// Headless physics checks: node scripts/sim-test.mjs [--random N]
import { UfoSim, STAGES, CLAW, DT, BAR } from '../src/sim.js';

export function play(sim, targetX, targetZ, log = false) {
  const t1 = (targetX - sim.head.position.x) / CLAW.moveSpeed;
  const t2 = (sim.head.position.z - targetZ) / CLAW.moveSpeed;
  sim.startPlay();
  const run = (sec) => { for (let i = 0; i < sec / DT; i++) sim.step(DT); };
  sim.press('b1'); run(Math.max(DT, t1)); sim.release('b1');
  sim.press('b2'); run(Math.max(DT, t2)); sim.release('b2');
  let last = '';
  let guard = 0;
  while (sim.state !== 'idle' && guard++ < 240 * 30) {
    sim.step(DT);
    if (log && sim.state !== last) {
      last = sim.state;
      const b = sim.box.position, h = sim.head.position;
      console.log(`  ${sim.state.padEnd(8)} head=(${h.x.toFixed(2)},${h.y.toFixed(2)},${h.z.toFixed(2)}) box=(${b.x.toFixed(2)},${b.y.toFixed(2)},${b.z.toFixed(2)}) arms=${sim.arms.map(a=>sim.armAngle(a).toFixed(2))} ${sim.descentStopReason||''}`);
    }
  }
  run(1.5);
  return sim.won;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  let failed = 0;
  const check = (ok, msg) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
    if (!ok) failed++;
  };
  const sim = new UfoSim();
  for (const st of STAGES) {
    sim.setup(st);
    const b = sim.box.position;
    check(b.y > BAR.y && Math.abs(b.z) < 1, `[${st.id}] box rests on the bars (y=${b.y.toFixed(2)})`);
  }
  // Weak arms must never carry the box to the chute in one play (it's a pushing game).
  sim.setup(STAGES.find((s) => s.id === 'bridge'));
  let carried = 0;
  for (const [x, z] of [[0.15, 0], [0.15, 0.6], [0.15, -0.6], [-0.6, 0.3], [0.9, -0.3]]) {
    sim.setup(sim.settings);
    let maxY = 0;
    const step = sim.step.bind(sim);
    sim.step = (dt) => {
      step(dt);
      if (sim.state === 'drop') maxY = Math.max(maxY, sim.box.position.y);
    };
    play(sim, x, z);
    if (maxY > 4.6) carried++;
  }
  check(carried === 0, `bridge: box never carried to the chute (${carried}/5)`);
  // The claw must actually reach the box and move it.
  sim.setup(STAGES.find((s) => s.id === 'bridge-easy'));
  const p0 = sim.box.position.clone();
  // one arm on the back end of the box, like STEP 1 of the SEGA guide
  for (const [x, z] of [[-1.8, -0.9], [2.0, -0.9], [-1.8, -0.7], [2.0, -0.7]]) play(sim, x, z);
  const moved = sim.box.position.vsub(p0).length() + Math.abs(sim.box.quaternion.x);
  check(moved > 0.05 || sim.won, `bridge-easy: claw moves the box (${moved.toFixed(2)})`);
  process.exit(failed ? 1 : 0);
}
