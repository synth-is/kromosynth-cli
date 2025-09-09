import { AudioContext, OscillatorNode, GainNode } from 'node-web-audio-api';
// or using old fashioned commonjs syntax:
// const { AudioContext, OscillatorNode, GainNode } = require('node-web-audio-api');
const audioContext = new AudioContext();

setInterval(() => {
  const now = audioContext.currentTime;
  const frequency = 200 + Math.random() * 2800;

  const env = new GainNode(audioContext, { gain: 0 });
  env.connect(audioContext.destination);
  env.gain
    .setValueAtTime(0, now)
    .linearRampToValueAtTime(0.2, now + 0.02)
    .exponentialRampToValueAtTime(0.0001, now + 1);

  const osc = new OscillatorNode(audioContext, { frequency });
  osc.connect(env);
  osc.start(now);
  osc.stop(now + 1);
}, 80);