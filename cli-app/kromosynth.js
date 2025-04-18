#!/usr/bin/env node
import meow from 'meow';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { resolve } from 'path';
import { parse } from 'jsonc-parser';
import { fork } from 'child_process';
import NodeWebAudioAPI from 'node-web-audio-api';
const { OfflineAudioContext } = NodeWebAudioAPI;
import {ulid} from 'ulid';
import toWav from 'audiobuffer-to-wav';
import merge from 'deepmerge';
import fetch from "node-fetch";
import async from 'async';
import {
	getNewAudioSynthesisGenome,
	getNewAudioSynthesisGenomeByMutation,
	getGenomeFromGenomeString,
	wireUpAudioGraphForPatchAndWaveNetwork,
	getAudioBufferFromGenomeAndMeta,
	getClassScoresForGenome
} from 'kromosynth';
import { qdSearch } from './quality-diversity-search.js';
export { qdSearch } from './quality-diversity-search.js'; // TODO: while this QD search implementation is not yet in its own module, export it from kromosynth-cli
import {
	calculateQDScoreForOneIteration,
	calculateQDScoresForAllIterations,
	calculateGridMeanFitnessForAllIterations,
	playAllClassesInEliteMap,
	playOneClassAcrossEvoRun,
	getGenomeStatisticsAveragedForOneIteration,
	getGenomeStatisticsAveragedForAllIterations,
	getCellScoresForOneIteration,
	getCellScoresForAllIterations,
	getCoverageForOneIteration,
	getCoverageForAllIterations,
	getScoreMatrixForLastIteration, getScoreMatricesForAllIterations,
	getCellSaturationGenerations,
	getGenomeSetsForOneIteration,
	getGenomeCountsForAllIterations,
	getGenomeCountsWithRenderingVariationsAsContainerDimensionsForAllIterations,
	getScoreVarianceForAllIterations,
	getScoreStatsForOneIteration,
	getElitesEnergy,
	getGoalSwitches, getGoalSwitchesThroughLineages,
	getLineageGraphData,
	getDurationPitchDeltaVelocityCombinations,
	getClassLabels,
	getNewEliteCountForAllIterations,
	getDiversityFromEmbeddingFiles,
	getTerrainNames,
	getEliteMapDiversityAtLastIteration, getEliteMapDiversityForAllIterations, getDiversityFromAllDiscoveredElites,
	renderEliteMapsTimeline
} from './qd-run-analysis.js';
import { yamnetTags_non_musical, yamnetTags_musical } from './util/classificationTags.js';
import {
	getAudioContext, getNewOfflineAudioContext, playAudio, SAMPLE_RATE
} from './util/rendering-common.js';
import { renderSfz } from './virtual-instrument.js';
import { 
	// median, 
	calcStandardDeviation, calcVariance, calcMean,
	runCmd,
	averageAttributes, standardDeviationAttributes, 
	getCommitCount, getClassLabelsWithElites, 
	getEliteMap, getEliteMaps, 
	getClassLabelsWithElitesFromEliteMap
} from './util/qd-common.js';
import { readGenomeAndMetaFromDisk } from './util/qd-common-elite-map-persistence.js';
import { extractFeaturesFromAllAudioFiles } from './extract-audio-features-from-dataset.js';
import { traceLineage, findLatestDescendantsByClass } from './util/lineage.js';
import { mapEliteMapToMapWithDifferentBDs } from './util/terrain-remap.js';

import { 
  runPhylogeneticAnalysis, 
  comparePhylogeneticMetrics,
	comparePhylogeneticMetricsAcrossConfigurations 
} from './phylogenetic-analysis-cli.js';

import {
  analyzePhylogeneticTreeMetrics,
  trackPhylogeneticMetricsOverTime,
  analyzeTerrainTransitions,
  analyzeDensityDependence,
  generatePhylogeneticReport
} from './qd-run-analysis.js';

import { mean, median, variance, std, map } from 'mathjs'


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


		QD search:
		evolution-runs
			Execute (potentially several) evolution runs sequentially, each corresponding to one execution of the command quality-diversity-search

		quality-diversity-search
			Perform search for sounds with Quality Diversity algorithms


		Analysis:
		evo-runs-git-gc
			Perform git garbage collection on all evolution runs (specified in the --evolution-runs-config-json-file)

		evo-runs-percent-completion
			Collect percent completion for all evolution runs (specified in the --evolution-runs-config-json-file)

		elite-map-qd-score
			Collect QD score for one iteration of an evolution run
		evo-run-qd-scores
			Collect QD scores for all iterations of an evolution run

		elite-map-cell-scores
			Collect cell score for one iteration of an evolution run
		evo-run-cell-scores
			Collect cell scores for all iterations of an evolution run

		elite-map-genome-statistics
			Collect genome statistics (average CPPN and patch network node and connection counts) for one iteration of an evolution run
		evo-run-genome-statistics
			Collect genome statistics (average CPPN and patch network node and connection counts) for all iterations of an evolution run

		elite-map-coverage
			Obtain the map coverage (number of cells with at least one elite) for one iteration of an evolution run, optionally above a certain QD score threshold
		evo-run-coverage
			Obtain the map coverage (number of cells with at least one elite) for all iterations of an evolution run, optionally above a certain QD score threshold

		elite-map-geneome-sets
			Unique genomes across the elite map, plus count of new additions and disappearance of genomes from the map
		evo-run-genome-sets
			Unique genomes accross the elite map, for all iterations of an evolution run

		elite-map-score-variance
			Collect the variance of the QD scores for each new genome in the elite map, for one iteration of an evolution run
		evo-run-score-variance
			Collect the variance of the QD scores for each new genome in the elite map, for all iterations of an evolution run

		evo-run-cell-saturation-generations
			Last generation number for which a cell received a new top elite

		evo-run-elites-energy
			Collect the energy of the elites in the elite map, for all iterations of an evolution run,
			where energy is measured as the count of unproductive iterations befor a new elite is found

		evo-run-goal-switches
			Number of goal switches per class, plus (mean) new champions per class

		evo-run-lineage
			Collect the lineage of the elites in the elite map, for all iterations of an evolution run

		evo-run-duration-pitch-delta-velocity-combinations
			Collect the duration and pitch combinations for all elites in the elite map, for all iterations of an evolution run

		evo-runs-analysis
			Perform a selection of analysis steps (see above) for all evolution runs (specified in the --evolution-runs-config-json-file)

		Sound rendering:

		evo-run-play-elite-map
			Play all elites in the elite map (horizontally), for one iteration of an evolution run, starting from the specified elite class (or the first one if none is specified)
		
		evo-run-play-class
			Play elites in one class of an elite map (vertically), ascending or descending, for all iterations of an evolution run

		render-virtual-instrument
			TODO: Render a sample based virtual instrument, using the SFZ format, from the supplied genome

		render-evoruns
			Render all elites in the elite map, for all evolution runs returned from a REST endpoint (evoruns.synth.is by default), to audio (WAV) files

		render-evorun
			Render all elites in the elite map, for one evolution run, to audio (WAV) files

		render-lineage-tree
			Render the lineage tree from a JSON lineage analysis file to WAV files

		render-elite-maps-timeline
			Render the elite maps timeline from elite maps at specified time steps to WAV files

		extract-features
			Extract audio features from a dataset of audio files
			- several features types, such as MFCC, Chroma, etc.

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

		Command: <evo-run-qd-scores, evo-run-play-class>
		--step-size Resolution: How many iterations to step over when calculating QD scores (trend) for one entire QD search run; 1, every iteration, is the default

		Command: <evo-run-play-elite-map, evo-run-play-class, elite-map-coverage>
		--evolution-run-id	See above
		--score-threshold minimum score for an elite to be taken into consideration

		Command: <evo-run-duration-pitch-delta-velocity-combinations>
		--unique-genomes Flag controlling whether to only consider unique genomes, from each elite map, when collecting duration, delta and pitch combinations

		Command: <evo-run-play-elite-map>
		--start-cell-key	Name of elite class to start playing from (horizontally); from the first to the latest elite
		--start-cell-key-index	Index of elite class to start playing from (horizontally); from the first to the latest elite

		Command: <evo-run-play-class>
		--cell-key	Name of elite class to play (vertically); from latest elite to the first

		Command: <render-evoruns>
		--evoruns-rest-server-url	URL of the REST server to query for evolution runs; https://evoruns.synth.is by default

		Command <render-evorun>
		--evo-run-dir-path Path to the evolution run directory
		--write-to-folder Folder to write the rendered audio files to; current folder by default
		--every-nth-iteration Only render every nth iteration; 10000 by default
		Other optional parameters:
		--duration, --note-delta, --velocity, --reverse, --anti-aliasing, 
		--frequency-updates-apply-to-all-pathc-network-outputs, --use-overtone-inharmonicity-factors,
		--use-gpu, --sample-rate, 
		--gene-metadata-override

		Command <extract-features>
		--dataset-folder	Path to the folder containing the audio files to extract features from
		--write-to-folder	Folder to write the extracted features to; current folder by default
		--sample-rate	Sample rate to use for feature extraction; should match the sample rate of the audio files in the dataset folder
		--ckpt-dir	Path to the directory containing model checkpoints
		--feature-extraction-server-host	Host of the feature extraction server
		--suffixes-filter	Array of file suffixes to filter the dataset folder by; e.g. '"020.wav,030.wav,040.wav,050.wav,060.wav,070.wav,080.wav,090.wav,100.wav"
		--feature-types-filter Array of feature types to extract; e.g. '"mfcc,vggish"'

		Command <map-elite-map-to-map-with-different-bd>
		--evolution-run-id	See above
		--evo-run-dir-path Path to the evolution run directory
		--terrain-name-from Name of the terrain to map from
		--terrain-name-to Name of the terrain to map to
		--genome-rendering-host Host of the genome rendering server
		--feature-extraction-host Host of the feature extraction server
		--quality-evaluation-feature-extraction-endpoint Endpoint of the feature extraction server for obtaining features for quality evaluation
		--projection-feature-extraction-endpoint Endpoint of the feature extraction server for obtaining features for projection
		--quality-evaluation-host Host of the quality evaluation server
		--quality-evaluation-endpoint Endpoint of the quality evaluation server
		--projection-host Host of the projection server
		--projection-endpoint Endpoint of the projection server
		--use-gpu
		--sample-rate

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
		$ kromosynth evo-runs-git-gc --evolution-runs-config-json-file config/evolution-runs.jsonc
		$ kromosynth evo-runs-percent-completion --evolution-runs-config-json-file config/evolution-runs.jsonc

		$ kromosynth elite-map-qd-score --evolution-run-config-json-file conf/evolution-run-config.jsonc --evolution-run-id 01GVR6ZWKJAXF3DHP0ER8R6S2J --evolution-run-iteration 9000
		$ kromosynth elite-map-genome-statistics --evolution-run-config-json-file conf/evolution-run-config.jsonc --evolution-run-id 01GVR6ZWKJAXF3DHP0ER8R6S2J --evolution-run-iteration 9000
		$ kromosynth elite-map-cell-scores	--evolution-run-config-json-file conf/evolution-run-config.jsonc --evolution-run-id 01GVR6ZWKJAXF3DHP0ER8R6S2J --evolution-run-iteration 9000
		$ kromosynth elite-map-coverage --evolution-run-config-json-file conf/evolution-run-config.jsonc --evolution-run-id 01GVR6ZWKJAXF3DHP0ER8R6S2J --score-threshold 0.5
		$ kromosynth elite-map-geneome-sets --evolution-run-config-json-file conf/evolution-run-config.jsonc --evolution-run-id 01GVR6ZWKJAXF3DHP0ER8R6S2J
		$ kromosynth elite-map-score-variance --evolution-run-config-json-file conf/evolution-run-config.jsonc --evolution-run-id 01GVR6ZWKJAXF3DHP0ER8R6S2J
		
		$ kromosynth evo-run-qd-scores --evolution-run-config-json-file conf/evolution-run-config.jsonc --evolution-run-id 01GVR6ZWKJAXF3DHP0ER8R6S2J --step-size 100
		$ kromosynth evo-run-genome-statistics --evolution-run-config-json-file conf/evolution-run-config.jsonc --evolution-run-id 01GVR6ZWKJAXF3DHP0ER8R6S2J --step-size 100
		$ kromosynth evo-run-cell-scores --evolution-run-config-json-file conf/evolution-run-config.jsonc --evolution-run-id 01GVR6ZWKJAXF3DHP0ER8R6S2J --step-size 100
		$ kromosynth evo-run-coverage --evolution-run-config-json-file conf/evolution-run-config.jsonc --evolution-run-id 01GVR6ZWKJAXF3DHP0ER8R6S2J --score-threshold 0.5 --step-size 100
		$ kromosynth evo-run-genome-sets --evolution-run-config-json-file conf/evolution-run-config.jsonc --evolution-run-id 01GVR6ZWKJAXF3DHP0ER8R6S2J --step-size 100
		$ kromosynth evo-run-score-variance --evolution-run-config-json-file conf/evolution-run-config.jsonc --evolution-run-id 01GVR6ZWKJAXF3DHP0ER8R6S2J --step-size 100
		$ kromosynth evo-run-cell-saturation-generations --evolution-run-config-json-file conf/evolution-run-config.jsonc --evolution-run-id 01GVR6ZWKJAXF3DHP0ER8R6S2J
		$ kromosynth evo-run-elites-energy --evolution-run-config-json-file conf/evolution-run-config.jsonc --evolution-run-id 01GVR6ZWKJAXF3DHP0ER8R6S2J --step-size 100
		$ kromosynth evo-run-goal-switches --evolution-run-config-json-file conf/evolution-run-config.jsonc --evo-params-json-file config/evolutionary-hyperparameters.jsonc --evolution-run-id 01GWS4J7CGBWXF5GNDMFVTV0BP_3dur-7ndelt-4vel --step-size 100
		$ kromosynth evo-run-lineage --evolution-run-config-json-file conf/evolution-run-config.jsonc --evolution-run-id 01GWS4J7CGBWXF5GNDMFVTV0BP_3dur-7ndelt-4vel --step-size 100
		$ kromosynth evo-run-duration-pitch-delta-velocity-combinations --evolution-run-config-json-file conf/evolution-run-config.jsonc --evolution-run-id 01GWS4J7CGBWXF5GNDMFVTV0BP_3dur-7ndelt-4vel --step-size 100 --unique-genomes true
		
		$ kromosynth evo-runs-analysis --evolution-runs-config-json-file config/evolution-runs.jsonc --analysis-operations qd-scores,grid-mean-fitness,cell-scores,coverage,score-matrix,score-matrices,new-elite-count,elite-generations,genome-statistics,genome-sets,genome-sets-through-rendering-variations,variance,elites-energy,goal-switches,goal-switches-through-lineages,lineage,duration-pitch-delta-velocity-combinations,diversity-from-embeddings,diversity-at-last-iteration,diversity-measures --step-size 100 --unique-genomes true --exclude-empty-cells true --class-restriction '["Narration, monologue"]' --max-iteration-index 300000
		
		$ kromosynth evo-run-play-elite-map --evolution-run-id 01GWS4J7CGBWXF5GNDMFVTV0BP_3dur-7ndelt-4vel --evolution-run-config-json-file conf/evolution-run-config.jsonc --start-cell-key "Narration, monologue" --start-cell-key-index 0

		$ kromosynth evo-run-play-class --evolution-run-id 01GXVYY4T87RYSS02FN79VVQX5_4dur-7ndelt-4vel_wavetable-bias --evolution-run-config-json-file conf/evolution-run-config.jsonc --cell-key "Narration, monologue" --step-size 100 --ascending false

		$ kromosynth render-evoruns --evoruns-rest-server-url http://localhost:3003 --write-to-folder ./

		$ kromosynth render-evorun --evo-run-dir-path ~/evoruns/01HPW0V4CVCDEJ6VCHCQRJMXWP --write-to-folder ~/Downloads/evorenders --every-nth-generation 100 --owerwrite-existing-files true --score-in-file-name true

		$ kromosynth render-lineage-tree --evo-run-dir-path ~/evoruns/01HPW0V4CVCDEJ6VCHCQRJMXWP --lineage-tree-json-file ~/Downloads/lineage.json --write-to-folder ~/Downloads/lineage-renders

		kromosynth render-elite-maps-timeline --evo-run-dir-path ~/evoruns/01JBEY1KKWNG5F64K4CBBKJ5TR_evoConf_singleMap_refSingleEmbeddings_x100_mfcc-sans0_umap_retrainIncr50withAllDiscoveredFeatures --write-to-folder ~/Downloads/render-test --step-size 500 --terrain-name customRef1

		$ kromosynth extract-features --dataset-folder /Users/bjornpjo/Downloads/OneBillionWav --write-to-folder /Users/bjornpjo/Downloads/OneBillionWav_features --sample-rate 44100 --ckpt-dir /Users/bjornpjo/.cache/torch/hub/checkpoints --feature-extraction-server-host 'ws://localhost:31051' --suffixes-filter "020.wav,030.wav,040.wav,050.wav,060.wav,070.wav,080.wav,090.wav,100.wav" --feature-types-filter "mfcc,vggish"

		$ kromosynth map-elite-map-to-map-with-different-bd --evolution-run-id 01GVR6ZWKJAXF3DHP0ER8R6S2J --evo-run-dir-path ~/evoruns/01GVR6ZWKJAXF3DHP0ER8R6S2J \
			--terrain-name-from "bd24" --terrain-name-to "bd16" \
			--genome-rendering-host ws://127.0.0.1:30051 \
			--feature-extraction-host ws://127.0.0.1:31051 --quality-evaluation-feature-extraction-endpoint "/mfcc" --projection-feature-extraction-endpoint "/manual?features=spectral_centroid,spectral_flatness" \
			--quality-evaluation-host ws://127.0.0.1:32051 --quality-evaluation-endpoint "/cosine?reference_embedding_path=/Users/bjornpjo/Downloads/nsynth-valid/family-split_features/string/string_acoustic_057-070-127.json&reference_embedding_key=mfcc" \
			--projection-host http://localhost:31053 --projection-endpoint /manual?features=spectral_centroid,spectral_flatness \
			--use-gpu true --sample-rate 16000

		TODO see saveRenderedSoundsToFilesWorker onwards

		$ kromosynth render-virtual-instrument [--read-from-file | --read-from-input] \
			[--octave-from 0] [--octave-to 9] [--duration 1] [--velocity-layer-count 8] \
			[--sample-rate 48000] [--bit-depth 24]
			[--write-to-folder ./]

		👉 more in the project's readme (at https://github.com/synth-is/kromosynth-cli)
`, {
	importMeta: import.meta,
	flags: {
		evoRunDirPath: {
			type: 'string'
		},
		readFromFile: {
			type: 'string',
			alias: 'r'
		},
		writeToFile: {
			type: 'string',
			alias: 'w',
		},
		writeToFolder: {
			type: 'string',
			default: './'
		},
		datasetFolder: {
			type: 'string',
		},
		suffixesFilter: {
			type: 'string',
			default: ''
		},
		scoreInFileName: {
			type: 'boolean',
			default: false
		},
		overwriteExistingFiles: {
			type: 'boolean',
			default: false
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
		antiAliasing: {
			type: 'boolean',
			default: false
		},
		useOvertoneInharmonicityFactors: {
			type: 'boolean',
			default: true
		},
		frequencyUpdatesApplyToAllPathcNetworkOutputs: {
			type: 'boolean',
			default: false
		},
		geneMetadataOverride: {
			type: 'boolean',
			default: false
		},
		everyNthGeneration: {
			type: 'number',
			default: Number.MAX_SAFE_INTEGER
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
		ascending: {
			type: 'boolean',
			default: true
		},

		evolutionRunsConfigJsonFile: {
			type: 'string'
		},
		evolutionRunsConfigJsonFileRunIndex: {
			type: 'number'
		},
		evolutionRunsConfigJsonFileRunIteration: {
			type: 'number'
		},

		evolutionRunConfigJsonFile: {
			type: 'string'
		},
		evolutionRunConfigJsonString: {
			type: 'string'
		},

		scoreThreshold: {
			type: 'number'
		},
		startCellKey: {
			type: 'string'
		},
		startCellKeyIndex: {
			type: 'number'
		},
		cellKey: {
			type: 'string'
		},

		uniqueGenomes: {
			type: 'boolean',
			default: false
		},
		excludeEmptyCells: {
			type: 'boolean',
			default: false
		},
		classRestriction: {
			type: 'string'
		},
		maxIterationIndex: {
			type: 'number'
		},

		octaveFrom: {
			type: 'number',
			default: 3
		},
		octaveTo: {
			type: 'number',
			default: 5
		},
		velocityLayerCount: {
			type: 'number',
			default: 8
		},
		sampleRate: {
			type: 'number',
			default: 48000
		},
		bitDepth: {
			type: 'number',
			default: 24
		},

		evorunsRestServerUrl: {
			type: 'string',
			default: 'https://evoruns.synth.is'
		},
		featureExtractionServerHost: {
			type: 'string',
			default: 'ws://localhost:31051'
		},
		featureTypesFilter: {
			type: 'string'
		},

		// lineage
		lineageTreeJsonFile: {
			type: 'string'
		},

		// map-elite-map-to-map-with-different-bd
		terrainNameFrom: {
			type: 'string'
		},
		terrainNameTo: {
			type: 'string'
		},
		genomeRenderingHost: {
			type: 'string'
		},
		featureExtractionHost: {
			type: 'string'
		},
		qualityEvaluationFeatureExtractionEndpoint: {
			type: 'string'
		},
		projectionFeatureExtractionEndpoint: {
			type: 'string'
		},
		qualityEvaluationHost: {
			type: 'string'
		},
		qualityEvaluationEndpoint: {
			type: 'string'
		},
		projectionHost: {
			type: 'string'
		},
		projectionEndpoint: {
			type: 'string'
		},

		terrainName: {
			type: 'string',
			default: ''
		},
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

		///// QD ANALYSIS

		case "evo-runs-git-gc":
			qdAnalysis_gitGC();
			break;
		case "evo-runs-percent-completion":
			qdAnalysis_percentCompletion();
			break;

		///// QD map analysis
		case "elite-map-qd-score":
			qdAnalysis_eliteMapQDScore();
			break;
		case "elite-map-genome-statistics":
			qdAnalysis_eliteMapGenomeStatistics();
			break;
		case "elite-map-cell-scores":
			qdAnalysis_eliteMapCellScores();
			break;
		case "elite-map-coverage":
			qdAnalysis_eliteMapCoverage();
			break;
		case "elite-map-geneome-sets":
			qdAnalysis_eliteMapGenomeSets();
			break;
		case "elite-map-score-variance":
			qdAnalysis_eliteMapScoreVariance();

		///// QD evo run analysis
		case "evo-run-genome-statistics":
			qdAnalysis_evoRunGenomeStatistics();
			break;
		case "evo-run-qd-scores":
			qdAnalysis_evoRunQDScores();
			break;
		case "evo-run-cell-scores":
			qdAnalysis_evoRunCellScores();
			break;
		case "evo-run-coverage":
			qdAnalysis_evoRunCoverage();
			break;
		case "evo-run-genome-sets":
			qdAnalysis_evoRunGenomeSets();
			break;
		case "evo-run-score-variance":
			qdAnalysis_evoRunScoreVariances();
			break;
		case "evo-run-cell-saturation-generations":
			qdAnalysis_evoRunCellSaturationGenerations();
			break;
		case "evo-run-elites-energy":
			qdAnalysis_evoRunElitesEnergy();
			break;
		case "evo-run-goal-switches":
			qdAnalysis_evoRunGoalSwitches();
			break;
		case "evo-run-lineage":
			qdAnalysis_evoRunLineage();
			break;
		case "evo-run-duration-pitch-delta-velocity-combinations":
			qdAnalysis_evoRunDurationPitchDeltaVelocityCombinations();
			break;
			
		case "evo-run-elite-counts":
			break;
		case "evo-run-variances":
			break;

		case "evo-run-class-lineage":
			break;
		case "evo-runs-analysis":
			qdAnalysis_evoRuns();
			break;

		case "evo-run-play-class":
			qdAnalysis_playClass();
			break;
		case "evo-run-play-elite-map":
			qdAnalysis_playEliteMap();
			break;

		case "render-virtual-instrument":
			renderVirtualInstrument();
			break;
		case "render-evoruns":
			renderEvoruns();
			break;
		case "render-evorun":
			renderEvorun();
			break;
		case "render-lineage-tree":
			renderLineageTree();
			break;
		case "render-elite-maps-timeline":
			callRenderEliteMapsTimeline();
			break;
		case "extract-features":
			extractFeatures();
			break;
		case "map-elite-map-to-map-with-different-bd":
			cmdMapEliteMapToMapWithDifferentBD();
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
			if( inputGenomeParsed.genome.evoRun ) {
				duration = inputGenomeParsed.genome.evoRun.duration;
				noteDelta = inputGenomeParsed.genome.evoRun.noteDelta;
				velocity = inputGenomeParsed.genome.evoRun.velocity;
			} else if( inputGenomeParsed.genome.tags && inputGenomeParsed.genome.tags.length ) {
				duration = inputGenomeParsed.genome.tags[0].duration;
				noteDelta = inputGenomeParsed.genome.tags[0].noteDelta;
				velocity = inputGenomeParsed.genome.tags[0].velocity;
			} else {
				duration = inputGenomeParsed.duration || cli.flags.duration;
				noteDelta = inputGenomeParsed.noteDelta || cli.flags.noteDelta;
				velocity = inputGenomeParsed.velocity || cli.flags.velocity;
			}
		} else {
			duration = cli.flags.duration;
			noteDelta = cli.flags.noteDelta;
			velocity = cli.flags.velocity;
		}
		const { reverse, useGpu } = cli.flags;

		console.log("Starting rendering...");
		const startRenderingTime = performance.now();
		const audioBuffer = await getAudioBufferFromGenomeAndMeta(
			inputGenomeParsed,
			duration, noteDelta, velocity, reverse,
			false, // asDataArray
			getNewOfflineAudioContext( duration ),
			getAudioContext(),
			cli.flags.useOvertoneInharmonicityFactors,
			useGpu,
		);
		const endRenderingTime = performance.now();
		console.log(`Rendering took ${endRenderingTime - startRenderingTime} milliseconds`);
		console.log("Will play audio now");
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

async function renderVirtualInstrument() {
	let inputGenome;
	if( cli.flags.readFromInput ) {
		inputGenome = await getGenomeFromInput();
	} else if( cli.flags.readFromFile ) {
		inputGenome = readJSONFromFile( cli.flags.readFromFile );
	}
	if( inputGenome ) {
		const inputGenomeParsed = JSON.parse( inputGenome );
		let {
			octaveFrom, octaveTo, duration, velocityLayerCount,
			sampleRate, bitDepth,
			writeToFolder,
			useOvertoneInharmonicityFactors
		} = cli.flags;
		renderSfz(
			inputGenomeParsed,
			octaveFrom, octaveTo, duration, velocityLayerCount,
			sampleRate, bitDepth,
			writeToFolder,
			useOvertoneInharmonicityFactors
		);
	}

}

async function renderEvoruns() {
	const { evorunsRestServerUrl, writeToFolder } = cli.flags;
	console.log("evorunsRestServerUrl", evorunsRestServerUrl);
	const evorunPaths = await getEvoruns( evorunsRestServerUrl );
	console.log("evorunPaths", evorunPaths);
	// for each evorun path, call the `/classes` endpoint to get the classes, with the evorun path as a query param
	for( let oneEvorunPath of evorunPaths ) {
		console.log("oneEvorunPath", oneEvorunPath);
		const evorunId = oneEvorunPath.split("/").pop();
		const writeToSubfolder = writeToFolder + oneEvorunPath.substring(0, oneEvorunPath.lastIndexOf("/")) + "/";
		const classesResponse = await fetch( `${evorunsRestServerUrl}/classes?evoRunDirPath=${oneEvorunPath}` );
		const classes = await classesResponse.json();
		console.log("classes", classes);
		if( ! classes.error ) {
			// for each class, call the `/iteration-count` endpoint to get the iteration count, with the evorun path and class as query params
			for( let oneClass of classes ) {
				console.log("oneClass", oneClass);

				

				const iterationCountResponse = await fetch( `${evorunsRestServerUrl}/iteration-count?evoRunDirPath=${oneEvorunPath}&class=${oneClass}` );
				const iterationCount = await iterationCountResponse.json();
				console.log("iterationCount", iterationCount);
				// for the last iteration, call the `/genome-string` endpoint to get the genome, with the evorun path, class and iteration as query params
				const genomeStringResponse = await fetch( `${evorunsRestServerUrl}/genome-string?evoRunDirPath=${oneEvorunPath}&class=${oneClass}&generation=${iterationCount-1}` );
				const genomeString = await genomeStringResponse.text();
				const genomeAndMeta = JSON.parse( genomeString );
				// console.log("genomeAndMeta", genomeAndMeta);
				// call the `/genome-metadata` endpoint to get the genome metadata, with the evorun path, class and iteration as query params
				const genomeMetadataResponse = await fetch( `${evorunsRestServerUrl}/genome-metadata?evoRunDirPath=${oneEvorunPath}&class=${oneClass}&generation=${iterationCount-1}` )
				const genomeMetadata = await genomeMetadataResponse.json();
				const{ genomeId, duration, noteDelta, velocity, reverse, score } = genomeMetadata;
				const id = `${evorunId}_${genomeId}`;

				const filenameBase = `_${duration}_${noteDelta}_${velocity}_${iterationCount-1}_${score ? score.toFixed(2) : score}`;
				const filename = `${filenameBase}.wav`;

				// test if the file exists, then not attempt rendering
				// TODO: optional via flag?
				const fullFilePath = writeToSubfolder + `${oneClass}_` + id + filename;
				if( !fs.existsSync(fullFilePath) ) {
					try {
						const audioBuffer = await getAudioBufferFromGenomeAndMeta(
							genomeAndMeta,
							duration, noteDelta, velocity, reverse,
							false, // asDataArray
							getNewOfflineAudioContext( duration ),
							getAudioContext(),
							cli.flags.useOvertoneInharmonicityFactors
						);
						const wav = toWav(audioBuffer);
						writeToFile( Buffer.from(new Uint8Array(wav)), writeToSubfolder, id, `${oneClass}_`, filename, false );				
					} catch (error) {
						const errorFilename = `${filenameBase}_ERROR.txt`;
						writeToFile( error.message, `${writeToSubfolder}errors/`, id, `${oneClass}_`, errorFilename, false );	
					}
				} else {
					console.log("File exists, not rendering:", fullFilePath);
				}
			}
		} else {
			const errorFilename = `_ERROR.txt`;
			writeToFile( classes.error, `${writeToFolder}errors/`, evorunId, ``, errorFilename, false );	
		}
	}
}

async function renderEvorun() {
	let { 
		evoRunDirPath,
		duration: durationParam, noteDelta: noteDeltaParam, velocity: velocityParam, reverse,
		antiAliasing, useOvertoneInharmonicityFactors, frequencyUpdatesApplyToAllPathcNetworkOutputs,
		geneMetadataOverride, useGpu, sampleRate,
		everyNthGeneration,
		writeToFolder, overwriteExistingFiles, scoreInFileName
	} = cli.flags;
	if( ! evoRunDirPath ) {
		console.error("No evoRunDirPath provided");
		process.exit();
	}
	const evoRunId = evoRunDirPath.substring(0,evoRunDirPath.length).split('/').pop();
	const generationCount = getCommitCount( evoRunDirPath, true );
	if( generationCount >= 1 ) {
		if( ! everyNthGeneration || everyNthGeneration >= generationCount ) {
			if( generationCount === 1 ) {
				everyNthGeneration = generationCount;
			} else {
				everyNthGeneration = generationCount - 1;
			}
		}
		console.log("generationCount",generationCount);
		console.log("everyNthGeneration",everyNthGeneration);
		for( 
				let iteration = generationCount > 1 ? everyNthGeneration : 0; 
				iteration < generationCount; 
				iteration = (iteration + everyNthGeneration) > generationCount && iteration !== generationCount-1 ? generationCount-1 : iteration + everyNthGeneration 
		) {
			const eliteMaps = await getEliteMaps( evoRunDirPath, iteration );
			for( let eliteMap of eliteMaps) {
				const classes = await getClassLabelsWithElitesFromEliteMap( eliteMap );
				for( let oneClass of classes ) {
					let terrainSuffix;
					if( eliteMaps.length > 1 ) { // assume last part of file name is the terrain suffix
						terrainSuffix = eliteMap._id.split("_").pop();
					}
					const classElites = eliteMap.cells[oneClass].elts;
					if( classElites && classElites.length ) {
						const genomeId = classElites[0].g;
						const genomeString = await readGenomeAndMetaFromDisk( evoRunId, genomeId, evoRunDirPath );
						// await getGenomeString( evoRunDirPath, oneClass, iteration );
						const genomeAndMeta = JSON.parse( genomeString );
						const tagForCell = genomeAndMeta.genome.tags.find(t => t.tag === oneClass);
						const { duration, noteDelta, velocity, score } = tagForCell;
						let _duration = durationParam || duration;
						let _noteDelta = noteDeltaParam || noteDelta;
						let _velocity = velocityParam || velocity;
						if( geneMetadataOverride ) {
							_duration = durationParam;
							_noteDelta = noteDeltaParam;
							_velocity = velocityParam;
						} else {
							_duration = duration;
							_noteDelta = noteDelta;
							_velocity = velocity;
						}
		
						let fileNamePrefix = "";
						if( scoreInFileName ) {
							const scorePercentRoundedAndPadded = Math.round(score*100).toString().padStart(3, '0');
							fileNamePrefix = `${scorePercentRoundedAndPadded}_`;
						}
		
						const oneClassFileNameFriendly = fileNamePrefix + oneClass.replace(/[^a-z0-9]/gi, '_').toLowerCase();
						const subFolder = writeToFolder + "/" + evoRunId + "/" + (iteration === generationCount - 1 ? ""/*write to the root of this evoruns folder*/ : iteration + "_" + _duration + "/") + (terrainSuffix ? terrainSuffix + "/" : "");
		
						const wavFileName = `${fileNamePrefix}${oneClassFileNameFriendly}_${genomeId}_${iteration}.wav`;
	
	
	
						if( fs.existsSync( subFolder + wavFileName ) && ! overwriteExistingFiles) {
							console.log("File exists, not rendering:", subFolder + wavFileName);
							continue;
						}
		
						console.log("Rendering evoRun", evoRunId, ", iteration ", iteration, ", class", oneClassFileNameFriendly, "from genomeId", genomeId);
						try {
							const audioBuffer = await getAudioBufferFromGenomeAndMeta(
								genomeAndMeta,
								_duration, _noteDelta, _velocity, reverse,
								false, // asDataArray
								getNewOfflineAudioContext( _duration, sampleRate ),
								getAudioContext( sampleRate ),
								useOvertoneInharmonicityFactors,
								useGpu,
								antiAliasing,
								frequencyUpdatesApplyToAllPathcNetworkOutputs
							);
							console.log("Audio buffer length", audioBuffer.length);
							const wav = toWav(audioBuffer);
							// console.log("Wav", wav);
							
							writeToFile( Buffer.from(new Uint8Array(wav)), subFolder, genomeId, `${oneClassFileNameFriendly}_`, `_${iteration}.wav`, false );
						} catch (error) {
							console.error("Error rendering", evoRunId, iteration, oneClassFileNameFriendly, genomeId, error);
						}
					}
				}
			}
		}
	}

	process.exit();
}

async function renderLineageTree() {
	let {
		evoRunDirPath, lineageTreeJsonFile, writeToFolder, overwriteExistingFiles,
		antiAliasing, useOvertoneInharmonicityFactors, frequencyUpdatesApplyToAllPathcNetworkOutputs,
		useGpu, sampleRate
	} = cli.flags;
	let withoutTracing = false; // TODO hardcoded for now
	if( ! evoRunDirPath ) {
		console.error("No evoRunDirPath provided");
		process.exit();
	}
	if( ! lineageTreeJsonFile ) {
		console.error("No lineageTreeJsonFile provided");
		process.exit();
	}
	const lineageData = JSON.parse(fs.readFileSync(lineageTreeJsonFile));
	
	lineageIterationLoop:
	for( let iterationIndex = 0; iterationIndex < lineageData.evoRuns[0].iterations.length; iterationIndex++ ) {
		const genomesToRender = {};
		const oneIteration = lineageData.evoRuns[0].iterations[iterationIndex];
		const evoRunId = oneIteration.id;
		const oneEvorunPath = evoRunDirPath + "/" + evoRunId;

		if( withoutTracing ) {
			let lineageIndex = 0;
			for( const oneLineageEntry of oneIteration.lineage ) {
				let { id: genomeId, eliteClass, s, gN, uBC, duration, noteDelta, velocity, parents } = oneLineageEntry;
				const renderedDescendantFileName = `${genomeId}-${duration}_${noteDelta}_${velocity}.wav`;
				console.log("Collecting", renderedDescendantFileName);
				genomesToRender[renderedDescendantFileName] = { 
					genomeId, eliteClass, duration, noteDelta, velocity, parents,
				};
				lineageIndex++;
			}
		} else {
			const latestDescendants = findLatestDescendantsByClass( lineageData, null, iterationIndex, true/*inCategoryMusical*/, true/*inCategoryNonMusical*/ );
			// latestDescendants.forEach( async (oneDescendant, index) => {
			let descendantIndex = 0;
			let lineageIndex = 0;
			let lastDuration, lastNoteDelta, lastVelocity;
			console.log("-----latestDescendants.length", latestDescendants.length);
			descendantIterationLoop:
			for( const oneDescendant of latestDescendants ) {
				const lineage = traceLineage( lineageData, oneDescendant, Infinity/*maxDepth*/, iterationIndex );
				// lineage.forEach( async (oneLineageItem) => {
				for( const oneLineageItem of lineage ) {
					let { id: genomeId, eliteClass, s, gN, uBC, duration, noteDelta, velocity, parents } = oneLineageItem;
	
					// hack to handle missing variation values due to remapping (see "lineage" analysis operation)
					if( duration===undefined ) duration = lastDuration; else lastDuration = duration;
					if( noteDelta===undefined ) noteDelta = lastNoteDelta; else lastNoteDelta = noteDelta;
					if( velocity===undefined ) velocity = lastVelocity; else lastVelocity = velocity;
	
					const renderedDescendantFileName = `${genomeId}-${duration}_${noteDelta}_${velocity}.wav`;
					console.log("Collecting", renderedDescendantFileName);
					genomesToRender[renderedDescendantFileName] = { 
						genomeId, eliteClass, duration, noteDelta, velocity, parents,
					};
					lineageIndex++;
				}
				descendantIndex++;
			}
			console.log("Collected", descendantIndex, "descendants and", lineageIndex, "lineage items");
		}
		
		const subFolder = writeToFolder + "/" + evoRunId + "/";
		if( !fs.existsSync(writeToFolder) ) {
			fs.mkdirSync(writeToFolder);
		}
		if( !fs.existsSync(subFolder) ) {
			fs.mkdirSync(subFolder);
		}

    const workerPath = path.join(__dirname, 'workers', 'renderAncestorToWavFile.js');
    const concurrencyLimit = 16;

    const queue = async.queue((task, done) => {
        const child = fork(workerPath);
        const { fileName, subFolder, ancestorData } = task;

        child.send({ 
            evoRunId, oneEvorunPath,
            fileName, subFolder, ancestorData, 
            overwriteExistingFiles, useOvertoneInharmonicityFactors, useGpu, antiAliasing, frequencyUpdatesApplyToAllPathcNetworkOutputs, sampleRate 
        });

        child.on('message', (message) => {
            console.log("Message from child:", message);
            done();
        });

        child.on('exit', (code) => {
            if (code !== 0) {
                console.error(`Child process for ${fileName} exited with code ${code}`);
                done(new Error(`Child process exited with code ${code}`));
            }
        });

        child.on('error', (err) => {
            console.error(`Error from child process for ${fileName}:`, err);
            done(err);
        });
    }, concurrencyLimit);

    for (let [fileName, ancestorData] of Object.entries(genomesToRender)) {
        queue.push({ fileName, subFolder, ancestorData });
    }

    queue.drain(() => {
        console.log("All rendering complete");
        process.exit();
    });
	}
}

async function callRenderEliteMapsTimeline( ) {
  let {
		evoRunDirPath, lineageTreeJsonFile, writeToFolder, overwriteExistingFiles,
		stepSize, terrainName,
		antiAliasing, useOvertoneInharmonicityFactors, frequencyUpdatesApplyToAllPathcNetworkOutputs,
		useGpu, sampleRate
	} = cli.flags;

	if( ! lineageTreeJsonFile ) {
		console.error("No lineageTreeJsonFile provided");
		process.exit();
	}
	const lineageData = JSON.parse(fs.readFileSync(lineageTreeJsonFile));
	
	lineageIterationLoop:
	for( let iterationIndex = 0; iterationIndex < lineageData.evoRuns[0].iterations.length; iterationIndex++ ) {
		const oneIteration = lineageData.evoRuns[0].iterations[iterationIndex];
		const evoRunId = oneIteration.id;
		
		await renderEliteMapsTimeline(
			evoRunDirPath, evoRunId, writeToFolder, overwriteExistingFiles,
			stepSize, terrainName,
			antiAliasing, useOvertoneInharmonicityFactors, frequencyUpdatesApplyToAllPathcNetworkOutputs,
			useGpu, sampleRate
		);
	}
}

async function extractFeatures() {
	const { 
		datasetFolder, writeToFolder, suffixesFilter, sampleRate, ckptDir, featureExtractionServerHost, featureTypesFilter
	} = cli.flags;
	await extractFeaturesFromAllAudioFiles( datasetFolder, writeToFolder, sampleRate, ckptDir, featureExtractionServerHost, suffixesFilter, featureTypesFilter );
}

async function cmdMapEliteMapToMapWithDifferentBD() {
	const {
		evolutionRunId, evoRunDirPath,
		terrainNameFrom, terrainNameTo, 
		genomeRenderingHost, 
		featureExtractionHost, qualityEvaluationFeatureExtractionEndpoint, projectionFeatureExtractionEndpoint, 
		qualityEvaluationHost, qualityEvaluationEndpoint, 
		projectionHost, projectionEndpoint,
		useGPU, sampleRate
	} = cli.flags;
	await mapEliteMapToMapWithDifferentBDs(
		evolutionRunId, evoRunDirPath, terrainNameFrom, terrainNameTo,
		genomeRenderingHost,
		featureExtractionHost, qualityEvaluationFeatureExtractionEndpoint, projectionFeatureExtractionEndpoint, 
		qualityEvaluationHost, qualityEvaluationEndpoint,
		projectionHost, projectionEndpoint,
		useGPU,
		sampleRate
	);
}

async function getEvoruns( evorunsRestServerUrl ) {
	const response = await fetch( `${evorunsRestServerUrl}/evorunpaths` );
	const evoruns = await response.json();
	return evoruns;
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
			cli.flags.classScoringDurations ? JSON.parse(cli.flags.classScoringDurations) : undefined, 
			cli.flags.classScoringNoteDeltas ? JSON.parse(cli.flags.classScoringNoteDeltas) : undefined, 
			cli.flags.classScoringVelocities ? JSON.parse(cli.flags.classScoringVelocities) : undefined,
			cli.flags.classificationGraphModel,
			undefined, //modelUrl, will download if not present
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
	const startTimeMs = Date.now();
	if( cli.flags.evolutionRunsConfigJsonFileRunIndex !== undefined ) {
		evoRunsConfig.currentEvolutionRunIndex = cli.flags.evolutionRunsConfigJsonFileRunIndex;
	}
	if( cli.flags.evolutionRunsConfigJsonFileRunIteration ) {
		evoRunsConfig.currentEvolutionRunIteration = cli.flags.evolutionRunsConfigJsonFileRunIteration;
	}
	evoRunsOuterLoop:
	while( evoRunsConfig.currentEvolutionRunIndex < evoRunsConfig.evoRuns.length ) {
		const currentEvoConfig = evoRunsConfig.evoRuns[evoRunsConfig.currentEvolutionRunIndex];
		while( evoRunsConfig.currentEvolutionRunIteration < currentEvoConfig.iterations.length ) {
			if( 
				( cli.flags.evolutionRunsConfigJsonFileRunIndex !== undefined && evoRunsConfig.currentEvolutionRunIndex !== cli.flags.evolutionRunsConfigJsonFileRunIndex )
				||
				( cli.flags.evolutionRunsConfigJsonFileRunIteration !== undefined && evoRunsConfig.currentEvolutionRunIteration !== cli.flags.evolutionRunsConfigJsonFileRunIteration )
			) { // we're targetting a specific evo run and don't want to conflict with another run possibly running in parallel
				break evoRunsOuterLoop;
			}

			let { id: currentEvolutionRunId } = currentEvoConfig.iterations[evoRunsConfig.currentEvolutionRunIteration];

			if( ! currentEvolutionRunId ) {
				currentEvolutionRunId = ulid() + "_" + currentEvoConfig.label;
				currentEvoConfig.iterations[evoRunsConfig.currentEvolutionRunIteration].id = currentEvolutionRunId;
				if( cli.flags.evolutionRunsConfigJsonFile ) {
					saveEvolutionRunsConfig( evoRunsConfig );
				}
			}

			const evoRunConfigMain = getEvolutionRunConfig( evoRunsConfig.baseEvolutionRunConfigFile );
			const evoRunConfigDiff = getEvolutionRunConfig( currentEvoConfig.diffEvolutionRunConfigFile );
			const evoRunConfig = {...evoRunConfigMain, ...evoRunConfigDiff};
			if( cli.flags.evolutionRunsConfigJsonFileRunIndex !== undefined && cli.flags.evolutionRunsConfigJsonFileRunIteration !== undefined ) {
				evoRunConfig.gRpcHostFilePathPrefix = `${evoRunConfig.gRpcHostFilePathPrefix}${cli.flags.evolutionRunsConfigJsonFileRunIndex}-${cli.flags.evolutionRunsConfigJsonFileRunIteration}-`;
			}
			

			const evoParamsMain = getEvoParams( evoRunsConfig.baseEvolutionaryHyperparametersFile );
			const evoParamsDiff = getEvoParams( currentEvoConfig.diffEvolutionaryHyperparametersFile );
			const evoParams = merge(evoParamsMain, evoParamsDiff);

			await qualityDiversitySearch( currentEvolutionRunId, evoRunConfig, evoParams );

			if( evoRunConfig.batchDurationMs && evoRunConfig.batchDurationMs < Date.now() - startTimeMs ) {
				// time's up
				break evoRunsOuterLoop;
			}

			if( cli.flags.evolutionRunsConfigJsonFile ) {
				evoRunsConfig.currentEvolutionRunIteration++;
				saveEvolutionRunsConfig( evoRunsConfig );
			}
		}
		evoRunsConfig.currentEvolutionRunIteration = 0;
		if( cli.flags.evolutionRunsConfigJsonFile ) {
			evoRunsConfig.currentEvolutionRunIndex++;
			saveEvolutionRunsConfig( evoRunsConfig );
		}
	}
	// process.exit();
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
	await qdSearch( _evolutionRunId, _evoRunConfig, _evoParams, false );
}


///// elite map analysis

async function qdAnalysis_eliteMapQDScore() {
	let {evolutionRunId, evolutionRunIteration} = cli.flags;
	if( evolutionRunId ) {
		const evoRunConfig = getEvolutionRunConfig();
		const qdScore = await calculateQDScoreForOneIteration( evoRunConfig, evolutionRunId, evolutionRunIteration );
		console.log(qdScore);
	}
}

async function qdAnalysis_eliteMapCellScores() {
	let {evolutionRunId, evolutionRunIteration} = cli.flags;
	if( evolutionRunId ) {
		const evoRunConfig = getEvolutionRunConfig();
		const cellScores = await getCellScoresForOneIteration( evoRunConfig, evolutionRunId, evolutionRunIteration );
		console.log(cellScores);
	}
}

async function qdAnalysis_eliteMapGenomeStatistics() {
	let {evolutionRunId, evolutionRunIteration} = cli.flags;
	if( evolutionRunId ) {
		const evoRunConfig = getEvolutionRunConfig();
		const {
			averageCppnNodeCount, averageCppnConnectionCount, averageAsNEATPatchNodeCount, averageAsNEATPatchConnectionCount
		} = await getGenomeStatisticsAveragedForOneIteration( evoRunConfig, evolutionRunId, evolutionRunIteration );
		console.log("averageCppnNodeCount:", averageCppnNodeCount, "averageCppnConnectionCount:", averageCppnConnectionCount, "averageAsNEATPatchNodeCount:", averageAsNEATPatchNodeCount, "averageAsNEATPatchConnectionCount:", averageAsNEATPatchConnectionCount);
		process.exit();
	}
}

async function qdAnalysis_eliteMapCoverage() {
	let {evolutionRunId, evolutionRunIteration, scoreThreshold} = cli.flags;
	if( evolutionRunId ) {
		const evoRunConfig = getEvolutionRunConfig();
		const coverage = await getCoverageForOneIteration( evoRunConfig, evolutionRunId, evolutionRunIteration, scoreThreshold );
		console.log(coverage);
	}
}

async function qdAnalysis_eliteMapGenomeSets() {
	let {evolutionRunId, evolutionRunIteration, scoreThreshold} = cli.flags;
	if( evolutionRunId ) {
		const evoRunConfig = getEvolutionRunConfig();
		const genomeSets = await getGenomeSetsForOneIteration( evoRunConfig, evolutionRunId, evolutionRunIteration, scoreThreshold );
		console.log(genomeSets);
	}
}

async function qdAnalysis_eliteMapScoreVariance() {
	let {evolutionRunId, evolutionRunIteration} = cli.flags;
	if( evolutionRunId ) {
		const evoRunConfig = getEvolutionRunConfig();
		const scoreVariance = await getScoreStatsForOneIteration( evoRunConfig, evolutionRunId, evolutionRunIteration );
		console.log(scoreVariance);
	}
}

///// evo runs analysis

async function qdAnalysis_evoRunQDScores() {
	let {evolutionRunId, stepSize} = cli.flags;
	if( evolutionRunId ) {
		const evoRunConfig = getEvolutionRunConfig();
		const qdScores = await calculateQDScoresForAllIterations( evoRunConfig, evolutionRunId, stepSize );
		console.log(qdScores);
	}
}

async function qdAnalysis_evoRunGenomeStatistics() {
	let {evolutionRunId, stepSize} = cli.flags;
	if( evolutionRunId ) {
		const evoRunConfig = getEvolutionRunConfig();
		const genomeStatistics = await getGenomeStatisticsAveragedForAllIterations( evoRunConfig, evolutionRunId, stepSize );
		console.log(genomeStatistics);
	}
}

async function qdAnalysis_evoRunCellScores() {
	let {evolutionRunId, stepSize} = cli.flags;
	if( evolutionRunId ) {
		const evoRunConfig = getEvolutionRunConfig();
		const cellScores = await getCellScoresForAllIterations( evoRunConfig, evolutionRunId, stepSize );
		console.log(cellScores);
	}
}

async function qdAnalysis_evoRunCoverage() {
	let {evolutionRunId, stepSize, scoreThreshold} = cli.flags;
	if( evolutionRunId ) {
		const evoRunConfig = getEvolutionRunConfig();
		const coverage = await getCoverageForAllIterations( evoRunConfig, evolutionRunId, stepSize, scoreThreshold );
		console.log(coverage);
	}
}

async function qdAnalysis_evoRunGenomeSets() {
	let {evolutionRunId, stepSize, scoreThreshold} = cli.flags;
	if( evolutionRunId ) {
		const evoRunConfig = getEvolutionRunConfig();
		const genomeSets = await getGenomeCountsForAllIterations( evoRunConfig, evolutionRunId, stepSize, scoreThreshold );
		console.log(genomeSets);
	}
}

async function qdAnalysis_evoRunScoreVariances() {
	let {evolutionRunId, stepSize} = cli.flags;
	if( evolutionRunId ) {
		const evoRunConfig = getEvolutionRunConfig();
		const scoreVariances = await getScoreVarianceForAllIterations( evoRunConfig, evolutionRunId, stepSize );
		console.log(scoreVariances);
	}
}

async function qdAnalysis_evoRunCellSaturationGenerations() {
	let {evolutionRunId, stepSize} = cli.flags;
	if( evolutionRunId ) {
		const evoRunConfig = getEvolutionRunConfig();
		const cellSaturationGenerations = await getCellSaturationGenerations( evoRunConfig, evolutionRunId );
		console.log(cellSaturationGenerations);
	}
}

async function qdAnalysis_evoRunElitesEnergy() {
	let {evolutionRunId, stepSize} = cli.flags;
	if( evolutionRunId ) {
		const evoRunConfig = getEvolutionRunConfig();
		const eliteEnergy = await getElitesEnergy( evoRunConfig, evolutionRunId, stepSize );
		console.log(eliteEnergy);
	}
}

async function qdAnalysis_evoRunGoalSwitches() {
	let {evolutionRunId, stepSize} = cli.flags;
	if( evolutionRunId ) {
		const evoParams = getEvoParams();
		const evoRunConfig = getEvolutionRunConfig();
		const goalSwitches = await getGoalSwitches( evoRunConfig, evolutionRunId, stepSize, evoParams );
		console.log(goalSwitches);
	}
}

async function qdAnalysis_evoRunLineage() {
	let {evolutionRunId, stepSize, scoreThreshold} = cli.flags;
	if( evolutionRunId ) {
		const evoRunConfig = getEvolutionRunConfig();
		const lineage = await getLineageGraphData( evoRunConfig, evolutionRunId, stepSize );
		console.log(lineage);
	}
}

async function qdAnalysis_evoRunDurationPitchDeltaVelocityCombinations() {
	let {evolutionRunId, stepSize, uniqueGenomes} = cli.flags;
	if( evolutionRunId ) {
		const evoRunConfig = getEvolutionRunConfig();
		const durationDeltaPitchCombinations = await getDurationPitchDeltaVelocityCombinations( evoRunConfig, evolutionRunId, stepSize, uniqueGenomes );
		console.log(durationDeltaPitchCombinations);
	}
}

// run git garbage collection on all evolution run iterations
function qdAnalysis_gitGC() {
	const evoRunsConfig = getEvolutionRunsConfig();
	for( let currentEvolutionRunIndex = 0; currentEvolutionRunIndex < evoRunsConfig.evoRuns.length; currentEvolutionRunIndex++ ) {
		const currentEvoConfig = evoRunsConfig.evoRuns[currentEvolutionRunIndex];
		for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
			let { id: evolutionRunId } = currentEvoConfig.iterations[currentEvolutionRunIteration];
			if( evolutionRunId ) {
				const evoRunConfigMain = getEvolutionRunConfig( evoRunsConfig.baseEvolutionRunConfigFile );
				const evoRunConfigDiff = getEvolutionRunConfig( currentEvoConfig.diffEvolutionRunConfigFile );
				const evoRunConfig = {...evoRunConfigMain, ...evoRunConfigDiff};
				const evoRunDirPath = `${evoRunConfig.evoRunsDirPath}${evolutionRunId}/`;
				console.log(`Performing git garbage collection on ${evoRunDirPath}...`);
				runCmd(`git -C ${evoRunDirPath} gc`);
			}
		}
	}
}

async function qdAnalysis_percentCompletion() {
	const evoRunsConfig = getEvolutionRunsConfig();
	const evoRunsPercentCompleted = {...evoRunsConfig};
	let sumTerminationConditionNumberOfEvals = 0;
	let sumNumberOfGenerations = 0;
	for( let currentEvolutionRunIndex = 0; currentEvolutionRunIndex < evoRunsConfig.evoRuns.length; currentEvolutionRunIndex++ ) {
		const currentEvoConfig = evoRunsConfig.evoRuns[currentEvolutionRunIndex];
		const evoRunConfigMain = getEvolutionRunConfig( evoRunsConfig.baseEvolutionRunConfigFile );
		const evoRunConfigDiff = getEvolutionRunConfig( currentEvoConfig.diffEvolutionRunConfigFile );
		const evoRunConfig = {...evoRunConfigMain, ...evoRunConfigDiff};
		let terrainNames = getTerrainNames( evoRunConfig );
		if( !terrainNames || !terrainNames.length ) {
			terrainNames = [''];
		}
		for( const oneTerraineName of terrainNames ) {
			const terrainNameSuffix = oneTerraineName ? '_' + oneTerraineName : '';
			if( evoRunConfig.terminationCondition.numberOfEvals ) {
				for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
					sumTerminationConditionNumberOfEvals += evoRunConfig.terminationCondition.numberOfEvals;
					let { id: evolutionRunId } = currentEvoConfig.iterations[currentEvolutionRunIteration];
					if( evolutionRunId ) {
						const evoRunDirPath = `${evoRunConfig.evoRunsDirPath}${evolutionRunId}/`;
						const eliteMapFileName = `${evoRunDirPath}elites_${evoRunsConfig.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].id}${terrainNameSuffix}.json`;
						const eliteMap = JSON.parse(fs.readFileSync( eliteMapFileName, "utf8" ));
						const generationNumber = eliteMap.generationNumber;
						sumNumberOfGenerations += generationNumber * eliteMap.searchBatchSize;
						const percentCompleted = (generationNumber * eliteMap.searchBatchSize) / evoRunConfig.terminationCondition.numberOfEvals;
						evoRunsPercentCompleted.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].percentCompleted = percentCompleted;
					}
				}
			}
		}
	}
	const totalPercentCompleted = sumNumberOfGenerations / sumTerminationConditionNumberOfEvals;
	evoRunsPercentCompleted.totalPercentCompleted = totalPercentCompleted;
	const evoRunsConfigFile = cli.flags.evolutionRunsConfigJsonFile || evoRunsConfig.baseEvolutionRunConfigFile;
	const evoRunConfigFileName = path.basename(evoRunsConfigFile, path.extname(evoRunsConfigFile));
	const percentCompletedResultsFilePath = `${path.dirname(evoRunsConfig.baseEvolutionRunConfigFile)}/evoRunsPercentCompleted_${evoRunConfigFileName}.json`;
	const percentCompletedResultsFileContents = JSON.stringify(evoRunsPercentCompleted, null, 2);
	fs.writeFileSync(percentCompletedResultsFilePath, percentCompletedResultsFileContents);
	console.log(`Wrote percent completed results to ${percentCompletedResultsFilePath}`);
}

async function qdAnalysis_evoRuns() {
  const evoRunsConfig = getEvolutionRunsConfig();
  const {
    analysisOperations, stepSize, scoreThreshold, uniqueGenomes, excludeEmptyCells, classRestriction, maxIterationIndex, 
    writeToFolder, terrainName
  } = cli.flags;
  const analysisOperationsList = analysisOperations.split(",");
  let classRestrictionList;
  if (classRestriction) {
    classRestrictionList = JSON.parse(classRestriction);
  }
  console.log("analysisOperationsList", analysisOperationsList);
  const evoRunsAnalysis = {...evoRunsConfig};
  
  // Setup analysis result file path
  let analysisResultFilePath;
  if (writeToFolder === './') {
    analysisResultFilePath = `${path.dirname(evoRunsConfig.baseEvolutionRunConfigFile)}/evolution-run-analysis_${analysisOperationsList}_step-${stepSize}${scoreThreshold ? '_thrshld_'+scoreThreshold:''}_${Date.now()}.json`;
  } else {
    analysisResultFilePath = `${writeToFolder}/evolution-run-analysis_${analysisOperationsList}${terrainName ? '_terrain-'+terrainName : ''}_step-${stepSize}${scoreThreshold ? '_thrshld_'+scoreThreshold:''}_${Date.now()}.json`;
  }
  
  // Collect run IDs for phylogenetic comparison if needed
  const runIdsForComparison = [];
  
  for (let currentEvolutionRunIndex = 0; currentEvolutionRunIndex < evoRunsConfig.evoRuns.length; currentEvolutionRunIndex++) {
    const currentEvoConfig = evoRunsConfig.evoRuns[currentEvolutionRunIndex];
    for (let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++) {
      let { id: evolutionRunId } = currentEvoConfig.iterations[currentEvolutionRunIteration];
      if (evolutionRunId) {
        const evoRunConfigMain = getEvolutionRunConfig(evoRunsConfig.baseEvolutionRunConfigFile);
        const evoRunConfigDiff = getEvolutionRunConfig(currentEvoConfig.diffEvolutionRunConfigFile);
        const evoRunConfig = {...evoRunConfigMain, ...evoRunConfigDiff};

        const evoParamsMain = getEvoParams(evoRunsConfig.baseEvolutionaryHyperparametersFile);
        const evoParamsDiff = getEvoParams(currentEvoConfig.diffEvolutionaryHyperparametersFile);
        const evoParams = merge(evoParamsMain, evoParamsDiff);
        
        // Add this run ID to the comparison list if needed
        if (analysisOperationsList.includes("phylogenetic-comparison")) {
          runIdsForComparison.push(evolutionRunId);
        }

				let lineage;
				if( analysisOperationsList.some(op => 
					[
						"lineage",
						"phylogenetic-metrics",
						"phylogenetic-metrics-over-time",
						"terrain-transitions",
						"density-dependence",
						"phylogenetic-report",
						"phylogenetic-comparison"
					].includes(op)
				)) {
					lineage = await getLineageGraphData( evoRunConfig, evolutionRunId, stepSize );
				}

        for (const oneAnalysisOperation of analysisOperationsList) {
          const classLabels = await getClassLabels(evoRunConfig, evolutionRunId);
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].classLabels = classLabels;
 
          // Add phylogenetic analysis operations
          if (oneAnalysisOperation === "phylogenetic-metrics") {
            console.log(`Running phylogenetic metrics analysis for iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            
            // Run basic phylogenetic analysis (no visualization to save time)
            const options = {
              visualize: true,
              trackOverTime: false,
              stepSize: stepSize,
              report: true
            };
            
            try {
              const phylogeneticMetrics = await runPhylogeneticAnalysis(evoRunConfig, evolutionRunId, options, lineage);
              evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].phylogeneticMetrics = phylogeneticMetrics;
              console.log(`Added phylogenetic metrics to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
              writeAnalysisResult(analysisResultFilePath, evoRunsAnalysis);
            } catch (error) {
              console.error(`Error running phylogenetic analysis for ${evolutionRunId}:`, error);
            }
          }
          
          if (oneAnalysisOperation === "phylogenetic-metrics-over-time") {
            console.log(`Running phylogenetic metrics over time for iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            
            try {
              // Use the trackPhylogeneticMetricsOverTime function directly
              const metricsOverTime = await trackPhylogeneticMetricsOverTime(evoRunConfig, evolutionRunId, stepSize);
              evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].phylogeneticMetricsOverTime = metricsOverTime;
              console.log(`Added phylogenetic metrics over time to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
              writeAnalysisResult(analysisResultFilePath, evoRunsAnalysis);
            } catch (error) {
              console.error(`Error tracking phylogenetic metrics over time for ${evolutionRunId}:`, error);
            }
          }
          
          if (oneAnalysisOperation === "terrain-transitions") {
            console.log(`Analyzing terrain transitions for iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            
            try {
              const terrainAnalysis = await analyzeTerrainTransitions(evoRunConfig, evolutionRunId, lineage);
              evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].terrainTransitions = terrainAnalysis;
              console.log(`Added terrain transitions analysis to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
              writeAnalysisResult(analysisResultFilePath, evoRunsAnalysis);
            } catch (error) {
              console.error(`Error analyzing terrain transitions for ${evolutionRunId}:`, error);
            }
          }
          
          if (oneAnalysisOperation === "density-dependence") {
            console.log(`Analyzing density dependence for iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            
            try {
              const densityAnalysis = await analyzeDensityDependence(evoRunConfig, evolutionRunId, lineage);
              evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].densityDependence = densityAnalysis;
              console.log(`Added density dependence analysis to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
              writeAnalysisResult(analysisResultFilePath, evoRunsAnalysis);
            } catch (error) {
              console.error(`Error analyzing density dependence for ${evolutionRunId}:`, error);
            }
          }
          
          if (oneAnalysisOperation === "phylogenetic-report") {
            console.log(`Generating phylogenetic report for iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            
            try {
              const report = await generatePhylogeneticReport(evoRunConfig, evolutionRunId, lineage);
              evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].phylogeneticReport = report;
              console.log(`Added phylogenetic report to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
              writeAnalysisResult(analysisResultFilePath, evoRunsAnalysis);
            } catch (error) {
              console.error(`Error generating phylogenetic report for ${evolutionRunId}:`, error);
            }
          }


					if( oneAnalysisOperation === "diversity-from-embeddings" ) {
						const diversityFromEmbeddings = getDiversityFromEmbeddingFiles( evoRunConfig, evolutionRunId);
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].diversityFromEmbeddings = diversityFromEmbeddings;
						console.log(`Added diversity from embeddings to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
						writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
					}
					if( oneAnalysisOperation === "diversity-at-last-iteration" ) {
						const diversityAtLastIteration = await getEliteMapDiversityAtLastIteration( evoRunConfig, evolutionRunId );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].diversityAtLastIteration = diversityAtLastIteration;
						console.log(`Added diversity at last iteration to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
						writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
					}
					if( oneAnalysisOperation === "diversity-from-all-discovered-elites" ) {
						const diversityFromAllDiscoveredElites = await getDiversityFromAllDiscoveredElites( evoRunConfig, evolutionRunId, true/* useDirectFeatureReading */ );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].diversityFromAllDiscoveredElites = diversityFromAllDiscoveredElites;
						console.log(`Added diversity from all discovered elites to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
						writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
					}
					if( oneAnalysisOperation === "diversity-measures" ) { // across all iterations
						const diversityMeasures = await getEliteMapDiversityForAllIterations( evoRunConfig, evolutionRunId, stepSize );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].diversityMeasures = diversityMeasures;
						console.log(`Added diversity measures to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
						writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
					}
					if( oneAnalysisOperation === "qd-scores" ) {
						const qdScores = await calculateQDScoresForAllIterations( evoRunConfig, evolutionRunId, stepSize, excludeEmptyCells, classRestrictionList, maxIterationIndex );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].qdScores = qdScores;
						console.log(`Added ${qdScores.length} QD scores to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
						writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
					}
					if( oneAnalysisOperation === "grid-mean-fitness" ) {
						const gridMeanFitness = await calculateGridMeanFitnessForAllIterations( evoRunConfig, evolutionRunId, stepSize );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].gridMeanFitness = gridMeanFitness;
						console.log(`Added grid mean fitness to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
						writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
					}
					if( oneAnalysisOperation === "genome-statistics" ) {
						const genomeStatistics = await getGenomeStatisticsAveragedForAllIterations( evoRunConfig, evolutionRunId, stepSize, excludeEmptyCells, classRestrictionList, maxIterationIndex );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].genomeStatistics = genomeStatistics;
						console.log(`Added genome statistics to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
						writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
					}
					if( oneAnalysisOperation === "cell-scores" ) {
						const cellScores = await getCellScoresForAllIterations( evoRunConfig, evolutionRunId, stepSize );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].cellScores = cellScores;
						console.log(`Added cell scores to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
						writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
					}
					if( oneAnalysisOperation === "coverage" ) {
						const coverage = await getCoverageForAllIterations( evoRunConfig, evolutionRunId, stepSize, scoreThreshold );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].coverage = coverage;
						console.log(`Added coverage to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
						writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
					}
					if( oneAnalysisOperation === "score-matrices" ) {
						const {scoreMatrices, coveragePercentage} = await getScoreMatricesForAllIterations( evoRunConfig, evolutionRunId, stepSize, terrainName, false/*includeGenomeId*/ );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].scoreMatrices = scoreMatrices;
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].coveragePercentage = coveragePercentage;
						console.log(`Added score matrices to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
						writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
					}
					if( oneAnalysisOperation === "score-and-genome-matrices" ) {
						const {scoreMatrices, coveragePercentage, evolutionRunConfig} = await getScoreMatricesForAllIterations( evoRunConfig, evolutionRunId, stepSize, terrainName, true/*includeGenomeId*/ );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].scoreAndGenomeMatrices = scoreMatrices;
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].coveragePercentage = coveragePercentage;
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].evolutionRunConfig = evolutionRunConfig;
						console.log(`Added score matrices to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
						writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
					}
					if( oneAnalysisOperation === "score-matrix" ) {
						const {scoreMatrix, coveragePercentage} = await getScoreMatrixForLastIteration( evoRunConfig, evolutionRunId, terrainName );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].scoreMatrix = scoreMatrix;
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].coveragePercentage = coveragePercentage;
						console.log(`Added score matrix to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
						writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
					}
					if( oneAnalysisOperation === "score-and-genome-matrix" ) {
						const {scoreMatrix, coveragePercentage, evolutionRunConfig} = await getScoreMatrixForLastIteration( evoRunConfig, evolutionRunId, terrainName, true/*includeGenomeId*/ );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].scoreAndGenomeMatrix = scoreMatrix;
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].coveragePercentage = coveragePercentage;
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].evolutionRunConfig = evolutionRunConfig;
						console.log(`Added score matrix to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
						writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
					}
					if( oneAnalysisOperation === "new-elite-count") {
						const newEliteCount = await getNewEliteCountForAllIterations( evoRunConfig, evolutionRunId, stepSize );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].newEliteCount = newEliteCount;
						console.log(`Added new elite count to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
						writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
					}
					if( oneAnalysisOperation === "elite-generations" ) {
						const eliteGenerations = await getCellSaturationGenerations( evoRunConfig, evolutionRunId );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].eliteGenerationsLabeled = eliteGenerations;
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].eliteGenerations = Object.values(eliteGenerations);
						console.log(`Added elite generations to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
						writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
					}
					if( oneAnalysisOperation === "genome-sets" ) {
						const genomeSets = await getGenomeCountsForAllIterations( evoRunConfig, evolutionRunId, stepSize );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].genomeSets = genomeSets;
						console.log(`Added genome sets to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
						writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
					}
					if( oneAnalysisOperation === "genome-sets-through-rendering-variations" ) {
						const genomeSetsThroughRenderingVariations = await getGenomeCountsWithRenderingVariationsAsContainerDimensionsForAllIterations( evoRunConfig, evolutionRunId, stepSize );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].genomeSetsThroughRenderingVariations = genomeSetsThroughRenderingVariations;
						console.log(`Added genome sets through rendering variations to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
						writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
					}
					if( oneAnalysisOperation == "variance" ) {
						const scoreVariances = await getScoreVarianceForAllIterations( evoRunConfig, evolutionRunId, stepSize );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].scoreVariances = scoreVariances;
						console.log(`Added score variances to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
						writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
					}
					if( oneAnalysisOperation == "elites-energy" ) {
						const elitesEnergy = await getElitesEnergy( evoRunConfig, evolutionRunId, stepSize, excludeEmptyCells, classRestrictionList, maxIterationIndex );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].elitesEnergy = elitesEnergy;
						console.log(`Added elites energy to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
						writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
					}
					if( oneAnalysisOperation === "goal-switches" ) {
						// TODO: make contextArrays configurable
						const contextArrays = [yamnetTags_non_musical, yamnetTags_musical];
						const goalSwitches = await getGoalSwitches( evoRunConfig, evolutionRunId, stepSize, evoParams, contextArrays );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].goalSwitches = goalSwitches;
						console.log(`Added goal switches to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
						writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
					}
					if( oneAnalysisOperation === "goal-switches-through-lineages" ) {
						// TODO: make contextArrays configurable
						const contextArrays = [yamnetTags_non_musical, yamnetTags_musical];
						const goalSwitchesThroughLineages = await getGoalSwitchesThroughLineages( evoRunConfig, evolutionRunId, evoParams, contextArrays );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].goalSwitchesThroughLineages = goalSwitchesThroughLineages;
						console.log(`Added goal switches through lineages to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
						writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
					}
					if( oneAnalysisOperation === "lineage" ) {
						// const lineage = await getLineageGraphData( evoRunConfig, evolutionRunId, stepSize );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].lineage = lineage;
						console.log(`Added lineage to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
						writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
					}
					if( oneAnalysisOperation === "duration-pitch-delta-velocity-combinations" ) {
						const durationPitchDeltaVelocityCombinations = await getDurationPitchDeltaVelocityCombinations( evoRunConfig, evolutionRunId, stepSize, uniqueGenomes );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].durationPitchDeltaVelocityCombinations = durationPitchDeltaVelocityCombinations;
						console.log(`Added duration delta pitch combinations to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
						writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
					}
				}
			}
		}

		// aggregate iterations
		evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"] = {};
		for( const oneAnalysisOperation of analysisOperationsList ) {
			if( oneAnalysisOperation === "diversity-measures" ) {
				// assume diversityMeasures is an object with keys for each terrain / eliteMap
				const diversityMeasuresAcrossIterations = {};
				for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
					const { diversityMeasures } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
					for( const oneTerrainName in diversityMeasures ) {
						if( ! diversityMeasuresAcrossIterations[oneTerrainName] ) {
							diversityMeasuresAcrossIterations[oneTerrainName] = [];
						}
						diversityMeasuresAcrossIterations[oneTerrainName].push( diversityMeasures[oneTerrainName] );
					}
				}
				for( const oneTerrainName in diversityMeasuresAcrossIterations ) {
					evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["diversityMeasures"] = {};
					evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["diversityMeasures"][oneTerrainName] = {};
					evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["diversityMeasures"][oneTerrainName]["means"] = mean( diversityMeasuresAcrossIterations[oneTerrainName], 0 );
					evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["diversityMeasures"][oneTerrainName]["variances"] = variance( diversityMeasuresAcrossIterations[oneTerrainName], 0 );
					evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["diversityMeasures"][oneTerrainName]["stdDevs"] = std( diversityMeasuresAcrossIterations[oneTerrainName], 0 );
				}
				writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
			}
			if( oneAnalysisOperation === "grid-mean-fitness" ) {
				// assume gridMeanFitness is an object with keys for each terrain / eliteMap
				const gridMeanFitnessAcrossIterations = {};
				for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
					const { gridMeanFitness } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
					for( const oneTerrainName in gridMeanFitness ) {
						if( ! gridMeanFitnessAcrossIterations[oneTerrainName] ) {
							gridMeanFitnessAcrossIterations[oneTerrainName] = [];
						}
						gridMeanFitnessAcrossIterations[oneTerrainName].push( gridMeanFitness[oneTerrainName] );
					}
				}
				for( const oneTerrainName in gridMeanFitnessAcrossIterations ) {
					evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["gridMeanFitness"] = {};
					evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["gridMeanFitness"][oneTerrainName] = {};
					evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["gridMeanFitness"][oneTerrainName]["means"] = mean( gridMeanFitnessAcrossIterations[oneTerrainName], 0 );
					evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["gridMeanFitness"][oneTerrainName]["variances"] = variance( gridMeanFitnessAcrossIterations[oneTerrainName], 0 );
					evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["gridMeanFitness"][oneTerrainName]["stdDevs"] = std( gridMeanFitnessAcrossIterations[oneTerrainName], 0 );
				}
				writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
			}
			if( oneAnalysisOperation === "qd-scores" ) {
				console.log("aggregating qd scores for evolution run #", currentEvolutionRunIndex, "...");
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["qdScores"] = {};
				if( Array.isArray(evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[0].qdScores) ) {
					const qdScoresAcrossIterations = [];
					for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
						// sum each iteration's qd scores
						const { qdScores } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
						qdScoresAcrossIterations.push( qdScores );
					}
					evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["qdScores"]["means"] = mean( qdScoresAcrossIterations, 0 );
					evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["qdScores"]["variances"] = variance( qdScoresAcrossIterations, 0 );
					evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["qdScores"]["stdDevs"] = std( qdScoresAcrossIterations, 0 );
				} else {
					// assume qdScores is an object with keys for each terrain / eliteMap
					const qdScoresAcrossIterations = {};
					for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
						// sum each iteration's qd scores
						const { qdScores } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
						for( const oneTerrainName in qdScores ) {	
							if( ! qdScoresAcrossIterations[oneTerrainName] ) {
								qdScoresAcrossIterations[oneTerrainName] = [];
							}
							qdScoresAcrossIterations[oneTerrainName].push( qdScores[oneTerrainName] );
						}
					}
					for( const oneTerrainName in qdScoresAcrossIterations ) {
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["qdScores"][oneTerrainName] = {};
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["qdScores"][oneTerrainName]["means"] = mean( qdScoresAcrossIterations[oneTerrainName], 0 );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["qdScores"][oneTerrainName]["variances"] = variance( qdScoresAcrossIterations[oneTerrainName], 0 );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["qdScores"][oneTerrainName]["stdDevs"] = std( qdScoresAcrossIterations[oneTerrainName], 0 );
					}
				}
				writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
			}
			if( oneAnalysisOperation === "genome-statistics" ) {
				console.log("aggregating genome statistics for evolution run #", currentEvolutionRunIndex, "...");
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"] = {};
				const averageCppnNodeCountsAcrossIterations = [];
				const averageCppnConnectionCountsAcrossIterations = [];
				const averageAsNEATPatchNodeCountsAcrossIterations = [];
				const averageAsNEATPatchConnectionCountsAcrossIterations = [];
				
				const averageNetworkOuputsCountsAcrossIterations = [];
				const averageFrequencyRangesCountsAcrossIterations = [];
				const cppnCountsAcrossIterations = [];

				const cppnNodeTypeCountObjectsAcrossIterations = [];
				const asNEATPatchNodeTypeCountObjectsAcrossIterations = [];
				for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
					const { genomeStatistics } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
					averageCppnNodeCountsAcrossIterations.push( genomeStatistics.map( statsAtEvoIt => statsAtEvoIt.averageCppnNodeCount ) );
					averageCppnConnectionCountsAcrossIterations.push( genomeStatistics.map( statsAtEvoIt => statsAtEvoIt.averageCppnConnectionCount ) );
					averageAsNEATPatchNodeCountsAcrossIterations.push( genomeStatistics.map( statsAtEvoIt => statsAtEvoIt.averageAsNEATPatchNodeCount ) );
					averageAsNEATPatchConnectionCountsAcrossIterations.push( genomeStatistics.map( statsAtEvoIt => statsAtEvoIt.averageAsNEATPatchConnectionCount ) );

					averageNetworkOuputsCountsAcrossIterations.push( genomeStatistics.map( statsAtEvoIt => statsAtEvoIt.averageNetworkOutputsCount ) );
					averageFrequencyRangesCountsAcrossIterations.push( genomeStatistics.map( statsAtEvoIt => statsAtEvoIt.averageFrequencyRangesCount ) );
					cppnCountsAcrossIterations.push( genomeStatistics.map( statsAtEvoIt => statsAtEvoIt.cppnCount ) );

					cppnNodeTypeCountObjectsAcrossIterations.push( genomeStatistics[genomeStatistics.length-1].cppnNodeTypeCounts );
					asNEATPatchNodeTypeCountObjectsAcrossIterations.push( genomeStatistics[genomeStatistics.length-1].asNEATPatchNodeTypeCounts );
				}
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageCppnNodeCounts"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageCppnNodeCounts"]["means"] = mean( averageCppnNodeCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageCppnNodeCounts"]["variances"] = variance( averageCppnNodeCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageCppnNodeCounts"]["stdDevs"] = std( averageCppnNodeCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageCppnConnectionCounts"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageCppnConnectionCounts"]["means"] = mean( averageCppnConnectionCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageCppnConnectionCounts"]["variances"] = variance( averageCppnConnectionCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageCppnConnectionCounts"]["stdDevs"] = std( averageCppnConnectionCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageAsNEATPatchNodeCounts"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageAsNEATPatchNodeCounts"]["means"] = mean( averageAsNEATPatchNodeCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageAsNEATPatchNodeCounts"]["variances"] = variance( averageAsNEATPatchNodeCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageAsNEATPatchNodeCounts"]["stdDevs"] = std( averageAsNEATPatchNodeCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageAsNEATPatchConnectionCounts"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageAsNEATPatchConnectionCounts"]["means"] = mean( averageAsNEATPatchConnectionCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageAsNEATPatchConnectionCounts"]["variances"] = variance( averageAsNEATPatchConnectionCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageAsNEATPatchConnectionCounts"]["stdDevs"] = std( averageAsNEATPatchConnectionCountsAcrossIterations, 0 );

				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageNetworkOutputsCounts"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageNetworkOutputsCounts"]["means"] = mean( averageNetworkOuputsCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageNetworkOutputsCounts"]["variances"] = variance( averageNetworkOuputsCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageNetworkOutputsCounts"]["stdDevs"] = std( averageNetworkOuputsCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageFrequencyRangesCounts"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageFrequencyRangesCounts"]["means"] = mean( averageFrequencyRangesCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageFrequencyRangesCounts"]["variances"] = variance( averageFrequencyRangesCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageFrequencyRangesCounts"]["stdDevs"] = std( averageFrequencyRangesCountsAcrossIterations, 0 );

				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["cppnCounts"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["cppnCounts"]["means"] = mean( cppnCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["cppnCounts"]["variances"] = variance( cppnCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["cppnCounts"]["stdDevs"] = std( cppnCountsAcrossIterations, 0 );

				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["cppnNodeTypeCounts"] = averageAttributes( cppnNodeTypeCountObjectsAcrossIterations );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["cppnNodeTypeCountsStdDevs"] = standardDeviationAttributes( cppnNodeTypeCountObjectsAcrossIterations, 0 );	
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["asNEATPatchNodeTypeCounts"] = averageAttributes( asNEATPatchNodeTypeCountObjectsAcrossIterations );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["asNEATPatchNodeTypeCountsStdDevs"] = standardDeviationAttributes( asNEATPatchNodeTypeCountObjectsAcrossIterations, 0 );

				writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
			}
			if( oneAnalysisOperation === "cell-scores" ) {
				console.log("aggregating cell scores for evolution run #", currentEvolutionRunIndex, "...");
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["cellScores"] = {};
				const cellScoreSums = new Array( currentEvoConfig.iterations.length );
				const cellScoresAcrossIterations = [];
				for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
					const { cellScores } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
					cellScoresAcrossIterations.push( cellScores );
				}
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["cellScores"]["means"] = mean( cellScoresAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["cellScores"]["variances"] = variance( cellScoresAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["cellScores"]["stdDevs"] = std( cellScoresAcrossIterations, 0 );

				writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
			}
			if( oneAnalysisOperation === "coverage" ) {
				console.log("aggregating coverage for evolution run #", currentEvolutionRunIndex, "...");
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["coverage"] = {};

				if( Array.isArray(evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[0].coverage) ) {
					const coverageAcrossIterations = [];
					for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
						const { coverage } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
						coverageAcrossIterations.push( coverage );
					}
					evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["coverage"]["means"] = mean( coverageAcrossIterations, 0 );
					evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["coverage"]["variances"] = variance( coverageAcrossIterations, 0 );
					evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["coverage"]["stdDevs"] = std( coverageAcrossIterations, 0 );
				} else {
					// assume coverage is an object with keys for each terrain / eliteMap
					const coverageAcrossIterations = {};
					for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
						const { coverage } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
						for( const oneTerrainName in coverage ) {
							if( ! coverageAcrossIterations[oneTerrainName] ) {
								coverageAcrossIterations[oneTerrainName] = [];
							}
							coverageAcrossIterations[oneTerrainName].push( coverage[oneTerrainName] );
						}
					}
					for( const oneTerrainName in coverageAcrossIterations ) {
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["coverage"][oneTerrainName] = {};
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["coverage"][oneTerrainName]["means"] = mean( coverageAcrossIterations[oneTerrainName], 0 );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["coverage"][oneTerrainName]["variances"] = variance( coverageAcrossIterations[oneTerrainName], 0 );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["coverage"][oneTerrainName]["stdDevs"] = std( coverageAcrossIterations[oneTerrainName], 0 );
					}
				}
				writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
			}
			if( oneAnalysisOperation === "new-elite-count") {
				console.log("aggregating new elite count for evolution run #", currentEvolutionRunIndex, "...");
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["newEliteCount"] = {};
				if( Array.isArray(evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[0].newEliteCount) ) {
					const newEliteCountAcrossIterations = [];
					for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
						const { newEliteCount } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
						newEliteCountAcrossIterations.push( newEliteCount );
					}
					evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["newEliteCount"]["means"] = mean( newEliteCountAcrossIterations, 0 );
					evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["newEliteCount"]["variances"] = variance( newEliteCountAcrossIterations, 0 );
					evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["newEliteCount"]["stdDevs"] = std( newEliteCountAcrossIterations, 0 );
				} else {
					// assume newEliteCount is an object with keys for each terrain / eliteMap
					const newEliteCountAcrossIterations = {};
					for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
						const { newEliteCount } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
						for( const oneTerrainName in newEliteCount ) {
							if( ! newEliteCountAcrossIterations[oneTerrainName] ) {
								newEliteCountAcrossIterations[oneTerrainName] = [];
							}
							newEliteCountAcrossIterations[oneTerrainName].push( newEliteCount[oneTerrainName] );
						}
					}
					for( const oneTerrainName in newEliteCountAcrossIterations ) {
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["newEliteCount"][oneTerrainName] = {};
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["newEliteCount"][oneTerrainName]["means"] = mean( newEliteCountAcrossIterations[oneTerrainName], 0 );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["newEliteCount"][oneTerrainName]["variances"] = variance( newEliteCountAcrossIterations[oneTerrainName], 0 );
						evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["newEliteCount"][oneTerrainName]["stdDevs"] = std( newEliteCountAcrossIterations[oneTerrainName], 0 );
					}
				}
				writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
			}
			if( oneAnalysisOperation === "genome-sets" ) {
				console.log("aggregating genome sets for evolution run #", currentEvolutionRunIndex, "...");
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"] = {};
				const genomeCountsAcrossIterations = [];
				const nodeAndConnectionCountSetAcrossIterations = [];
				const genomeSetsAdditionsAcrossIterations = [];
				const genomeSetsRemovalsAcrossIterations = [];
				for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
					const { genomeSets } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
					let { genomeCount, nodeAndConnectionCountSetCount, genomeSetsAdditions, genomeSetsRemovals } = genomeSets;
					genomeCountsAcrossIterations.push( genomeCount );
					nodeAndConnectionCountSetAcrossIterations.push( nodeAndConnectionCountSetCount );
					// replace undefined array elements with zeros
					for( let i = 0; i < genomeSetsAdditions.length; i++ ) {
						if( genomeSetsAdditions[i] === undefined ) genomeSetsAdditions[i] = 0;
					}
					genomeSetsAdditionsAcrossIterations.push( genomeSetsAdditions );
					// replace undefined values with 0
					for( let i = 0; i < genomeSetsRemovals.length; i++ ) {
						if( genomeSetsRemovals[i] === undefined ) genomeSetsRemovals[i] = 0;
					}
					genomeSetsRemovalsAcrossIterations.push( genomeSetsRemovals );
				}
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeCounts"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeCounts"]["means"] = mean( genomeCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeCounts"]["variances"] = variance( genomeCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeCounts"]["stdDevs"] = std( genomeCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["nodeAndConnectionCountSetCounts"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["nodeAndConnectionCountSetCounts"]["means"] = mean( nodeAndConnectionCountSetAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["nodeAndConnectionCountSetCounts"]["variances"] = variance( nodeAndConnectionCountSetAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["nodeAndConnectionCountSetCounts"]["stdDevs"] = std( nodeAndConnectionCountSetAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeSetsAdditions"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeSetsAdditions"]["means"] = mean( genomeSetsAdditionsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeSetsAdditions"]["variances"] = variance( genomeSetsAdditionsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeSetsAdditions"]["stdDevs"] = std( genomeSetsAdditionsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeSetsRemovals"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeSetsRemovals"]["means"] = mean( genomeSetsRemovalsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeSetsRemovals"]["variances"] = variance( genomeSetsRemovalsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeSetsRemovals"]["stdDevs"] = std( genomeSetsRemovalsAcrossIterations, 0 );
				
				writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
			}
			if( oneAnalysisOperation === "genome-sets-through-rendering-variations" ) {
				console.log("aggregating genome sets through rendering variations for evolution run #", currentEvolutionRunIndex, "...");
				function calculateGenomeCountStatistics(data) {
					// Extract all genomeCount arrays
					const genomeCounts = data.map(item => item.genomeSetsThroughRenderingVariations.genomeCount);
				
					// Determine the number of positions in genomeCount
					const numPositions = genomeCounts[0].length;
				
					// Initialize arrays to store statistics for each position
					const positionStats = Array(numPositions).fill().map(() => ({
						sums: {},
						sumOfSquares: {},
						counts: {}
					}));
				
					// Iterate through all genomeCount arrays
					genomeCounts.forEach(genomeCountArray => {
						genomeCountArray.forEach((obj, position) => {
							Object.entries(obj).forEach(([key, value]) => {
								if (!positionStats[position].sums[key]) {
									positionStats[position].sums[key] = 0;
									positionStats[position].sumOfSquares[key] = 0;
									positionStats[position].counts[key] = 0;
								}
								positionStats[position].sums[key] += value;
								positionStats[position].sumOfSquares[key] += value * value;
								positionStats[position].counts[key]++;
							});
						});
					});
				
					// Calculate means, variances, and standard deviations for each position
					const means = [];
					const variances = [];
					const stdDevs = [];
				
					positionStats.forEach((stats, position) => {
						means[position] = {};
						variances[position] = {};
						stdDevs[position] = {};
				
						Object.keys(stats.sums).forEach(key => {
							const mean = stats.sums[key] / stats.counts[key];
							means[position][key] = mean;
				
							const variance = (stats.sumOfSquares[key] / stats.counts[key]) - (mean * mean);
							variances[position][key] = variance;
				
							stdDevs[position][key] = Math.sqrt(variance);
						});
					});
				
					// Structure the results
					return {
						aggregates: {
							genomeSetsThroughRenderingVariations: {
								genomeCount: {
									means,
									variances,
									stdDevs
								}
							}
						}
					};
				}
				const genomeSetsThroughRenderingVariations = calculateGenomeCountStatistics(evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations);
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSetsThroughRenderingVariations"] = genomeSetsThroughRenderingVariations.aggregates.genomeSetsThroughRenderingVariations;
				writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
			}
			if( oneAnalysisOperation == "elites-energy" ) {
				console.log("aggregating elites energy for evolution run #", currentEvolutionRunIndex, "...");
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["elitesEnergy"] = {};
				const averageEnergiesAcrossIterations = [];
				const eliteIterationEnergiesAcrossIterations = [];
				for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
					const { elitesEnergy } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
					const { averageEnergy, eliteIterationEnergies } = elitesEnergy;
					averageEnergiesAcrossIterations.push( averageEnergy );
					eliteIterationEnergiesAcrossIterations.push( eliteIterationEnergies );
				}
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["elitesEnergy"]["averageEnergies"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["elitesEnergy"]["averageEnergies"]["means"] = mean( averageEnergiesAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["elitesEnergy"]["averageEnergies"]["variances"] = variance( averageEnergiesAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["elitesEnergy"]["averageEnergies"]["stdDevs"] = std( averageEnergiesAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["elitesEnergy"]["eliteIterationEnergies"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["elitesEnergy"]["eliteIterationEnergies"]["means"] = mean( eliteIterationEnergiesAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["elitesEnergy"]["eliteIterationEnergies"]["variances"] = variance( eliteIterationEnergiesAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["elitesEnergy"]["eliteIterationEnergies"]["stdDevs"] = std( eliteIterationEnergiesAcrossIterations, 0 );

				writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
			}
			if( oneAnalysisOperation === "goal-switches" ) {
				console.log("aggregating goal switches for evolution run #", currentEvolutionRunIndex, "...");
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"] = {};
				const averageChampionCountsAcrossIterations = [];
				const averageGoalSwitchCountsAcrossIterations = [];
				const goalSwitchScoreCorrelationsAcrossIterations = [];
				const averageContextSwitchCountAcrossIterations = [];
				const averageContextDwellCountAcrossIterations = [];
				const contextSwitchDwellRatioAcrossIterations = [];
				for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
					const { goalSwitches } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
					const { 
						averageChampionCount, averageGoalSwitchCount, 
						goalSwitchScoreCorrelation, 
						averageContextSwitchCount, averageContextDwellCount, contextSwitchDwellRatio
					} = goalSwitches;
					averageChampionCountsAcrossIterations.push( averageChampionCount );
					averageGoalSwitchCountsAcrossIterations.push( averageGoalSwitchCount );
					goalSwitchScoreCorrelationsAcrossIterations.push( goalSwitchScoreCorrelation );
					averageContextSwitchCountAcrossIterations.push( averageContextSwitchCount );
					averageContextDwellCountAcrossIterations.push( averageContextDwellCount );
					contextSwitchDwellRatioAcrossIterations.push( contextSwitchDwellRatio );
				}
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageChampionCounts"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageChampionCounts"]["means"] = mean( averageChampionCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageChampionCounts"]["variances"] = variance( averageChampionCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageChampionCounts"]["stdDevs"] = std( averageChampionCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageGoalSwitchCounts"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageGoalSwitchCounts"]["means"] = mean( averageGoalSwitchCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageGoalSwitchCounts"]["variances"] = variance( averageGoalSwitchCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageGoalSwitchCounts"]["stdDevs"] = std( averageGoalSwitchCountsAcrossIterations, 0 );

				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["goalSwitchScoreCorrelations"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["goalSwitchScoreCorrelations"]["means"] = mean( goalSwitchScoreCorrelationsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["goalSwitchScoreCorrelations"]["variances"] = variance( goalSwitchScoreCorrelationsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["goalSwitchScoreCorrelations"]["stdDevs"] = std( goalSwitchScoreCorrelationsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageContextSwitchCount"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageContextSwitchCount"]["means"] = mean( averageContextSwitchCountAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageContextSwitchCount"]["variances"] = variance( averageContextSwitchCountAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageContextSwitchCount"]["stdDevs"] = std( averageContextSwitchCountAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageContextDwellCount"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageContextDwellCount"]["means"] = mean( averageContextDwellCountAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageContextDwellCount"]["variances"] = variance( averageContextDwellCountAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageContextDwellCount"]["stdDevs"] = std( averageContextDwellCountAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["contextSwitchDwellRatio"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["contextSwitchDwellRatio"]["means"] = mean( contextSwitchDwellRatioAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["contextSwitchDwellRatio"]["variances"] = variance( contextSwitchDwellRatioAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["contextSwitchDwellRatio"]["stdDevs"] = std( contextSwitchDwellRatioAcrossIterations, 0 );

				writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
			}
			if( oneAnalysisOperation === "goal-switches-through-lineages" ) {
				console.log("aggregating goal switches through lineages for evolution run #", currentEvolutionRunIndex, "...");
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"] = {};
				const averageGoalSwitchCountsAcrossIterations = [];
				const goalSwitchScoreCorrelationsAcrossIterations = [];
				const averageContextSwitchCountsAcrossIterations = [];
				const averageContextDwellCountsAcrossIterations = [];
				const contextSwitchDwellRatiosAcrossIterations = [];
				for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
					const { goalSwitchesThroughLineages } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
					const { 
						goalSwitchesToCells, averageGoalSwitchCount,
						goalSwitchScoreCorrelation,
						averageContextSwitchCount, averageContextDwellCount, contextSwitchDwellRatio
					} = goalSwitchesThroughLineages;
					averageGoalSwitchCountsAcrossIterations.push( averageGoalSwitchCount );
					goalSwitchScoreCorrelationsAcrossIterations.push( goalSwitchScoreCorrelation );
					averageContextSwitchCountsAcrossIterations.push( averageContextSwitchCount );
					averageContextDwellCountsAcrossIterations.push( averageContextDwellCount );
					contextSwitchDwellRatiosAcrossIterations.push( contextSwitchDwellRatio );
				}
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageGoalSwitchCounts"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageGoalSwitchCounts"]["means"] = mean( averageGoalSwitchCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageGoalSwitchCounts"]["variances"] = variance( averageGoalSwitchCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageGoalSwitchCounts"]["stdDevs"] = std( averageGoalSwitchCountsAcrossIterations, 0 );

				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageGoalSwitchScoreCorrelations"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageGoalSwitchScoreCorrelations"]["means"] = mean( goalSwitchScoreCorrelationsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageGoalSwitchScoreCorrelations"]["variances"] = variance( goalSwitchScoreCorrelationsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageGoalSwitchScoreCorrelations"]["stdDevs"] = std( goalSwitchScoreCorrelationsAcrossIterations, 0 );

				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageContextSwitchCounts"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageContextSwitchCounts"]["means"] = mean( averageContextSwitchCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageContextSwitchCounts"]["variances"] = variance( averageContextSwitchCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageContextSwitchCounts"]["stdDevs"] = std( averageContextSwitchCountsAcrossIterations, 0 );

				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageContextDwellCounts"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageContextDwellCounts"]["means"] = mean( averageContextDwellCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageContextDwellCounts"]["variances"] = variance( averageContextDwellCountsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageContextDwellCounts"]["stdDevs"] = std( averageContextDwellCountsAcrossIterations, 0 );

				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["contextSwitchDwellRatios"] = {};
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["contextSwitchDwellRatios"]["means"] = mean( contextSwitchDwellRatiosAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["contextSwitchDwellRatios"]["variances"] = variance( contextSwitchDwellRatiosAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["contextSwitchDwellRatios"]["stdDevs"] = std( contextSwitchDwellRatiosAcrossIterations, 0 );

				writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
			}
			if( oneAnalysisOperation === "elite-generations" ) {
				console.log("aggregating elite generations for evolution run #", currentEvolutionRunIndex, "...");
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["eliteGenerations"] = {};
				const eliteGenerationsAcrossIterations = [];
				for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
					const { eliteGenerations } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
					eliteGenerationsAcrossIterations.push( eliteGenerations );
				}
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["eliteGenerations"]["means"] = mean( eliteGenerationsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["eliteGenerations"]["variances"] = variance( eliteGenerationsAcrossIterations, 0 );
				evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["eliteGenerations"]["stdDevs"] = std( eliteGenerationsAcrossIterations, 0 );

				writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
			}
		}
	}

	// Aggregate metrics for this evolution run
	aggregatePhylogeneticMetrics(evoRunsAnalysis, currentEvolutionRunIndex, analysisOperationsList);

  // Run comparison between all runs if requested
  if (analysisOperationsList.includes("phylogenetic-comparison") && runIdsForComparison.length > 1) {
    console.log("Running phylogenetic comparison between all runs...");
    try {
      const comparisonResults = await comparePhylogeneticMetrics(
        getEvolutionRunConfig(evoRunsConfig.baseEvolutionRunConfigFile), 
        runIdsForComparison
      );
      evoRunsAnalysis.phylogeneticComparison = comparisonResults;
      writeAnalysisResult(analysisResultFilePath, evoRunsAnalysis);
    } catch (error) {
      console.error("Error during phylogenetic comparison:", error);
    }
  }

	// Check if aggregate comparison was requested
	if (analysisOperationsList.includes("phylogenetic-aggregate-comparison")) {
		console.log("Running phylogenetic comparison between configuration types...");
		try {
			const comparisonResults = await comparePhylogeneticMetricsAcrossConfigurations(
				evoRunsConfig, 
				evoRunsAnalysis,
				writeToFolder === './' ? 
					`${path.dirname(evoRunsConfig.baseEvolutionRunConfigFile)}/phylogenetic-configuration-comparison.json` : 
					`${writeToFolder}/phylogenetic-configuration-comparison.json`
			);
			evoRunsAnalysis.phylogeneticConfigurationComparison = comparisonResults;
			writeAnalysisResult(analysisResultFilePath, evoRunsAnalysis);
		} catch (error) {
			console.error("Error during phylogenetic configuration comparison:", error);
		}
	}
  
  return evoRunsAnalysis;
}

/**
 * Aggregate phylogenetic metrics across iterations of an evolution run
 */
function aggregatePhylogeneticMetrics(evoRunsAnalysis, currentEvolutionRunIndex, analysisOperationsList) {
  // Skip if no iterations to aggregate
  if (!evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations.length) return;
  
  // Initialize aggregates object if needed
  if (!evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates) {
    evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates = {};
  }
  
  // Aggregate phylogenetic metrics if they exist
  if (analysisOperationsList.includes("phylogenetic-metrics")) {
    console.log(`Aggregating phylogenetic metrics for evolution run #${currentEvolutionRunIndex}...`);
    
    const phylogeneticMetricsAcrossIterations = [];
    
    for (let i = 0; i < evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations.length; i++) {
      const iteration = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[i];
      if (iteration.phylogeneticMetrics) {
        phylogeneticMetricsAcrossIterations.push(iteration.phylogeneticMetrics);
      }
    }
    
    if (phylogeneticMetricsAcrossIterations.length > 0) {
      // Create aggregate structure
      const aggregatedMetrics = {
        treeSize: {
          extantLineages: {
            mean: mean(phylogeneticMetricsAcrossIterations.map(m => m.metrics.extantLineages)),
            stdDev: std(phylogeneticMetricsAcrossIterations.map(m => m.metrics.extantLineages))
          },
          totalSamples: {
            mean: mean(phylogeneticMetricsAcrossIterations.map(m => m.metrics.totalSamples)),
            stdDev: std(phylogeneticMetricsAcrossIterations.map(m => m.metrics.totalSamples))
          },
          uniqueLineages: {
            mean: mean(phylogeneticMetricsAcrossIterations.map(m => m.metrics.uniqueLineages)),
            stdDev: std(phylogeneticMetricsAcrossIterations.map(m => m.metrics.uniqueLineages))
          }
        },
        events: {
          births: {
            mean: mean(phylogeneticMetricsAcrossIterations.map(m => m.metrics.events.birthCount)),
            stdDev: std(phylogeneticMetricsAcrossIterations.map(m => m.metrics.events.birthCount))
          },
          deaths: {
            mean: mean(phylogeneticMetricsAcrossIterations.map(m => m.metrics.events.deathCount)),
            stdDev: std(phylogeneticMetricsAcrossIterations.map(m => m.metrics.events.deathCount))
          },
          extinctions: {
            mean: mean(phylogeneticMetricsAcrossIterations.map(m => m.metrics.events.extinctionCount)),
            stdDev: std(phylogeneticMetricsAcrossIterations.map(m => m.metrics.events.extinctionCount))
          }
        },
        shape: {
          sackinIndex: {
            mean: mean(phylogeneticMetricsAcrossIterations.map(m => m.metrics.shape.sackinIndex)),
            stdDev: std(phylogeneticMetricsAcrossIterations.map(m => m.metrics.shape.sackinIndex))
          },
          collessIndex: {
            mean: mean(phylogeneticMetricsAcrossIterations.map(m => m.metrics.shape.collessIndex)),
            stdDev: std(phylogeneticMetricsAcrossIterations.map(m => m.metrics.shape.collessIndex))
          }
        },
        terrainTransitions: {
          terrainAdaptability: {
            mean: mean(phylogeneticMetricsAcrossIterations.map(m => m.metrics.terrainTransitions.terrainAdaptability)),
            stdDev: std(phylogeneticMetricsAcrossIterations.map(m => m.metrics.terrainTransitions.terrainAdaptability))
          }
        },
        densityDependence: {
          correlation: {
            mean: mean(phylogeneticMetricsAcrossIterations.map(m => m.metrics.densityDependence.densityDependenceCorrelation)),
            stdDev: std(phylogeneticMetricsAcrossIterations.map(m => m.metrics.densityDependence.densityDependenceCorrelation))
          },
          isDensityDependent: {
            // Calculate percentage of runs that are density-dependent
            percentage: (phylogeneticMetricsAcrossIterations.filter(m => 
              m.metrics.densityDependence.isDensityDependent).length / 
              phylogeneticMetricsAcrossIterations.length) * 100
          }
        }
      };
      
      evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.phylogeneticMetrics = aggregatedMetrics;
    }
  }
  
  // Aggregate terrain transitions if they exist
  if (analysisOperationsList.includes("terrain-transitions")) {
    console.log(`Aggregating terrain transitions for evolution run #${currentEvolutionRunIndex}...`);
    
    const terrainTransitionsAcrossIterations = [];
    
    for (let i = 0; i < evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations.length; i++) {
      const iteration = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[i];
      if (iteration.terrainTransitions) {
        terrainTransitionsAcrossIterations.push(iteration.terrainTransitions);
      }
    }
    
    if (terrainTransitionsAcrossIterations.length > 0) {
      // Calculate mean values
      const terrainAdaptability = mean(terrainTransitionsAcrossIterations.map(
        t => t.terrainMetrics.terrainAdaptability));
      
      const multiTerrainGenomeCount = mean(terrainTransitionsAcrossIterations.map(
        t => t.terrainMetrics.multiTerrainGenomeCount));
      
      evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.terrainTransitions = {
        terrainAdaptability,
        multiTerrainGenomeCount
      };
    }
  }
  
  // Aggregate density dependence if it exists
  if (analysisOperationsList.includes("density-dependence")) {
    console.log(`Aggregating density dependence for evolution run #${currentEvolutionRunIndex}...`);
    
    const densityDependenceAcrossIterations = [];
    
    for (let i = 0; i < evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations.length; i++) {
      const iteration = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[i];
      if (iteration.densityDependence) {
        densityDependenceAcrossIterations.push(iteration.densityDependence);
      }
    }
    
    if (densityDependenceAcrossIterations.length > 0) {
      const correlation = mean(densityDependenceAcrossIterations.map(
        d => d.densityDependenceCorrelation));
      
      const isDensityDependentPercentage = (densityDependenceAcrossIterations.filter(
        d => d.isDensityDependent).length / densityDependenceAcrossIterations.length) * 100;
      
      evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.densityDependence = {
        correlation,
        isDensityDependentPercentage
      };
    }
  }
}

function writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis ) {
	const evoRunsAnalysisJSONString = JSON.stringify( evoRunsAnalysis, null, 2 );
	// if analysisResultFilePath does not exist, create it
	if( !fs.existsSync( analysisResultFilePath ) ) fs.mkdirSync( path.dirname(analysisResultFilePath), {recursive: true} );
	fs.writeFileSync( analysisResultFilePath, evoRunsAnalysisJSONString );
	console.log(`Wrote: ${analysisResultFilePath}`);
}

async function qdAnalysis_playEliteMap() {
	let {
		evolutionRunId, evolutionRunIteration, scoreThreshold,
		startCellKey, startCellKeyIndex,
	} = cli.flags;
	if( evolutionRunId ) {
		const evoRunConfig = getEvolutionRunConfig();
		await playAllClassesInEliteMap(
			evoRunConfig, evolutionRunId, evolutionRunIteration, scoreThreshold,
			startCellKey, startCellKeyIndex
		);
	}
}

async function qdAnalysis_playClass() {
	let {evolutionRunId, cellKey, stepSize, ascending} = cli.flags;
	if( evolutionRunId ) {
		const evoRunConfig = getEvolutionRunConfig();
		await playOneClassAcrossEvoRun( cellKey, evoRunConfig, evolutionRunId, stepSize, ascending );
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
			if( !fs.existsSync(fileNameFlag) ) fs.mkdirSync(fileNameFlag, {recursive: true});
			fileName = fileNameFlag + fileName;
		}
	}
	// fs.writeFile(fileName, content, err => {
	// 	if (err) {
	// 		console.error("writeToFile: ", err);
	// 	}
	// 	if( exitAfterWriting ) process.exit();
	// });
	fs.writeFileSync(fileName, content);
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
		evoRunConfig = {};
	}
	return evoRunConfig;
}

export function getAudioGraphMutationParams( evoParams ) {
	return evoParams && evoParams["audioGraph"] && evoParams["audioGraph"]["mutationParams"] || undefined;
}

await executeEvolutionTask();
