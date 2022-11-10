#!/usr/bin/env node
import meow from 'meow';
import NodeWebAudioAPI from 'node-web-audio-api';
const { AudioContext, OfflineAudioContext, OscillatorNode, GainNode, AudioNode } = NodeWebAudioAPI;
import {
	getNewAudioSynthesisGenome,
  getNewAudioSynthesisGenomeByMutation,
  renderAudio,
	wireUpAudioGraphForPatchAndWaveNetwork
} from 'kromosynth';

import createVirtualAudioGraph from 'virtual-audio-graph';

let audioCtx;
let audioBufferSourceNode;

const cli = meow(`
	Usage
	  $ foo <command>

	Options
	  --read-from-file, -rff  Gene file to read from
    --write-to-file, -wtf  File to write to

    --read-from-input, -rfi  Read from standard input (for piping ... | )
    --write-to-output, -wto  Write to standard output (for piping | ...)

		--play-on-default-audio-device, -play  Play rendered audio with the command <render-audio> on default audio device
		--duration, -d  Duration in seconds for the <render-audio> command
		--note-delta, -nd  Note relative from the sound's base note (12=one octave up), for the <render-audio> command
		--velocity, -v  Velocity of the rendered sound from the <render-audio> command, 1 being full velocity (as when hitting a piano key)
		--reverse, -r  Reverse the rendered sound from the <render-audio> command

	Examples
		$ ./kromosynth.js new-genome [--write-to-file]
		$ ./kromosynth.js mutate-genome [--read-from-file | --read-from-input] [--write-to-file | --write-to-output]
		$ ./kromosynth.js render-audio [--read-from-file | --read-from-input] [--write-to-file | --play-on-default-audio-device]
		$ ./kromosynth.js sound-check
`, {
	importMeta: import.meta,
	flags: {
		readFromFile: {
			type: 'string',
			alias: 'rff'
		},
		writeToFile: {
			type: 'string',
			alias: 'wtf',
		},
		writeToOutput: {
			type: 'boolean',
			alias: 'wto',
			default: true
		},
		readFromInput: {
			type: 'boolean',
			alias: 'rfi',
			default: false // TODO: might want to go for true, then need to detect if stdin
		},
		playOnDefaultAudioDevice: {
			type: 'boolean',
			alias: 'play',
			default: true
		},
		duration: {
			type: 'number',
			alias: 'd',
			default: 1.0
		},
		noteDelta: {
			type: 'number',
			alias: 'nd',
			default: 0
		},
		velocity: {
			type: 'number',
			alias: 'v',
			default: 1.0
		},
		reverse: {
			type: 'boolean',
			alias: 'r',
			default: false
		}
	}
});
/*
{
	input: ['unicorns'],
	flags: {rainbow: true},
	...
}
*/


function executeEvolutionTask() {
  const command = cli.input[0];
  // console.log("command", command);
  // console.log("cli.flags", cli.flags);
  switch (command) {
    case "new-genome":
      newGenome();
      break;
    case "mutate-genome":
      mutateGenome();
      break;
	case "render-audio":
		renderAudioFromGenome();
		break;
	case "sound-check":
		soundCheck();
		break;
    default:
      cli.showHelp();
  }
}

function newGenome() {
  // console.log("newGenome");
  const genome = getNewAudioSynthesisGenome();
  const genomeStringified = JSON.stringify(genome);
  if( cli.flags.writeToFile ) {
    // TODO:
  }
  if( cli.flags.writeToOutput ) {
    console.log(genomeStringified);
  }
  process.exit();
}

async function mutateGenome() {
  // console.log("mutateGenome");
	let inputGenome;
	if( cli.flags.readFromInput ) { // TODO: detect if input is incoming and then opt for this flag's functionality?
		inputGenome = await getInput();
	} else if( cli.flags.readFromFile ) {

	}
	console.log(inputGenome);
}

async function renderAudioFromGenome() {

	let inputGenome;
	if( cli.flags.readFromInput ) { // TODO: detect if input is incoming and then opt for this flag's functionality?
		inputGenome = await getInput();
	} else if( cli.flags.readFromFile ) {
		// TODO
	}
	if( inputGenome ) {

		// console.log("inputGenome unparsed:", inputGenome);
		const inputGenomeParsed = JSON.parse( inputGenome );
		const { duration, noteDelta, velocity, reverse } = cli.flags;

		const offlineAudioContext = new OfflineAudioContext({
			numberOfChannels: 2,
			length: 44100 * duration,
			sampleRate: 44100,
		});

		const virtualAudioGraph = await wireUpAudioGraphForPatchAndWaveNetwork(
			inputGenomeParsed,
			duration, noteDelta, velocity,
			offlineAudioContext.sampleRate, // TODO: see a todo comment at startMemberOutputsRendering in render.js
			offlineAudioContext,
			reverse
		);

		virtualAudioGraph.audioContext.startRendering().then( audioBuffer => {
			if( cli.flags.playOnDefaultAudioDevice ) {
				playAudio( audioBuffer );
				setTimeout(() => {process.exit()}, duration*1000);
			} else {
				process.exit();
			}
			if( cli.flags.writeToFile ) {
				// TODO: write audioBuffer as wav to file, and exit when that (and playing) is done
			}
		} );
	}
}

// creates a random genome, wires up an audio graph for it
// and plays it back in real time (to the default audio device)
async function soundCheck() {

	const genome = getNewAudioSynthesisGenome();
	const { duration, noteDelta, velocity, reverse } = cli.flags;

	const offlineAudioContext = new OfflineAudioContext({
		numberOfChannels: 2,
		length: 44100 * duration,
		sampleRate: 44100,
	});

	const virtualAudioGraph = await wireUpAudioGraphForPatchAndWaveNetwork(
		genome,
		duration, noteDelta, velocity,
		offlineAudioContext.sampleRate, // TODO: see a todo comment at startMemberOutputsRendering in render.js
		offlineAudioContext,
		reverse
	);

	virtualAudioGraph.audioContext.startRendering().then( renderedBuffer => {
		playAudio( renderedBuffer );

		setTimeout(() => {process.exit()}, duration*1000);
	} );
}


function sayHello(name) {
  console.log("Hello " + name);
}

// from https://wellingguzman.com/notes/node-pipe-input
function getInput() {
  return new Promise(function (resolve, reject) {
    const stdin = process.stdin;
    let data = '';

    stdin.setEncoding('utf8');
    stdin.on('data', function (chunk) {
      data += chunk;
    });

    stdin.on('end', function () {
      resolve(data);
    });

    stdin.on('error', reject);
  });
}

function getAudioContext() {
	if( ! audioCtx ) audioCtx = new AudioContext();
	return audioCtx;
}

function playAudio( audioBuffer ) {

	if( audioBufferSourceNode ) {
		this.stopAudio();
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

//getInput().then(sayHello).catch(console.error);
// sayHello()

executeEvolutionTask();


function testVirtualAudioGraph() {
	// const virtualAudioGraph = createVirtualAudioGraph({
	// 	audioContext: getAudioContext(),
	// 	output: getAudioContext().destination,
	// });
	//
	// const {currentTime} = getAudioContext()
	//
	// const graph = {
	// 	0: ['gain', 'output', {gain: 0.2}],
	// 	1: ['oscillator', 0, {
	// 		type: 'square',
	// 		frequency: 440,
	// 		startTime: currentTime + 1,
	// 		stopTime: currentTime + 2
	// 	}],
	// 	2: ['oscillator', 0, {
	// 		type: 'sawtooth',
	// 		frequency: 260,
	// 		detune: 4,
	// 		startTime: currentTime + 1.5,
	// 		stopTime: currentTime + 8.5
	// 	}],
	// }
	//
	// virtualAudioGraph.update(graph)
	//
	// console.log("virtualAudioGraph",virtualAudioGraph);
}

// testVirtualAudioGraph();
