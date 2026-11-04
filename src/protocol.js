// MIT protocol builders: Janczykkkko and brAzzi64 (2026).
// See THIRD_PARTY_NOTICES.md. Verified source firmware: V12.0D.500.
export const SERVICE='0000e0ff-3c17-d293-8e48-14fe2e4da212';
export const COMMAND='0000ffe1-0000-1000-8000-00805f9b34fb';
export const STATUS='0000ffe2-0000-1000-8000-00805f9b34fb';
export function crc16(data){let crc=0;for(const b of data){crc^=b;for(let i=0;i<8;i++)crc=(crc&1)?(crc>>>1)^0x8408:crc>>>1;}return crc;}
export function frame(cmd,seq,payload){const bytes=new Uint8Array(11+payload.length);bytes.set([0x58,1,1,cmd,seq]);new DataView(bytes.buffer).setUint16(5,bytes.length,true);bytes.set(payload,9);new DataView(bytes.buffer).setUint16(bytes.length-2,crc16(bytes.slice(0,-2)),true);return bytes;}
export const commit=()=>frame(0x42,0x1f,[1]);
export const start=()=>frame(0x46,0x9e,[1]);
export const cancel=()=>frame(0x47,0x9e,[1]);
export const handshake=()=>frame(0x56,0x1f,[1]);
export const patternCode=pattern=>pattern==='center'?0:pattern==='ring'||pattern==='circular'?1:pattern==='spiral'?2:undefined;
export const vibrationCode=(before,after)=>(before?1:0)|(after?2:0);
const grinderRpm=r=>r.rpm??r.pours?.[0]?.rpm;
export function issues(r){
  const errors=[];
  if(r.details_incomplete)errors.push("المصدر لا يوفّر تفاصيل الصبات لهذه الوصفة؛ افتح رابط xBloom الأصلي.");
  if(r.unsupported_bypass)errors.push('هذه الوصفة تستخدم ماء التجاوز (Bypass)، وهو غير مدعوم في بروتوكول هذا الإصدار.');
  const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
  if(r.model!=='Studio')errors.push('التحكم متاح لوصفات Studio فقط.');
  if(!integer(r.dose_g,1,30))errors.push('الجرعة يجب أن تكون عددًا صحيحًا بين 1 و30 غ.');
  if(!integer(r.grind,0,80))errors.push('الطحن يجب أن يكون 1–80، أو 0 للبن المطحون.');
  const rpm=grinderRpm(r);
  if(!(r.grind===0&&rpm===0)&&!integer(rpm,60,120))errors.push('سرعة المطحنة يجب أن تكون عددًا صحيحًا بين 60 و120 RPM، أو صفر عند إلغاء الطحن.');
  if(!Array.isArray(r.pours)||r.pours.length<2||r.pours.length>10)errors.push('الوصفة تحتاج 2–10 صبات.');
  let length=0,total=0;
  for(const [i,p] of (r.pours||[]).entries()){
    const label='الصبة '+(i+1)+': ';
    if(!integer(p.ml,1,500))errors.push(label+'كمية الماء يجب أن تكون 1–500 مل.');
    if(!integer(p.temp,40,95)||p.temperature_mode&&p.temperature_mode!=='numeric_celsius')errors.push(label+'درجة الحرارة الرقمية المدعومة 40–95°م.');
    if(patternCode(p.pattern)===undefined)errors.push(label+'نمط الصب غير معروف؛ الأنماط المدعومة مركزي ودائري وحلزوني.');
    if(typeof p.agitation!=='boolean'||typeof p.before!=='boolean')errors.push(label+'بيانات الاهتزاز غير مكتملة.');
    if(!Number.isFinite(p.flow)||p.flow<3||p.flow>3.5||Math.abs(p.flow*10-Math.round(p.flow*10))>1e-7)errors.push(label+'التدفق 3.0–3.5 مل/ث بخطوة 0.1.');
    if(!integer(p.pause,0,255))errors.push(label+'الانتظار يجب أن يكون 0–255 ثانية.');
    length+=8+4*Math.max(0,Math.ceil(p.ml/127)-1);total+=p.ml;
  }
  if(length>255)errors.push('الوصفة أطول من حزمة البلوتوث المدعومة.');
  if(!Number.isFinite(total)||total>600)errors.push('إجمالي ماء التحضير المدعوم حتى 600 مل.');
  if(!Number.isFinite(total/r.dose_g)||Math.round(total/r.dose_g*10)>255)errors.push('نسبة الماء إلى القهوة تتجاوز النطاق المدعوم.');
  return [...new Set(errors)];
}
export function loadFrames(r){
  const errors=issues(r);if(errors.length)throw new Error(errors.join('\n'));
  const dose=new Uint8Array(13);dose[0]=1;dose[9]=r.dose_g;
  const temps=new Uint8Array(9);temps[0]=1;const v=new DataView(temps.buffer);v.setFloat32(1,110,true);v.setFloat32(5,90,true);
  const segments=[];
  r.pours.forEach((p,i)=>{const pat=patternCode(p.pattern),agit=vibrationCode(p.before,p.agitation);let ml=p.ml;while(ml>127){segments.push(127,p.temp,pat,agit);ml-=127;}segments.push(ml,p.temp,pat,agit,(-p.pause)&255,0,i?0:grinderRpm(r),Math.round(p.flow*10));});
  const total=r.pours.reduce((sum,p)=>sum+p.ml,0);
  return [frame(0xa4,0x1f,[1,0xb9,0,0,0,1,0,0,0]),frame(0xa6,0x1f,dose),frame(0xa8,0x1f,temps),frame(r.grind===0?0x44:0x41,0x1f,[1,segments.length,...segments,r.grind===0?0xfe:r.grind,Math.round(total/r.dose_g*10)])];
}
export function notification(data){
  const b=data instanceof Uint8Array?data:new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
  if(b.length<12||b[0]!==0x58||b[1]!==2||b[2]!==7)return null;
  const v=new DataView(b.buffer,b.byteOffset,b.byteLength),length=v.getUint32(5,true);
  if(length!==b.length||v.getUint16(b.length-2,true)!==crc16(b.slice(0,-2))||b[9]!==0xc1)return null;
  if(b[3]===0x57&&b.length>=13)return {state:b[10]};
  if(b[3]===0x49){const info=new TextDecoder().decode(b.slice(10,-2)),firmware=info.match(/V\d+[.][\dA-Za-z]+[.]\d+/)?.[0];if(firmware)return {firmware};}
  if((b[3]===0x4b||b[3]===0x15)&&b.length>=16){const weight=v.getFloat32(10,true)*(b[3]===0x4b?.001:1);if(Number.isFinite(weight)&&weight>=0&&weight<=2000)return {[b[3]===0x4b?'water':'coffee']:weight};}
  return {ack:b[3]};
}
