import {createServer} from 'node:http';
import site from './dist/server/index.js';

const port=Number(process.env.PORT||3000);
const host=process.env.HOST||'0.0.0.0';
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be between 1 and 65535');

const server=createServer(async(request,response)=>{
  try{
    const method=request.method==='HEAD'?'GET':request.method;
    const target=new URL(request.url||'/',`http://localhost:${port}`);
    const result=await site.fetch(new Request(target,{method}),{}, {waitUntil:task=>Promise.resolve(task).catch(()=>{})});
    response.writeHead(result.status,Object.fromEntries(result.headers));
    response.end(request.method==='HEAD'?undefined:Buffer.from(await result.arrayBuffer()));
  }catch{
    if(!response.headersSent)response.writeHead(500,{'Content-Type':'application/json; charset=utf-8'});
    response.end(JSON.stringify({error:'تعذّر إكمال الطلب. حاول مرة أخرى.'}));
  }
});
server.listen(port,host,()=>console.log(`Deem listening on http://${host}:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
