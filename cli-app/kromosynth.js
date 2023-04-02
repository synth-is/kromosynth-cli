#!/usr/bin/env node
import meow from 'meow';
import fs from 'fs';
import { parse } from 'jsonc-parser';
import NodeWebAudioAPI from 'node-web-audio-api';
const { OfflineAudioContext } = NodeWebAudioAPI;
import {ulid} from 'ulid';
import toWav from 'audiobuffer-to-wav';
import {
	getNewAudioSynthesisGenome,
	getNewAudioSynthesisGenomeByMutation,
	getGenomeFromGenomeString,
	wireUpAudioGraphForPatchAndWaveNetwork,
	getAudioBufferFromGenomeAndMeta,
	getClassScoresForGenome
} from 'kromosynth';
import { mapElites } from './quality-diversity-search.js';
import { 
	calculateQDScoreForOneIteration, 
	calculateQDScoresForAllIterations,
	playAllClassesInEliteMap
} from './qd-run-analysis.js';	
import {
	getAudioContext, getNewOfflineAudioContext, playAudio, SAMPLE_RATE
} from './util/rendering-common.js';

const GENOME_OUTPUT_BEGIN = "GENOME_OUTPUT_BEGIN";
const GENOME_OUTPUT_END = "GENOME_OUTPUT_END";

const cli = meow(`
	Usage
	  $ kromosynth <command>

	Commands
		new-genome
			Spawn new sound synthesis genome (pattern producting wave generation network + audio graph)

		mutate-genome
			Mutate the supplied genome

		render-audio
			Render audio from the supplied genome

		classify-genome
			Get class scores for genome

		evolution-runs
			Execute (potentially several) evolution runs sequentially, each corresponding to one execution of the command quality-diversity-search

		quality-diversity-search
			Perform search for sounds with Quality Diversity algorithms

	Options
		Commands: <new-genome, mutate-genome, render-audio or classify-genome>
		--read-from-file, -r  Gene file to read from
		--write-to-file, -w  File to write to (file name auto-generated if none supplied)

		--read-from-input, -i  Read from standard input (for piping ... | ); false by default
		--write-to-output, -o  Write to standard output (for piping | ...); true by default

		Command: <mutate-genome>
		--mutation-count	 Number of mutations to perform with the <mutate-genome> command; 1 by default
		--probability-mutating-wave-network	Probability of mutating the audio buffer source pattern producing network on each mutation; 0.5 by default
		--probability-mutating-patch	Probability of mutating the synthesizer patch (adding nodes, e.g. a buffer source, oscillator, etc.); 0.5 by default

		Command: <render-audio>
		--play-on-default-audio-device, -p  Play rendered audio with the command <render-audio> on default audio device; true by default
		--duration, -d  Duration in seconds for the <render-audio> command; 1.0 by default
		--note-delta, -d  Note relative from the sound's base note (12=one octave up), for the <render-audio> command; 0 by default
		--velocity, -v  Velocity of the rendered sound from the <render-audio> command, 1 being full velocity (as when hitting a piano key); 1.0 by default
		--reverse, -r  Reverse the rendered sound from the <render-audio> command; false by default
		--gene-metadata-override	Metadata from gene, for duration, note delta and velocity, if present, overrides corresponding command line flags or their defaults
		--use-overtone-inharmonicity-factors	Whether to use evolved inharmonicity factors on partial / overtone buffer sources to additive synthesis nodes; true by default

		Commands: <new-genome, mutate-genome or quality-diversity-search>
		--evo-params-json-file		File containing evolutionary hyperparameters
		--evo-params-json-string		JSON string containing evolutionary hyperparameters

		Command: <classify-genome>
		--class-scoring-durations		Array of sound durations in seconds, used to obtain sound classification scores (fitness). Example: "[0.5, 1, 2, 5]"
		--class-scoring-note-deltas		Array of note delta values, used to obtain sound classification scores (fitness). Example: "[-36, -24, -12, 0, 12, 24, 36]"
		--class-scoring-velocities		Array of velocity values in the range [0, 1], used to obtain sound classification scores (fitness). Example: "[0.25, 0.5, 0.75, 1]"
		--classification-graph-model	A key for a classification model. Example: "yamnet"
		--use-gpu		Flag controlling the use of a GPU during classification

		Command: <evolution-runs>
		--evolution-runs-config-json-file		File containing configuration parameters for sequential execution of evolution runs
		--evolution-runs-config-json-string	JSON string containing configuration parameters for sequential execution of evolution runs

		Command: <quality-diversity-search>
		--evolution-run-id	ID of the evolution run, for restarting a previous run; if none is supplied, a new one is created
		--evolution-run-config-json-file	File containing configuration parameters for evolution runs with Quality Diversity search algorithms
		--evolution-run-config-json-string 	JSON string containing configuration parameters for evolution runs with Quality Diversity search algorithms

		Command: <elite-map-qd-score>
		--evolution-run-iteration The evolution run iteration number to calculate QD score for; the last iteration is used if omitted

		Command: <evo-run-qd-scores>
		--step-size Resolution: How many iterations to step over when calculating QD scores (trend) for one entire QD search run; 1, every iteration, is the default

		Command: <evo-run-play-elite-map, ...>
		--evolution-run-id	See above
		--score-threshold minimum score for an elite to be taken into consideration

	Examples
		$ kromosynth new-genome [--write-to-file]
		$ kromosynth mutate-genome [--read-from-file | --read-from-input] [--write-to-file | --write-to-output]
		$ kromosynth render-audio [--read-from-file | --read-from-input] [--write-to-file | --play-on-default-audio-device]
		$ kromosynth classify-genome [--read-from-file | --read-from-input] [--write-to-file "filename.json" | --write-to-output]
		$ kromosynth sound-check

		QD search:
		$ kromosynth quality-diversity-search --evo-params-json-file config/evolutionary-hyperparameters.jsonc --evolution-run-config-json-file config/evolution-run-config.jsonc
		$ kromosynth evolution-runs --evolution-runs-config-json-file config/evolution-runs.jsonc

		QD search analysis:
		$ kromosynth elite-map-qd-score --evolution-run-config-json-file conf/evolution-run-config.jsonc --evolution-run-id 01GVR6ZWKJAXF3DHP0ER8R6S2J --evolution-run-iteration 9000
		$ kromosynth evo-run-qd-scores --evolution-run-config-json-file conf/evolution-run-config.jsonc --evolution-run-id 01GVR6ZWKJAXF3DHP0ER8R6S2J --step-size 100
		$ kromosynth evo-run-play-elite-map --evolution-run-id 01GWS4J7CGBWXF5GNDMFVTV0BP_3dur-7ndelt-4vel --evolution-run-config-json-file conf/evolution-run-config.jsonc

		👉 more in the project's readme (at https://github.com/synth-is/kromosynth-cli)
`, {
	importMeta: import.meta,
	flags: {
		readFromFile: {
			type: 'string',
			alias: 'r'
		},
		writeToFile: {
			type: 'string',
			alias: 'w',
		},
		writeToOutput: {
			type: 'boolean',
			alias: 'o',
			default: true
		},
		readFromInput: {
			type: 'boolean',
			alias: 'i',
			default: false // TODO: might want to go for true, then need to detect if stdin
		},
		playOnDefaultAudioDevice: {
			type: 'boolean',
			alias: 'p',
			default: true
		},
		duration: {
			type: 'number',
			alias: 'd',
			default: 1.0
		},
		noteDelta: {
			type: 'number',
			alias: 'd',
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
		geneMetadataOverride: {
			type: 'boolean',
			default: false
		},
		mutationCount: {
			type: 'number',
			default: 1
		},
		probabilityMutatingWaveNetwork: {
			type: 'number',
			default: 0.5
		},
		probabilityMutatingPatch: {
			type: 'number',
			default: 0.5
		},
		evoParamsJsonFile: {
			type: 'string'
		},
		evoParamsJsonString: {
			type: 'string'
		},
		useOvertoneInharmonicityFactors: {
			type: 'boolean',
			default: true
		},

		classScoringDurations: {
			type: 'string'
		},
		classScoringNoteDeltas: {
			type: 'string'
		},
		classScoringVelocities: {
			type: 'string'
		},
		classificationGraphModel: {
			type: 'string'
		},
		useGpu: {
			type: 'boolean',
			default: true
		},

		evolutionRunId: {
			type: 'string'
		},
		evolutionRunIteration: {
			type: 'number'
		},
		stepSize: {
			type: 'number',
			default: 1
		},
		evoRunsConfigFile: {
			type: 'string'
		},
		evolutionRunConfigJsonFile: {
			type: 'string'
		},
		evolutionRunConfigJsonString: {
			type: 'string'
		},

		scoreThreshold: {
			type: 'number'
		}
	}
});

async function executeEvolutionTask() {
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
		case "classify-genome":
			classifyGenome();
			break;
		case "evolution-runs":
			await evolutionRuns();
			break;
		case "quality-diversity-search":
			await qualityDiversitySearch();
			break;
		case "elite-map-qd-score":
			qdAnalysis_eliteMapQDScore();
			break;
		case "evo-run-qd-scores":
			qdAnalysis_evoRunQDScores();
			break;
		case "evo-run-elite-counts":
			break;
		case "evo-run-variances":
			break;
		case "evo-run-coverage-above-score-threshold":
			break;
		case "evo-run-class-lineage":
			break;
		case "evo-run-play-class":
			break;
		case "evo-run-play-elite-map":
			qdAnalysis_playEliteMap();
			break;
    default:
      cli.showHelp();
  }
}

function newGenome() {
	const evoParams = getEvoParams();
	const genome = getNewAudioSynthesisGenome(
		undefined, // evolutionRunId
		undefined, // generationNumber
		undefined, // parentIndex
		evoParams
	);
	const genomeAndMeta = { genome, _id: ulid() };
	const genomeAndMetaStringified = JSON.stringify(genomeAndMeta);
	const doWriteToFile = cli.flags.writeToFile !== undefined;
	if( doWriteToFile ) {
		writeGeneToFile( genomeAndMetaStringified, cli.flags.writeToFile, genomeAndMeta._id );
	}
  if( cli.flags.writeToOutput ) {
		printGeneToOutput( genomeAndMetaStringified );
  }
	if( ! doWriteToFile ) {
		process.exit();
	} // otherwise process.exit will be called in the fs.writeFile callback above
}

function genomeFromUrl() {
	console.log("cli.input", cli.input);
}

async function mutateGenome() {
	const evoParams = getEvoParams();
	let inputGenomeString;
	if( cli.flags.readFromInput ) { // TODO: detect if input is incoming and then opt for this flag's functionality?
		inputGenomeString = await getGenomeFromInput();
	} else if( cli.flags.readFromFile ) {
		inputGenomeString = readJSONFromFile( cli.flags.readFromFile );
	}
	const doWriteToFile = cli.flags.writeToFile !== undefined;
	if( inputGenomeString ) {
		const inputGenomeParsed = await getGenomeFromGenomeString( inputGenomeString, evoParams );
		let newGenome = inputGenomeParsed;
		const evoRunId = `mutations_${ulid()}`;
		const patchFitnessTestDuration = 0.1;
		const audioGraphMutationParams = getAudioGraphMutationParams( evoParams );
		for( let generationNumber = 1; generationNumber <= cli.flags.mutationCount; generationNumber++ ) {
			newGenome = await getNewAudioSynthesisGenomeByMutation(
				newGenome,
				evoRunId, generationNumber,
				-1, // parentIndex
				'mutations', // algorithm
				getAudioContext(),
				cli.flags.probabilityMutatingWaveNetwork,
				cli.flags.probabilityMutatingPatch,
				audioGraphMutationParams,
				evoParams,
				OfflineAudioContext,
				patchFitnessTestDuration
			);
		}
		const genomeAndMeta = { genome: newGenome, _id: ulid() };
		const genomeAndMetaStringified = JSON.stringify(genomeAndMeta);
		if( cli.flags.writeToOutput ) {
			printGeneToOutput( genomeAndMetaStringified );
		}
		if( doWriteToFile ) {
			writeGeneToFile( genomeAndMetaStringified, cli.flags.writeToFile, genomeAndMeta._id );
		}
	}
	if( ! doWriteToFile || ! inputGenomeString ) {
		process.exit();
	} // otherwise process.exit will be called in the fs.writeFile callback above
}

async function renderAudioFromGenome() {
	let inputGenome;
	if( cli.flags.readFromInput ) { // TODO: detect if input is incoming and then opt for this flag's functionality?
		inputGenome = await getGenomeFromInput();
	} else if( cli.flags.readFromFile ) {
		inputGenome = readJSONFromFile( cli.flags.readFromFile );
	}
	if( inputGenome ) {
		const inputGenomeParsed = JSON.parse( inputGenome );
		let duration, noteDelta, velocity;
		if( cli.flags.geneMetadataOverride ) {
			duration = inputGenomeParsed.duration || cli.flags.duration;
			noteDelta = inputGenomeParsed.noteDelta || cli.flags.noteDelta;
			velocity = inputGenomeParsed.velocity || cli.flags.velocity;
		} else {
			duration = cli.flags.duration;
			noteDelta = cli.flags.noteDelta;
			velocity = cli.flags.velocity;
		}
		const { reverse } = cli.flags;

		const audioBuffer = await getAudioBufferFromGenomeAndMeta(
			inputGenomeParsed,
			duration, noteDelta, velocity, reverse,
			false, // asDataArray
			getNewOfflineAudioContext( duration ),
			getAudioContext(),
			cli.flags.useOvertoneInharmonicityFactors
		);
		const doWriteToFile = cli.flags.writeToFile !== undefined;
		if( cli.flags.playOnDefaultAudioDevice ) {
			playAudio( audioBuffer );
			setTimeout(() => {process.exit()}, duration*1000);
		} else if( ! doWriteToFile ) {
			process.exit();
		}
		if( doWriteToFile ) {
			const wav = toWav(audioBuffer);
			writeToWavFile( Buffer.from(new Uint8Array(wav)), cli.flags.writeToFile, inputGenomeParsed._id, duration, noteDelta, velocity, reverse, !cli.flags.playOnDefaultAudioDevice );
		}
	}
}

async function classifyGenome() {
	let inputGenome;
	if( cli.flags.readFromInput ) { // TODO: detect if input is incoming and then opt for this flag's functionality?
		inputGenome = await getGenomeFromInput();
	} else if( cli.flags.readFromFile ) {
		inputGenome = readJSONFromFile( cli.flags.readFromFile );
	}
	const doWriteToFile = cli.flags.writeToFile !== undefined;
	if( inputGenome ) {
		const genomeAndMetaParsed = JSON.parse( inputGenome );
		const classScoresForGenome = await getClassScoresForGenome(
			genomeAndMetaParsed.genome,
			cli.flags.classScoringDurations, cli.flags.classScoringNoteDeltas, cli.flags.classScoringVelocities,
			cli.flags.classificationGraphModel,
			cli.flags.useGpu,
			true // supplyAudioContextInstances
		);
		
		const classScoresForGenomeStringified = JSON.stringify(classScoresForGenome);
		if( cli.flags.writeToOutput ) {
			printGeneToOutput( classScoresForGenomeStringified, "CLASSIFICATION_OUTPUT_BEGIN", "CLASSIFICATION_OUTPUT_END" );
		}
		if( doWriteToFile ) {
			writeGeneToFile( classScoresForGenomeStringified, cli.flags.writeToFile, genomeAndMetaParsed._id );
		}
	}
	if( ! doWriteToFile || ! inputGenomeString ) {
		process.exit();
	}
}

async function evolutionRuns() {
	const evoRunsConfig = getEvolutionRunsConfig();
	while( evoRunsConfig.currentEvolutionRunIndex < evoRunsConfig.evoRuns.length ) {
		let { currentEvolutionRunId } = evoRunsConfig;
		const currentEvoConfig = evoRunsConfig.evoRuns[evoRunsConfig.currentEvolutionRunIndex];
		if( ! currentEvolutionRunId ) {
			currentEvolutionRunId = ulid() + "_" + currentEvoConfig.label;
			evoRunsConfig.currentEvolutionRunId = currentEvolutionRunId;
			if( cli.flags.evolutionRunsConfigJsonFile ) {
				saveEvolutionRunsConfig( evoRunsConfig );
			}
		}
		
		const evoRunConfigMain = getEvolutionRunConfig( evoRunsConfig.baseEvolutionRunConfigFile );
		const evoRunConfigDiff = getEvolutionRunConfig( currentEvoConfig.diffEvolutionRunConfigFile );
		const evoRunConfig = {...evoRunConfigMain, ...evoRunConfigDiff};
	
		const evoParamsMain = getEvoParams( evoRunsConfig.baseEvolutionaryHyperparametersFile );
		const evoParamsDiff = getEvoParams( currentEvoConfig.diffEvolutionaryHyperparametersFile );
		const evoParams = {...evoParamsMain, ...evoParamsDiff};
		
		await qualityDiversitySearch( currentEvolutionRunId, evoRunConfig, evoParams );
	
		if( cli.flags.evolutionRunsConfigJsonFile ) {
			evoRunsConfig.currentEvolutionRunIndex++;
			evoRunsConfig.currentEvolutionRunId = null;
			saveEvolutionRunsConfig( evoRunsConfig );
		}
	}
	process.exit();
}

function saveEvolutionRunsConfig( evoRunsConfig ) {
	const evoRunsConfigString = JSON.stringify( evoRunsConfig, null, 2 );
			fs.writeFileSync( cli.flags.evolutionRunsConfigJsonFile, evoRunsConfigString );
}

async function qualityDiversitySearch( evolutionRunId, evoRunConfig, evoParams ) {
	let _evolutionRunId = evolutionRunId || cli.flags.evolutionRunId;
	if( ! _evolutionRunId ) {
		_evolutionRunId = ulid();
	}
	const _evoRunConfig = evoRunConfig || getEvolutionRunConfig();
	const _evoParams = evoParams || getEvoParams();
	if( "mapElites" === _evoRunConfig.algorithm ) {
		await mapElites( _evolutionRunId, _evoRunConfig, _evoParams, false );
	} // TODO deepGridMapElites etc.
}

async function qdAnalysis_eliteMapQDScore() {
	let {evolutionRunId, evolutionRunIteration} = cli.flags;
	if( evolutionRunId ) {
		const evoRunConfig = getEvolutionRunConfig();
		const qdScore = await calculateQDScoreForOneIteration( evoRunConfig, evolutionRunId, evolutionRunIteration );
		console.log(qdScore);
	}
}

async function qdAnalysis_evoRunQDScores() {
	let {evolutionRunId, stepSize} = cli.flags;
	if( evolutionRunId ) {
		const evoRunConfig = getEvolutionRunConfig();
		const qdScores = await calculateQDScoresForAllIterations( evoRunConfig, evolutionRunId, stepSize );
		console.log(qdScores);
	}
}

async function qdAnalysis_playEliteMap() {
	let {evolutionRunId, evolutionRunIteration, scoreThreshold} = cli.flags;
	if( evolutionRunId ) {
		const evoRunConfig = getEvolutionRunConfig();
		await playAllClassesInEliteMap(evoRunConfig, evolutionRunId, evolutionRunIteration, scoreThreshold);
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

function printGeneToOutput( gene, stringDelimiterBegin, stringDelimiterEnd ) {
	const geneArray = gene.match(/.{1,1024}/g); // https://stackoverflow.com/a/7033662/169858
	console.log(stringDelimiterBegin || GENOME_OUTPUT_BEGIN);
	geneArray.forEach(oneGeneLine => {
		console.log(oneGeneLine);
	});
	console.log(stringDelimiterEnd || GENOME_OUTPUT_END);
}

async function getGenomeFromInput() { // based on https://stackoverflow.com/a/5400451
	const input = await getInput();
	const inputLineArray = input.split(/\r?\n/);
	let encounteredGenomeOutput = false;
	let geneJSON;
	if( inputLineArray.length === 1 ) {
		// we should have the whole gene on one line (not split over multiple lines, mixed with other output from the CLI methods)
		geneJSON = inputLineArray[0];
	} else {
		geneJSON = "";
		for (const inputLine of inputLineArray) {
			if( encounteredGenomeOutput && GENOME_OUTPUT_END !== inputLine ) {
				geneJSON += inputLine;
			} else if( GENOME_OUTPUT_BEGIN === inputLine ) {
				encounteredGenomeOutput = true;
			}
		}
	}
	return geneJSON;
}

function writeToFile( content, fileNameFlag, id, fileNamePrefix, fileNameSuffix, exitAfterWriting = true ) {
	let fileName;
	if( fileNameFlag && !fileNameFlag.endsWith('/') ) {
		fileName = fileNameFlag;
	} else { // no file name supplied, generate one
		fileName = `${fileNamePrefix}${id || ulid()}${fileNameSuffix}`;
		if( fileNameFlag && fileNameFlag.endsWith('/') ) {
			if( !fs.existsSync(fileNameFlag) ) fs.mkdirSync(fileNameFlag);
			fileName = fileNameFlag + fileName;
		}
	}
	fs.writeFile(fileName, content, err => {
		if (err) {
			console.error("writeToFile: ", err);
		}
		if( exitAfterWriting ) process.exit();
	});
}
function writeGeneToFile( content, fileNameFlag, id ) {
	writeToFile( content, fileNameFlag, id, 'kromosynth_gene_', '.json' );
}
function writeToWavFile( content, fileNameFlag, id, duration, noteDelta, velocity, reverse, exitAfterWriting ) {
	writeToFile( content, fileNameFlag, id, 'kromosynth_render_', `__d_${duration}__nd_${noteDelta}__v_${velocity}__r_${reverse}.wav`, exitAfterWriting );
}

function readJSONFromFile( fileName ) {
	let jsonString;
	try {
		jsonString = fs.readFileSync(fileName, 'utf8');
	} catch (err) {
		console.error("readJSONFromFile: ", err);
	}
	return jsonString;
}

function getParamsFromJSONString( evoParamsJsonString ) {
	return parse( evoParamsJsonString );
}
function getParamsFromJSONFile( fileName ) {
	const evoParamsJsonString = readJSONFromFile( fileName );
	return getParamsFromJSONString( evoParamsJsonString );
}

export function getEvoParams( evoParamsJsonFile ) {
	let evoParams;
	const _evoParamsJsonFile = evoParamsJsonFile || cli.flags.evoParamsJsonFile;
	if( _evoParamsJsonFile ) {
		evoParams = getParamsFromJSONFile( _evoParamsJsonFile );
	} else if( cli.flags.evoParamsJsonString ) {
		evoParams = getParamsFromJSONString( cli.flags.evoParamsJsonString );
	} else {
		evoParams = {};
	}
	return evoParams;
}

function getEvolutionRunsConfig() {
	let evoRunsConfig;
	if( cli.flags.evolutionRunsConfigJsonFile ) {
		evoRunsConfig = getParamsFromJSONFile( cli.flags.evolutionRunsConfigJsonFile );
	} else if( cli.flags.evolutionRunsConfigJsonString ) {
		evoRunsConfig = getParamsFromJSONString( cli.flags.evolutionRunsConfigJsonString );
	} else {
		evoRunsConfig = {};
	}
	return evoRunsConfig;
}

function getEvolutionRunConfig( evolutionRunConfigJsonFile ) {
	let evoRunConfig;
	const _evolutionRunConfigJsonFile = evolutionRunConfigJsonFile || cli.flags.evolutionRunConfigJsonFile;
	if( _evolutionRunConfigJsonFile ) {
		evoRunConfig = getParamsFromJSONFile( _evolutionRunConfigJsonFile );
	} else if( cli.flags.evolutionRunConfigJsonString ) {
		evoRunConfig = getParamsFromJSONString( cli.flags.evolutionRunConfigJsonString );
	} else {
		evoParams = {};
	}
	return evoRunConfig;
}

export function getAudioGraphMutationParams( evoParams ) {
	return evoParams && evoParams["audioGraph"] && evoParams["audioGraph"]["mutationParams"] || undefined; 
}

await executeEvolutionTask();