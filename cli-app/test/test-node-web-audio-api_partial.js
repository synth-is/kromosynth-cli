import { OfflineAudioContext } from 'node-web-audio-api';
import toWav from 'audiobuffer-to-wav';
import fs from 'fs';

const SAMPLE_RATE = 48000;

const duration = 10;
const frequency = 440;
const samples = duration * SAMPLE_RATE;
const sineWave = new Float32Array(samples);

for (let i = 0; i < samples; i++) {
  sineWave[i] = Math.sin(2 * Math.PI * frequency * i / SAMPLE_RATE);
}

const segmentLength = samples / 10;
const segments = [];

for (let i = 0; i < 10; i++) {
  segments.push(sineWave.subarray(i * segmentLength, (i + 1) * segmentLength));
}

const renderedSegments = [];

// render each segment individually
for (const segment of segments) {
  let offline = new OfflineAudioContext(1, segment.length, SAMPLE_RATE);
  const segmentBuffer = offline.createBuffer(1, segment.length, SAMPLE_RATE);
  segmentBuffer.copyToChannel(segment, 0);

  const segmentSource = offline.createBufferSource();
  segmentSource.buffer = segmentBuffer;
  segmentSource.connect(offline.destination);
  segmentSource.start();

  const renderedBuffer = await offline.startRendering();
  renderedSegments.push(renderedBuffer.getChannelData(0));
}

// concatenate the rendered segments
const concatenatedBuffer = new Float32Array(renderedSegments.reduce((acc, val) => acc + val.length, 0));
let offset = 0;
for (const segment of renderedSegments) {
  concatenatedBuffer.set(segment, offset);
  offset += segment.length;
}

let offline = new OfflineAudioContext(1, 10*SAMPLE_RATE, SAMPLE_RATE);
const concatenatedAudioBuffer = offline.createBuffer(1, concatenatedBuffer.length, SAMPLE_RATE);
concatenatedAudioBuffer.copyToChannel(concatenatedBuffer, 0);

const concatenatedAudioBufferWav = toWav(concatenatedAudioBuffer);
const concatenatedAudioBufferWavBuffer = Buffer.from(new Uint8Array(concatenatedAudioBufferWav));
fs.writeFileSync("concatenated_oscillator.wav", concatenatedAudioBufferWavBuffer);