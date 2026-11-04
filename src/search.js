export function normalizeSearch(value){
  return String(value??'').normalize('NFKD').toLocaleLowerCase('ar')
    .replace(/\p{M}/gu,'')
    .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g,'')
    .replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
    .replace(/[٠-٩]/g,n=>String(n.charCodeAt(0)-0x660))
    .replace(/[۰-۹]/g,n=>String(n.charCodeAt(0)-0x6f0))
    .replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}
export function matchesRecipe(recipe,query='',style='',basket=''){
  if(recipe.model!=='Studio'||style&&recipe.style!==style||basket&&recipe.basket!==basket)return false;
  const term=normalizeSearch(query);
  if(!term)return true;
  const values=[recipe.id,recipe.source_url,recipe.name,recipe.roaster,recipe.bean?.name,recipe.bean?.roaster,recipe.bean?.process,recipe.bean?.region,recipe.bean?.origin_raw,recipe.bean?.varietal,...(Array.isArray(recipe.countries)?recipe.countries:[]),...(Array.isArray(recipe.notes)?recipe.notes:[]),...(Array.isArray(recipe.bean?.tasting_notes)?recipe.bean.tasting_notes:[])];
  const text=normalizeSearch(values.filter(Boolean).join(' '));
  return term.split(' ').every(word=>text.includes(word));
}
