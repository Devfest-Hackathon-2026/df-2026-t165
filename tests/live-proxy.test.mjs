import {test} from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {WebSocketServer} from 'ws';
import {connectProxy} from '../public/live-proxy.js';

test('connectProxy: init→ready, relays messages and inputs, reports errors',async()=>{
 const wss=new WebSocketServer({port:0}),seen=[];
 wss.on('connection',ws=>ws.on('message',raw=>{const m=JSON.parse(String(raw));seen.push(m);
  if(m.type==='init'){ws.send(JSON.stringify({type:'ready'}));ws.send(JSON.stringify({type:'message',message:{serverContent:{turnComplete:true}}}))}
  if(m.type==='input')ws.send(JSON.stringify({type:'error',message:'boom'}))}));
 await new Promise(r=>wss.once('listening',r));
 const got=[];let errored;
 const session=await connectProxy({url:`ws://127.0.0.1:${wss.address().port}/api/live-ws`,ticket:'t1',request:{currentQuestion:'q',card:null,turns:[]},callbacks:{onmessage:m=>got.push(m),onerror:e=>errored=e,onclose:()=>{}}});
 await new Promise(r=>setTimeout(r,50));
 assert.deepEqual(seen[0],{type:'init',ticket:'t1',request:{currentQuestion:'q',card:null,turns:[]}});
 assert.deepEqual(got,[{serverContent:{turnComplete:true}}]);
 session.sendRealtimeInput({audio:{data:'AA==',mimeType:'audio/pcm;rate=16000'}});
 await new Promise(r=>setTimeout(r,50));
 assert.equal(seen[1].type,'input');assert.equal(errored.message,'boom');
 session.close();await new Promise(r=>wss.close(r));
});
test('connectProxy: rejects when the server refuses the ticket',async()=>{
 const wss=new WebSocketServer({port:0});
 wss.on('connection',ws=>ws.on('message',()=>{ws.send(JSON.stringify({type:'error',message:'期限切れ'}))}));
 await new Promise(r=>wss.once('listening',r));
 await assert.rejects(connectProxy({url:`ws://127.0.0.1:${wss.address().port}/x`,ticket:'bad',request:{},callbacks:{}}),/期限切れ/);
 await new Promise(r=>wss.close(r));
});

async function run(env,verify){
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'0',GOOGLE_CLOUD_PROJECT:'',GCLOUD_PROJECT:'',TSUGITE_STORAGE:'local',TSUGITE_BUCKET:'',GEMINI_API_KEY:'',DEMO_ACCESS_CODE:'',...env},stdio:['ignore','pipe','pipe']});
 try{const base=await new Promise((res,rej)=>{const t=setTimeout(()=>{rej(Error('timeout'));child.kill()},10000);child.stdout.once('data',d=>{clearTimeout(t);res(String(d).match(/http:\/\/127\.0\.0\.1:\d+/)[0])})});await verify(base)}
 finally{if(child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r))}}
}
test('server: vertex mode issues one-time tickets; the websocket rejects missing or reused tickets',()=>run({GEMINI_BACKEND:'vertex',GOOGLE_CLOUD_PROJECT:'p',TSUGITE_STORAGE:'local',DEMO_ACCESS_CODE:'code',GEMINI_LIVE_MODEL:'live-x'},async base=>{
 const h={'content-type':'application/json','x-workspace-id':'11111111-1111-1111-1111-111111111111','x-demo-access-code':'code'};
 const r=await fetch(base+'/api/live-token',{method:'POST',headers:h,body:'{}'});const t=await r.json();
 assert.equal(r.status,200,JSON.stringify(t));assert.equal(t.proxy,true);assert.equal(t.model,'live-x');assert.match(t.ticket,/^[0-9a-f-]{36}$/);assert.equal('token' in t,false);
 await assert.rejects(connectProxy({url:base.replace('http','ws')+t.url,ticket:'wrong',request:{},callbacks:{}}),/許可が切れ/);
 assert.equal((await fetch(base+'/api/live-token',{method:'POST',headers:{...h,'x-demo-access-code':'no'},body:'{}'})).status,401);
}));
