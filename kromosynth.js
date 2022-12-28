#!/usr/bin/env node
import meow from 'meow';
import NodeWebAudioAPI from 'node-web-audio-api';
const { AudioContext, OfflineAudioContext } = NodeWebAudioAPI;
import {ulid} from 'ulid';
import {
	getNewAudioSynthesisGenome,
	getNewAudioSynthesisGenomeByMutation,
	getGenomeFromGenomeString,
	wireUpAudioGraphForPatchAndWaveNetwork,
	getAudioBufferFromGenomeAndMeta
} from 'kromosynth';

let audioCtx;
let audioBufferSourceNode;

const SAMPLE_RATE = 48000;

const GENOME_OUTPUT_BEGIN = "GENOME_OUTPUT_BEGIN";
const GENOME_OUTPUT_END = "GENOME_OUTPUT_END";

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
		},
		mutationCount: {
			type: 'number',
			alias: 'mc',
			default: 1
		},
		probabilityMutatingWaveNetwork: {
			type: 'number',
			alias: 'pmwn',
			default: 0.5
		},
		probabilityMutatingPatch: {
			type: 'number',
			alias: 'pmp',
			default: 0.5
		}
	}
});

function executeEvolutionTask() {
  const command = cli.input[0];
  // console.log("command", command);
  // console.log("cli.flags", cli.flags);
  switch (command) {
    case "new-genome":
		newGenome();
		break;
	case "genome-from-url":
		genomeFromUrl();
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
  const genome = getNewAudioSynthesisGenome();
	const genomeAndMeta = { genome };
	const genomeAndMetaStringified = JSON.stringify(genomeAndMeta);
	if( cli.flags.writeToFile ) {
		// TODO:
	}
  if( cli.flags.writeToOutput ) {
		printGeneToOutput( genomeAndMetaStringified );
  }
  process.exit();
}

function genomeFromUrl() {
	console.log("cli.input", cli.input);
}

async function mutateGenome() {
	let inputGenomeString;
	if( cli.flags.readFromInput ) { // TODO: detect if input is incoming and then opt for this flag's functionality?
		inputGenomeString = await getGenomeFromInput();
	} else if( cli.flags.readFromFile ) {

	}
	if( inputGenomeString ) {
		const inputGenomeParsed = await getGenomeFromGenomeString( inputGenomeString );
		let newGenome = inputGenomeParsed;
		const evoRunId = `mutations_${ulid()}`;
		const patchFitnessTestDuration = 0.1;
		for( let generationNumber = 1; generationNumber <= cli.flags.mutationCount; generationNumber++ ) {
			newGenome = await getNewAudioSynthesisGenomeByMutation(
				newGenome,
				evoRunId, generationNumber,
				-1, // parentIndex
				'mutations', // algorithm
				getAudioContext(),
				cli.flags.probabilityMutatingWaveNetwork,
				cli.flags.probabilityMutatingPatch,
				undefined, // TODO: read asNEATMutationParams from file path, if supplied via flag
				OfflineAudioContext,
				patchFitnessTestDuration
			);
		}
		if( cli.flags.writeToOutput ) {
			const genomeAndMeta = { genome: newGenome };
			printGeneToOutput( JSON.stringify(genomeAndMeta) );
		}
	}
	process.exit();
}

async function renderAudioFromGenome() {

	let inputGenome;
	if( cli.flags.readFromInput ) { // TODO: detect if input is incoming and then opt for this flag's functionality?
		inputGenome = await getGenomeFromInput();
	} else if( cli.flags.readFromFile ) {
		// TODO
	}
	if( inputGenome ) {
		const inputGenomeParsed = JSON.parse( inputGenome );

		const { duration, noteDelta, velocity, reverse } = cli.flags;

		const audioBuffer = await getAudioBufferFromGenomeAndMeta(
			inputGenomeParsed,
			duration, noteDelta, velocity, reverse,
			false, // asDataArray
			getNewOfflineAudioContext( duration ),
			getAudioContext()
		);

		if( cli.flags.playOnDefaultAudioDevice ) {
			playAudio( audioBuffer );
			setTimeout(() => {process.exit()}, duration*1000);
		} else {
			process.exit();
		}
		if( cli.flags.writeToFile ) {
			// TODO: write audioBuffer as wav to file, and exit when that (and playing) is done
		}
	}
}

// creates a random genome, wires up an audio graph for it
// and plays it back in real time (to the default audio device)
async function soundCheck() {

	const genome = getNewAudioSynthesisGenome();
	const { duration, noteDelta, velocity, reverse } = cli.flags;

	const offlineAudioContext = new OfflineAudioContext({
		numberOfChannels: 2,
		length: SAMPLE_RATE * duration,
		sampleRate: SAMPLE_RATE,
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

function printGeneToOutput( gene ) {
	const geneArray = gene.match(/.{1,1024}/g); // https://stackoverflow.com/a/7033662/169858
	console.log(GENOME_OUTPUT_BEGIN);
	geneArray.forEach(oneGeneLine => {
		console.log(oneGeneLine);
	});
	console.log(GENOME_OUTPUT_END);
}

async function getGenomeFromInput() { // based on https://stackoverflow.com/a/5400451
	const input = await getInput();
	const inputLineArray = input.split(/\r?\n/);
	let encounteredGenomeOutput = false;
	let geneJSON = "";
	for (const inputLine of inputLineArray) {
		if( encounteredGenomeOutput && GENOME_OUTPUT_END !== inputLine ) {
			geneJSON += inputLine;
		} else if( GENOME_OUTPUT_BEGIN === inputLine ) {
			encounteredGenomeOutput = true;
		}
	}
	return geneJSON;
}

function getAudioContext() {
	if( ! audioCtx ) audioCtx = new AudioContext({sampleRate: SAMPLE_RATE});
	return audioCtx;
}

function getNewOfflineAudioContext( duration ) {
	const offlineAudioContext = new OfflineAudioContext({
		numberOfChannels: 2,
		length: SAMPLE_RATE * duration,
		sampleRate: SAMPLE_RATE,
	});
	return offlineAudioContext;
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

executeEvolutionTask();
