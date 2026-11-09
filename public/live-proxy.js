// サーバー経由の音声会話。ブラウザ ⇄ このサーバー（WebSocket）⇄ Vertex AI の Gemini Live。
// Gemini の SDK の session と同じ形（sendRealtimeInput / sendClientContent / close）で返す。
export function connectProxy({url,ticket,request,callbacks},WS=globalThis.WebSocket){
  return new Promise((resolve,reject)=>{
    const base=typeof location==='undefined'?'':location.origin.replace(/^http/,'ws');
    const ws=new WS(/^wss?:/.test(url)?url:base+url);
    let ready=false;
    const send=m=>{if(ws.readyState!==1)throw Error('接続が閉じています');ws.send(JSON.stringify(m))};
    const session={
      sendRealtimeInput:payload=>send({type:'input',payload}),
      sendClientContent:payload=>send({type:'content',payload}),
      close:()=>{try{ws.close()}catch{}}
    };
    ws.onopen=()=>ws.send(JSON.stringify({type:'init',ticket,request}));
    ws.onmessage=e=>{
      let m;try{m=JSON.parse(e.data)}catch{return}
      if(m.type==='ready'){ready=true;resolve(session)}
      else if(m.type==='message')callbacks.onmessage(m.message);
      else if(m.type==='error'){const err=Error(m.message||'音声接続でエラーが発生しました');if(ready)callbacks.onerror(err);else reject(err);session.close()}
    };
    ws.onerror=()=>{const err=Error('音声接続でエラーが発生しました');if(ready)callbacks.onerror(err);else reject(err)};
    ws.onclose=()=>{if(ready)callbacks.onclose();else reject(Error('音声接続を開始できませんでした'))};
  });
}
