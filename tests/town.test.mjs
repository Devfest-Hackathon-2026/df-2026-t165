import {test} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {spawn} from 'node:child_process';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import {buildSources,parseTownAnswer,cleanStories,parseRegions,cleanRegionRequest} from '../src/town.mjs';
import {sniff,materialRecord} from '../src/materials.mjs';

test('town answer renumbers source markers and drops unknown ones',()=>{
 const sources=buildSources({place:'青葉地区',materials:[],stories:[]});
 const out=parseTownAnswer(JSON.stringify({text:'夏祭りは昭和25年に始まりました[S1]。神輿は新しくされました[S3、S1]。でたらめ[S99]。',materials:['S2','S1','S99'],askable:false}),sources);
 assert.equal(out.text,'夏祭りは昭和25年に始まりました[1]。神輿は新しくされました[2][1]。でたらめ。');
 assert.deepEqual(out.citations.map(c=>c.id),[sources[0].citation.id,sources[2].citation.id]);
 assert.equal(out.materials.length,2);assert.equal(out.askable,false);
 assert.equal(parseTownAnswer({text:'資料にありません。',askable:false},sources).askable,true,'no citation means ask a local person');
});
test('only stated facts of confirmed stories become sources',()=>{
 const stories=cleanStories([{requestId:'r1',speaker:'田中さん',title:'提灯',facts:[{label:'集合時間',value:'未確認'},{label:'場所',value:'公民館'}]},{requestId:'',facts:[{label:'a',value:'b'}]}]);
 assert.equal(stories.length,1);assert.deepEqual(stories[0].facts,[{label:'場所',value:'公民館'}]);
 const s=buildSources({place:'どこか町',materials:[],stories});assert.equal(s.length,1);assert.equal(s[0].citation.requestId,'r1');
});
test('regions keep only registered candidates',()=>{
 const q=cleanRegionRequest({candidates:[{id:'tohoku',name:'東北'},{id:'kansai',name:'関西'},{id:'bad id',name:'x'}],answers:['海']});
 assert.equal(q.candidates.length,2);
 const out=parseRegions({regions:[{id:'kansai',fit:true,reasons:['町並み']},{id:'mars',fit:true}]},q.candidates);
 assert.deepEqual(out.regions.map(r=>[r.id,r.fit]),[['kansai',true],['tohoku',false]]);
});
test('file type is checked by content, and consent is required',()=>{
 assert.equal(sniff(Buffer.from('%PDF-1.7 ...')),'application/pdf');assert.equal(sniff(Buffer.from('hello world!')),null);
 assert.throws(()=>materialRecord({place:'青葉地区',title:'a'},{name:'a.pdf',type:'application/pdf',size:10},'w'),/確認/);
 assert.equal(materialRecord({place:' 青葉 地区 ',title:'a',consent:true},{name:'a.pdf',type:'application/pdf',size:10},'w').placeKey,'青葉地区');
});

// 偽のGemini（generateContent だけ）を立て、サーバー経由で町のチャットと資料の添付を確かめる
async function fakeGemini(reply){
 const seen=[];const s=http.createServer(async(req,res)=>{let b='';for await(const c of req)b+=c;seen.push({url:req.url,body:b?JSON.parse(b):null});res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({candidates:[{content:{role:'model',parts:[{text:JSON.stringify(reply(seen.at(-1)))}]},finishReason:'STOP'}],usageMetadata:{totalTokenCount:1}}))});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));return {url:`http://127.0.0.1:${s.address().port}`,seen,close:()=>new Promise(r=>s.close(r))};
}
async function running(env,verify){
 const dir=await mkdtemp(join(tmpdir(),'tsugite-town-'));
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'0',GOOGLE_CLOUD_PROJECT:'',GCLOUD_PROJECT:'',TSUGITE_BUCKET:'',TSUGITE_STORAGE:'local',TSUGITE_DATA_DIR:dir,GEMINI_API_KEY:'',DEMO_ACCESS_CODE:'',...env},stdio:['ignore','pipe','pipe']});
 try{const base=await new Promise((resolve,reject)=>{const t=setTimeout(()=>{reject(Error('timeout'));child.kill()},10000);child.stdout.once('data',d=>{clearTimeout(t);const m=String(d).match(/http:\/\/127\.0\.0\.1:\d+/);m?resolve(m[0]):reject(Error('no url'))});child.once('exit',c=>{clearTimeout(t);reject(Error('exit '+c))})});await verify(base)}
 finally{if(child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r))}await rm(dir,{recursive:true,force:true})}
}
test('materials upload, list, download and owner-only delete',()=>running({},async base=>{
 const owner=randomUUID(),other=randomUUID(),jpg=await readFile('public/images/kansai.jpg');
 const up=meta=>{const f=new FormData();f.append('file',new Blob([jpg],{type:'image/jpeg'}),'a.jpg');f.append('meta',JSON.stringify(meta));return fetch(base+'/api/materials',{method:'POST',headers:{'x-workspace-id':owner},body:f})};
 assert.equal((await up({place:'青葉地区',title:'駅前'})).status,400,'consent required');
 const r=await up({place:'青葉地区',title:'駅前',consent:true,description:'昭和の商店街'});assert.equal(r.status,201);const m=(await r.json()).material;
 assert.equal(m.mine,true);assert.equal('owner' in m,false);
 const list=(await(await fetch(base+'/api/materials?place='+encodeURIComponent('青葉 地区'),{headers:{'x-workspace-id':other}})).json()).materials;
 assert.equal(list.length,1);assert.equal(list[0].mine,false);
 const file=await fetch(base+`/api/materials/${m.id}/file`);assert.equal(file.headers.get('content-type'),'image/jpeg');assert.equal(Buffer.compare(Buffer.from(await file.arrayBuffer()),jpg),0);
 const town=await(await fetch(base+'/api/town?place='+encodeURIComponent('青葉地区'))).json();assert.equal(town.town.contacts.length,3);assert.equal(town.materials.length,1);assert.equal('knowledge' in town.town,false);
 assert.equal((await fetch(base+'/api/materials/'+m.id,{method:'DELETE',headers:{'x-workspace-id':other}})).status,403);
 assert.equal((await fetch(base+'/api/materials/'+m.id,{method:'DELETE',headers:{'x-workspace-id':owner}})).status,200);
 assert.equal((await fetch(base+`/api/materials/${m.id}/file`)).status,404);
 assert.equal((await fetch(base+'/api/town-answer',{method:'POST',body:JSON.stringify({place:'青葉地区',question:'夏祭りは？'})})).status,409,'falls back when Gemini is not set');
}));
test('town answer sends sources and attached files to Gemini and returns numbered citations',async()=>{
 const g=await fakeGemini(()=>({text:'夏祭りは昭和25年に青年団が始めました[S1]。駅前の写真も登録されています[S5]。',materials:['S5'],askable:false}));
 try{await running({GEMINI_API_KEY:'test-key',GEMINI_BASE_URL:g.url,GEMINI_TEXT_MODEL:'fake-flash',DEMO_ACCESS_CODE:'code'},async base=>{
  const wid=randomUUID(),h={'x-workspace-id':wid,'x-demo-access-code':'code'};
  assert.equal((await(await fetch(base+'/api/config')).json()).aiReady,true);
  const f=new FormData();f.append('file',new Blob([await readFile('public/images/kansai.jpg')],{type:'image/jpeg'}),'ekimae.jpg');f.append('meta',JSON.stringify({place:'青葉地区',title:'駅前の写真',consent:true}));
  assert.equal((await fetch(base+'/api/materials',{method:'POST',headers:h,body:f})).status,201);
  const res=await fetch(base+'/api/town-answer',{method:'POST',headers:{...h,'content-type':'application/json'},body:JSON.stringify({place:'青葉地区',question:'夏祭りはいつから？',history:[],stories:[{requestId:'r1',speaker:'田中さん',title:'提灯の準備',facts:[{label:'雨天の場所',value:'公民館の集会室'}]}]})});
  const out=await res.json();assert.equal(res.status,200,JSON.stringify(out));
  assert.equal(out.mode,'gemini');assert.equal(out.text,'夏祭りは昭和25年に青年団が始めました[1]。駅前の写真も登録されています[2]。');
  assert.equal(out.citations[0].id,'ayumi');assert.equal(out.citations[1].fileKind,'写真');assert.equal(out.citations[1].server,true);
  const sent=g.seen.find(x=>/generateContent/.test(x.url)).body,parts=sent.contents[0].parts;
  assert.match(parts[0].text,/\[S1\] 『青葉地区のあゆみ』/);assert.match(parts[0].text,/田中さんが確認した語り/);
  assert.equal(parts.filter(p=>p.inlineData?.mimeType==='image/jpeg').length,1,'photo is attached to the prompt');
  assert.match(sent.systemInstruction.parts[0].text,/推測しない/);
  const rg=await(await fetch(base+'/api/regions',{method:'POST',headers:{...h,'content-type':'application/json'},body:JSON.stringify({candidates:[{id:'kansai',name:'関西の町並み'}],answers:['町なか']})})).json();
  assert.deepEqual(rg.regions.map(r=>r.id),['kansai']);
 })}finally{await g.close()}
});

test('video: sniffed by header, registered as 動画, and never attached to Gemini',()=>{
 const mp4=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom')]),mov=Buffer.concat([Buffer.from([0,0,0,20]),Buffer.from('ftypqt  ')]),webm=Buffer.from([0x1a,0x45,0xdf,0xa3,0,0,0,0,0,0,0,0]);
 assert.equal(sniff(mp4),'video/mp4');assert.equal(sniff(mov),'video/quicktime');assert.equal(sniff(webm),'video/webm');
 const rec=materialRecord({place:'青葉地区',title:'提灯の運び方',description:'体育館から神社へ運ぶ様子',consent:true},{name:'a.mp4',type:'video/mp4',size:1000},'w');
 assert.equal(rec.kind,'動画');
 const s=buildSources({place:'青葉地区',materials:[{...rec,size:1000}]}).at(-1);
 assert.equal(s.file,null);assert.ok(s.text.includes('動画の中身は確認していない')&&s.text.includes('体育館から神社へ'));
});
