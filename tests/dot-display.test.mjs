import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layoutText,normalize,GLYPHS} from '../src/dot-display.js';

test('every glyph is 7 rows of equal width',()=>{
  for(const[ch,g]of Object.entries(GLYPHS)){assert.equal(g.length,7,ch);assert.ok(g.every(r=>r.length===g[0].length),ch);}
});
test('layoutText joins glyphs with one empty column',()=>{
  assert.equal(layoutText('0').cols,5);
  assert.equal(layoutText('00').cols,11);
  assert.equal(layoutText('1.5').cols,5+1+1+1+5);
  assert.equal(layoutText('').cols,0);
});
test('lit cells match the glyph shape',()=>{
  const{on}=layoutText('1');
  assert.ok(on.has(0*64+2),'top of the one');
  assert.ok(on.has(6*64+0)&&on.has(6*64+4),'base serif');
  assert.ok(!on.has(0*64+0));
});
test('unknown characters render as blanks and values are normalised',()=>{
  assert.equal(layoutText('a').on.size,0);
  assert.equal(normalize(' —'),'-');
  assert.equal(normalize('١٤٨٫٥'.replace('٫','.')),'148.5');
});
