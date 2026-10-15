// Headless physics checks: node scripts/sim-test.mjs [--random N]
import { UfoSim, STAGES, CLAW, DT } from '../src/sim.js';

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
  const sim = new UfoSim();
  for (const st of STAGES) {
    sim.setup(st);
    const b = sim.box.position;
    console.log(`[${st.id}] settled box y=${b.y.toFixed(3)} z=${b.z.toFixed(3)}`);
  }
  sim.setup(STAGES[1]);
  console.log('play: aim at front edge');
  play(sim, 1.0, 0.9, true);
  const q = sim.box.quaternion;
  console.log('box quat', q.x.toFixed(3), q.y.toFixed(3), q.z.toFixed(3), q.w.toFixed(3), 'won', sim.won);
}
