// three.js visuals for the machine. Reads body poses from UfoSim every frame.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CAB, BAR, CLAW, ARM_JOINTS, armParts } from './sim.js';

const BOX_THEMES = [
  { a: '#ff5fa2', b: '#7a2cff', title: 'MAGICAL ☆ STAR', sub: '프리미엄 피규어', hair: '#ffd84d', suit: '#ff5fa2' },
  { a: '#2ec5ff', b: '#1838a8', title: 'SKY KNIGHT', sub: 'SPM 피규어', hair: '#e9f2ff', suit: '#1f6bff' },
  { a: '#ffb02e', b: '#d1361f', title: 'FLAME HEART', sub: '경품 한정', hair: '#ff6b2e', suit: '#222' },
  { a: '#6ee7a8', b: '#127a63', title: 'FOREST SPIRIT', sub: 'Luminasta', hair: '#2a2a2a', suit: '#3fd18b' },
  { a: '#d6b3ff', b: '#4b2a8a', title: 'MOONLIGHT', sub: '경품 전용', hair: '#b9c4ff', suit: '#8f5bff' },
];

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawFigure(ctx, cx, cy, s, t) {
  // a very stylised anime figure: hair, face, body, skirt, base
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.fillStyle = '#d9d9e3';
  ctx.beginPath();
  ctx.ellipse(0, 92, 46, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffe2cf';
  ctx.fillRect(-9, 40, 7, 50);
  ctx.fillRect(3, 40, 7, 50);
  ctx.fillStyle = t.suit;
  ctx.beginPath();
  ctx.moveTo(-34, 48);
  ctx.lineTo(34, 48);
  ctx.lineTo(16, 0);
  ctx.lineTo(-16, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-14, -30, 28, 34);
  ctx.fillStyle = t.hair;
  ctx.beginPath();
  ctx.ellipse(0, -52, 30, 32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-28, -50);
  ctx.quadraticCurveTo(-48, 10, -30, 30);
  ctx.lineTo(-20, -30);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(28, -50);
  ctx.quadraticCurveTo(48, 10, 30, 30);
  ctx.lineTo(20, -30);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffe2cf';
  ctx.beginPath();
  ctx.ellipse(0, -46, 20, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = t.hair;
  ctx.beginPath();
  ctx.ellipse(0, -64, 24, 12, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a2b6b';
  ctx.beginPath();
  ctx.ellipse(-8, -44, 4, 6, 0, 0, Math.PI * 2);
  ctx.ellipse(8, -44, 4, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function boxFaceTextures(theme, dims) {
  const px = 256; // pixels per unit
  const make = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = Math.round(w * px);
    c.height = Math.round(h * px);
    const ctx = c.getContext('2d');
    draw(ctx, c.width, c.height);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  };
  const bg = (ctx, W, H) => {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, theme.a);
    g.addColorStop(1, theme.b);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 26; i++) {
      const x = (i * 97) % W;
      const y = (i * 53) % H;
      ctx.beginPath();
      ctx.arc(x, y, 6 + (i % 5) * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(4, W * 0.012);
    ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, W - ctx.lineWidth * 2, H - ctx.lineWidth * 2);
  };
  const fitText = (ctx, text, x, y, maxW, size, weight) => {
    let f = size;
    ctx.font = `${weight} ${f}px system-ui, sans-serif`;
    while (ctx.measureText(text).width > maxW && f > 8) {
      f -= 2;
      ctx.font = `${weight} ${f}px system-ui, sans-serif`;
    }
    ctx.fillText(text, x, y);
  };
  // top (largest) face: window showing the figure, title toward the player
  const top = make(dims.w, dims.d, (ctx, W, H) => {
    bg(ctx, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    roundRect(ctx, W * 0.1, H * 0.06, W * 0.8, H * 0.7, 24);
    ctx.fill();
    ctx.fillStyle = 'rgba(190,220,255,0.55)';
    roundRect(ctx, W * 0.125, H * 0.075, W * 0.75, H * 0.665, 18);
    ctx.fill();
    drawFigure(ctx, W * 0.5, H * 0.42, (H * 0.6) / 200, theme);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, theme.title, W / 2, H * 0.84, W * 0.86, Math.round(W * 0.13), 900);
    fitText(ctx, theme.sub, W / 2, H * 0.92, W * 0.8, Math.round(W * 0.08), 700);
  });
  const side = (w, h) =>
    make(w, h, (ctx, W, H) => {
      bg(ctx, W, H);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      fitText(ctx, theme.title, W / 2, H * 0.42, W * 0.88, Math.round(H * 0.3), 900);
      fitText(ctx, 'NOT FOR SALE · 경품 전용', W / 2, H * 0.76, W * 0.85, Math.round(H * 0.15), 700);
    });
  const plain = (w, h) => make(w, h, bg);
  return [side(dims.d, dims.h), side(dims.d, dims.h), top, plain(dims.w, dims.d), side(dims.w, dims.h), plain(dims.w, dims.h)];
}

export class MachineView {
  constructor(canvas, sim) {
    this.sim = sim;
    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#14101f');
    scene.fog = new THREE.Fog('#14101f', 30, 60);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enabled = false;
    this.controls.target.set(0, 4.5, 0);

    this.buildLights();
    this.buildCabinet();
    this.buildClaw();
    this.barGroup = new THREE.Group();
    scene.add(this.barGroup);
    this.themeIndex = 0;
    this.views = {
      front: { pos: [0, 7.4, 18], target: [0, 5.3, 0] },
      side: { pos: [17, 7.4, 0.5], target: [0, 5.0, 0] },
      left: { pos: [-17, 7.4, 0.5], target: [0, 5.0, 0] },
      top: { pos: [0, 19, 1.2], target: [0, 3.5, -0.2] },
    };
    this.setView('front');
    sim.on('boxreset', () => this.buildBox());
  }

  buildLights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight('#c9c4ff', '#2a1d3a', 0.9));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(1.5, 20, 3);
    key.target.position.set(0, 0, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -6;
    sc.right = 6;
    sc.top = 6;
    sc.bottom = -6;
    sc.near = 5;
    sc.far = 30;
    key.shadow.bias = -0.0005;
    s.add(key, key.target);
    const fill = new THREE.PointLight('#ff6bd5', 30, 30);
    fill.position.set(-4, 9, 6);
    const fill2 = new THREE.PointLight('#5bd7ff', 30, 30);
    fill2.position.set(4, 9, 6);
    s.add(fill, fill2);
  }

  buildCabinet() {
    const s = this.scene;
    const W = CAB.halfW;
    const frameMat = new THREE.MeshStandardMaterial({ color: '#f0f0f8', metalness: 0.3, roughness: 0.35 });
    const pinkMat = new THREE.MeshStandardMaterial({ color: '#ff4fa8', emissive: '#ff2f8f', emissiveIntensity: 0.6 });
    const add = (geo, mat, x, y, z, cast = false, recv = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = cast;
      m.receiveShadow = recv;
      s.add(m);
      return m;
    };
    // pillars
    const pil = new THREE.BoxGeometry(0.35, CAB.height + 2.5, 0.35);
    for (const x of [-W - 0.2, W + 0.2])
      for (const z of [CAB.front + 0.2, CAB.back - 0.2]) add(pil, frameMat, x, (CAB.height + 2.5) / 2 - 1.5, z);
    // header sign
    const sign = document.createElement('canvas');
    sign.width = 1024;
    sign.height = 160;
    const c = sign.getContext('2d');
    const g = c.createLinearGradient(0, 0, 1024, 0);
    g.addColorStop(0, '#ff3d9a');
    g.addColorStop(0.5, '#ffcf3d');
    g.addColorStop(1, '#3dc8ff');
    c.fillStyle = '#1a0f2e';
    c.fillRect(0, 0, 1024, 160);
    c.fillStyle = g;
    c.font = '900 92px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('UFO ☆ CRANE', 512, 84);
    const signTex = new THREE.CanvasTexture(sign);
    signTex.colorSpace = THREE.SRGBColorSpace;
    add(
      new THREE.BoxGeometry(W * 2 + 0.8, 1.6, 0.4),
      [frameMat, frameMat, frameMat, frameMat, new THREE.MeshBasicMaterial({ map: signTex }), frameMat],
      0,
      CAB.height + 0.6,
      CAB.front + 0.2,
    );
    // ceiling with rails
    add(new THREE.BoxGeometry(W * 2 + 0.8, 0.3, CAB.front - CAB.back + 0.8), frameMat, 0, CAB.height - 0.15, 0, false, false);
    const railMat = new THREE.MeshStandardMaterial({ color: '#888', metalness: 0.8, roughness: 0.3 });
    for (const z of [CAB.back + 0.2, CAB.front - 0.2])
      add(new THREE.BoxGeometry(W * 2, 0.12, 0.12), railMat, 0, CAB.height - 0.4, z);
    this.gantry = add(new THREE.BoxGeometry(0.25, 0.18, CAB.front - CAB.back - 0.2), railMat, 0, CAB.height - 0.55, 0);
    this.trolley = add(new THREE.BoxGeometry(0.7, 0.3, 0.6), railMat, 0, CAB.height - 0.75, 0);
    // back wall
    const back = document.createElement('canvas');
    back.width = 512;
    back.height = 512;
    const bc = back.getContext('2d');
    const bg = bc.createLinearGradient(0, 0, 0, 512);
    bg.addColorStop(0, '#2b1650');
    bg.addColorStop(1, '#100820');
    bc.fillStyle = bg;
    bc.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 60; i++) {
      bc.fillStyle = `hsla(${(i * 47) % 360},90%,70%,${0.25 + (i % 3) * 0.15})`;
      bc.beginPath();
      bc.arc((i * 131) % 512, (i * 71) % 512, 2 + (i % 4), 0, Math.PI * 2);
      bc.fill();
    }
    const backTex = new THREE.CanvasTexture(back);
    backTex.colorSpace = THREE.SRGBColorSpace;
    add(new THREE.PlaneGeometry(W * 2, CAB.height), new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.9 }), 0, CAB.height / 2, CAB.back - 0.01);
    // side mirrors-ish panels (dark)
    const sideMat = new THREE.MeshStandardMaterial({ color: '#241a3a', roughness: 0.6, transparent: true, opacity: 0.35 });
    for (const x of [-W, W]) {
      const m = add(new THREE.PlaneGeometry(CAB.front - CAB.back, CAB.height), sideMat, x, CAB.height / 2, 0);
      m.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    // front glass (very subtle)
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.06,
      roughness: 0.05,
      metalness: 0,
      depthWrite: false,
    });
    add(new THREE.PlaneGeometry(W * 2, CAB.height - 1), glass, 0, CAB.height / 2 + 0.5, CAB.front);
    // lower front panel with prize door
    add(new THREE.BoxGeometry(W * 2 + 0.8, 1.2, 0.3), pinkMat, 0, 0.2, CAB.front + 0.2);
    // prize hole (dark pit under the bars)
    const pit = new THREE.MeshStandardMaterial({ color: '#07050c', roughness: 1 });
    add(new THREE.BoxGeometry(W * 2, 0.1, CAB.front - CAB.back), pit, 0, -0.05, 0);
    this.deckMeshes = [];
    // LED strips
    const ledMat = new THREE.MeshBasicMaterial({ color: '#7df9ff' });
    for (const x of [-W + 0.05, W - 0.05]) add(new THREE.BoxGeometry(0.05, CAB.height - 1, 0.05), ledMat, x, CAB.height / 2, CAB.front - 0.05);
  }

  buildBars() {
    const g = this.barGroup;
    while (g.children.length) {
      const c = g.children.pop();
      c.geometry?.dispose();
    }
    const sim = this.sim;
    const barMat = new THREE.MeshStandardMaterial({ color: '#d8dbe2', metalness: 0.9, roughness: 0.25 });
    const tapeMat = new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.8 });
    const deckMat = new THREE.MeshStandardMaterial({ color: '#3a2d5c', roughness: 0.7 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: '#ffd23d', roughness: 0.5 });
    for (const bar of sim.barLayout) {
      const grp = new THREE.Group();
      grp.position.set(0, BAR.y, bar.z);
      grp.rotation.y = bar.yaw;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(BAR.radius, BAR.radius, BAR.length, 24), barMat);
      m.rotation.z = Math.PI / 2;
      m.castShadow = m.receiveShadow = true;
      grp.add(m);
      // rubber end caps / supports
      for (const x of [-BAR.length / 2 + 0.3, BAR.length / 2 - 0.3]) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(BAR.radius * 1.15, BAR.radius * 1.15, 0.25, 16), tapeMat);
        cap.rotation.z = Math.PI / 2;
        cap.position.x = x;
        grp.add(cap);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, BAR.y, 0.2), barMat);
        post.position.set(x, -BAR.y / 2, 0);
        grp.add(post);
      }
      g.add(grp);
    }
    // deck plates
    const d = sim.deck;
    for (const side of [1, -1]) {
      const outer = side > 0 ? CAB.front : -CAB.back;
      const inner = d.inner + Math.sin(sim.settings.splay) * BAR.length * 0.5;
      const depth = outer - inner;
      const m = new THREE.Mesh(new THREE.BoxGeometry(CAB.halfW * 2, 0.2, depth), deckMat);
      m.position.set(0, d.top - 0.1, side * (inner + depth / 2));
      m.receiveShadow = true;
      g.add(m);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(CAB.halfW * 2, 0.06, 0.08), edgeMat);
      edge.position.set(0, d.top + 0.01, side * (inner + 0.04));
      g.add(edge);
      // skirt down into the pit
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(CAB.halfW * 2, d.top, 0.1), deckMat);
      skirt.position.set(0, d.top / 2, side * inner);
      g.add(skirt);
    }
  }

  buildBox() {
    const sim = this.sim;
    if (this.boxMesh) {
      this.scene.remove(this.boxMesh);
      const old = this.boxMesh.children[0];
      old.geometry.dispose();
      for (const m of old.material) {
        m.map?.dispose();
        m.dispose();
      }
    }
    const dims = sim.boxDims;
    const theme = BOX_THEMES[this.themeIndex++ % BOX_THEMES.length];
    const mats = boxFaceTextures(theme, dims).map(
      (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.45, metalness: 0.05 }),
    );
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(dims.w, dims.h, dims.d), mats);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.position.set(-dims.com[0], -dims.com[1], -dims.com[2]);
    // the group origin is the centre of mass (= physics body origin)
    const group = (this.boxMesh = new THREE.Group());
    group.add(mesh);
    const marker = (this.comMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 16, 12),
      new THREE.MeshBasicMaterial({ color: '#ff2b55', depthTest: false }),
    ));
    marker.renderOrder = 10;
    marker.visible = !!this.showCom;
    group.add(marker);
    this.scene.add(group);
    this.buildBars();
    this.sync();
  }

  buildClaw() {
    const white = new THREE.MeshStandardMaterial({ color: '#f4f6fa', metalness: 0.1, roughness: 0.35 });
    const grey = new THREE.MeshStandardMaterial({ color: '#b7c1c9', metalness: 0.5, roughness: 0.35 });
    const blue = new THREE.MeshStandardMaterial({ color: '#4f74e3', metalness: 0.25, roughness: 0.4 });
    const tipMat = new THREE.MeshStandardMaterial({ color: '#8f9aa3', metalness: 0.4, roughness: 0.6 });
    const head = (this.headMesh = new THREE.Group());
    // big round SEGA-style head
    const ball = new THREE.Mesh(new THREE.SphereGeometry(CLAW.headRadius, 40, 24), white);
    ball.position.y = 0.3;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(CLAW.headRadius * 1.005, CLAW.headRadius * 1.005, 0.32, 40, 1, true), grey);
    band.position.y = 0.45;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.42, 0.2), white);
    visor.position.set(0, 0.05, CLAW.headRadius * 0.82);
    const visorIn = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.28, 0.05), grey);
    visorIn.position.set(0, 0.05, CLAW.headRadius * 0.82 + 0.1);
    const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.25, 16), grey);
    hook.position.y = 1.08;
    for (const m of [ball, band, visor, visorIn, hook]) {
      m.castShadow = true;
      head.add(m);
    }
    this.scene.add(head);
    this.armMeshes = [];
    for (const side of [-1, 1]) {
      const g = new THREE.Group();
      for (const p of armParts(side)) {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(p.half[0] * 2, p.half[1] * 2, p.half[2] * 2),
          p.kind === 'tip' ? tipMat : blue,
        );
        m.position.set(...p.pos);
        m.rotation.z = p.rot;
        m.castShadow = true;
        g.add(m);
      }
      // rounded elbow so the bracket looks bent rather than boxy
      const elbow = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, CLAW.armWidth, 16), blue);
      elbow.rotation.x = Math.PI / 2;
      elbow.position.set(side * ARM_JOINTS[0][0], ARM_JOINTS[0][1], 0);
      g.add(elbow);
      this.scene.add(g);
      this.armMeshes.push(g);
    }
    const cableGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 6);
    cableGeo.translate(0, 0.5, 0);
    this.cable = new THREE.Mesh(cableGeo, new THREE.MeshStandardMaterial({ color: '#222' }));
    this.scene.add(this.cable);
    // optional aim laser
    this.laser = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 1, 6),
      new THREE.MeshBasicMaterial({ color: '#ff2b55', transparent: true, opacity: 0.8 }),
    );
    this.laser.geometry.translate(0, -0.5, 0);
    this.laser.visible = false;
    this.scene.add(this.laser);
  }

  setShowCom(on) {
    this.showCom = on;
    if (this.comMarker) this.comMarker.visible = on;
  }

  setView(name) {
    this.viewName = name;
    if (name === 'free') {
      this.controls.enabled = true;
      return;
    }
    this.controls.enabled = false;
    const v = this.views[name];
    this.camTarget = { pos: new THREE.Vector3(...v.pos), target: new THREE.Vector3(...v.target) };
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the whole machine visible on narrow screens
    this.camera.fov = w / h < 1 ? 60 : 42;
    this.camera.updateProjectionMatrix();
  }

  sync() {
    const sim = this.sim;
    if (this.boxMesh) {
      this.boxMesh.position.copy(sim.box.position);
      this.boxMesh.quaternion.copy(sim.box.quaternion);
    }
    const h = sim.head.position;
    this.headMesh.position.copy(h);
    sim.arms.forEach((a, i) => {
      this.armMeshes[i].position.copy(a.position);
      this.armMeshes[i].quaternion.copy(a.quaternion);
    });
    const topY = CAB.height - 0.8;
    this.cable.position.set(h.x, h.y + 1.2, h.z);
    this.cable.scale.y = Math.max(0.01, topY - h.y - 1.2);
    this.gantry.position.x = h.x;
    this.trolley.position.set(h.x, CAB.height - 0.75, h.z);
    if (this.laser.visible) {
      this.laser.position.set(h.x, h.y, h.z);
      this.laser.scale.y = h.y;
    }
  }

  render(dt) {
    if (this.camTarget && !this.controls.enabled) {
      const k = 1 - Math.pow(0.001, dt);
      this.camera.position.lerp(this.camTarget.pos, k);
      this.controls.target.lerp(this.camTarget.target, k);
      this.camera.lookAt(this.controls.target);
    } else {
      this.controls.update();
    }
    this.sync();
    this.renderer.render(this.scene, this.camera);
  }
}
