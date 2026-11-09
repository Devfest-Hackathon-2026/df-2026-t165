import {GoogleGenAI,Modality} from './vendor/google-genai.js';
import {startLiveSession} from './live-core.js';
export const startConversation=options=>startLiveSession(options,{
  GoogleGenAI,Modality,
  AudioContext:window.AudioContext||window.webkitAudioContext,
  AudioWorkletNode:window.AudioWorkletNode,
  getUserMedia:constraints=>navigator.mediaDevices.getUserMedia(constraints)
});
