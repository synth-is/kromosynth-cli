import NodeWebAudioAPI from 'node-web-audio-api';
const { AudioContext, OfflineAudioContext } = NodeWebAudioAPI;
let audioCtx;
let audioBufferSourceNode;

export const SAMPLE_RATE = 48000;

export function getAudioContext( sampleRate = SAMPLE_RATE) {
	if( ! audioCtx ) audioCtx = new AudioContext({sampleRate});
	return audioCtx;
}

export function getNewOfflineAudioContext( duration, sampleRate = SAMPLE_RATE) {
	const offlineAudioContext = new OfflineAudioContext({
		numberOfChannels: 2,
		length: sampleRate * duration,
		sampleRate: sampleRate,
	});
	return offlineAudioContext;
}

export function playAudio( audioBuffer ) {

	if( audioBufferSourceNode ) {
		stopAudio();
	}
	audioBufferSourceNode = getAudioContext().createBufferSource();
	// set the buffer in the AudioBufferSourceNode
	audioBufferSourceNode.buffer = audioBuffer;
	// connect the AudioBufferSourceNode to the
	// destination so we can hear the sound
	audioBufferSourceNode.connect(getAudioContext().destination);
	// start the source playing
	audioBufferSourceNode.start();
}

function stopAudio() {
  if( audioBufferSourceNode ) {
    audioBufferSourceNode.stop(0);
    audioBufferSourceNode = null;
  }
}