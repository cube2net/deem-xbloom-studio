// Dot-matrix metric tiles for the machine face, after the "DotTiles" design by Louis Studios:
// 5x7 dot numerals that count up and morph dot by dot, a title with a grey subtitle, a small unit,
// and a row of ticks with a marker. Vanilla port; every size is relative to the tile width (cqw).
const TW=206,PAD=19.5,TRACK_X0=19.5,TRACK_W=168,VIS_Y=164.2,PITCH=7.35,DOT_R=3.08,VAL_X=22.5,VAL_Y=89.1,VAL_MAX_W=140;
const TICKS=44,COUNT_MS=900,DRAW_MS=1400,POP_IN_MS=210,POP_OUT_MS=150,NS='http://www.w3.org/2000/svg';

export const GLYPHS={
  '0':['.XXX.','X...X','X...X','X...X','X...X','X...X','.XXX.'],
  '1':['..X..','.XX..','X.X..','..X..','..X..','..X..','XXXXX'],
  '2':['.XXX.','X...X','....X','..XX.','.X...','X....','XXXXX'],
  '3':['XXXXX','....X','...X.','..XX.','....X','X...X','.XXX.'],
  '4':['...X','..XX','.X.X','X..X','XXXX','...X','...X'],
  '5':['XXXXX','X....','X.XX.','XX..X','....X','X...X','.XXX.'],
  '6':['..XX.','.X...','X....','X.XX.','XX..X','X...X','.XXX.'],
  '7':['XXXXX','....X','...X.','...X.','..X..','.X...','.X...'],
  '8':['.XXX.','X...X','X...X','.XXX.','X...X','X...X','.XXX.'],
  '9':['.XXX.','X...X','X..XX','.XX.X','....X','...X.','.XX..'],
  ':':['.','.','X','.','X','.','.'],
  '.':['.','.','.','.','.','.','X'],
  '-':['...','...','...','XXX','...','...','...'],
  ' ':['.....','.....','.....','.....','.....','.....','.....'],
};

/** Columns and lit cells (row*64+col) for a string; glyphs are separated by one empty column. */
export function layoutText(s){
  const on=new Set();let x=0,first=true;
  for(const ch of s){
    const g=GLYPHS[ch]??GLYPHS[' '];
    if(!first)x+=1;first=false;
    const w=g[0].length;
    for(let r=0;r<7;r++)for(let c=0;c<w;c++)if(g[r][c]==='X')on.add(r*64+x+c);
    x+=w;
  }
  return{cols:x,on};
}
export const normalize=raw=>String(raw??'').trim().replace(/[—–−]/g,'-').replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-0x660));

const clamp01=x=>x<0?0:x>1?1:x;
const easeOutCubic=x=>1-Math.pow(1-x,3),easeInOutCubic=x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
const easeOutBack=x=>1+2.2*Math.pow(x-1,3)+1.2*Math.pow(x-1,2),easeInQuad=x=>x*x;
const hash=(a,b)=>{let h=(a*374761393+b*668265263)|0;h=(h^(h>>>13))*1274126177;return((h^(h>>>16))>>>0)/4294967296;};
const u=n=>`calc(${(n/TW).toFixed(5)} * 100cqw)`;
const BASE_COLS=layoutText('000.0').cols;
const isNum=s=>/^-?\d+(\.\d+)?$/.test(s);
const reduced=()=>!!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

class Tile{
  constructor(root,index){
    this.root=root;this.index=index;this.value='-';this.target=0;this.cols=0;
    this.markerX=0;this.introAt=-1;this.raf=0;this.visible=false;this.last=0;
    const put=(tag,cls,text,styles)=>{const e=document.createElement(tag);e.className=cls;if(text!=null)e.textContent=text;for(const[k,v]of Object.entries(styles||{}))e.style.setProperty(k,v);e.setAttribute('aria-hidden','true');root.append(e);return e;};
    this.titleEl=put('h3','dt-title',root.dataset.title,{right:u(PAD-1.4),top:u(19.5)});
    this.subEl=put('div','dt-sub',root.dataset.sub,{right:u(PAD-.9),top:u(53.1),'font-size':u(14.2)});
    this.unitEl=put('span','dt-unit',root.dataset.unit,{left:u(146.5),width:u(60),top:u(112),'font-size':u(15)});
    this.dotsSvg=document.createElementNS(NS,'svg');this.dotsSvg.setAttribute('aria-hidden','true');this.dotsSvg.setAttribute('class','dt-dots');root.append(this.dotsSvg);
    this.vis=document.createElementNS(NS,'svg');this.vis.setAttribute('aria-hidden','true');this.vis.setAttribute('class','dt-vis');this.vis.setAttribute('viewBox',`0 140 ${TW} 36`);
    Object.entries({left:'0',top:u(140),width:'100%',height:u(36)}).forEach(([k,v])=>this.vis.style.setProperty(k,v));
    this.ticks=Array.from({length:TICKS},(_,i)=>{const r=document.createElementNS(NS,'rect');r.setAttribute('x',(TRACK_X0+i*TRACK_W/(TICKS-1)-.62).toFixed(2));r.setAttribute('y',VIS_Y-4.5);r.setAttribute('width',1.24);r.setAttribute('height',9);r.setAttribute('fill','currentColor');r.setAttribute('opacity',0);this.vis.append(r);return r;});
    this.marker=document.createElementNS(NS,'rect');['y',VIS_Y-6.8,'width',9,'height',13.6,'rx',.6,'fill','currentColor','opacity',0].reduce((a,v,i,arr)=>{if(i%2===0)this.marker.setAttribute(v,arr[i+1]);return a;},0);this.vis.append(this.marker);
    root.append(this.vis);
    this.labLeft=put('span','dt-lab','0',{left:u(PAD-1)});this.labRight=put('span','dt-lab','',{right:u(PAD-1)});
    this.vis.style.display=this.labLeft.style.display=this.labRight.style.display='none';
    this.build(Math.max(BASE_COLS,layoutText(this.value).cols));
    this.fit();
  }
  build(cols){
    this.cols=cols;const N=cols*7;
    this.cur=new Float32Array(N);this.from=new Float32Array(N);this.to=new Float32Array(N);this.t0=new Float32Array(N);this.shown='';
    const scale=this.scale=Math.min(1,VAL_MAX_W/(cols*PITCH)),s=this.dotsSvg;
    s.replaceChildren();s.setAttribute('viewBox',`0 0 ${cols} 7`);
    for(const[k,v]of Object.entries({left:u(VAL_X-PITCH*scale/2),top:u(VAL_Y-PITCH*scale/2),width:u(cols*PITCH*scale),height:u(7*PITCH*scale)}))s.style.setProperty(k,v);
    this.dots=Array.from({length:N},(_,i)=>{const c=document.createElementNS(NS,'circle');c.setAttribute('cx',(i%cols)+.5);c.setAttribute('cy',Math.floor(i/cols)+.5);c.setAttribute('r',0);c.setAttribute('fill','currentColor');s.append(c);return c;});
  }
  fit(){
    const el=this.titleEl;el.style.setProperty('font-size',u(29.4));
    const avail=this.root.clientWidth*((TW-PAD*2+6)/TW),w=el.scrollWidth;
    el.style.setProperty('font-size',u(29.4*(w>avail&&w>0?Math.max(.6,avail/w):1)));
  }
  setValue(raw){
    const s=normalize(raw)||'-';if(s===this.value)return;
    this.value=s;const need=Math.max(BASE_COLS,layoutText(s).cols);if(need!==this.cols)this.build(need);
    this.kick();
  }
  setTarget(n){
    this.target=n>0?n:0;const on=this.target>0;
    this.vis.style.display=this.labLeft.style.display=this.labRight.style.display=on?'':'none';
    this.labRight.textContent=on?String(Math.round(this.target)):'';this.kick();
  }
  intro(delay=0){this.introAt=performance.now()+delay;this.markerX=0;this.dirty=true;this.kick();}
  retarget(s,now,instant){
    this.shown=s;const{on}=layoutText(s),N=this.cols*7,want=new Uint8Array(N);
    on.forEach(key=>{const c=key%64;if(c<this.cols)want[Math.floor(key/64)*this.cols+c]=1;});
    for(let i=0;i<N;i++){
      const t=want[i];if(this.to[i]===t)continue;
      const r=Math.floor(i/this.cols),c=i%this.cols;
      this.from[i]=this.cur[i];this.to[i]=t;this.t0[i]=instant?-1e9:now+c*6+r*9+hash(i,this.index)*26;
    }
  }
  writeDots(now){
    const R=DOT_R/PITCH,N=this.cols*7;let busy=false;
    for(let i=0;i<N;i++){
      if(this.cur[i]===this.to[i]&&this.t0[i]<now)continue;
      const up=this.to[i]>this.from[i],p=clamp01((now-this.t0[i])/(up?POP_IN_MS:POP_OUT_MS)),e=up?easeOutBack(p):easeInQuad(p);
      const v=p>=1?this.to[i]:this.from[i]+(this.to[i]-this.from[i])*e;
      if(p<1)busy=true;
      if(v!==this.cur[i]||p>=1){this.cur[i]=v;this.dots[i].setAttribute('r',Math.max(0,v*R).toFixed(4));}
    }
    return busy;
  }
  textAt(phase){
    const s=this.value,blank=' '.repeat(s.length);
    if(phase<0)return blank;
    if(phase<COUNT_MS&&isNum(s)){
      const dec=(s.split('.')[1]??'').length,step=Math.pow(10,-dec),steps=8,q=Math.floor(phase/COUNT_MS*steps)/steps;
      return(Math.round(parseFloat(s)*easeOutCubic(q)/step)*step).toFixed(dec).padStart(s.length,' ');
    }
    return s;
  }
  ticksAt(draw,markerX){
    const mx=TRACK_X0+markerX*TRACK_W;
    this.ticks.forEach((el,i)=>{
      const x=TRACK_X0+i*TRACK_W/(TICKS-1),reveal=clamp01((draw*1.5-i/TICKS)/.4),d=Math.abs(x-mx)-4.5;
      el.setAttribute('opacity',((d<1.4?0:x<mx?.94:.24)*reveal).toFixed(3));
    });
    this.marker.setAttribute('x',(mx-4.5).toFixed(2));this.marker.setAttribute('opacity',clamp01(draw*4).toFixed(3));
  }
  frame=now=>{
    this.raf=0;if(!this.visible)return;
    const dt=Math.min(100,Math.max(0,now-(this.last||now)));this.last=now;
    const still=reduced(),phase=this.introAt<0?-1:still?1e9:now-this.introAt;
    const s=still?this.value:this.textAt(phase);
    if(s!==this.shown)this.retarget(s,now,still);
    let busy=this.writeDots(now),settled=true;
    if(this.target>0){
      const draw=still?1:clamp01(phase/DRAW_MS),goal=clamp01((parseFloat(this.value)||0)/this.target);
      if(still||phase<1300){const intro=still?1:easeInOutCubic(clamp01((phase-120)/1150));this.markerX=goal*(phase<0?0:intro);}
      else this.markerX+=(goal-this.markerX)*(1-Math.exp(-dt/110));
      if(Math.abs(goal-this.markerX)<.0005&&phase>=1300)this.markerX=goal;
      this.ticksAt(phase<0?0:draw,this.markerX);
      settled=phase>=DRAW_MS&&Math.abs(goal-this.markerX)<.0005;
    }
    const intro=phase>=0&&phase<Math.max(COUNT_MS,DRAW_MS)+100;
    if(busy||intro||!settled)this.kick(true);
  };
  kick(force){if(!this.raf&&(this.visible||force)){this.visible=true;this.raf=requestAnimationFrame(this.frame);}}
  pause(){this.visible=false;if(this.raf)cancelAnimationFrame(this.raf);this.raf=0;}
}

export function setupDotDisplays(stage){
  const tiles=[...stage.querySelectorAll('.face-read')].map((root,i)=>{
    const tile=new Tile(root,i);root._tile=tile;
    const b=root.querySelector('b');tile.setValue(b.textContent);
    new MutationObserver(()=>tile.setValue(b.textContent)).observe(b,{childList:true,characterData:true,subtree:true});
    return tile;
  });
  const replay=()=>{if(stage.classList.contains('zooming'))return;tiles.forEach((t,i)=>t.intro(i*140));};
  if(typeof IntersectionObserver==='function')new IntersectionObserver(entries=>{
    const on=entries[entries.length-1].isIntersecting;
    tiles.forEach(t=>on?(t.visible=true,t.kick()):t.pause());
    if(on&&!stage.classList.contains('zooming')&&tiles.some(t=>t.introAt<0||!stage._seen))replay(),stage._seen=true;
    if(!on)stage._seen=false;
  }).observe(stage);else replay();
  // The zoom from the home page hands over to the tiles: play their intro once the card is revealed.
  new MutationObserver(()=>{if(!stage.classList.contains('zooming'))replay();}).observe(stage,{attributes:true,attributeFilter:['class']});
  document.fonts?.ready.then(()=>tiles.forEach(t=>t.fit()));
  if(typeof ResizeObserver==='function')new ResizeObserver(()=>tiles.forEach(t=>t.fit())).observe(stage);
  return tiles;
}

/** Planned amounts (grams) behind the progress ticks, keyed by tile: { water, cup }. */
export function setDotTargets(stage,targets){
  for(const[key,n]of Object.entries(targets)){const t=stage.querySelector('.face-'+key)?._tile;t?.setTarget(n);}
}
