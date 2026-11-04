import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Machine} from '../src/bluetooth.js';
import {crc16} from '../src/protocol.js';
const recipe={model:'Studio',dose_g:16,grind:55,pours:[{ml:40,temp:92,pattern:'spiral',before:false,agitation:false,pause:30,rpm:100,flow:3},{ml:200,temp:92,pattern:'spiral',before:false,agitation:false,pause:5,rpm:100,flow:3}]};
function fake(){const m=new Machine();m.connected=true;m.state=0x1f;m.armed=JSON.stringify(recipe);m.device={gatt:{connected:true}};m.writes=[];m.command={writeValueWithoutResponse:async b=>m.writes.push(b[3])};return m;}
test('auto-proceed on commit never sends a redundant start',async()=>{const m=fake();m.waitState=async()=>0x22;await m.brew(recipe);assert.deepEqual(m.writes,[0x42]);});
test('unconfirmed state never guesses or retries a physical start',async()=>{const m=fake();m.waitState=async()=>null;await assert.rejects(m.brew(recipe),/حالة تأكيد/);assert.deepEqual(m.writes,[0x42]);});
test('fallback start requires current awaiting-confirm telemetry',async()=>{const m=fake();let step=0;m.waitState=async()=>{if(step++===0){m.state=0x1e;m.events.push({time:Date.now(),state:0x1e});return null;}return 0x22;};await m.brew(recipe);assert.deepEqual(m.writes,[0x42,0x46]);});
test('cancel invalidates pending load so no recipe frames follow the stop',async()=>{const m=fake();m.state=1;m.command.writeValueWithoutResponse=async b=>{m.writes.push(b[3]);if(b[3]===0x47){const f=Buffer.from('580207571f10000000c1010000002d33','hex');assert.equal(crc16(f.subarray(0,-2)),f.readUInt16LE(f.length-2));m.receive(f);}};const loading=m.load(recipe);const result=assert.rejects(loading,/أُلغي التحميل/);await new Promise(r=>setTimeout(r,650));await m.stop();await result;assert.deepEqual(m.writes,[0xa4,0x56,0x47]);assert.equal(m.armed,null);});
