import test from 'node:test';
import assert from 'node:assert/strict';
import {recipeView} from '../src/recipe-view.js';
test('favorites home shows saved recipes until a real query searches the public libraries',()=>{assert.equal(recipeView('favorites','').favoritesOnly,true);assert.equal(recipeView('favorites','  ـَ  ').canSearch,false);assert.equal(recipeView('favorites','قهوة').favoritesOnly,false);assert.equal(recipeView('favorites','قهوة').canSearch,true);assert.equal(recipeView('favorites','').favoritesOnly,true);});
test('preparation and history never launch recipe searches or show the library',()=>{for(const view of ['preparation','history']){assert.equal(recipeView(view,'قهوة').canSearch,false);assert.equal(recipeView(view,'قهوة').visible,false);}assert.equal(recipeView('library','').visible,true);assert.equal(recipeView('library','').favoritesOnly,false);});
