// Tracks only received scale samples. Recipe values are targets, never readings.
export class BrewSession {
  constructor(recipe, now=Date.now(),status='active'){this.recipe=structuredClone(recipe);this.startedAt=now;this.endedAt=null;this.status=status;this.connected=true;this.samples={water:[],coffee:[]};this.latest={water:null,coffee:null};this.lastAt=null;}
  elapsed(now=Date.now()){if(this.status==='pending'||this.status==='failed')return 0;return Math.max(0,((this.endedAt??now)-this.startedAt)/1000);}
  ingest(event,now=Date.now()){
    if(this.status!=='active'||!this.connected)return;
    for(const key of ['water','coffee'])if(Number.isFinite(event[key])&&event[key]>=0&&event[key]<=2000){const points=this.samples[key];points.push({t:this.elapsed(now),value:event[key]});if(points.length>3600)this.samples[key]=points.filter((_,i)=>i%2===0||i===points.length-1);this.latest[key]=event[key];this.lastAt=now;}
    if(event.state===0x24)this.finish('complete',now);
    else if([1,0x41].includes(event.state))this.finish('ended',now);
  }
  finish(status,now=Date.now()){if(!['active','pending'].includes(this.status))return;this.endedAt=this.status==='pending'?this.startedAt:now;this.status=status;}
}
