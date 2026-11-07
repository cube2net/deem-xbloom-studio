import test from 'node:test';
import assert from 'node:assert/strict';
import {machineProblem} from '../src/brew-session.js';
test('water and bean shortages are reported with guidance',()=>{
  assert.equal(machineProblem(0x0c).kind,'water');assert.match(machineProblem(0x0c).hint,/الماء/);
  assert.equal(machineProblem(0x0f).kind,'beans');
});
test('expected states are not problems; unexpected states are reported with their code',()=>{
  for(const s of [0x01,0x10,0x1d,0x1e,0x1f,0x22,0x23,0x24,0x3b,0x41])assert.equal(machineProblem(s),null,'0x'+s.toString(16));
  const p=machineProblem(0x7a);assert.equal(p.kind,'unknown');assert.match(p.message,/0x7A/);
  assert.equal(machineProblem(undefined),null);
});
