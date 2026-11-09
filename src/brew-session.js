// Tracks only received scale samples. Recipe values are targets, never readings.
export class BrewSession {
  constructor(recipe, now=Date.now(),status='active'){this.recipe=structuredClone(recipe);this.startedAt=now;this.endedAt=null;this.status=status;this.connected=true;this.samples={water:[],coffee:[]};this.latest={water:null,coffee:null};this.lastAt=null;this.problem=null;this.failure=null;}
  elapsed(now=Date.now()){if(this.status==='pending'||this.status==='failed')return 0;return Math.max(0,((this.endedAt??now)-this.startedAt)/1000);}
  ingest(event,now=Date.now()){
    if(this.status!=='active'||!this.connected)return;
    for(const key of ['water','coffee'])if(Number.isFinite(event[key])&&event[key]>=0&&event[key]<=2000){const points=this.samples[key];points.push({t:this.elapsed(now),value:event[key]});if(points.length>3600)this.samples[key]=points.filter((_,i)=>i%2===0||i===points.length-1);this.latest[key]=event[key];this.lastAt=now;}
    if(event.state===0x24)this.finish('complete',now);
    else if([1,0x41].includes(event.state))this.finish('ended',now);
  }
  finish(status,now=Date.now()){if(!['active','pending'].includes(this.status))return;this.endedAt=this.status==='pending'?this.startedAt:now;this.status=status;}
}

// Machine states that mean "something needs attention". Unknown states are only reported
// while a start is pending, so normal transitions during a brew never raise false alarms.
const EXPECTED=new Set([0x01,0x10,0x1d,0x1e,0x1f,0x22,0x23,0x24,0x3b,0x41]);
export function machineProblem(state){
  if(state===0x0c)return {kind:'water',title:'المكينة تحتاج ماء',message:'المكينة أبلغت أن الماء غير كافٍ.',hint:'أضف الماء إلى الخزان وتأكد من تركيبه جيدًا، ثم أرسل الوصفة مجددًا.'};
  if(state===0x0f)return {kind:'beans',title:'المكينة تنتظر البن',message:'المكينة أبلغت أن البن غير متوفر.',hint:'ضع البن في الحاوية وتأكد من إغلاقها، ثم أرسل الوصفة مجددًا.'};
  if(Number.isInteger(state)&&!EXPECTED.has(state))return {kind:'unknown',title:'حالة غير متوقعة من المكينة',message:'أبلغت المكينة عن الحالة 0x'+state.toString(16).toUpperCase().padStart(2,'0')+'.',hint:'راجع شاشة المكينة؛ قد تحتاج تنظيفًا أو وضع الكوب أو الفلتر.'};
  return null;
}

// Interpolated scale reading (grams of water) at time t, from the received samples only.
export function waterAt(samples,t){
  if(!samples.length)return null;let prev=null;
  for(const s of samples){if(s.t>t)return prev?prev.value+(s.value-prev.value)*Math.min(1,(t-prev.t)/Math.max(.001,s.t-prev.t)):null;prev=s;}
  return prev.value;
}
// Per-pour animation state from real scale readings: fill 0..1 while water is poured,
// then wait 0..1 across the recipe's pause. running=false freezes at the last state.
export function pourProgress(session,t=session.elapsed(),running=session.status==='active'){
  const water=waterAt(session.samples.water,t),finished=session.status==='complete'&&!running;let start=0;
  return session.recipe.pours.map(p=>{
    const ml=Number(p.ml)||0,end=start+ml,pause=Number(p.pause)||0,tol=Math.min(2,ml*.05),first=start;start=end;
    if(finished)return {fill:1,wait:1,phase:'done',left:0};
    const fill=ml>0&&water!==null?Math.min(1,Math.max(0,(water-first)/Math.max(.001,ml-tol))):0;
    if(fill<1)return {fill,wait:0,phase:fill>0&&running?'pour':'idle',left:pause};
    const reachedAt=session.samples.water.find(x=>x.t<=t&&x.value>=end-tol)?.t??t,wait=pause?Math.min(1,Math.max(0,(t-reachedAt)/pause)):1;
    return {fill:1,wait,phase:wait<1&&running?'wait':'done',left:Math.ceil(pause*(1-wait))};
  });
}
