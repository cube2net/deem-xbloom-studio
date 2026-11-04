import {issues} from './protocol.js';
export async function requestJson(path,{signal,fetcher=fetch}={}){
  const response=await fetcher(path,{headers:{Accept:'application/json'},cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(90000)]):AbortSignal.timeout(90000)});
  const body=await response.text();
  if(/^\s*</.test(body))throw new Error('تعذّر الوصول إلى بيانات الوصفة؛ أعاد الخادم صفحة بدل البيانات.');
  let data;try{data=JSON.parse(body);}catch{throw new Error('تعذّر قراءة بيانات المصدر.');}
  if(!response.ok)throw new Error(data?.error||'تعذّر جلب الوصفات');
  if(!data||typeof data!=='object')throw new Error('بيانات المصدر غير مكتملة.');
  return data;
}
export const recipePath=id=>'/api/recipe?'+new URLSearchParams({id});
export async function getRecipe(id,options){
  const data=await requestJson(recipePath(id),options);
  if(data.id!==id||data.model!=='Studio'||typeof data.name!=='string'||!Array.isArray(data.pours)||data.pours.some(p=>!p||typeof p!=='object'))throw new Error('بيانات الوصفة غير مكتملة أو غير مطابقة.');
  return data;
}
export const canSendRecipe=(recipe,{connected,busy})=>!!recipe&&connected&&!busy&&issues(recipe).length===0;
