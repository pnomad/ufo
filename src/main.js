import { UfoSim, STAGES, BOX_PRESETS } from './sim.js';
import { MachineView } from './scene.js';
import { Sound } from './sound.js';

const $ = (sel) => document.querySelector(sel);
const sim = new UfoSim();
const view = new MachineView($('#view'), sim);
const sound = new Sound();
window.ufo = { sim, view }; // handy for debugging from the console

const PRICE = 1000;
const stats = { credits: 0, spent: 0, plays: 0, playsThisBox: 0, spentThisBox: 0, gets: 0 };
let lastSnapshot = null; // prize pose before the last finished play
let playSnapshot = null; // prize pose at the start of the current play
let currentStage = STAGES[1];

// ------------------------------------------------------------- stage / settings
const stageSel = $('#stage');
for (const st of STAGES) {
  const o = document.createElement('option');
  o.value = st.id;
  o.textContent = st.name;
  stageSel.append(o);
}
const custom = document.createElement('option');
custom.value = 'custom';
custom.textContent = '직접 세팅';
stageSel.append(custom);

const sliders = {
  gap: { label: '봉 간격', min: 1.2, max: 2.4, step: 0.01, fmt: (v) => `${(v * 10).toFixed(1)}cm`, rebuild: true },
  splay: { label: '봉 벌어짐(八자)', min: 0, max: 0.1, step: 0.005, fmt: (v) => `${((v * 180) / Math.PI).toFixed(1)}°`, rebuild: true },
  closePower: { label: '집는 힘', min: 5, max: 100, step: 1, fmt: (v) => `${v}%` },
  risePower: { label: '올라갈 때 힘', min: 0, max: 100, step: 1, fmt: (v) => `${v}%` },
  push: { label: '내려 누르는 힘', min: 5, max: 100, step: 1, fmt: (v) => `${v}%` },
  barFriction: { label: '봉 마찰', min: 0.05, max: 0.8, step: 0.01, fmt: (v) => v.toFixed(2) },
  depth: { label: '하강 제한(높을수록 덜 내려감)', min: 0, max: 1.5, step: 0.05, fmt: (v) => `${(v * 10).toFixed(1)}cm` },
};
const sliderBox = $('#sliders');
const sliderEls = {};
for (const [key, def] of Object.entries(sliders)) {
  const row = document.createElement('label');
  row.className = 'slider';
  row.innerHTML = `<span>${def.label}</span><input type="range" min="${def.min}" max="${def.max}" step="${def.step}"><b></b>`;
  const input = row.querySelector('input');
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    row.querySelector('b').textContent = def.fmt(v);
    stageSel.value = 'custom';
    if (def.rebuild) {
      pendingRebuild = true;
    } else {
      sim.settings[key] = v;
      if (key === 'barFriction') sim.barContact.friction = v;
    }
  });
  input.addEventListener('change', () => {
    if (def.rebuild && pendingRebuild) applyCustom();
  });
  sliderBox.append(row);
  sliderEls[key] = row;
}
let pendingRebuild = false;
const boxSel = $('#boxsize');
for (const [k, b] of Object.entries(BOX_PRESETS)) {
  const o = document.createElement('option');
  o.value = k;
  o.textContent = b.label;
  boxSel.append(o);
}
boxSel.addEventListener('change', () => {
  stageSel.value = 'custom';
  applyCustom();
});

function readSliders() {
  const s = {};
  for (const [key, row] of Object.entries(sliderEls)) s[key] = parseFloat(row.querySelector('input').value);
  s.box = boxSel.value;
  return s;
}

function writeSliders(s) {
  for (const [key, row] of Object.entries(sliderEls)) {
    const v = s[key] ?? (key === 'depth' ? 0.7 : 0);
    row.querySelector('input').value = v;
    row.querySelector('b').textContent = sliders[key].fmt(v);
  }
  boxSel.value = s.box;
}

function applyCustom() {
  pendingRebuild = false;
  loadSettings({ ...currentStage, ...readSliders(), id: 'custom', desc: '직접 만든 세팅' });
}

function loadSettings(st) {
  currentStage = st;
  sim.setup({ depth: 0.7, ...st, stopButton: $('#stopbtn').checked });
  writeSliders(sim.settings);
  $('#stagedesc').textContent = st.desc;
  stats.playsThisBox = 0;
  stats.spentThisBox = 0;
  lastSnapshot = null;
  playSnapshot = null;
  hideWin();
  updateHud();
}

stageSel.addEventListener('change', () => {
  const st = STAGES.find((s) => s.id === stageSel.value);
  if (st) loadSettings(st);
});

$('#stopbtn').addEventListener('change', (e) => (sim.settings.stopButton = e.target.checked));
$('#laser').addEventListener('change', (e) => (view.laser.visible = e.target.checked));
$('#showcom').addEventListener('change', (e) => view.setShowCom(e.target.checked));
$('#mute').addEventListener('change', (e) => sound.setMuted(e.target.checked));

// ----------------------------------------------------------------- game flow
function insertCoin(amount) {
  sound.coin();
  const plays = amount >= 5000 ? Math.floor(amount / PRICE) + 1 : Math.floor(amount / PRICE);
  stats.credits += plays;
  stats.spent += amount;
  stats.spentThisBox += amount;
  tryStart();
  updateHud();
}

function tryStart() {
  if (sim.state === 'idle' && stats.credits > 0 && !sim.won) {
    stats.credits--;
    stats.plays++;
    stats.playsThisBox++;
    playSnapshot = sim.snapshot();
    sim.startPlay();
    sound.start();
    updateHud();
  }
}

sim.on('state', (s) => {
  sound.state(s);
  updateHud();
});
sim.on('playend', () => {
  lastSnapshot = playSnapshot;
  updateHud();
  if (!sim.won) setTimeout(tryStart, 250);
});
sim.on('win', () => {
  stats.gets++;
  sound.win();
  setTimeout(showWin, 600);
  updateHud();
});

function showWin() {
  $('#win-plays').textContent = `${stats.playsThisBox}판`;
  $('#win-cost').textContent = `₩${stats.spentThisBox.toLocaleString()}`;
  $('#win').hidden = false;
}

function hideWin() {
  $('#win').hidden = true;
}

$('#win-next').addEventListener('click', () => {
  hideWin();
  newBox();
});

function newBox() {
  sim.resetBox();
  sim.resetClaw();
  stats.playsThisBox = 0;
  stats.spentThisBox = 0;
  lastSnapshot = null;
  tryStart();
  updateHud();
}

$('#staff').addEventListener('click', () => {
  if (!['idle', 'ready'].includes(sim.state)) return;
  const st = sim.state;
  lastSnapshot = null;
  sim.resetBox(true);
  sim.resetClaw();
  if (st === 'ready') sim.startPlay();
  toast('점원: "처음 위치로 다시 놓아 드렸어요~"');
});

$('#undo').addEventListener('click', () => {
  if (!lastSnapshot || !['idle', 'ready'].includes(sim.state)) return;
  sim.restore(lastSnapshot);
  playSnapshot = lastSnapshot;
  hideWin();
  toast('박스를 직전 판 시작 위치로 되돌렸어요 (연습용)');
  updateHud();
});

$('#coin1').addEventListener('click', () => insertCoin(1000));
$('#coin5').addEventListener('click', () => insertCoin(5000));
$('#resetstats').addEventListener('click', () => {
  Object.assign(stats, { credits: 0, spent: 0, plays: 0, playsThisBox: 0, spentThisBox: 0, gets: 0 });
  updateHud();
});

// ------------------------------------------------------------------ buttons
const btn1 = $('#btn1');
const btn2 = $('#btn2');
function down(b) {
  sound.unlock();
  if (b === 'b1' && sim.state === 'idle' && stats.credits > 0) tryStart();
  sim.press(b);
  updateHud();
}
function up(b) {
  sim.release(b);
  updateHud();
}
for (const [el, b] of [
  [btn1, 'b1'],
  [btn2, 'b2'],
]) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    down(b);
  });
  el.addEventListener('pointerup', () => up(b));
  el.addEventListener('pointercancel', () => up(b));
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

const keyMap = { KeyZ: 'b1', Digit1: 'b1', ArrowRight: 'b1', KeyX: 'b2', Digit2: 'b2', ArrowUp: 'b2' };
const held = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
    if (!keyMap[e.code]) return;
  }
  const b = keyMap[e.code];
  if (b) {
    e.preventDefault();
    if (held.has(e.code)) return;
    held.add(e.code);
    down(b);
  } else if (e.code === 'KeyC') {
    insertCoin(1000);
  } else if (e.code === 'KeyV') {
    cycleView();
  } else if (e.code === 'Space') {
    e.preventDefault();
    if (sim.state === 'descend') sim.press('stop');
  } else if (e.code === 'KeyR') {
    $('#undo').click();
  }
});
window.addEventListener('keyup', (e) => {
  const b = keyMap[e.code];
  if (b) {
    held.delete(e.code);
    up(b);
  }
});
window.addEventListener('blur', () => {
  held.clear();
  up('b1');
  up('b2');
});

// ------------------------------------------------------------------- views
const VIEWS = ['front', 'side', 'left', 'top', 'free'];
const viewBtns = document.querySelectorAll('[data-view]');
function setView(name) {
  view.setView(name);
  viewBtns.forEach((b) => b.classList.toggle('on', b.dataset.view === name));
}
function cycleView() {
  setView(VIEWS[(VIEWS.indexOf(view.viewName) + 1) % VIEWS.length]);
}
viewBtns.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

// --------------------------------------------------------------------- HUD
const STATE_TEXT = {
  idle: '돈을 넣어 주세요',
  ready: '① 버튼을 누르고 있으면 → 오른쪽으로',
  moveX: '→ 이동 중… 손을 떼면 멈춰요',
  readyZ: '② 버튼을 누르고 있으면 ↑ 안쪽으로',
  moveZ: '↑ 이동 중… 손을 떼면 내려가요',
  open: '집게 벌리는 중',
  descend: '하강 중',
  close: '잡는 중',
  rise: '상승 중',
  return: '돌아가는 중',
  drop: '배출구에서 놓는 중',
  shut: '',
};

function updateHud() {
  $('#credits').textContent = stats.credits;
  $('#spent').textContent = `₩${stats.spent.toLocaleString()}`;
  $('#plays').textContent = `${stats.playsThisBox}판 / ₩${stats.spentThisBox.toLocaleString()}`;
  $('#gets').textContent = stats.gets;
  let msg = STATE_TEXT[sim.state] ?? '';
  if (sim.state === 'idle' && stats.credits > 0) msg = '① 버튼을 누르면 시작';
  if (sim.state === 'descend' && sim.settings.stopButton) msg = '하강 중 — Space/버튼으로 멈춤';
  $('#status').textContent = msg;
  btn1.classList.toggle('lit', sim.state === 'ready' || sim.state === 'moveX' || (sim.state === 'idle' && stats.credits > 0));
  btn2.classList.toggle('lit', sim.state === 'readyZ' || sim.state === 'moveZ');
  $('#undo').disabled = !lastSnapshot;
}

let toastTimer;
function toast(t) {
  const el = $('#toast');
  el.textContent = t;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

$('#helpbtn').addEventListener('click', () => ($('#help').hidden = false));
$('#help-close').addEventListener('click', () => ($('#help').hidden = true));
$('#panel-toggle').addEventListener('click', () => document.body.classList.toggle('panel-open'));

// -------------------------------------------------------------------- loop
function resize() {
  const c = $('#view');
  view.resize(c.clientWidth, c.clientHeight);
}
window.addEventListener('resize', resize);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  sim.advance(dt);
  sound.update(sim);
  view.render(dt);
  requestAnimationFrame(frame);
}

stageSel.value = currentStage.id;
loadSettings(currentStage);
resize();
setView('front');
requestAnimationFrame(frame);
