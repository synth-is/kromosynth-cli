#!/usr/bin/env node
import meow from 'meow';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
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
	qdAnalysis_eliteMapQDScore,
	qdAnalysis_eliteMapCellScores,
	qdAnalysis_eliteMapGenomeStatistics,
	qdAnalysis_eliteMapCoverage,
	qdAnalysis_eliteMapGenomeSets,
	qdAnalysis_eliteMapScoreVariance,
	qdAnalysis_evoRunQDScores,
	qdAnalysis_evoRunGenomeStatistics,
	qdAnalysis_evoRunCellScores,
	qdAnalysis_evoRunCoverage,
	qdAnalysis_evoRunGenomeSets,
	qdAnalysis_evoRunScoreVariances,
	qdAnalysis_evoRunCellSaturationGenerations,
	qdAnalysis_evoRunElitesEnergy,
	qdAnalysis_evoRunGoalSwitches,
	qdAnalysis_evoRunLineage,
	qdAnalysis_evoRunDurationPitchDeltaVelocityCombinations,
	qdAnalysis_evoRunPopulateKuzuDB,
	qdAnalysis_gitGC,
	qdAnalysis_percentCompletion,
	qdAnalysis_evoRuns,
	qdAnalysis_playClass,
} from './kromosynth-analysis.js';
import {
	qdAnalysis_evoRunsFromDir,
	evoRunsDirAnalysisAggregate,
	qdAnalysis_evoRunsPopulateKuzuDB
} from './kromosynth-analysis-dir.js';
import {

	renderEliteMapsTimeline
} from './qd-run-analysis.js';
import { 
	getEvolutionRunsConfig,
	readJSONFromFile,
	getEvolutionRunConfig,
	getEvoParams,
} from './kromosynth-common.js';

import {
	getAudioContext, getNewOfflineAudioContext, playAudio, SAMPLE_RATE
} from './util/rendering-common.js';
import { renderSfz } from './virtual-instrument.js';
import { 
	getCommitCount, getEliteMaps, 
	getClassLabelsWithElitesFromEliteMap
} from './util/qd-common.js';
import { readGenomeAndMetaFromDisk } from './util/qd-common-elite-map-persistence.js';
import { extractFeaturesFromAllAudioFiles } from './extract-audio-features-from-dataset.js';
import { traceLineage, findLatestDescendantsByClass } from './util/lineage.js';
import { mapEliteMapToMapWithDifferentBDs } from './util/terrain-remap.js';


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

		evo-run-populate-kuzudb
			Populate a KuzuDB database with lineage data from an evolution run

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

		evo-runs-dir-analysis
			Perform a selection of analysis steps for all evolution runs in a directory
			--concurrency-limit  Number of parallel analysis tasks to run (default: 1 for sequential processing)

		evo-runs-dir-analysis-aggregate
			Aggregate previously analyzed evolution runs data by folder type (grouped by naming pattern)

		evo-runs-populate-kuzudb
			Populate KuzuDB databases with lineage and feature data for all evolution runs in a directory
			--concurrency-limit  Number of parallel analysis tasks to run (default: 1 for sequential processing)

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
		$ kromosynth evo-run-populate-kuzudb --evolution-run-config-json-file conf/evolution-run-config.jsonc --evolution-run-id 01GWS4J7CGBWXF5GNDMFVTV0BP_3dur-7ndelt-4vel --step-size 1
		
		$ kromosynth evo-runs-populate-kuzudb --evo-runs-dir-path /Volumes/kromosynth2/kromosynth/evoruns/supervised_and_unsupervised_singleMapBDs --concurrency-limit 8
		
		$ kromosynth evo-runs-analysis --evolution-runs-config-json-file config/evolution-runs.jsonc --analysis-operations qd-scores,grid-mean-fitness,cell-scores,coverage,score-matrix,score-matrices,new-elite-count,elite-generations,genome-statistics,genome-sets,genome-sets-through-rendering-variations,variance,elites-energy,goal-switches,goal-switches-through-lineages,lineage,duration-pitch-delta-velocity-combinations,diversity-from-embeddings,diversity-at-last-iteration,diversity-measures,populate-kuzudb --step-size 100 --unique-genomes true --exclude-empty-cells true --class-restriction '["Narration, monologue"]' --max-iteration-index 300000
		
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
		evoRunsDirPath: {
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
		lineageDataFile: {
			type: 'string'
		},

		concurrencyLimit: {
			type: 'number',
			default: 1 // Default to sequential processing
		},

		forceProcessing: {
			type: 'boolean',
			default: false // force processing of all evoruns, even if they were processed before
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
			qdAnalysis_gitGC( cli );
			break;
		case "evo-runs-percent-completion":
			qdAnalysis_percentCompletion( cli );
			break;

		///// QD map analysis
		case "elite-map-qd-score":
			qdAnalysis_eliteMapQDScore( cli );
			break;
		case "elite-map-genome-statistics":
			qdAnalysis_eliteMapGenomeStatistics( cli );
			break;
		case "elite-map-cell-scores":
			qdAnalysis_eliteMapCellScores( cli );
			break;
		case "elite-map-coverage":
			qdAnalysis_eliteMapCoverage( cli );
			break;
		case "elite-map-geneome-sets":
			qdAnalysis_eliteMapGenomeSets( cli );
			break;
		case "elite-map-score-variance":
			qdAnalysis_eliteMapScoreVariance( cli );

		///// QD evo run analysis
		case "evo-run-genome-statistics":
			qdAnalysis_evoRunGenomeStatistics( cli );
			break;
		case "evo-run-qd-scores":
			qdAnalysis_evoRunQDScores( cli );
			break;
		case "evo-run-cell-scores":
			qdAnalysis_evoRunCellScores( cli );
			break;
		case "evo-run-coverage":
			qdAnalysis_evoRunCoverage( cli );
			break;
		case "evo-run-genome-sets":
			qdAnalysis_evoRunGenomeSets( cli );
			break;
		case "evo-run-score-variance":
			qdAnalysis_evoRunScoreVariances( cli );
			break;
		case "evo-run-cell-saturation-generations":
			qdAnalysis_evoRunCellSaturationGenerations( cli );
			break;
		case "evo-run-elites-energy":
			qdAnalysis_evoRunElitesEnergy( cli );
			break;
		case "evo-run-goal-switches":
			qdAnalysis_evoRunGoalSwitches( cli );
			break;
		case "evo-run-lineage":
			qdAnalysis_evoRunLineage( cli );
			break;
		case "evo-run-duration-pitch-delta-velocity-combinations":
			qdAnalysis_evoRunDurationPitchDeltaVelocityCombinations( cli );
			break;
		case "evo-run-populate-kuzudb":
			qdAnalysis_evoRunPopulateKuzuDB( cli );
			break;
			
		case "evo-run-elite-counts":
			break;
		case "evo-run-variances":
			break;

		case "evo-run-class-lineage":
			break;
		case "evo-runs-analysis":
			qdAnalysis_evoRuns( cli );
			break;
		case "evo-runs-dir-analysis":
			qdAnalysis_evoRunsFromDir( cli );
			break;
		case "evo-runs-dir-analysis-aggregate":
			evoRunsDirAnalysisAggregate( cli );
			break;
		case "evo-runs-populate-kuzudb":
			qdAnalysis_evoRunsPopulateKuzuDB( cli );
			break;

		case "evo-run-play-class":
			qdAnalysis_playClass( cli );
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
	const evoParams = getEvoParams( cli );
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
	const evoParams = getEvoParams( cli );
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
	const evoRunsConfig = getEvolutionRunsConfig( cli );
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

			const evoRunConfigMain = getEvolutionRunConfig( evoRunsConfig.baseEvolutionRunConfigFile, cli );
			const evoRunConfigDiff = getEvolutionRunConfig( currentEvoConfig.diffEvolutionRunConfigFile, cli );
			const evoRunConfig = {...evoRunConfigMain, ...evoRunConfigDiff};
			if( cli.flags.evolutionRunsConfigJsonFileRunIndex !== undefined && cli.flags.evolutionRunsConfigJsonFileRunIteration !== undefined ) {
				evoRunConfig.gRpcHostFilePathPrefix = `${evoRunConfig.gRpcHostFilePathPrefix}${cli.flags.evolutionRunsConfigJsonFileRunIndex}-${cli.flags.evolutionRunsConfigJsonFileRunIteration}-`;
			}
			

			const evoParamsMain = getEvoParams( evoRunsConfig.baseEvolutionaryHyperparametersFile, cli );
			const evoParamsDiff = getEvoParams( currentEvoConfig.diffEvolutionaryHyperparametersFile, cli );
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
	const _evoRunConfig = evoRunConfig || getEvolutionRunConfig(cli);
	const _evoParams = evoParams || getEvoParams(cli);
	await qdSearch( _evolutionRunId, _evoRunConfig, _evoParams, false );
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


export function getAudioGraphMutationParams( evoParams ) {
	return evoParams && evoParams["audioGraph"] && evoParams["audioGraph"]["mutationParams"] || undefined;
}

await executeEvolutionTask();
