// Ding-style toasts without a framework: spring-physics motion, typed icons,
// optional action button, loading → result promise toasts, hover-to-pause and swipe-to-dismiss.
const ICONS={
  success:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 4 4 8-9"/></svg>',
  error:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>',
  info:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 11v6M12 7.2v.1"/></svg>',
  warning:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v6M12 16.6v.1"/></svg>',
  loading:'<svg class="ding-spin" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 1 0 8 8"/></svg>'
};
const MAX_VISIBLE=4,DEFAULT_MS=4500;
const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const canLinear=typeof CSS!=='undefined'&&typeof CSS.supports==='function'&&CSS.supports('animation-timing-function','linear(0,1)');

// Damped spring → CSS linear() easing, so the motion is a real spring, not a cubic-bezier guess.
const springCache=new Map();
export function spring({stiffness=380,damping=24,mass=1}={}){
  const key=stiffness+'/'+damping+'/'+mass;if(springCache.has(key))return springCache.get(key);
  const w0=Math.sqrt(stiffness/mass),zeta=damping/(2*Math.sqrt(stiffness*mass)),points=[];
  const at=t=>{if(zeta<1){const wd=w0*Math.sqrt(1-zeta*zeta);return 1-Math.exp(-zeta*w0*t)*(Math.cos(wd*t)+zeta*w0/wd*Math.sin(wd*t));}return 1-Math.exp(-w0*t)*(1+w0*t);};
  let settled=0,t=0,end=2;
  for(;t<4;t+=1/60){const x=at(t);points.push(+x.toFixed(4));if(Math.abs(1-x)<.0015){if(++settled>=4){end=t;break;}}else settled=0;}
  if(points.length<3)points.push(1);
  const result={duration:Math.round(Math.max(end,.25)*1000),easing:canLinear?'linear('+points.join(',')+',1)':'cubic-bezier(.34,1.56,.64,1)'};
  springCache.set(key,result);return result;
}

let list=null,counter=0;const entries=new Map();
function container(){
  if(list)return list;
  list=document.createElement('ol');list.className='ding';list.setAttribute('popover','manual');list.setAttribute('aria-live','polite');list.setAttribute('aria-relevant','additions');
  document.body.append(list);
  // A modal dialog opened later would cover the toasts; re-promote them to the top layer.
  new MutationObserver(()=>{if(list.childElementCount&&list.matches?.(':popover-open')){try{list.hidePopover();list.showPopover();}catch{}}}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
  return list;
}
function sync(){
  const el=container();
  if(typeof el.showPopover!=='function')return;
  const open=el.matches(':popover-open');
  try{if(el.childElementCount&&!open)el.showPopover();else if(!el.childElementCount&&open)el.hidePopover();}catch{}
}
// FLIP: let the toasts that stay glide to their new place on a spring.
function relayout(mutate,skip){
  const before=new Map();for(const el of list.children)before.set(el,el.getBoundingClientRect().top);
  mutate();sync();
  if(reduced())return;
  const s=spring({stiffness:320,damping:26});
  for(const el of list.children){
    if(el===skip||!before.has(el)||el.dataset.leaving)continue;
    const delta=before.get(el)-el.getBoundingClientRect().top;
    if(Math.abs(delta)>.5)el.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:s.duration,easing:s.easing});
  }
}
function setIcon(entry,type,pop){
  const icon=entry.el.querySelector('.ding-icon');icon.innerHTML=ICONS[type]||ICONS.info;
  if(pop&&!reduced()){const s=spring({stiffness:520,damping:16});icon.animate([{transform:'scale(.4)'},{transform:'scale(1)'}],{duration:s.duration,easing:s.easing});}
}
function setTimer(entry,duration){
  entry.bar?.cancel();entry.bar=null;const bar=entry.el.querySelector('.ding-bar');
  if(!Number.isFinite(duration)||duration<=0){bar.hidden=true;return;}
  bar.hidden=false;
  entry.bar=bar.animate([{transform:'scaleX(1)'},{transform:'scaleX(0)'}],{duration,easing:'linear',fill:'forwards'});
  entry.bar.onfinish=()=>dismiss(entry.id);
  if(entry.paused)entry.bar.pause();
}
function render(entry,opts,animateIcon){
  const el=entry.el,type=opts.type||entry.type||'info';entry.type=type;el.dataset.type=type;el.setAttribute('role',type==='error'?'alert':'status');
  if(opts.title!==undefined)el.querySelector('.ding-title').textContent=opts.title;
  if(opts.description!==undefined){const d=el.querySelector('.ding-desc');d.textContent=opts.description||'';d.hidden=!opts.description;}
  setIcon(entry,type,animateIcon);
  const btn=el.querySelector('.ding-action');
  if(opts.action!==undefined){
    entry.action=opts.action;btn.hidden=!opts.action;btn.textContent=opts.action?.label||'';
  }
  setTimer(entry,opts.duration!==undefined?opts.duration:type==='loading'?Infinity:DEFAULT_MS);
}
function build(entry){
  const el=document.createElement('li');el.className='ding-toast';
  el.innerHTML='<span class="ding-icon"></span><div class="ding-body"><strong class="ding-title" dir="auto"></strong><p class="ding-desc" dir="auto" hidden></p></div><button type="button" class="ding-action" hidden></button><button type="button" class="ding-close" aria-label="إغلاق التنبيه">×</button><span class="ding-bar" aria-hidden="true"></span>';
  el.querySelector('.ding-close').onclick=()=>dismiss(entry.id);
  el.querySelector('.ding-action').onclick=()=>{
    const result=entry.action?.onClick?.();
    if(result&&typeof result==='object')update(entry.id,result);else dismiss(entry.id);
  };
  const pause=()=>{entry.paused=true;entry.bar?.pause();},resume=()=>{entry.paused=false;if(!entry.dragging)entry.bar?.play();};
  el.addEventListener('pointerenter',pause);el.addEventListener('pointerleave',resume);el.addEventListener('focusin',pause);el.addEventListener('focusout',resume);
  swipe(entry,el);
  return el;
}
function swipe(entry,el){
  let startX=0,startY=0,dx=0,active=false;
  el.addEventListener('pointerdown',e=>{if(e.target.closest('button')||e.button>0)return;active=true;entry.dragging=true;startX=e.clientX;startY=e.clientY;dx=0;el.setPointerCapture(e.pointerId);entry.bar?.pause();});
  el.addEventListener('pointermove',e=>{if(!active)return;dx=e.clientX-startX;if(Math.abs(e.clientY-startY)>Math.abs(dx)*1.6&&Math.abs(dx)<12)return;el.style.transform=`translateX(${dx}px) rotate(${dx/60}deg)`;el.style.opacity=String(Math.max(.25,1-Math.abs(dx)/260));});
  const end=()=>{
    if(!active)return;active=false;entry.dragging=false;
    if(Math.abs(dx)>90){dismiss(entry.id,dx>0?1:-1);return;}
    const from=el.style.transform||'none',fromOpacity=el.style.opacity||'1';el.style.transform='';el.style.opacity='';
    if(!reduced()){const s=spring({stiffness:420,damping:24});el.animate([{transform:from,opacity:fromOpacity},{transform:'none',opacity:1}],{duration:s.duration,easing:s.easing});}
    if(!entry.paused)entry.bar?.play();
  };
  el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
}

export function update(id,opts={}){
  const entry=entries.get(id);if(!entry)return id;
  render(entry,opts,true);return id;
}
export function dismiss(id,direction=0){
  const entry=entries.get(id);if(!entry||entry.el.dataset.leaving)return;
  entry.el.dataset.leaving='1';entry.bar?.cancel();entries.delete(id);
  const remove=()=>relayout(()=>entry.el.remove(),entry.el);
  if(reduced()){remove();return;}
  const x=direction?direction*160:0;
  const out=entry.el.animate([{opacity:getComputedStyle(entry.el).opacity,transform:getComputedStyle(entry.el).transform==='none'?'none':getComputedStyle(entry.el).transform},{opacity:0,transform:direction?`translateX(${x}px) rotate(${direction*6}deg)`:'translateY(-18px) scale(.94)'}],{duration:direction?200:240,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});
  out.onfinish=remove;out.oncancel=remove;
}

export function toast(title,opts={}){
  container();
  const entry={id:++counter,type:opts.type||'info',paused:false,dragging:false,bar:null,action:null};
  entry.el=build(entry);entries.set(entry.id,entry);
  render(entry,{title:String(title??''),description:opts.description,action:opts.action||null,type:entry.type,duration:opts.duration},false);
  relayout(()=>list.prepend(entry.el),entry.el);
  // Older toasts beyond the limit leave first.
  const extra=[...entries.values()].filter(e=>!e.el.dataset.leaving);
  if(extra.length>MAX_VISIBLE)for(const old of extra.slice(0,extra.length-MAX_VISIBLE))dismiss(old.id);
  if(!reduced()){const s=spring({stiffness:360,damping:21});entry.el.animate([{transform:'translateY(-30px) scale(.9)'},{transform:'translateY(0) scale(1)'}],{duration:s.duration,easing:s.easing});entry.el.animate([{opacity:0},{opacity:1}],{duration:160,easing:'ease-out'});}
  return entry.id;
}
for(const type of ['success','error','info','warning'])toast[type]=(title,opts={})=>toast(title,{...opts,type});
toast.dismiss=id=>{if(id===undefined)for(const key of [...entries.keys()])dismiss(key);else dismiss(id);};
toast.update=update;
// Loading toast that turns into a success or error toast when the promise settles.
toast.promise=(promise,messages={})=>{
  const text=(m,value,fallback)=>typeof m==='function'?m(value):m??fallback;
  const id=toast(text(messages.loading,undefined,'جارٍ التنفيذ…'),{type:'loading',duration:Infinity});
  Promise.resolve(promise).then(
    value=>update(id,{type:'success',title:text(messages.success,value,'تم'),description:'',duration:DEFAULT_MS}),
    error=>update(id,{type:'error',title:text(messages.error,error,'تعذّر إكمال العملية'),description:'',duration:6000})
  );
  return promise;
};
export default toast;
