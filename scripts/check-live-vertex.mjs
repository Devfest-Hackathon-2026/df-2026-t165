// Vertex AI の Gemini Live が、このプロジェクトで使えるモデルと場所を調べる（Cloud Shell などで実行）
// 使い方: GOOGLE_CLOUD_PROJECT=devfest165 node scripts/check-live-vertex.mjs [モデル名 ...]
import {GoogleGenAI,Modality} from '@google/genai';
const project=process.env.GOOGLE_CLOUD_PROJECT;
if(!project){console.error('GOOGLE_CLOUD_PROJECT を指定してください');process.exit(1)}
const models=process.argv.slice(2).length?process.argv.slice(2):['gemini-3.8-live','gemini-live-2.5-flash-native-audio','gemini-3.1-flash-live-preview','gemini-live-2.5-flash-preview-native-audio-09-2025'];
const locations=['global','us-central1'];
async function tryOne(model,location){
 const ai=new GoogleGenAI({vertexai:true,project,location});
 return new Promise(async resolve=>{
  let done=false,session;const finish=r=>{if(done)return;done=true;clearTimeout(t);try{session?.close()}catch{}resolve(r)};
  const t=setTimeout(()=>finish('接続はできたが、10秒以内に返事なし'),10000);
  try{
   session=await ai.live.connect({model,config:{responseModalities:[Modality.AUDIO],outputAudioTranscription:{}},callbacks:{
    onmessage:m=>{const s=m.serverContent;if(s?.outputTranscription?.text||s?.modelTurn?.parts?.some(p=>p.inlineData?.data))finish('OK（返事あり）')},
    onerror:e=>finish('エラー: '+String(e?.message||e).slice(0,160)),
    onclose:e=>finish('閉じられた: '+String(e?.reason||e?.code||'').slice(0,160))}});
   session.sendClientContent({turns:[{role:'user',parts:[{text:'こんにちは。一言であいさつしてください。'}]}],turnComplete:true});
  }catch(e){finish('失敗: '+String(e?.message||e).slice(0,160))}
 });
}
for(const model of models)for(const location of locations)console.log(`${model} @ ${location}: ${await tryOne(model,location)}`);
process.exit(0);
