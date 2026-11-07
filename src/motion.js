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
  running=true;veil.hidden=false;veil.style.willChange='transform';
  return new Promise((resolve,reject)=>{
    const cover=veil.animate([{transform:'translate3d(100vw,0,0)'},{transform:'translate3d(-75vw,0,0)'}],{duration:420,easing:'cubic-bezier(.6,0,.3,1)',fill:'forwards'});
    const release=()=>{veil.getAnimations().forEach(a=>a.cancel());veil.hidden=true;veil.style.willChange='';running=false;};
    cover.finished.then(()=>{
      try{swap();}catch(error){release();reject(error);return;}
      resolve();
      requestAnimationFrame(()=>{
        const leave=veil.animate([{transform:'translate3d(-75vw,0,0)'},{transform:'translate3d(-250vw,0,0)'}],{duration:520,easing:'cubic-bezier(.25,.6,.3,1)',fill:'forwards'});
        leave.finished.then(release,release);
      });
    },error=>{release();try{swap();}catch{}resolve();});
  });
}

// The home-page machine travels to the preparation page: a copy of the photo zooms until the
// machine's front (display, knobs, brew cup) exactly fills the face card, then the card fades in.
// REGION is the band of the cutout the face view shows (top, height and right edge as fractions of the image);
// its width follows the face card's proportions.
const REGION={y:.24,h:.72,right:.96};
export function liftMachine(img){
  if(reduced()||!img||!img.naturalWidth||typeof img.animate!=='function')return null;
  const r=img.getBoundingClientRect();
  if(r.width<40||r.bottom<0||r.top>innerHeight)return null;
  // The photo is object-fit:contain, anchored bottom-centre.
  const k=Math.min(r.width/img.naturalWidth,r.height/img.naturalHeight),w=img.naturalWidth*k,h=img.naturalHeight*k;
  const left=r.left+(r.width-w)/2,top=r.top+(r.height-h);
  const clone=new Image();clone.src=img.currentSrc||img.src;clone.alt='';clone.className='fly-machine';clone.setAttribute('aria-hidden','true');
  Object.assign(clone.style,{left:left+'px',top:top+'px',width:w+'px',height:h+'px',filter:getComputedStyle(img).filter});
  document.body.append(clone);img.style.visibility='hidden';
  const restore=()=>{img.style.visibility='';};
  return{
    abort(){clone.remove();restore();},
    async land(stage){
      try{
        const s=stage.getBoundingClientRect(),scale=s.height/(REGION.h*h),regionW=s.width/scale,regionX=REGION.right*w-regionW;
        const tx=s.left-left-scale*regionX,ty=s.top-top-scale*REGION.y*h;
        const clip=`inset(${REGION.y*h}px ${w-REGION.right*w}px ${h-(REGION.y+REGION.h)*h}px ${regionX}px)`;
        const fly=clone.animate([{transform:'translate3d(0,0,0) scale(1)',clipPath:'inset(0px 0px 0px 0px round 0px)'},{transform:`translate3d(${tx}px,${ty}px,0) scale(${scale})`,clipPath:clip}],{duration:1100,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});
        await fly.finished;
        stage.classList.remove('zooming');
        await clone.animate([{opacity:1},{opacity:0}],{duration:420,easing:'ease-out',fill:'forwards'}).finished;
      }catch{stage.classList.remove('zooming');}
      finally{clone.remove();restore();}
    }
  };
}
