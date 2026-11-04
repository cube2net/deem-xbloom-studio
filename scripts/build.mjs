import {readFileSync,writeFileSync,mkdirSync,copyFileSync,readdirSync} from 'node:fs';
const assets = Object.fromEntries(['index.html','style.css','app.js','api.js','protocol.js','bluetooth.js','search.js','recipe-view.js','recipe-search.js','alerts.js','brew-session.js','brew-screen.js','sw.js'].map(name=>[name,readFileSync(new URL('../src/'+name,import.meta.url),'utf8')]));
for(const file of readdirSync(new URL('../src/fonts/',import.meta.url))){if(file.endsWith('.woff2'))assets['fonts/'+file]={base64:readFileSync(new URL('../src/fonts/'+file,import.meta.url)).toString('base64'),type:'font/woff2'};}
const source=readFileSync(new URL('../worker/index.js',import.meta.url),'utf8');
mkdirSync(new URL('../dist/server/',import.meta.url),{recursive:true});
const search=readFileSync(new URL('../src/search.js',import.meta.url),'utf8').replace(/export /g,'');
writeFileSync(new URL('../dist/server/index.js',import.meta.url),'const ASSETS = '+JSON.stringify(assets)+';\n'+search+'\n'+source);
console.log('Built Deem Worker with embedded assets');
