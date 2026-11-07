import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DEMO} from '../src/domain.mjs';
const target=process.argv[2];
if(!target){console.error('使い方: node scripts/check-google.mjs https://公開URL [--ai] [--live-token]');process.exit(1)}
const url=new URL(target);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw Error('公開先はHTTPSを指定してください');
const origin=url.origin,code=process.env.TSUGITE_DEMO_ACCESS_CODE||'',workspace=randomUUID();
async function call(route,{data,authorized=true,expected=200}={}){const headers={'content-type':'application/json','x-workspace-id':workspace};if(authorized)headers['x-demo-access-code']=code;const res=await fetch(origin+route,{method:data===undefined?'GET':'POST',headers,signal:AbortSignal.timeout(55000),...(data===undefined?{}:{body:JSON.stringify(data)})});assert.equal(res.status,expected,route+' のHTTP応答を確認してください');return res.json()}
try{
 assert.equal((await call('/healthz')).ok,true);console.log('OK: サーバー起動');
 const config=await call('/api/config');console.log('OK: 接続設定を取得（保存先 '+config.storage+'）');
 if(config.requiresCode){await call('/api/workspace/'+workspace,{authorized:false,expected:401});assert.ok(code,'TSUGITE_DEMO_ACCESS_CODE を設定してください');console.log('OK: アクセスコードなしの保存領域アクセスを拒否')}
 await call('/api/workspace/'+workspace);console.log('OK: 保存先の読み取り権限（実データの作成・変更なし）');
 if(process.argv.includes('--ai')){
  assert.equal(config.aiReady,true,'AIの環境変数が未設定です');
  const turns=DEMO.lines.map((text,i)=>({id:'smoke-'+i,role:'user',text}));
  const request={question:DEMO.question,event:DEMO.event,task:DEMO.task};
  const follow=await call('/api/followup',{data:{request,turns:turns.slice(0,1)}});assert.equal(follow.mode,'gemini');assert.ok(follow.text?.trim());console.log('OK: Geminiの聞き返し');
  const out=await call('/api/card',{data:{request,turns}});assert.equal(out.mode,'gemini');assert.ok(Object.values(out.card.facts).some(f=>f.sourceIds.length));for(const f of Object.values(out.card.facts))assert.ok(f.sourceIds.every(id=>turns.some(t=>t.id===id)));console.log('OK: Geminiの下書きと元発言ID（意味の正確さは別途人が確認）');
 }
 if(process.argv.includes('--live-token')){const token=await call('/api/live-token',{data:{}});assert.ok(token.token);console.log('OK: Live用の短期トークン発行（マイク・音声応答は未検証）')}
 console.log('指定された接続チェックが完了しました。');
}catch(error){console.error('未完了: '+error.message);process.exitCode=1}
