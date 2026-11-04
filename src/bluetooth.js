import {SERVICE,COMMAND,STATUS,frame,handshake,loadFrames,commit,start,cancel,notification} from './protocol.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export class Machine extends EventTarget {
  constructor(){super();this.connected=false;this.busy=false;this.state=null;this.armed=null;this.events=[];this.generation=0;this.cancelRequested=false;this.writeQueue=Promise.resolve();}
  emit(type,detail){this.dispatchEvent(new CustomEvent(type,{detail}));}
  reset(){this.generation++;this.connected=false;this.armed=null;this.state=null;this.busy=false;this.events=[];this.emit('connection',false);}
  async connect(){
    if(this.connected)return;
    if(!globalThis.navigator?.bluetooth)throw new Error('افتح ديم في Chrome على أندرويد أو الكمبيوتر لدعم البلوتوث.');
    if(!globalThis.isSecureContext)throw new Error('الاتصال يحتاج رابط HTTPS أو localhost.');
    let device;
    try{
      device=await navigator.bluetooth.requestDevice({filters:[{namePrefix:'XBLOOM'},{services:[SERVICE]}],optionalServices:[SERVICE,'device_information']});
      this.device=device;
      device.addEventListener('gattserverdisconnected',()=>this.reset(),{once:true});
      const server=await device.gatt.connect(),service=await server.getPrimaryService(SERVICE);
      this.command=await service.getCharacteristic(COMMAND);
      this.status=await service.getCharacteristic(STATUS);
      this.status.addEventListener('characteristicvaluechanged',e=>this.receive(e.target.value));
      await this.status.startNotifications();
      this.connected=true;this.events=[];this.armed=null;
      await this.write(frame(0xa4,0x1f,[1,0xb9,0,0,0,1,0,0,0]));
      await sleep(500);await this.write(handshake());
      this.emit('connection',true);
      // Standard read-only GATT information, when provided by this firmware.
      try{const info=await server.getPrimaryService('device_information');const firmware=await info.getCharacteristic('firmware_revision_string');const value=await firmware.readValue();this.emit('telemetry',{firmware:new TextDecoder().decode(value).replace(/\0/g,'').trim()});}catch{}
    }catch(e){device?.gatt?.disconnect();this.reset();throw e;}
  }
  disconnect(){this.device?.gatt?.disconnect();this.reset();}
  receive(data){
    const event=notification(data);if(!event)return;
    if(event.state!==undefined){
      this.state=event.state;this.events.push({state:event.state,time:Date.now()});if(this.events.length>100)this.events.shift();
      if(event.state!==0x1f)this.armed=null;
    }
    this.emit('telemetry',event);
  }
  async write(bytes){
    if(!this.connected||!this.device?.gatt?.connected)throw new Error('انقطع الاتصال بالمكينة.');
    if(bytes.length>512)throw new Error('حزمة الوصفة أكبر من الحد المدعوم.');
    const connection=this.device;
    const write=this.writeQueue.catch(()=>{}).then(()=>{if(connection!==this.device||!this.connected)throw new Error('انقطع الاتصال بالمكينة.');return this.command.writeValueWithoutResponse(bytes);});
    this.writeQueue=write;await write;
  }
  async waitState(states,since,timeout,generation){
    const end=Date.now()+timeout;
    do{
      if(this.generation!==generation||!this.connected)throw new Error('انقطع الاتصال؛ لم يتم تأكيد حالة المكينة.');
      if(this.cancelRequested)throw new Error('أُلغي الطلب.');
      const ev=this.events.find(e=>e.time>=since&&states.includes(e.state));if(ev)return ev.state;
      await sleep(80);
    }while(Date.now()<end);
    return null;
  }
  async load(recipe){
    if(this.busy)throw new Error('انتظر انتهاء العملية الحالية.');
    if(this.state!==null&&![1,0x24,0x41,0x1f].includes(this.state))throw new Error('المكينة ليست في حالة تسمح بتحميل وصفة.');
    const frames=loadFrames(recipe),generation=this.generation;
    this.busy=true;this.armed=null;this.cancelRequested=false;this.events=[];this.emit('busy',true);
    try{
      await this.write(frames[0]);await sleep(500);if(generation!==this.generation||this.cancelRequested)throw new Error('أُلغي التحميل.');await this.write(handshake());await sleep(2000);
      for(const f of frames.slice(1)){if(generation!==this.generation||this.cancelRequested)throw new Error('أُلغي التحميل.');await this.write(f);await sleep(400);}
      const status=await this.waitState([0x1f,0x0c,0x0f],0,12000,generation);
      if(status!==0x1f)throw new Error(status===0x0c?'المكينة تحتاج ماء.':status===0x0f?'المكينة تحتاج بن.':'لم تؤكد المكينة تحميل الوصفة. لا تبدأ التحضير.');
      this.armed=JSON.stringify(recipe);this.emit('loaded',recipe);
    }finally{this.busy=false;this.emit('busy',false);}
  }
  async brew(recipe){
    if(this.busy)throw new Error('انتظر انتهاء العملية الحالية.');
    if(this.state!==0x1f||this.armed!==JSON.stringify(recipe))throw new Error('أرسل الوصفة الحالية للمكينة أولًا.');
    this.busy=true;this.cancelRequested=false;this.armed=null;this.emit('busy',true);
    const since=Date.now(),generation=this.generation;
    try{
      await this.write(commit());
      const acted=[0x22,0x10,0x23,0x3b,0x24,0x0c,0x0f,0x01,0x41];
      let state=await this.waitState(acted,since,8000,generation);
      if(state===null){
        // Never send start speculatively. Require fresh awaiting-confirm telemetry.
        if(this.state!==0x1e||!this.events.some(e=>e.time>=since&&e.state===0x1e))throw new Error('لم تصل حالة تأكيد واضحة. راجع شاشة المكينة قبل المحاولة مجددًا.');
        const after=Date.now();await this.write(start());state=await this.waitState(acted,after,8000,generation);
      }
      if(state===0x0c)throw new Error('المكينة تحتاج ماء؛ أضف الماء ثم أرسل الوصفة مجددًا.');
      if(state===0x0f)throw new Error('المكينة تنتظر البن؛ راجع شاشتها.');
      if(state===null)throw new Error('أُرسل أمر البدء، لكن لم تؤكد المكينة بدء التحضير. راجع شاشتها.');
      if([1,0x41].includes(state))throw new Error('عادت المكينة إلى وضع الانتظار؛ راجع شاشتها.');
      this.emit('started',recipe);
    }finally{this.busy=false;this.emit('busy',false);}
  }
  async stop(){
    this.generation++;this.cancelRequested=true;this.armed=null;
    // Invalidates pending load/start work; serial queue keeps GATT writes ordered.
    const since=Date.now(),generation=this.generation;
    await this.write(cancel());
    this.cancelRequested=false;
    const result=await this.waitState([1,0x1f,0x24,0x41],since,8000,generation);
    if(result===null)throw new Error('أُرسل طلب الإيقاف دون تأكيد. استخدم زر المكينة إذا استمرت.');
    this.emit('stopped',true);
  }
}
