// Public Rashf pages only; no accounts or arbitrary URL proxy.
const ORIGIN='https://rashf.net';
const CAF='https://www.caf-xbloom.com';
const memory=new Map();
// Workers for Platforms may expose Cache API but forbid access to caches.default.
// Caching is optional: source reads must keep working when it is unavailable.
async function cacheRead(request){try{return await globalThis.caches?.default?.match(request)??null;}catch{return null;}}
async function cacheWrite(request,response){try{await globalThis.caches?.default?.put(request,response);}catch{}}
export function parsePage(html){
  const m=html.match(/<script\b[^>]*data-page="app"[^>]*>([\s\S]*?)<\/script>/i);
  if(!m) throw new Error('تغيّر تنسيق صفحة رشْف؛ تعذّر قراءة الوصفة.');
  const data=JSON.parse(m[1]);
  if(!data.props) throw new Error('بيانات المصدر غير متاحة.');
  return data.props;
}
export function normalize(props){
  const {card:c,record:r}=props;
  if(!c||!r||!Array.isArray(r.pours)) throw new Error('صفحة المصدر لا تحتوي وصفة منشورة.');
  return {id:c.id,source:'rashf',name:c.name,model:c.model,basket:c.basket,style:c.style,dose_g:c.dose_g,grind:r.grinder_enabled===false?0:c.grind,rpm:c.rpm,ratio:c.ratio,ice_g:c.ice_g,countries:c.countries||[],roaster:c.roaster,notes:c.notes||[],bean:r.bean||{},observed_at:r.observed_at,source_url:ORIGIN+'/library/'+encodeURIComponent(c.id),share_url:typeof c.source_url==='string'&&c.source_url.startsWith('https://share-h5.xbloom.com/')?c.source_url:null,fetched_at:new Date().toISOString(),pours:r.pours.map(p=>({ml:p.water_ml,temp:p.temperature_c,temperature_mode:p.temperature_mode,flow:p.flow_ml_s,pause:p.pause_after_s,pattern:p.pattern,agitation:p.vibration_after===true,before:p.vibration_before===true,rpm:p.pattern==='center'?0:c.rpm}))};
}
async function upstream(path,ttl,ctx,origin=ORIGIN){
  const key=origin+path,mem=memory.get(key);
  if(mem&&mem.expires>Date.now())return mem.text;
  const cacheKey=new Request(key);
  const cached=await cacheRead(cacheKey);
  if(cached)return cached.text();
  const response=await fetch(key,{headers:{'Accept':'text/html, application/xml','User-Agent':'DeemCoffee/1.0 (public recipe reader)'},signal:AbortSignal.timeout(18000),redirect:'manual'});
  if(!response.ok)throw new Error('رشْف غير متاح الآن ('+response.status+'). حاول لاحقًا.');
  if(Number(response.headers.get('content-length')||0)>4_000_000)throw new Error('حجم صفحة المصدر أكبر من المتوقع.');
  const text=await response.text();
  if(text.length>4_000_000)throw new Error('حجم صفحة المصدر أكبر من المتوقع.');
  if(memory.size>300)memory.delete(memory.keys().next().value);
  memory.set(key,{text,expires:Date.now()+ttl*1000});
  ctx.waitUntil(cacheWrite(cacheKey,new Response(text,{headers:{'Cache-Control':'public, max-age='+ttl}})));
  return text;
}
function text(html){return html.replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]+>/g,' ').replace(/&#(?:x([0-9a-f]+)|(\d+));/gi,(_,hex,num)=>String.fromCodePoint(parseInt(hex||num,hex?16:10))).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();}
export function parseCafCards(html){
  const rows=[];
  for(const m of html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g)){
    const title=m[1].match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/)?.[1],path=m[1].match(/href="(\/recipes\/[^"?#]+)"/)?.[1],share=m[1].match(/href="(https:\/\/share-h5\.xbloom\.com\/\?[^" ]+)"/)?.[1];
    if(title&&path&&share)rows.push({slug:decodeURIComponent(path.slice(9)),name:text(title),share_url:text(share),style:text(m[1]).includes('بارد')?'iced':'hot'});
  }
  return [...new Map(rows.map(r=>[r.slug,r])).values()];
}
export function normalizeCaf(raw,summary){
  const r=raw.recipeVo;if(raw.result!=='success'||!r)throw new Error('تعذّر قراءة إعدادات رابط xBloom المنشور في كاف.');
  const list=typeof r.pourDataJSONStr==='string'?JSON.parse(r.pourDataJSONStr):(r.pourList||[]);
  if(!Array.isArray(list))throw new Error('تنسيق تفاصيل الصبات في كاف غير معروف.');
  const bool=v=>v===1?true:v===2?false:null;
    const pours=list.map(p=>({ml:Number(p.volume),temp:Number(p.temperature),temperature_mode:'numeric_celsius',flow:Number(p.flowRate),pause:Number(p.pausing),pattern:p.pattern===1?'center':p.pattern===2?'spiral':p.pattern===3?'circular':'unsupported',before:bool(p.isEnableVibrationBefore),agitation:bool(p.isEnableVibrationAfter),rpm:p.pattern===1?0:Number(r.rpm)}));
  return {id:'caf:'+summary.slug,source:'caf',name:summary.name||r.theName,model:r.adaptedModel===1?'Studio':r.adaptedModel===0?'Original':'Unknown',basket:['OMNI','XPOD','OTHER'].includes(r.cupTypeName)?r.cupTypeName:'OTHER',style:summary.style||'hot',dose_g:Number(r.dose),grind:r.isSetGrinderSize===2?0:r.grinderSize==null?null:Number(r.grinderSize),ratio:Number(r.grandWater),water_total_ml:Math.round(Number(r.dose)*Number(r.grandWater)),rpm:Number(r.rpm),ice_g:summary.ice_g??null,countries:[],roaster:summary.roaster||null,notes:[],bean:{},observed_at:null,source_url:CAF+'/recipes/'+encodeURIComponent(summary.slug),share_url:summary.share_url,fetched_at:new Date().toISOString(),unsupported_bypass:r.isEnableBypassWater===1,details_incomplete:pours.length===0,pours};
}
async function publicShare(summary,ctx){
  const url=new URL(summary.share_url);if(url.origin!=='https://share-h5.xbloom.com'||!url.searchParams.get('id'))throw new Error('رابط xBloom غير صالح في المصدر.');
  const key='share:'+url.searchParams.get('id'),known=memory.get(key);if(known&&known.expires>Date.now())return normalizeCaf(known.data,summary);
  const cacheKey=new Request('https://deem-cache.invalid/share/'+encodeURIComponent(url.searchParams.get('id')));
  const cached=await cacheRead(cacheKey);
  if(cached)return normalizeCaf(await cached.json(),summary);
  const response=await fetch('https://client-api.xbloom.com/RecipeDetail.html',{method:'POST',headers:{'Content-Type':'application/json','Referer':'https://share-h5.xbloom.com/'},body:JSON.stringify({tableIdOfRSA:url.searchParams.get('id'),interfaceVersion:19700101,skey:'testskey'}),signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw new Error('تعذّر جلب تفاصيل وصفة كاف من رابط xBloom.');
  const data=await response.json(),recipe=normalizeCaf(data,summary);
  memory.set(key,{data,expires:Date.now()+300000});ctx.waitUntil(cacheWrite(cacheKey,Response.json(data,{headers:{'Cache-Control':'public, max-age=300'}})));
  return recipe;
}
async function cafRecipe(slug,ctx,summary){
  if(!/^[\p{L}\p{N}_-]{1,180}$/u.test(slug))throw new Error('معرّف وصفة كاف غير صالح.');
  if(!summary){
    const html=await upstream('/recipes/'+encodeURIComponent(slug),300,ctx,CAF);
    const field=label=>text(html.match(new RegExp('<p[^>]*>'+label+'<\\/p>\\s*<p[^>]*>([\\s\\S]*?)<\\/p>'))?.[1]||'');
    const body=text(html.replace(/<script[\s\S]*?<\/script>/g,''));
    summary={slug,name:text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1]||''),share_url:text(html.match(/href="(https:\/\/share-h5\.xbloom\.com\/\?[^" ]+)"/)?.[1]||''),style:body.includes('وصفة باردة')?'iced':'hot',ice_g:Number(field('كمية البن').match(/([\d.]+) جرام ثلج/)?.[1])||null};
  }
  return publicShare(summary,ctx);
}
async function index(ctx){
  const xml=await upstream('/sitemap.xml',900,ctx);
  const maps=[...xml.matchAll(/<loc>(https:\/\/rashf\.net\/sitemaps\/recipes-\d+\.xml)<\/loc>/g)].slice(0,12).map(m=>m[1].slice(ORIGIN.length));
  if(!maps.length)throw new Error('تعذّر العثور على خريطة وصفات رشْف.');
  const rows=[];
  for(const path of maps){
    const body=await upstream(path,900,ctx);
    for(const m of body.matchAll(/<url>([\s\S]*?)<\/url>/g)){
      const id=m[1].match(/<loc>https:\/\/rashf\.net\/library\/([a-zA-Z0-9_-]+)<\/loc>/)?.[1];
      if(id)rows.push({id,modified:m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]||''});
    }
  }
  return [...new Map(rows.map(r=>[r.id,r])).values()].sort((a,b)=>b.modified.localeCompare(a.modified)||a.id.localeCompare(b.id));
}
async function recipe(id,ctx){
  if(id.startsWith('caf:'))return cafRecipe(id.slice(4),ctx);
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new Error('معرّف الوصفة غير صالح.');
  return normalize(parsePage(await upstream('/library/'+id,300,ctx)));
}
function json(body,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
export default {async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(request.method!=='GET')return json({error:'الطلب غير مدعوم'},405);
  try{
    if(url.pathname==='/api/caf'){
      const q=(url.searchParams.get('q')||'').slice(0,160),offset=Number(url.searchParams.get('offset')||0),style=url.searchParams.get('style')||'',basket=url.searchParams.get('basket')||'';
      if(!Number.isSafeInteger(offset)||offset<0||offset>30000)return json({error:'رقم الصفحة غير صالح'},400);
      let html=await upstream('/'+(q?'?q='+encodeURIComponent(q):''),300,ctx,CAF),rows=parseCafCards(html);
      if(!rows.length&&q&&normalizeSearch(q)!==q){html=await upstream('/?q='+encodeURIComponent(normalizeSearch(q)),300,ctx,CAF);rows=parseCafCards(html);}
      const batch=rows.slice(offset,offset+12),items=[],failed=[];
      if(!rows.length&&!html.includes('الوصفات'))throw new Error('تغيّر تنسيق قائمة كاف.');
      for(let i=0;i<batch.length;i+=3){const results=await Promise.allSettled(batch.slice(i,i+3).map(r=>cafRecipe(r.slug,ctx,r)));results.forEach((r,j)=>{if(r.status==='fulfilled'){if(matchesRecipe(r.value,'',style,basket))items.push(r.value);}else failed.push('caf:'+batch[i+j].slug);});}
      if(batch.length&&failed.length===batch.length)throw new Error('تعذّر جلب تفاصيل وصفات كاف.');
      return json({items,failed,total:rows.length,scanned:batch.length,scanned_until:offset+batch.length,next:offset+batch.length<rows.length?offset+batch.length:null,checked_at:new Date().toISOString(),source:CAF});
    }
    if(url.pathname==='/api/catalog'){
      const offset=Number(url.searchParams.get('offset')||0);
      if(!Number.isSafeInteger(offset)||offset<0||offset>30000)return json({error:'رقم الصفحة غير صالح'},400);
      const q=(url.searchParams.get('q')||'').slice(0,160),style=url.searchParams.get('style')||'',basket=url.searchParams.get('basket')||'';
      if(!['','hot','iced'].includes(style)||!['','OMNI','XPOD','OTHER'].includes(basket))return json({error:'فلتر غير صالح'},400);
      let rows=await index(ctx);
      const id=q.match(/(?:^|\/)(xbc-[a-zA-Z0-9_-]+)\/?$/)?.[1];
      if(id)rows=rows.filter(r=>r.id===id);
      const batch=rows.slice(offset,offset+18),items=[],failed=[];
      for(let i=0;i<batch.length;i+=3){
        const results=await Promise.allSettled(batch.slice(i,i+3).map(r=>recipe(r.id,ctx)));
        results.forEach((r,j)=>{if(r.status==='fulfilled'){if(matchesRecipe(r.value,id?'':q,style,basket))items.push(r.value);}else failed.push(batch[i+j].id);});
      }
      if(batch.length&&!items.length&&failed.length===batch.length)throw new Error('تعذّر جلب صفحات الوصفات من رشْف.');
      return json({items,failed,total:rows.length,scanned:batch.length,scanned_until:offset+batch.length,next:offset+batch.length<rows.length?offset+batch.length:null,checked_at:new Date().toISOString(),source:ORIGIN});
    }
    if(url.pathname==='/api/recipe'){
      const id=url.searchParams.get('id');
      if(!id)return json({error:'معرّف الوصفة مطلوب'},400);
      return json(await recipe(id,ctx));
    }
    if(url.pathname.startsWith('/api/recipe/'))return json(await recipe(decodeURIComponent(url.pathname.slice(12)),ctx));
    const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
    const asset=ASSETS[name];
    if(!asset)return new Response('Not found',{status:404});
    if(typeof asset==='object'&&asset.base64)return new Response(Uint8Array.from(atob(asset.base64),c=>c.charCodeAt(0)),{headers:{'Content-Type':asset.type,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
    const type=name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript';
    return new Response(asset,{headers:{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'bluetooth=(self)','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self' https://*.chatgpt.com https://chatgpt.com; base-uri 'self'; object-src 'none'"}});
  }catch(e){return json({error:e.message||'تعذّر الوصول إلى المصدر'},502);}
}};
