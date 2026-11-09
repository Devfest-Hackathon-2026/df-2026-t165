import {GoogleGenAI,Modality} from './vendor/google-genai.js';
import {startLiveSession} from './live-core.js';
import {connectProxy} from './live-proxy.js';
export const startConversation=options=>startLiveSession(options,{
  GoogleGenAI,Modality,connectProxy,
  AudioContext:window.AudioContext||window.webkitAudioContext,
  AudioWorkletNode:window.AudioWorkletNode,
  getUserMedia:constraints=>navigator.mediaDevices.getUserMedia(constraints)
});
