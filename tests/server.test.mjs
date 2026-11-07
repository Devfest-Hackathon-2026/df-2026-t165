import {test} from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
async function running(accessCode,verify){
 const dir=await mkdtemp(join(tmpdir(),'tsugite-test-'));
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'0',GEMINI_API_KEY:'',GOOGLE_CLOUD_PROJECT:'',GCLOUD_PROJECT:'',DEMO_ACCESS_CODE:accessCode,TSUGITE_STORAGE:'local',TSUGITE_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
 try{
  const base=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{reject(Error('server startup timed out'));child.kill()},10000);child.stdout.once('data',data=>{clearTimeout(timeout);const match=String(data).match(/http:\/\/127\.0\.0\.1:\d+/);match?resolve(match[0]):reject(Error('missing server URL'))});child.once('error',reject);child.once('exit',code=>{clearTimeout(timeout);reject(Error('server exited '+code))})});
  await verify(base);
 }finally{if(child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve))}await rm(dir,{recursive:true,force:true})}
}
test('local server persists a workspace and returns a source-grounded experience card',()=>running('',async base=>{
 const config=await(await fetch(base+'/api/config')).json();assert.equal(config.aiReady,false);assert.equal(config.storage,'local-file');
 const id=randomUUID(),payload={requests:[{id:'sample',turns:[]}],measurements:[]};
 const r=await fetch(base+'/api/workspace/'+id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});assert.equal(r.status,200);
 assert.deepEqual((await(await fetch(base+'/api/workspace/'+id)).json()).data,payload);
 const card=await(await fetch(base+'/api/card',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({turns:[{id:'u1',role:'user',text:'雨なら公民館の集会室です。'}]})})).json();assert.equal(card.mode,'experience');assert.equal(card.card.facts.where.value,'公民館の集会室');assert.equal(card.card.facts.when.status,'unknown');
 assert.equal((await fetch(base+'/api/live-token',{method:'POST',body:'{}'})).status,409);
}));
test('access code protects both reads and writes without exposing it in config',()=>running('private-demo-code',async base=>{
 const route=base+'/api/workspace/'+randomUUID();assert.equal((await fetch(route)).status,401);
 assert.equal((await fetch(route,{method:'PUT',body:JSON.stringify({requests:[],measurements:[]})})).status,401);
 assert.equal((await fetch(route,{headers:{'x-demo-access-code':'private-demo-code'}})).status,200);
 const config=await(await fetch(base+'/api/config')).text();assert.equal(config.includes('private-demo-code'),false);
}));
test('malformed conversations and unsupported endpoints are rejected predictably',()=>running('',async base=>{
 const post=(route,payload)=>fetch(base+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
 assert.equal((await post('/api/card',{})).status,400);
 assert.equal((await post('/api/card',{turns:[null]})).status,400);
 assert.equal((await post('/api/card',{turns:[{id:'duplicate',role:'user',text:'a'},{id:'duplicate',role:'user',text:'b'}]})).status,400);
 assert.equal((await post('/api/followup',{turns:[]})).status,400);
 assert.equal((await post('/api/answer',{question:'どこ？',card:{confirmedAt:'today'}})).status,400);
 assert.equal((await post('/api/does-not-exist',{})).status,404);
}));
