import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spring} from '../src/toast.js';
const points=easing=>easing.startsWith('linear(')?easing.slice(7,-1).split(',').map(Number):null;
test('spring settles on 1 and overshoots when under-damped',()=>{
  const {easing,duration}=spring({stiffness:380,damping:18});
  const p=points(easing);
  if(p){assert.equal(p.at(-1),1);assert.ok(Math.max(...p)>1,'under-damped spring should overshoot');assert.equal(p[0],0);}
  assert.ok(duration>=250&&duration<4000);
});
test('critically damped spring does not overshoot',()=>{
  const p=points(spring({stiffness:300,damping:2*Math.sqrt(300)}).easing);
  if(p)assert.ok(Math.max(...p)<=1.0001);
});
test('spring results are cached per parameter set',()=>{assert.equal(spring({stiffness:111,damping:15}),spring({stiffness:111,damping:15}));});
