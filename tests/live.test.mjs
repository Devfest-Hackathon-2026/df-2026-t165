import {test} from 'node:test';import assert from 'node:assert/strict';
import {startLiveSession} from '../public/live-core.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
function fixture(overrides={}){
 const events={tracksStopped:0,contextClosed:0,sessionClosed:0,ended:[],turns:[],connected:0};
 const stream={getTracks:()=>[{stop:()=>events.tracksStopped++}]};
 const session={close:()=>events.sessionClosed++,sendClientContent:()=>{},sendRealtimeInput:()=>{}};
 class Context{constructor(){this.sampleRate=24000;this.audioWorklet={addModule:async()=>{}};this.destination={}}async resume(){}close(){events.contextClosed++}createMediaStreamSource(){return {connect(){},disconnect(){}}}}
 class Worklet{constructor(){this.port={}}connect(){}disconnect(){}}
 class AI{constructor(){this.live={connect:async config=>{events.connected++;events.callbacks=config.callbacks;return session}}}}
 const controller=new AbortController();
 const options={signal:controller.signal,request:{question:'どこ？',turns:[]},getToken:async()=>({token:'test-token',model:'test-model',maxSessionSeconds:300}),onTurn:(role,text)=>events.turns.push({role,text}),onStatus:()=>{},onEnd:error=>events.ended.push(error)};
 const deps={getUserMedia:async()=>stream,AudioContext:Context,AudioWorkletNode:Worklet,GoogleGenAI:AI,Modality:{AUDIO:'AUDIO'},...overrides};
 return {events,stream,session,controller,options,deps};
}
test('navigation while microphone permission is pending stops a late stream',async()=>{const pending=deferred(),f=fixture({getUserMedia:()=>pending.promise});const run=startLiveSession(f.options,f.deps);f.controller.abort();pending.resolve(f.stream);await run;assert.equal(f.events.tracksStopped,1);assert.equal(f.events.connected,0);assert.equal(f.events.ended.length,1)});
test('navigation during connection closes a session that resolves after cancellation',async()=>{const pending=deferred(),started=deferred(),f=fixture();f.deps.GoogleGenAI=class{constructor(){this.live={connect:()=>{started.resolve();return pending.promise}}}};const run=startLiveSession(f.options,f.deps);await started.promise;f.controller.abort();pending.resolve(f.session);await run;assert.equal(f.events.tracksStopped,1);assert.equal(f.events.contextClosed,1);assert.equal(f.events.sessionClosed,1);assert.equal(f.events.ended.length,1)});
test('stopping flushes partial text once and discards later messages',async()=>{const f=fixture();const control=await startLiveSession(f.options,f.deps);f.events.callbacks.onmessage({serverContent:{inputTranscription:{text:'公民館です。'}}});control.stop();control.stop();f.events.callbacks.onmessage({serverContent:{inputTranscription:{text:'遅れて届いた内容'},turnComplete:true}});assert.deepEqual(f.events.turns,[{role:'user',text:'公民館です。'}]);assert.equal(f.events.ended.length,1);assert.equal(f.events.tracksStopped,1);assert.equal(f.events.contextClosed,1)});
test('token failures release microphone and audio context',async()=>{const f=fixture();f.options.getToken=async()=>{throw Error('接続できません')};await assert.rejects(startLiveSession(f.options,f.deps),/接続できません/);assert.equal(f.events.tracksStopped,1);assert.equal(f.events.contextClosed,1);assert.equal(f.events.ended.length,1)});
test('connection errors surface a useful message after cleanup',async()=>{const f=fixture();await startLiveSession(f.options,f.deps);f.events.callbacks.onerror(Error('internal'));assert.equal(f.events.tracksStopped,1);assert.match(f.events.ended[0],/音声接続/)});
