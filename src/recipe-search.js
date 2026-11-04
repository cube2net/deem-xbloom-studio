import {matchesRecipe} from './search.js';
import {recipeView} from './recipe-view.js';

export function cleanRecipes(values){
  if(!Array.isArray(values))return [];
  return values.filter(r=>r&&typeof r==='object'&&typeof r.id==='string'&&r.id&&typeof r.name==='string').map(r=>({...r,countries:Array.isArray(r.countries)?r.countries:[],notes:Array.isArray(r.notes)?r.notes:[],pours:Array.isArray(r.pours)?r.pours:[]}));
}
export function filterRecipes(recipes,{view,query='',favorites=[],source='all',style='',basket='',hits=new Set()}){
  const context=recipeView(view,query);
  return recipes.filter(r=>(!context.favoritesOnly||favorites.includes(r.id))&&(source==='all'||(r.source==='caf'||r.id.startsWith('caf:')?'caf':'rashf')===source)&&matchesRecipe(r,'',style,basket)&&(matchesRecipe(r,query)||hits.has(r.id)));
}
// Each source publishes as soon as it resolves; a slow or failed source cannot hide the other.
export async function searchSources(sources,fetchSource,publish,isCurrent){
  return Promise.allSettled(sources.map(async source=>{
    try{const data=await fetchSource(source);if(isCurrent())publish(source,{data});}
    catch(error){if(isCurrent())publish(source,{error});}
  }));
}
