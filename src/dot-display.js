// Draws a label and a number as white LED-matrix dots on a canvas (no frame, no background).
// The real text stays in the DOM (visually hidden) so screen readers still get the values.
const DOT_FONT='800 40px Cairo, sans-serif';

function sample(text,cols,rows,{px,align='center',weight=800}={}){
  const off=document.createElement('canvas');off.width=cols;off.height=rows;
  const ctx=off.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#000';ctx.textBaseline='alphabetic';
  let size=px;ctx.font=`${weight} ${size}px Cairo, sans-serif`;
  const width=ctx.measureText(text).width;
  if(width>cols*0.96){size=size*cols*0.96/width;ctx.font=`${weight} ${size}px Cairo, sans-serif`;}
  ctx.textAlign=align;
  ctx.fillText(text,align==='center'?cols/2:0,rows*0.82);
  const data=ctx.getImageData(0,0,cols,rows).data,out=[];
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if(data[(y*cols+x)*4+3]>96)out.push([x,y]);
  return out;
}

export function drawDots(canvas,label,value,unit='غ'){
  const box=canvas.getBoundingClientRect();if(box.width<8||box.height<8)return;
  const dpr=Math.min(globalThis.devicePixelRatio||1,3),pitch=Math.max(2,box.width/62);
  canvas.width=Math.round(box.width*dpr);canvas.height=Math.round(box.height*dpr);
  const cols=Math.floor(box.width/pitch),rows=Math.floor(box.height/pitch);
  const labelRows=Math.round(rows*0.4),gap=Math.round(rows*0.04),valueRows=rows-labelRows-gap;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
  const ox=(box.width-cols*pitch)/2,r=pitch*0.4;
  ctx.fillStyle='#fff';ctx.shadowColor='rgba(255,255,255,.9)';ctx.shadowBlur=pitch*1.4*dpr;
  const plot=(dots,y0,x0=0)=>{for(const [x,y] of dots){ctx.beginPath();ctx.arc((ox+(x+x0+.5)*pitch)*dpr,((y0+y+.5)*pitch)*dpr,r*dpr,0,6.2832);ctx.fill();}};
  plot(sample(label,cols,labelRows,{px:labelRows*1.0,weight:700}),0);
  // number on the left, unit letter small at its end
  const unitCols=Math.round(cols*0.2);
  plot(sample(value,cols-unitCols,valueRows,{px:valueRows*1.12,weight:800}),labelRows+gap);
  plot(sample(unit,unitCols,Math.round(valueRows*0.6),{px:valueRows*0.6,weight:700}),labelRows+gap+Math.round(valueRows*0.38),cols-unitCols);
}

export function setupDotDisplays(root){
  const reads=[...root.querySelectorAll('.face-read')];
  const paint=()=>{for(const read of reads){const canvas=read.querySelector('canvas'),label=read.dataset.label,value=read.querySelector('b').textContent.trim()||'—';drawDots(canvas,label,value);}};
  let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;paint();});};
  const observer=new MutationObserver(schedule);
  for(const read of reads)observer.observe(read.querySelector('b'),{childList:true,characterData:true,subtree:true});
  if(typeof ResizeObserver==='function')new ResizeObserver(schedule).observe(root);
  document.fonts?.load(DOT_FONT).then(schedule,schedule);document.fonts?.ready.then(schedule);
  schedule();
  return paint;
}
