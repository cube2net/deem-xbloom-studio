import {requestJson,getRecipe,canSendRecipe} from './api.js';
import {cleanRecipes,filterRecipes,searchSources} from './recipe-search.js';
import {recipeView} from './recipe-view.js';
import {setupBrewScreen} from './brew-screen.js';
import {Machine} from './bluetooth.js';
import {issues} from './protocol.js';
import {matchesRecipe,normalizeSearch} from './search.js';
import {MachineAlerts} from './alerts.js';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem('deem:'+key))??fallback;}catch{return fallback;}};
function save(key,value){try{localStorage.setItem('deem:'+key,JSON.stringify(value));}catch{toast('لم يتم الحفظ: مساحة تخزين المتصفح غير متاحة.');}}
let recipes=read('recipes',[]),favorites=read('favorites',[]),overrides=read('overrides',{}),history=read('history',[]),next=0,total=0,view='favorites',style='',basket='',loading=false,selected=null,selectedFresh=false,selection=0,loadingToMachine=false;
let sourceFilter='all',searchBusy=false,searchToken=0,searchAbort=null,searchTimer=null,searchCursors={rashf:0,caf:0},searchScanned=0,searchFailures=0,searchExhausted=false,searchStarted=false,searchHits=new Set();
const sourceName=r=>r.source==='caf'||r.id.startsWith('caf:')?'كاف':'رشْف';
const sourceKey=r=>r.source==='caf'||r.id.startsWith('caf:')?'caf':'rashf';
const remoteMode=()=>recipeView(view,$('#search').value).canSearch&&!!(normalizeSearch($('#search').value)||style||basket||sourceFilter!=='all');
recipes=cleanRecipes(recipes);if(!Array.isArray(favorites))favorites=[];if(!Array.isArray(history))history=[];if(!overrides||typeof overrides!=='object')overrides={};
const machine=new Machine();
let alertLog=read('machineAlerts',[]),notificationsEnabled=read('notificationsEnabled',false),notifyRegistration=null,lastScaleAt=null;
if(!Array.isArray(alertLog))alertLog=[];
const alerts=new MachineAlerts({emit:addMachineAlert});
function renderAlerts(){
  $('#machineAlerts').innerHTML=alertLog.length?alertLog.slice(0,20).map(a=>`<article class="machine-alert ${a.kind==='warning'?'warning':''}"><div><strong>${esc(a.title)}</strong><p>${esc(a.body)}</p></div><time>${esc(time(a.at))}</time></article>`).join(''):'<p class="no-alerts">لا توجد تنبيهات</p>';
  $('#enableNotifications').textContent=notificationsEnabled?'إيقاف إشعارات المتصفح':'تفعيل إشعارات المتصفح';
  $('#notificationHint').textContent=notificationsEnabled?'الإشعارات مفعّلة':'الإشعارات غير مفعّلة';
}
async function ensureNotificationWorker(){
  if(!('serviceWorker' in navigator))throw new Error('إشعارات المتصفح غير متاحة هنا. افتح رابط ديم مباشرة في Chrome.');
  await navigator.serviceWorker.register('/sw.js');notifyRegistration=await navigator.serviceWorker.ready;return notifyRegistration;
}
function addMachineAlert(event){
  const item={...event,at:new Date().toISOString()};alertLog.unshift(item);alertLog=alertLog.slice(0,80);save('machineAlerts',alertLog);renderAlerts();showMachineNotice(item);
  if(notificationsEnabled&&'Notification' in window&&Notification.permission==='granted')ensureNotificationWorker().then(reg=>reg.showNotification('ديم · '+item.title,{body:item.body,tag:'deem-'+item.kind+'-'+item.title,dir:'rtl',lang:'ar'})).catch(()=>{$('#notificationHint').textContent='تعذّر إرسال إشعار النظام؛ التنبيهات مستمرة داخل ديم.';});
}
$('#enableNotifications').onclick=async()=>{
  if(notificationsEnabled){notificationsEnabled=false;save('notificationsEnabled',false);renderAlerts();return;}
  if(!('Notification' in window)){toast('هذا المتصفح لا يدعم إشعارات النظام؛ التنبيهات متاحة داخل ديم.');return;}
  try{const permission=await Notification.requestPermission();if(permission!=='granted'){toast('لم يُسمح بالإشعارات. يمكنك تفعيلها من إعدادات الموقع.');return;}await ensureNotificationWorker();notificationsEnabled=true;save('notificationsEnabled',true);renderAlerts();toast('فُعّلت إشعارات المكينة.');}catch(e){toast(error(e));}
};
const sum=r=>r.pours.length?r.pours.reduce((n,p)=>n+p.ml,0):(r.water_total_ml||Math.round(r.dose_g*r.ratio)||0);
let toastTimer;
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
let machineNoticeTimer;
function dismissMachineNotice(){clearTimeout(machineNoticeTimer);const el=$('#machineNotice');if(el.hidePopover)el.hidePopover();else el.hidden=true;}
function showMachineNotice(item){const el=$('#machineNotice');clearTimeout(machineNoticeTimer);$('#noticeTitle').textContent=item.title;$('#noticeBody').textContent=item.body;el.dataset.kind=item.kind;el.classList.remove('notice-enter');void el.offsetWidth;el.classList.add('notice-enter');if(el.showPopover)el.showPopover();else el.hidden=false;machineNoticeTimer=setTimeout(dismissMachineNotice,5000);}
$('#dismissNotice').onclick=dismissMachineNotice;
function error(e){return e.name==='NotFoundError'?'لم تُختر مكينة. اضغط الاتصال واختر XBLOOM.':e.name==='SecurityError'?'افتح رابط ديم مباشرة في Chrome خارج المعاينة لتفعيل البلوتوث.':e.name==='NetworkError'?'تعذّر الاتصال. قرّب الجهاز وافصل تطبيق xBloom ثم حاول مجددًا.':e.message||'تعذّر إكمال العملية.';}
const api=(path,signal)=>requestJson(path,{signal});
function merge(list){const map=new Map(recipes.map(r=>[r.id,r]));cleanRecipes(list).forEach(r=>map.set(r.id,r));recipes=[...map.values()];save('recipes',recipes.slice(-1000));}
function time(value){return value?new Date(value).toLocaleString('ar-SA',{calendar:'gregory',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'غير معروف';}
function effective(r){return overrides[r.id]?structuredClone(overrides[r.id]):structuredClone(r);}
function toggleFavorite(id){favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];save('favorites',favorites);render();if(selected?.id===id)renderRecipe();}
function render(){
  $('#favoriteCount').textContent=favorites.length;
  const context=recipeView(view,$('#search').value);
  $('#librarySection').hidden=!context.visible;$('#historySection').hidden=view!=='history';$('#preparationPage').hidden=view!=='preparation';$('#homeIntro').hidden=!context.visible;
  $('#stepChoose').toggleAttribute('aria-current',view!=='preparation');$('#stepPrepare').toggleAttribute('aria-current',view==='preparation');
  $('#stepChoose').setAttribute('aria-current',view==='preparation'?'false':'step');$('#stepPrepare').setAttribute('aria-current',view==='preparation'?'step':'false');
  $('#sectionTitle').textContent=context.favoritesOnly?'وصفاتي المفضلة':context.searching?'نتائج البحث':'مكتبة الوصفات';
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});
  const q=$('#search').value.trim();
  const filtered=filterRecipes(recipes,{view,query:q,favorites,source:sourceFilter,style,basket,hits:searchHits});
  $('#cards').innerHTML=filtered.map(r=>`<article class="recipe-card"><a class="recipe-card-link" href="#prepare" data-open="${esc(r.id)}" aria-label="تجهيز وصفة ${esc(r.name)}"></a><div class="card-top"><span class="badge ${r.style==='iced'?'iced':'hot'}">${r.style==='iced'?'❄ بارد':'☕ حار'} · ${esc(r.basket||'Studio')}</span><button class="heart ${favorites.includes(r.id)?'saved':''}" data-favorite="${esc(r.id)}" aria-label="${favorites.includes(r.id)?'إزالة من':'إضافة إلى'} المفضلة: ${esc(r.name)}" aria-pressed="${favorites.includes(r.id)}">${favorites.includes(r.id)?'♥':'♡'}</button></div><h3 dir="auto">${esc(r.name)}</h3><p class="origin" dir="auto">${esc([r.roaster,...r.countries].filter(Boolean).join(' · ')||'وصفة منشورة من المجتمع')}</p><div class="metrics"><div class="metric"><strong>${esc(r.dose_g)} g</strong><span>الجرعة</span></div><div class="metric"><strong>${esc(sum(r))} ml</strong><span>الماء</span></div><div class="metric"><strong>${esc(r.grind||'OFF')}</strong><span>الطحن</span></div><div class="metric"><strong>${esc(r.pours.length||"—")}</strong><span>الصبات</span></div></div><div class="card-bottom"><span>${overrides[r.id]?'نسخة معدّلة محليًا':'من '+sourceName(r)}</span><button class="open-recipe" data-open="${esc(r.id)}">تجهيز الوصفة ↙</button></div></article>`).join('');
  $('#empty').hidden=filtered.length>0||loading||searchBusy;
  $('#emptyTitle').textContent=context.favoritesOnly?'لا توجد وصفات مفضلة':'لا توجد نتائج';
  $('#browseRecipes').hidden=!context.favoritesOnly;
  $('#more').hidden=(!context.canSearch&&view!=='library')||(remoteMode()?searchExhausted:next===null);$('#more').disabled=loading||searchBusy;$('#more').textContent=searchBusy?'جارٍ البحث في المكتبة…':remoteMode()?(searchStarted?'المزيد من نتائج البحث ↓':'متابعة البحث ↓'):loading?'جارٍ جلب الوصفات…':'تحميل المزيد من رشْف ↓';
  $('#searchProgress').hidden=!remoteMode()||!searchStarted;$('#searchStatus').textContent=searchBusy?`جارٍ البحث في المصادر… ${searchScanned} وصفة فُحصت · ${filtered.length} نتيجة`:searchExhausted?`اكتمل البحث · ${filtered.length} نتيجة${searchFailures?' · تعذّر جلب '+searchFailures+' وصفة':''}`:`البحث متوقف مؤقتًا · ${filtered.length} نتيجة · ${searchScanned} وصفة فُحصت`;
  $('#stopSearch').hidden=!searchBusy;
  $('#catalogInfo').textContent=`${filtered.length} وصفة`;
  $('#historyList').innerHTML=history.length?history.map(h=>`<article class="history-item"><div><strong dir="auto">${esc(h.name)}</strong><br><small>${esc(time(h.at))}</small></div><span>${esc(h.result)}</span></article>`).join(''):'<div class="empty"><h3>لا يوجد سجل تحضير</h3></div>';
}
async function loadCatalog(refresh=false){
  if(remoteMode()){scheduleSearch();return;}
  if(loading)return;loading=true;$('#globalError').hidden=true;$('#refresh').disabled=true;$('#syncStatus').textContent='جارٍ التحقق من المصادر…';render();
  try{
    const results=await Promise.allSettled([api('/api/catalog?offset='+(refresh?0:next||0)),...(refresh?[api('/api/caf')]:[])]);
    const data=results[0].status==='fulfilled'?results[0].value:null,caf=results[1]?.status==='fulfilled'?results[1].value:null;
    if(!data&&!caf)throw results.find(r=>r.status==='rejected').reason;
    if(data){merge(data.items);next=refresh&&Number.isInteger(next)&&next>data.next&&data.next!==null?next:data.next;total=data.total;}
    if(caf)merge(caf.items);
    let favFailed=0;
    if(refresh){for(const id of favorites){if([...(data?.items||[]),...(caf?.items||[])].some(r=>r.id===id))continue;try{merge([await getRecipe(id)]);}catch{favFailed++;}}}
    const checked=(data||caf).checked_at,failed=results.filter(r=>r.status==='rejected');
    $('#syncStatus').textContent='آخر تحقق من المصادر: '+time(checked)+(failed.length?' · تعذّر أحد المصادر':'')+(favFailed?` · تعذّر تحديث ${favFailed} من المفضلة`:'');
    if(failed.length){$('#globalError').textContent=failed.map(r=>error(r.reason)).join('\n');$('#globalError').hidden=false;}
    save('lastCheck',checked);save('next',next);save('total',total);
  }catch(e){$('#globalError').textContent=error(e);$('#globalError').hidden=false;$('#syncStatus').textContent='تعذّر التحديث · آخر تحقق ناجح: '+time(read('lastCheck',null));}
  finally{loading=false;$('#refresh').disabled=false;render();}
}
function stopSearch(){clearTimeout(searchTimer);searchToken++;searchAbort?.abort();searchAbort=null;searchBusy=false;render();}
function scheduleSearch(){
  stopSearch();searchStarted=false;searchExhausted=false;searchScanned=0;searchFailures=0;searchHits=new Set();searchCursors={rashf:sourceFilter==='caf'?null:0,caf:sourceFilter==='rashf'?null:0};render();
  if(remoteMode())searchTimer=setTimeout(()=>runSearch(),450);
}
async function runSearch(){
  if(searchBusy||!remoteMode())return;
  const continuing=searchStarted;searchBusy=true;searchStarted=true;searchAbort=new AbortController();const token=++searchToken,signal=searchAbort.signal;
  $('#globalError').hidden=true;render();
  const q=$('#search').value.trim(),initialCount=filterRecipes(recipes,{view,query:q,favorites,source:sourceFilter,style,basket,hits:searchHits}).length;
  let rounds=0;
  try{
    while(token===searchToken&&(searchCursors.rashf!==null||searchCursors.caf!==null)){
      // Query CAF's public search first, then advance Rashf's sitemap in bounded batches.
      const sources=['caf','rashf'].filter(s=>searchCursors[s]!==null);
      await searchSources(sources,source=>{const params=new URLSearchParams({q,style,basket,offset:String(searchCursors[source])});return api((source==='caf'?'/api/caf?':'/api/catalog?')+params,signal);},(source,result)=>{
        if(result.error){searchFailures++;$('#globalError').textContent='تعذّر البحث في '+(source==='caf'?'كاف':'رشْف')+': '+error(result.error);$('#globalError').hidden=false;searchCursors[source]=null;}
        else{const data=result.data,items=cleanRecipes(data.items);items.forEach(r=>searchHits.add(r.id));merge(items);searchCursors[source]=data.next??null;searchScanned+=data.scanned||0;searchFailures+=data.failed?.length||0;}
        render();
      },()=>token===searchToken&&!signal.aborted);
      if(token!==searchToken)return;
      rounds++;
      const count=filterRecipes(recipes,{view,query:q,favorites,source:sourceFilter,style,basket,hits:searchHits}).length;
      if(count>=(continuing?initialCount+18:18))break;
      // An empty search with source/filter selection fetches one displayed page at a time.
      if(!normalizeSearch(q)&&rounds>=1)break;
    }
    searchExhausted=searchCursors.rashf===null&&searchCursors.caf===null;
  }catch(e){if(token!==searchToken||e.name==='AbortError')return;$('#globalError').textContent=error(e)+'\n';$('#globalError').hidden=false;}
  finally{if(token===searchToken){searchBusy=false;render();}}
}
async function openRecipe(id){
  if(machine.busy||loadingToMachine){toast('المكينة مشغولة');return;}
  stopSearch();view='preparation';render();animateView($('#preparationPage'));window.scrollTo({top:0,behavior:'instant'});
  const token=++selection;const known=recipes.find(r=>r.id===id);selectedFresh=false;selected=known?effective(known):null;
  $('#recipeBody').innerHTML=selected?'':'<p>جارٍ قراءة الوصفة من رشْف…</p>';if(selected)renderRecipe();
  $('#preparationPage').hidden=false;
  try{
    const r=await getRecipe(id);if(token!==selection||loadingToMachine||machine.busy)return;
    if(r.model!=='Studio')throw new Error('هذه الوصفة لجهاز '+r.model+'؛ ديم يتحكم بمكينة Studio فقط.');
    merge([r]);selected=effective(r);selectedFresh=true;render();renderRecipe();
  }catch(e){if(token!==selection)return;if(selected){renderRecipe();$('#recipeStatus').textContent='نسخة محفوظة · '+error(e);}else $('#recipeBody').innerHTML='<p class="notice error">'+esc(error(e))+'</p>';}
}
function renderRecipe(){
  if(!selected)return;const r=selected,errors=issues(r),modified=!!overrides[r.id],source=recipes.find(x=>x.id===r.id);
  $('#recipeBody').innerHTML=`<h2 id="recipeTitle" dir="auto">${esc(r.name)}</h2><div class="recipe-meta"><a href="${esc(r.source_url)}" target="_blank" rel="noopener noreferrer">المصدر: ${sourceName(r)} ↗</a><span>جُلبت ${esc(time(source?.fetched_at))}</span><span>${modified?'نسختك المحلية · الأصل يستمر بالتحديث':'الوصفة كما نُشرت'}</span></div><div class="recipe-toolbar"><button class="pill" id="favoriteRecipe">${favorites.includes(r.id)?'♥ محفوظة':'♡ حفظ الوصفة'}</button><button class="pill" id="editRecipe">تعديل نسخة</button><button class="pill" id="exportRecipe">تصدير JSON ↓</button>${modified?'<button class="pill" id="resetRecipe">العودة إلى الأصل</button>':''}${r.share_url?`<a class="pill" href="${esc(r.share_url)}" target="_blank" rel="noopener noreferrer">فتح في xBloom ↗</a>`:''}</div><div class="recipe-stats"><div><b>${esc(r.dose_g)} g</b><span>جرعة القهوة</span></div><div><b>${esc(sum(r))} ml</b><span>ماء التحضير</span></div><div><b>${esc(r.grind||'OFF')}</b><span>درجة الطحن</span></div><div><b>1:${(sum(r)/r.dose_g).toFixed(1)}</b><span>نسبة التحضير</span></div></div>${r.ice_g?`<p class="notice">الثلج: ${esc(r.ice_g)} غ</p>`:''}<div id="editor" hidden></div><div class="pour-list">${r.pours.map((p,i)=>`<div class="pour-row"><span class="pour-number">${i+1}</span><div><strong>${i?'الصبة '+(i+1):'الترطيب'}</strong><small>${esc(({spiral:'حلزوني',ring:'دائري',circular:'دائري',center:'مركزي'})[p.pattern]||p.pattern)}${p.before?' · اهتزاز قبل الصب':''}${p.agitation?' · اهتزاز بعد الصب':''} · انتظار ${esc(p.pause)} ث</small></div><span class="pour-data">${esc(p.ml)} ml · ${esc(p.temp??p.temperature_mode)}° · ${esc(p.flow)} ml/s</span></div>`).join('')}</div>${errors.length?'<div class="notice error"><b>إعدادات لا يمكن إرسالها بهذا الإصدار</b>\n'+errors.map(esc).join('\n')+'</div>':''}<div id="recipeStatus" class="recipe-status" role="status">${selectedFresh?'':'نسخة محفوظة · جارٍ التحديث…'}</div><div class="actions"><button id="loadMachine" class="primary">① إرسال الوصفة للمكينة</button><button id="startBrew" class="primary">② بدء التحضير</button><button id="stopBrew" class="danger">إيقاف</button></div>`;
  $('#favoriteRecipe').onclick=()=>toggleFavorite(r.id);$('#editRecipe').onclick=editRecipe;$('#exportRecipe').onclick=()=>{const blob=new Blob([JSON.stringify(selected,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='deem-'+r.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);};
  if($('#resetRecipe'))$('#resetRecipe').onclick=()=>{delete overrides[r.id];save('overrides',overrides);selected=structuredClone(source);machine.armed=null;renderRecipe();render();};
  $('#loadMachine').onclick=async()=>{const recipe=structuredClone(selected);loadingToMachine=true;$('#loadMachine').disabled=true;try{
    let fresh=null;try{fresh=await getRecipe(recipe.id,{signal:AbortSignal.timeout(8000)});if(fresh.id!==recipe.id||fresh.model!=='Studio')throw Error('بيانات الوصفة غير مطابقة');merge([fresh]);selectedFresh=true;}catch(e){fresh=null;selectedFresh=false;$('#recipeStatus').textContent='نسخة محفوظة · '+error(e);}
    if(fresh&&!overrides[recipe.id]){const before=JSON.stringify({...recipe,fetched_at:null}),after=JSON.stringify({...fresh,fetched_at:null});if(before!==after){selected=fresh;machine.armed=null;renderRecipe();$('#recipeStatus').textContent='تحدّثت الوصفة في المصدر';return;}}
    if(selected.id!==recipe.id)throw new Error('تغيّرت الوصفة المختارة');const problems=issues(recipe);if(problems.length)throw new Error(problems.join('\n'));
    $('#recipeStatus').textContent='جارٍ إرسال الوصفة…';await machine.load(recipe);$('#recipeStatus').textContent=selectedFresh?'الوصفة محمّلة':'الوصفة المحفوظة محمّلة';
  }catch(e){$('#recipeStatus').textContent=error(e);}finally{loadingToMachine=false;updateButtons();}};
  $('#startBrew').onclick=async()=>{const recipe=structuredClone(selected);brewScreen.pending(recipe);$('#stepChoose').setAttribute('aria-current','false');$('#stepPrepare').setAttribute('aria-current','false');$('#stepExtract').setAttribute('aria-current','step');try{await machine.brew(recipe);$('#recipeStatus').textContent='جارٍ الاستخلاص';}catch(e){brewScreen.failed(error(e));$('#recipeStatus').textContent=error(e);}finally{updateButtons();}};
  $('#stopBrew').onclick=async()=>{try{$('#recipeStatus').textContent='جارٍ طلب الإيقاف…';await machine.stop();$('#recipeStatus').textContent='أكدت المكينة إيقاف التحضير.';}catch(e){$('#recipeStatus').textContent=error(e);}updateButtons();};
  updateButtons();
}
function updateButtons(){if(!$('#loadMachine'))return;$('#loadMachine').disabled=!canSendRecipe(selected,{connected:machine.connected,busy:machine.busy||loadingToMachine});$('#startBrew').disabled=!machine.connected||machine.busy||machine.state!==0x1f||machine.armed!==JSON.stringify(selected);$('#stopBrew').disabled=!machine.connected;}
function editRecipe(){
  if(machine.busy){toast('انتظر انتهاء العملية الحالية.');return;}const r=selected;
  const number=(label,key,value,min,max,step=1)=>`<label>${label}<input data-key="${key}" type="number" value="${esc(value)}" min="${min}" max="${max}" step="${step}" required></label>`;
  const el=$('#editor');el.hidden=false;el.innerHTML=`<form id="editForm" class="editor"><div class="edit-fields">${number('الجرعة (غ)','dose_g',r.dose_g,1,30)}${number('الطحن (0 = بدون طحن)','grind',r.grind,0,80)}${number('سرعة المطحنة (RPM)','rpm',r.rpm??r.pours[0]?.rpm,0,120,1)}</div>${r.pours.map((p,i)=>`<fieldset class="edit-pour" data-pour="${i}"><legend>الصبة ${i+1}</legend><div class="edit-fields">${number('الماء (مل)','ml',p.ml,1,500)}${number('الحرارة (°م)','temp',p.temp,40,95)}${number('التدفق (مل/ث)','flow',p.flow,3,3.5,.1)}${number('الانتظار (ث)','pause',p.pause,0,255)}<label>نمط الصب<select data-key="pattern">${['spiral','ring','center'].map(x=>`<option value="${x}" ${(p.pattern==='circular'?'ring':p.pattern)===x?'selected':''}>${{spiral:'حلزوني',ring:'دائري',center:'مركزي'}[x]}</option>`).join('')}</select></label></div><label class="check"><input type="checkbox" data-key="before" ${p.before?'checked':''}>اهتزاز قبل الصب</label><label class="check"><input type="checkbox" data-key="agitation" ${p.agitation?'checked':''}>اهتزاز بعد الصب</label></fieldset>`).join('')}<div class="actions"><button type="submit" class="primary">حفظ النسخة المحلية</button><button type="button" id="cancelEdit" class="pill">إلغاء</button></div></form>`;
  $('#cancelEdit').onclick=()=>el.hidden=true;
  $('#editForm').onsubmit=e=>{e.preventDefault();const draft=structuredClone(selected);for(const input of $('#editForm').querySelectorAll('[data-key]')){const p=input.closest('[data-pour]'),target=p?draft.pours[Number(p.dataset.pour)]:draft;target[input.dataset.key]=input.type==='checkbox'?input.checked:input.tagName==='SELECT'?input.value:Number(input.value);if(p&&input.dataset.key==='temp')target.temperature_mode='numeric_celsius';}const errors=issues(draft);if(errors.length){toast(errors[0]);return;}draft.ratio=sum(draft)/draft.dose_g;overrides[draft.id]=draft;save('overrides',overrides);selected=draft;machine.armed=null;renderRecipe();render();toast('حُفظت نسختك المحلية.');};
}
const stateNames={1:'المكينة جاهزة',12:'تحتاج ماء',15:'تنتظر البن',16:'جارٍ التحضير',29:'جارٍ تحميل الوصفة',30:'بانتظار تأكيد التحضير',31:'الوصفة محمّلة',34:'جارٍ الطحن والتجهيز',35:'جارٍ التحضير',36:'قهوتك جاهزة',59:'جارٍ التحضير',65:'انتظار / انتهاء'};
machine.addEventListener('connection',e=>{const on=e.detail;alerts.connection(on);$('#deviceName').textContent=on?(machine.device?.name||'XBLOOM'):'—';if(!on){lastScaleAt=null;$('#telemetryTime').textContent='الميزان غير متصل';$('#deviceFirmware').textContent='—';}$('#connect').classList.toggle('connected',on);$('#connectLabel').textContent=on?(machine.device?.name||'متصل'):'اتصل بالمكينة';$('#connectMain').textContent=on?'المكينة متصلة ✓':'اتصل بمكينة xBloom';$('#machineHint').textContent=on?'متصلة بالبلوتوث':'غير متصلة';$('#machineState').textContent=on?'متصلة · بانتظار حالة المكينة':'بانتظار الاتصال';if(!on){$('#water').textContent='—';$('#coffee').textContent='—';}updateButtons();});
machine.addEventListener('busy',updateButtons);
machine.addEventListener('telemetry',e=>{const t=e.detail;if(t.state!==undefined){$('#machineState').textContent=stateNames[t.state]||'حالة غير معروفة: '+t.state.toString(16);alerts.state(t.state);}if(t.firmware)$('#deviceFirmware').textContent=t.firmware;if(t.water!==undefined)$('#water').textContent=t.water.toFixed(1);if(t.coffee!==undefined)$('#coffee').textContent=t.coffee.toFixed(1);if(t.water!==undefined||t.coffee!==undefined){lastScaleAt=Date.now();$('#telemetryTime').textContent='قراءة مباشرة من الميزان · '+new Date().toLocaleTimeString('ar-SA');}updateButtons();});
machine.addEventListener('started',e=>{history.unshift({id:e.detail.id,name:e.detail.name,at:new Date().toISOString(),result:'أكدت المكينة بدء التحضير'});history=history.slice(0,100);save('history',history);render();toast('أكدت المكينة بدء التحضير.');});
async function connect(){if(machine.connected){$('#helpDialog').showModal();return;}$('#connect').disabled=true;$('#connectMain').disabled=true;$('#machineHint').textContent='جارٍ الاتصال…';try{await machine.connect();toast('اتصلت ديم بالمكينة.');}catch(e){$('#machineHint').textContent=error(e);toast(error(e));}finally{$('#connect').disabled=false;$('#connectMain').disabled=false;}}
$('#connect').onclick=connect;$('#connectMain').onclick=connect;$('#help').onclick=()=>$('#helpDialog').showModal();$('#closeHelp').onclick=()=>$('#helpDialog').close();$('#disconnect').onclick=()=>{machine.disconnect();$('#helpDialog').close();};
function showRecipes(target='favorites'){selection++;view=target;scheduleSearch();animateView(target==='history'?$('#historySection'):$('#librarySection'));window.scrollTo({top:0,behavior:'instant'});}
$('#backToRecipes').onclick=()=>showRecipes();$('#browseRecipes').onclick=()=>showRecipes('library');
$('.brand').onclick=e=>{e.preventDefault();showRecipes();};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>showRecipes(b.dataset.view));
document.querySelectorAll('[data-style]').forEach(b=>b.onclick=()=>{style=b.dataset.style;document.querySelectorAll('[data-style]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});scheduleSearch();});
document.querySelectorAll('[data-basket]').forEach(b=>b.onclick=()=>{basket=b.dataset.basket;document.querySelectorAll('[data-basket]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});scheduleSearch();});
$('#search').oninput=scheduleSearch;$('#searchForm').onsubmit=e=>{e.preventDefault();scheduleSearch();clearTimeout(searchTimer);if(remoteMode())runSearch();};$('#cards').onclick=e=>{const fav=e.target.closest('[data-favorite]'),open=e.target.closest('[data-open]');if(fav)toggleFavorite(fav.dataset.favorite);if(open){e.preventDefault();openRecipe(open.dataset.open);}};
$('#more').onclick=()=>remoteMode()?runSearch():loadCatalog();$('#refresh').onclick=()=>remoteMode()?scheduleSearch():loadCatalog(true);$('#stopSearch').onclick=stopSearch;$('#sourceFilter').onchange=()=>{sourceFilter=$('#sourceFilter').value;scheduleSearch();};
machine.addEventListener('started',()=>{$('#stepPrepare').setAttribute('aria-current','false');$('#stepExtract').setAttribute('aria-current','step');});
$('#brewDialog').addEventListener('close',()=>{$('#stepExtract').setAttribute('aria-current','false');render();});
next=read('next',0);total=read('total',0);render();loadCatalog(true);
setInterval(()=>{if(!document.hidden&&!machine.busy&&!searchBusy&&!remoteMode())loadCatalog(true);},15*60*1000);

machine.addEventListener('loaded',e=>{const r=e.detail;$('#sentSettings').innerHTML='<strong dir="auto">'+esc(r.name)+'</strong><div class="settings-grid"><div>الجرعة<strong>'+esc(r.dose_g)+' غ</strong></div><div>الطحن<strong>'+esc(r.grind||'بدون طحن')+'</strong></div><div>الماء<strong>'+esc(sum(r))+' مل</strong></div><div>الصبات<strong>'+esc(r.pours.length)+'</strong></div></div><p>الحرارة: '+r.pours.map(p=>esc(p.temp)+'°م').join('، ')+'</p><p>آخر تحميل: '+esc(time(new Date().toISOString()))+'</p>';});
setInterval(()=>{if(machine.connected&&lastScaleAt&&Date.now()-lastScaleAt>15000)$('#telemetryTime').textContent='آخر قراءة ميزان: '+new Date(lastScaleAt).toLocaleTimeString('ar-SA')+' · بانتظار بيانات جديدة';},5000);
renderAlerts();

function animateView(element){if(!element||matchMedia("(prefers-reduced-motion: reduce)").matches)return;element.classList.remove("view-enter");void element.offsetWidth;element.classList.add("view-enter");element.addEventListener("animationend",()=>element.classList.remove("view-enter"),{once:true});}
document.addEventListener("click",event=>{const button=event.target.closest?.("button");if(!button||button.disabled||!button.isConnected||matchMedia("(prefers-reduced-motion: reduce)").matches)return;const wave=document.createElement("span");wave.className="click-wave";wave.setAttribute("aria-hidden","true");button.append(wave);wave.addEventListener("animationend",()=>wave.remove(),{once:true});});

const brewScreen=setupBrewScreen(machine,{notify:toast});
