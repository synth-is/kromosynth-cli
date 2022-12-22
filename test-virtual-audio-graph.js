#!/usr/bin/env node
import NodeWebAudioAPI from 'node-web-audio-api';
const { AudioContext, OfflineAudioContext, OscillatorNode, GainNode } = NodeWebAudioAPI;
import createVirtualAudioGraph from 'virtual-audio-graph';

function testVirtualAudioGraph() {

  const DURATION_SEC = 8;

  const ONLINE = true;
  let virtualAudioGraph;
  if( ONLINE ) {
    const audioContext = new AudioContext();
    virtualAudioGraph = createVirtualAudioGraph({
  		audioContext: audioContext,
  		output: audioContext.destination,
  	});
  } else {
    const offlineAudioContext = new OfflineAudioContext(
      {
        numberOfChannels: 2,
        length: 44100 * DURATION_SEC,
        sampleRate: 44100,
      }
    );
    virtualAudioGraph = createVirtualAudioGraph({
  		audioContext: offlineAudioContext,
  		output: offlineAudioContext.destination,
  	});
  }

	const { currentTime } = virtualAudioGraph
  console.log("currentTime",currentTime);

	const graph = {
		// 0: ['gain', 'output', {gain: 0.3}],
    0: ['gain', 'output', {gain: [
      ['setValueAtTime', 0, 0],
      ['setValueCurveAtTime', 
        Float32Array.of(0.5, 0.75, 0.25, 1,0.5, 0.75, 0.25, 1,0.5, 0.75, 0.25, 1,0.5, 0.75, 0.25, 1,0.5, 0.75, 0.25, 0), 
        0, 
        4
      ],
    ]}],
		1: ['oscillator', 0, {
			type: 'square',
			frequency: 440,
			startTime: currentTime,
			stopTime: currentTime + 2.5
		}],
		2: ['oscillator', 0, {
			type: 'sawtooth',
			frequency: 260,
			detune: 4,
			startTime: currentTime + .5,
			stopTime: currentTime + 4
		}],
	}

	virtualAudioGraph.update(graph)

  if( ! ONLINE ) {
    virtualAudioGraph.audioContext.startRendering().then( renderedBuffer => {
      const audioContextPlayback = new AudioContext();
      const song = audioContextPlayback.createBufferSource();
      song.buffer = renderedBuffer;
      song.connect(audioContextPlayback.destination);
      song.start();
      setTimeout(() => {process.exit()}, DURATION_SEC*1000);
    } );
  } else {
    setTimeout(() => {process.exit()}, DURATION_SEC*1000);
  }
}

function testWebAudioAPI() {
  const DURATION_SEC = 2;

  const ONLINE = false;
  let audioContext;
  if( ONLINE ) {
    audioContext = new AudioContext();
  } else {
    audioContext = new OfflineAudioContext(
      2
      ,44100 * 40
      , 44100
      // {
      //   numberOfChannels: 2,
      //   length: 44100 * DURATION_SEC,
      //   sampleRate: 44100,
      // }
    );
  }

  const now = audioContext.currentTime;

  // const env = new GainNode(offlineAudioContext);
  const env = audioContext.createGain();
  env.connect(audioContext.destination);
  env.gain.value = 0;
  // env.gain.setValueAtTime(0, now);
  // env.gain.linearRampToValueAtTime(DURATION_SEC, now + 0.02);
  // env.gain.exponentialRampToValueAtTime(0.0001, now + DURATION_SEC);
  const waveArray = new Float32Array(19);
  waveArray[0] = 0.5;
  waveArray[1] = 1;
  waveArray[2] = 0.5;
  waveArray[3] = 0;
  waveArray[4] = 0.5;
  waveArray[5] = 1;
  waveArray[6] = 0.5;
  waveArray[7] = 0;
  waveArray[8] = 0.5;

  waveArray[9] = 1;
  waveArray[10] = 0.5;
  waveArray[11] = 0;
  waveArray[12] = 0.5;
  waveArray[13] = 1;
  waveArray[14] = 0.5;
  waveArray[15] = 0;
  waveArray[16] = 0.5;
  waveArray[17] = 1;
  waveArray[18] = 0;

  env.gain.setValueCurveAtTime(waveArray, now, DURATION_SEC);

  const osc = new OscillatorNode(audioContext);
  osc.type = 'sine';
  osc.frequency.value = 200 + Math.random() * 2800;
  osc.connect(env);
  osc.start(now);
  osc.stop(now + DURATION_SEC);

  if( ! ONLINE ) {
    audioContext.startRendering().then( renderedBuffer => {
      console.log('Rendering completed successfully');
      const playbackAudioContext = new AudioContext();
      const song = playbackAudioContext.createBufferSource();
      song.buffer = renderedBuffer;
      song.connect(playbackAudioContext.destination);
      song.start();
      setTimeout(() => {process.exit()}, DURATION_SEC*1000);
    } );
  } else {
    setTimeout(() => {process.exit()}, DURATION_SEC*1000);
  }
  
}

testVirtualAudioGraph();
// testWebAudioAPI();

