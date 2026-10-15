// UFO catcher physics simulation (no rendering).
// Units: 1 unit = 10 cm (dm). Gravity scaled accordingly.
// Coordinate system: +x = right, +y = up, +z = toward the player (front glass).
import * as CANNON from 'cannon-es';

export const G = 98; // 9.8 m/s^2 in dm/s^2
export const DT = 1 / 240;

export const CAB = {
  halfW: 4.4, // inner half width (x)
  front: 3.0, // front glass z
  back: -3.0, // back wall z
  height: 11,
};

export const BAR = { y: 3.0, radius: 0.16, length: 8.6 };

export const CLAW = {
  topY: 8.6, // pivot height when fully up
  pivotX: 0.3, // hinge offset from head center
  armLen: 3.0,
  armThick: 0.12,
  armWidth: 0.42, // along z
  tipLen: 0.32, // inward claw length
  tipThick: 0.12,
  openAngle: 0.62, // rad (~36 deg)
  closedAngle: -0.02, // tips just meet in the middle
  moveSpeed: 2.6, // horizontal dm/s
  downSpeed: 2.2,
  upSpeed: 2.2,
  rangeX: [-2.3, 2.3],
  rangeZ: [-2.4, 2.4],
  home: { x: -2.3, z: 2.4 },
};

// Box placed lying flat: thin side vertical, long side along x, depth along z.
export const BOX_PRESETS = {
  normal: { w: 2.6, h: 1.2, d: 2.15, mass: 0.7, label: '일반 피규어 박스' },
  big: { w: 3.0, h: 1.5, d: 2.5, mass: 1.1, label: '대형 피규어 박스' },
  small: { w: 2.0, h: 1.0, d: 1.8, mass: 0.45, label: '소형 피규어 박스' },
};

export const STAGES = [
  {
    id: 'bridge-easy',
    name: '다리 걸치기 · 연습',
    desc: '봉 간격이 넓고 집게 힘도 좋은 연습용 세팅.',
    box: 'normal', gap: 1.62, splay: 0, closePower: 70, risePower: 55, push: 55, barFriction: 0.25,
  },
  {
    id: 'bridge',
    name: '다리 걸치기 · 보통',
    desc: '가장 흔한 매장 세팅. 앞/뒤 모서리를 눌러 세로로 끼우는(세로 하메) 게 정석.',
    box: 'normal', gap: 1.48, splay: 0, closePower: 45, risePower: 30, push: 45, barFriction: 0.3,
  },
  {
    id: 'bridge-hard',
    name: '다리 걸치기 · 짠물',
    desc: '간격 좁고 집게는 들어 올리는 순간 힘이 빠지는 짠 세팅.',
    box: 'normal', gap: 1.34, splay: 0, closePower: 28, risePower: 8, push: 32, barFriction: 0.45,
  },
  {
    id: 'hachi',
    name: '팔(八)자 봉',
    desc: '봉이 오른쪽으로 갈수록 벌어짐. 박스를 넓은 쪽으로 밀어 보내자.',
    box: 'normal', gap: 1.3, splay: 0.06, closePower: 45, risePower: 28, push: 45, barFriction: 0.25,
  },
  {
    id: 'big',
    name: '대형 박스',
    desc: '무겁고 큰 박스. 한 번에 안 되니 조금씩 밀어서 기울이자.',
    box: 'big', gap: 1.75, splay: 0, closePower: 55, risePower: 35, push: 55, barFriction: 0.3,
  },
];

const GROUP = { STATIC: 1, BOX: 2, ARM: 4, HEAD: 8 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class UfoSim {
  constructor() {
    this.listeners = {};
    this.time = 0;
    this.settings = { ...STAGES[1] };
    this.build();
  }

  on(ev, fn) {
    (this.listeners[ev] ||= []).push(fn);
  }

  emit(ev, data) {
    for (const fn of this.listeners[ev] || []) fn(data);
  }

  // ---------------------------------------------------------------- setup
  build() {
    const world = (this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -G, 0) }));
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.solver.iterations = 30;
    world.solver.tolerance = 1e-5;
    world.allowSleep = true;

    this.mat = {
      box: new CANNON.Material('box'),
      bar: new CANNON.Material('bar'),
      arm: new CANNON.Material('arm'),
      glass: new CANNON.Material('glass'),
      floor: new CANNON.Material('floor'),
    };
    const cm = (a, b, friction, restitution = 0) => {
      const c = new CANNON.ContactMaterial(a, b, { friction, restitution });
      world.addContactMaterial(c);
      return c;
    };
    this.barContact = cm(this.mat.box, this.mat.bar, 0.3);
    cm(this.mat.box, this.mat.arm, 0.4);
    cm(this.mat.box, this.mat.glass, 0.1);
    cm(this.mat.box, this.mat.floor, 0.5, 0.05);
    cm(this.mat.arm, this.mat.bar, 0.3);
    cm(this.mat.arm, this.mat.glass, 0.05);

    // Cabinet walls & floor (floor = prize chute, anything landing there is a win)
    const addStatic = (shape, pos, mat) => {
      const b = new CANNON.Body({ mass: 0, material: mat, collisionFilterGroup: GROUP.STATIC });
      b.addShape(shape);
      b.position.set(pos[0], pos[1], pos[2]);
      world.addBody(b);
      return b;
    };
    const t = 0.2;
    addStatic(new CANNON.Box(new CANNON.Vec3(CAB.halfW + 1, t, 5)), [0, -t, 0], this.mat.floor);
    addStatic(new CANNON.Box(new CANNON.Vec3(t, CAB.height, 5)), [-CAB.halfW - t, CAB.height, 0], this.mat.glass);
    addStatic(new CANNON.Box(new CANNON.Vec3(t, CAB.height, 5)), [CAB.halfW + t, CAB.height, 0], this.mat.glass);
    addStatic(new CANNON.Box(new CANNON.Vec3(CAB.halfW + 1, CAB.height, t)), [0, CAB.height, CAB.back - t], this.mat.glass);
    addStatic(new CANNON.Box(new CANNON.Vec3(CAB.halfW + 1, CAB.height, t)), [0, CAB.height, CAB.front + t], this.mat.glass);

    this.bars = [];
    this.buildClaw();
  }

  buildClaw() {
    const world = this.world;
    const head = (this.head = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.KINEMATIC,
      collisionFilterGroup: GROUP.HEAD,
      collisionFilterMask: GROUP.BOX | GROUP.STATIC,
      material: this.mat.arm,
    }));
    head.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 0.35, 0.5)), new CANNON.Vec3(0, 0.4, 0));
    head.position.set(CLAW.home.x, CLAW.topY, CLAW.home.z);
    head.allowSleep = false;
    world.addBody(head);

    this.arms = [];
    this.hinges = [];
    for (const side of [-1, 1]) {
      const arm = new CANNON.Body({
        mass: 0.25,
        material: this.mat.arm,
        collisionFilterGroup: GROUP.ARM,
        collisionFilterMask: GROUP.BOX | GROUP.STATIC,
        angularDamping: 0.6,
        linearDamping: 0.1,
      });
      arm.allowSleep = false;
      const L = CLAW.armLen;
      arm.addShape(
        new CANNON.Box(new CANNON.Vec3(CLAW.armThick / 2, L / 2, CLAW.armWidth / 2)),
        new CANNON.Vec3(0, -L / 2, 0),
      );
      // inward-pointing claw tip (爪)
      arm.addShape(
        new CANNON.Box(new CANNON.Vec3(CLAW.tipLen / 2, CLAW.tipThick / 2, CLAW.armWidth / 2)),
        new CANNON.Vec3(-side * (CLAW.tipLen / 2 - CLAW.armThick / 2), -L + CLAW.tipThick / 2, 0),
      );
      arm.position.set(head.position.x + side * CLAW.pivotX, head.position.y, head.position.z);
      arm.side = side;
      world.addBody(arm);
      const hinge = new CANNON.HingeConstraint(head, arm, {
        pivotA: new CANNON.Vec3(side * CLAW.pivotX, 0, 0),
        pivotB: new CANNON.Vec3(0, 0, 0),
        axisA: new CANNON.Vec3(0, 0, 1),
        axisB: new CANNON.Vec3(0, 0, 1),
      });
      hinge.enableMotor();
      world.addConstraint(hinge);
      this.arms.push(arm);
      this.hinges.push(hinge);
    }
    this.armTarget = 0; // 0 = closed, 1 = open
    this.armTorque = 100;
  }

  clearBars() {
    for (const b of this.bars) this.world.removeBody(b);
    this.bars = [];
  }

  // Apply a stage / custom settings and lay out a fresh box.
  setup(settings) {
    this.settings = { ...this.settings, ...settings };
    const s = this.settings;
    this.clearBars();
    this.barContact.friction = s.barFriction;

    const r = BAR.radius;
    const zc = s.gap / 2 + r;
    this.barLayout = [];
    for (const side of [1, -1]) {
      const b = new CANNON.Body({ mass: 0, material: this.mat.bar, collisionFilterGroup: GROUP.STATIC });
      const cyl = new CANNON.Cylinder(r, r, BAR.length, 20);
      // cannon-es cylinders are along Y; rotate onto X
      const q = new CANNON.Quaternion();
      q.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 2);
      b.addShape(cyl, new CANNON.Vec3(), q);
      b.position.set(0, BAR.y, side * zc);
      // splay: bars open toward +x (八 shape seen from above)
      b.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -side * s.splay);
      this.world.addBody(b);
      this.bars.push(b);
      this.barLayout.push({ z: side * zc, yaw: -side * s.splay });
    }
    // Deck plates outside the bars: a box that slides off the front/back lands
    // here instead of the prize hole (the hole is only between the bars).
    const deckTop = BAR.y - 0.45;
    for (const side of [1, -1]) {
      const inner = zc + r + 0.35 + Math.sin(s.splay) * BAR.length * 0.5;
      const outer = side > 0 ? CAB.front : -CAB.back;
      const half = (outer - inner) / 2;
      const b = new CANNON.Body({ mass: 0, material: this.mat.floor, collisionFilterGroup: GROUP.STATIC });
      b.addShape(new CANNON.Box(new CANNON.Vec3(CAB.halfW, 0.1, half)));
      b.position.set(0, deckTop - 0.1, side * (inner + half));
      this.world.addBody(b);
      this.bars.push(b);
    }
    this.deck = { top: deckTop, inner: zc + r + 0.35 };
    // Lowest pivot height: open claw tips stop a bit above the bar tops.
    this.minY = BAR.y + r + (s.depth ?? 0.35) + CLAW.armLen * Math.cos(CLAW.openAngle);
    this.resetBox();
    this.resetClaw();
    this.won = false;
  }

  resetBox() {
    const s = this.settings;
    const dims = (this.boxDims = BOX_PRESETS[s.box] || BOX_PRESETS.normal);
    if (this.box) this.world.removeBody(this.box);
    const box = (this.box = new CANNON.Body({
      mass: dims.mass,
      material: this.mat.box,
      collisionFilterGroup: GROUP.BOX,
      linearDamping: 0.02,
      angularDamping: 0.05,
    }));
    box.addShape(new CANNON.Box(new CANNON.Vec3(dims.w / 2, dims.h / 2, dims.d / 2)));
    box.position.set(0.15, BAR.y + BAR.radius + dims.h / 2 + 0.01, 0);
    box.sleepSpeedLimit = 0.05;
    box.sleepTimeLimit = 0.6;
    this.world.addBody(box);
    this.won = false;
    // settle
    for (let i = 0; i < 120; i++) this.world.step(DT);
    this.emit('boxreset', box);
  }

  // Snapshot of the prize so a practice "undo" can restore the previous play.
  snapshot() {
    const b = this.box;
    return {
      box: this.settings.box,
      p: b.position.clone(),
      q: b.quaternion.clone(),
      v: b.velocity.clone(),
      w: b.angularVelocity.clone(),
    };
  }

  restore(snap) {
    if (!snap) return;
    if (snap.box !== this.settings.box) return;
    const b = this.box;
    b.position.copy(snap.p);
    b.quaternion.copy(snap.q);
    b.velocity.copy(snap.v);
    b.angularVelocity.copy(snap.w);
    b.wakeUp();
    this.won = false;
  }

  resetClaw() {
    this.head.position.set(CLAW.home.x, CLAW.topY, CLAW.home.z);
    this.head.velocity.setZero();
    for (const arm of this.arms) {
      arm.position.set(this.head.position.x + arm.side * CLAW.pivotX, CLAW.topY, CLAW.home.z);
      arm.quaternion.set(0, 0, 0, 1);
      arm.velocity.setZero();
      arm.angularVelocity.setZero();
    }
    this.state = 'idle';
    this.stateTime = 0;
    this.armTarget = 0;
    this.armTorque = this.torqueFromPower(60);
    this.input = { b1: false, b2: false };
    this.used = { b1: false, b2: false };
  }

  // power 0..100 -> hinge torque. Tip force = torque / armLen.
  torqueFromPower(p) {
    return (p / 100) * 80 * CLAW.armLen;
  }

  // --------------------------------------------------------------- control
  // Buttons follow the classic UFO CATCHER flow:
  //   button 1 (hold) -> move right; release stops. Usable once.
  //   button 2 (hold) -> move back; release starts the drop. Usable once.
  //   Pressing either button during the descent stops the descent (optional).
  press(btn) {
    if (btn === 'b1' && this.state === 'ready') {
      this.setState('moveX');
      this.input.b1 = true;
    } else if (btn === 'b2' && this.state === 'readyZ') {
      this.setState('moveZ');
      this.input.b2 = true;
    } else if (this.state === 'descend' && this.settings.stopButton) {
      this.stopDescent('button');
    }
  }

  release(btn) {
    if (btn === 'b1' && this.state === 'moveX') {
      this.input.b1 = false;
      this.setState('readyZ');
    } else if (btn === 'b2' && this.state === 'moveZ') {
      this.input.b2 = false;
      this.setState('open');
    }
  }

  startPlay() {
    if (this.state !== 'idle') return false;
    this.setState('ready');
    return true;
  }

  setState(s) {
    this.state = s;
    this.stateTime = 0;
    this.emit('state', s);
  }

  stopDescent(reason) {
    this.head.velocity.setZero();
    this.descentStopReason = reason;
    this.setState('close');
  }

  armAngle(arm) {
    // head never rotates, so the arm quaternion is the relative rotation
    const q = arm.quaternion;
    return 2 * Math.atan2(q.z, q.w);
  }

  updateArms() {
    const open = CLAW.openAngle;
    const closed = CLAW.closedAngle;
    const tgt = closed + (open - closed) * this.armTarget;
    for (let i = 0; i < 2; i++) {
      const arm = this.arms[i];
      // left arm (side -1) opens with negative angle, right arm with positive
      const desired = arm.side * tgt;
      const ang = this.armAngle(arm);
      const w = clamp(10 * (desired - ang), -3.5, 3.5);
      this.hinges[i].setMotorSpeed(-w);
      this.hinges[i].setMotorMaxForce(this.armTorque);
    }
  }

  // Upward contact force acting on the claw (head + arms). When this beats the
  // claw's own weight the cable goes slack and the machine stops descending.
  clawSupportForce() {
    let f = 0;
    const claw = new Set([this.head, ...this.arms]);
    for (const c of this.world.contacts) {
      const ai = claw.has(c.bi);
      const aj = claw.has(c.bj);
      if (ai === aj) continue;
      // ni points from bi to bj; force on bj = +ni * m
      const fy = c.ni.y * c.multiplier;
      f += aj ? fy : -fy;
    }
    return f;
  }

  stepClaw(dt) {
    const s = this.settings;
    const h = this.head;
    this.stateTime += dt;
    const v = h.velocity;
    v.setZero();
    switch (this.state) {
      case 'idle':
      case 'ready':
      case 'readyZ':
        this.armTarget = 0;
        this.armTorque = this.torqueFromPower(60);
        break;
      case 'moveX':
        if (h.position.x < CLAW.rangeX[1]) v.x = CLAW.moveSpeed;
        else this.release('b1');
        break;
      case 'moveZ':
        if (h.position.z > CLAW.rangeZ[0]) v.z = -CLAW.moveSpeed;
        else this.release('b2');
        break;
      case 'open':
        this.armTarget = Math.min(1, this.stateTime / 0.6);
        this.armTorque = this.torqueFromPower(80);
        if (this.stateTime > 0.8) {
          this.supportAvg = 0;
          this.setState('descend');
        }
        break;
      case 'descend': {
        this.armTarget = 1;
        const sf = this.clawSupportForce();
        this.supportAvg = this.supportAvg * 0.85 + sf * 0.15;
        // slack threshold: claw "weight" acting on the prize
        const slack = 4 + (s.push / 100) * 90;
        if (this.stateTime > 0.15 && this.supportAvg > slack) {
          this.stopDescent('slack');
        } else if (h.position.y <= this.minY) {
          this.stopDescent('bottom');
        } else {
          v.y = -CLAW.downSpeed;
        }
        break;
      }
      case 'close':
        this.armTarget = 0;
        this.armTorque = this.torqueFromPower(s.closePower);
        if (this.stateTime > 1.1) this.setState('rise');
        break;
      case 'rise':
        this.armTarget = 0;
        // grip weakens shortly after the claw starts going up
        {
          const k = clamp(this.stateTime / 0.35, 0, 1);
          this.armTorque = this.torqueFromPower(s.closePower + (s.risePower - s.closePower) * k);
        }
        if (h.position.y < CLAW.topY) v.y = CLAW.upSpeed;
        else if (this.stateTime > 0.3) this.setState('return');
        break;
      case 'return': {
        this.armTorque = this.torqueFromPower(s.risePower);
        const dx = CLAW.home.x - h.position.x;
        const dz = CLAW.home.z - h.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.02) {
          h.position.x = CLAW.home.x;
          h.position.z = CLAW.home.z;
          this.setState('drop');
        } else {
          const sp = Math.min(CLAW.moveSpeed, d / dt);
          v.x = (dx / d) * sp;
          v.z = (dz / d) * sp;
        }
        break;
      }
      case 'drop':
        this.armTarget = Math.min(1, this.stateTime / 0.4);
        this.armTorque = this.torqueFromPower(80);
        if (this.stateTime > 1.0) this.setState('shut');
        break;
      case 'shut':
        this.armTarget = Math.max(0, 1 - this.stateTime / 0.5);
        if (this.stateTime > 0.7) {
          this.setState('idle');
          this.emit('playend', { won: this.won });
        }
        break;
    }
    // clamp the next position to the rails
    const nx = h.position.x + v.x * dt;
    const nz = h.position.z + v.z * dt;
    if (nx > CLAW.rangeX[1] || nx < CLAW.rangeX[0]) v.x = 0;
    if (nz > CLAW.rangeZ[1] || nz < CLAW.rangeZ[0]) v.z = 0;
    if (h.position.y + v.y * dt > CLAW.topY) {
      v.y = 0;
      h.position.y = CLAW.topY;
    }
    this.updateArms();
  }

  step(dt) {
    this.stepClaw(dt);
    this.world.step(dt);
    this.time += dt;
    if (!this.won && this.box.position.y < this.deck.top - 0.8) {
      this.won = true;
      this.emit('win');
    }
    // safety: if the box glitches out of the machine, put it back
    if (this.box.position.y < -5 || !Number.isFinite(this.box.position.y)) {
      this.resetBox();
    }
  }

  // Advance by a frame time using fixed substeps.
  advance(frameDt) {
    this.acc = (this.acc || 0) + Math.min(frameDt, 0.1);
    let n = 0;
    while (this.acc >= DT && n < 40) {
      this.step(DT);
      this.acc -= DT;
      n++;
    }
  }
}
