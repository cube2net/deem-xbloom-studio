export class MachineAlerts {
  constructor({emit,now=()=>Date.now()}={}){this.emit=emit||(()=>{});this.now=now;this.lastState=null;this.connected=false;}
  connection(connected){const was=this.connected;this.connected=connected;if(was&&!connected){this.lastState=null;this.emit({kind:'warning',title:'انقطع اتصال المكينة',body:'القراءات غير متاحة'});}}
  state(code){
    if(code===this.lastState)return;this.lastState=code;
    const event={0x0c:['warning','المكينة تحتاج ماء','الماء غير كافٍ'],0x0f:['warning','المكينة تنتظر البن','البن غير متوفر'],0x1f:['info','الوصفة جاهزة','أكدت المكينة تحميل الوصفة.'],0x22:['info','بدأ تجهيز القهوة','المكينة في مرحلة الطحن والتجهيز.'],0x10:['info','جارٍ تحضير قهوتك','بدأت المكينة مرحلة الصب.'],0x24:['success','قهوتك جاهزة','اكتمل الاستخلاص']}[code];
    if(event)this.emit({kind:event[0],title:event[1],body:event[2]});
  }
}
