// Dependencies are supplied by live.js so that resource cleanup can be tested without a microphone.
// 聞き役の指示。ブラウザ直結（トークン方式）とサーバー経由（Vertex）で同じ内容を使う
export const liveInstruction=request=>'あなたは地域の記憶を引き継ぐ「ツギテ」の聞き役です。短い日本語で一度に一つだけ質問します。初めて担当する人に場所・時間・手順・理由・確認先が伝わるよう、曖昧な部分を聞き返してください。推測で情報を追加せず、不明は未確認にします。現在の質問：'+(request.currentQuestion||request.question)+'。前回の確認済みの内容：'+JSON.stringify(request.card||null)+'。これまでの会話：'+JSON.stringify(request.turns.slice(-12));
export async function startLiveSession({getToken,request,onTurn,onStatus,onEnd,signal},deps){
  let stream,ctx,session,node,source,timer,ended=false,next=0,input='',output='';
  const playing=new Set();
  const flush=()=>{if(input.trim())onTurn('user',input.trim());if(output.trim())onTurn('assistant',output.trim());input='';output=''};
  const closeAudio=audio=>{try{Promise.resolve(audio?.close()).catch(()=>{})}catch{}};
  const stop=error=>{
    if(ended)return;
    ended=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);flush();
    try{node?.disconnect();source?.disconnect()}catch{}
    try{session?.close()}catch{}
    for(const player of playing){try{player.stop()}catch{}}
    stream?.getTracks().forEach(track=>track.stop());closeAudio(ctx);
    onEnd(typeof error==='string'?error:undefined);
  };
  const abort=()=>stop();
  const cancelled=()=>{if(ended)throw new DOMException('音声会話を終了しました','AbortError')};
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted){stop();return}
  // Includes connection setup so an unavailable service cannot leave capture running indefinitely.
  timer=setTimeout(()=>stop('接続がタイムアウトしました。もう一度お試しください。'),30000);
  try{
    onStatus('マイクとGoogle AIへの接続を準備しています。',()=>stop());
    stream=await deps.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
    if(ended){stream.getTracks().forEach(track=>track.stop());return}
    ctx=new deps.AudioContext({sampleRate:24000});await ctx.resume();cancelled();
    const token=await getToken();cancelled();
    const connectArgs={model:token.model,config:{responseModalities:[deps.Modality.AUDIO],inputAudioTranscription:{},outputAudioTranscription:{},systemInstruction:{parts:[{text:liveInstruction(request)}]}},callbacks:{
      onmessage:m=>{
        if(ended)return;
        const s=m.serverContent;if(!s)return;
        if(s.inputTranscription?.text)input+=s.inputTranscription.text;
        if(s.outputTranscription?.text)output+=s.outputTranscription.text;
        if(s.interrupted){for(const player of playing){try{player.stop()}catch{}}playing.clear();next=0;flush()}
        for(const part of s.modelTurn?.parts||[]){
          const data=part.inlineData?.data;if(!data)continue;
          const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
          if(bytes.length%2)continue;
          const pcm=new DataView(bytes.buffer),rate=Number(part.inlineData.mimeType?.match(/rate=(\d+)/)?.[1]||24000);
          const buffer=ctx.createBuffer(1,bytes.length/2,rate),values=buffer.getChannelData(0);
          for(let i=0;i<values.length;i++)values[i]=pcm.getInt16(i*2,true)/32768;
          const player=ctx.createBufferSource();player.buffer=buffer;player.connect(ctx.destination);
          next=Math.max(ctx.currentTime,next);player.start(next);next+=buffer.duration;
          playing.add(player);player.onended=()=>playing.delete(player);
        }
        if(s.turnComplete)flush();
      },
      onerror:()=>stop('音声接続でエラーが発生しました。接続設定やモデル名を確認してください。'),
      onclose:()=>stop()
    }};
    // proxy：サーバーがVertexに中継する（ブラウザにはキーも認証情報も渡さない）。token：ブラウザからGeminiに直結する
    session=token.proxy?await deps.connectProxy({url:token.url,ticket:token.ticket,request:{currentQuestion:request.currentQuestion||request.question,card:request.card||null,turns:request.turns.slice(-12)},callbacks:connectArgs.callbacks}):await new deps.GoogleGenAI({apiKey:token.token,httpOptions:{apiVersion:'v1beta'}}).live.connect(connectArgs);
    if(ended){session.close();return}
    await ctx.audioWorklet.addModule('./pcm-worklet.js');cancelled();
    source=ctx.createMediaStreamSource(stream);node=new deps.AudioWorkletNode(ctx,'pcm-capture');
    node.port.onmessage=e=>{
      if(ended)return;
      const raw=e.data,ratio=ctx.sampleRate/16000,out=new Int16Array(Math.floor(raw.length/ratio));
      for(let i=0;i<out.length;i++)out[i]=Math.max(-32768,Math.min(32767,raw[Math.floor(i*ratio)]*32767));
      let binary='';for(const b of new Uint8Array(out.buffer))binary+=String.fromCharCode(b);
      try{session.sendRealtimeInput({audio:{data:btoa(binary),mimeType:'audio/pcm;rate=16000'}})}catch{stop('音声の送信が止まりました。再接続してください。')}
    };
    source.connect(node);node.connect(ctx.destination);
    session.sendClientContent({turns:[{role:'user',parts:[{text:'現在の質問を伝え、短い質問ひとつで聞き取りを始めてください。'}]}],turnComplete:true});
    clearTimeout(timer);timer=setTimeout(()=>stop(),Math.min(token.maxSessionSeconds||300,300)*1000);
    onStatus('音声で会話中です。生の音声は保存せず、文字になったお話を記録します。',()=>stop());
    return {stop:()=>stop()};
  }catch(error){stop();if(!signal?.aborted&&error.name!=='AbortError')throw error}
}
