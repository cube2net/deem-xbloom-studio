// Fluid page transitions: a caramel "crema" ribbon sweeps across the screen,
// the page is swapped while it is fully covered, then the ribbon flows away.
const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
let running=false;

export function prefersReducedMotion(){return reduced();}

// Runs `swap` once the screen is covered. The returned promise resolves right
// after the swap, so callers can carry on while the ribbon is still leaving.
export function flow(swap){
  const veil=typeof document==='undefined'?null:document.getElementById('crema');
  if(reduced()||running||!veil||typeof veil.animate!=='function'){swap();return Promise.resolve();}
  running=true;
  return new Promise((resolve,reject)=>{
    const cover=veil.animate([{transform:'translateX(100vw)'},{transform:'translateX(-175vw)'}],{duration:480,easing:'cubic-bezier(.62,0,.32,1)',fill:'forwards'});
    const release=()=>{veil.getAnimations().forEach(a=>a.cancel());running=false;};
    cover.finished.then(()=>{
      try{swap();}catch(error){release();reject(error);return;}
      resolve();
      requestAnimationFrame(()=>{
        const leave=veil.animate([{transform:'translateX(-175vw)'},{transform:'translateX(-350vw)'}],{duration:560,easing:'cubic-bezier(.25,.6,.3,1)',fill:'forwards'});
        leave.finished.then(release,release);
      });
    },error=>{release();try{swap();}catch{}resolve();});
  });
}
