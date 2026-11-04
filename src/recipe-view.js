import {normalizeSearch} from './search.js';
// A query on the favorites home searches both public libraries. Clearing it restores favorites.
export function recipeView(view,query){
  const searching=!!normalizeSearch(query);
  return {visible:view==='favorites'||view==='library',favoritesOnly:view==='favorites'&&!searching,canSearch:view==='library'||view==='favorites'&&searching,searching};
}
