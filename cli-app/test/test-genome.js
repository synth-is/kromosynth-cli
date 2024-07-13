import fs from 'fs';
import { parse } from 'jsonc-parser';
import {
  getNewAudioSynthesisGenome,
  getNewAudioSynthesisGenomeByMutation,
  getAudioBufferFromGenomeAndMeta
} from 'kromosynth';
import { getAudioContext, getNewOfflineAudioContext } from '../util/rendering-common.js';
import NodeWebAudioAPI from 'node-web-audio-api';
const { OfflineAudioContext } = NodeWebAudioAPI;
import toWav from 'audiobuffer-to-wav';

const evoParams = fs.readFileSync("/Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/conf/evolutionary-hyperparameters.jsonc", "utf8");
const evoParamsObj = parse(evoParams);
const audioGraphMutationParams = evoParamsObj["audioGraph"]["mutationParams"];

evoParamsObj.audioGraph.defaultParameters.addOscillatorNetworkOutputVsOscillatorNodeRate = 1;

let newGenome = getNewAudioSynthesisGenome(
  1,
  1,
  undefined,
  evoParamsObj,
  false
);

let genomeString;
let genomeStringMatches;
let mutationCount = 0;
const genomeOccurenceString = /ConvolverNode\\\\\\/g;
do {
  newGenome = await getNewAudioSynthesisGenomeByMutation(
    [newGenome],
    1,
    1,
    -1,
    'kromosynth',
    getAudioContext(),
    0.5,
    0.5,
    audioGraphMutationParams,
    evoParamsObj,
    OfflineAudioContext,
    0.1, // patchFitnessTestDuration
  );
  if( ! newGenome ) {
    console.log("let's start over");
    newGenome = getNewAudioSynthesisGenome(
      1,
      1,
      undefined,
      evoParamsObj,
      false
    );
  }
  genomeString = JSON.stringify(newGenome);
  genomeStringMatches = genomeString.match(new RegExp(genomeOccurenceString, 'g'));
  console.log('genomeStringMatches:', genomeStringMatches);
  mutationCount++;
  // repeat until we have a ConvolverNode
} while (
  // genomeString.indexOf(genomeOccurenceString) === -1
  // 10 occurrences of genomeOccurenceString
  ! genomeStringMatches || genomeStringMatches.length < 1
  // || 
  // genomeString.indexOf('GainNode') === -1
  //  mutationCount < 100
);

// render the genome to a wav file
const duration = 4;
const noteDelta = 0;
const velocity = 1;
const reverse = false;
const useOvertoneInharmonicityFactors = true;
const useGpu = true;
const audioBuffer = await getAudioBufferFromGenomeAndMeta(
  {genome: newGenome},
  duration, noteDelta, velocity, reverse,
  false, // asDataArray
  getNewOfflineAudioContext( duration ),
  getAudioContext(),
  useOvertoneInharmonicityFactors,
  useGpu,
);
const wav = toWav(audioBuffer);
fs.writeFileSync( '/Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/test/test.wav', Buffer.from(new Uint8Array(wav)) );

console.log('evoParams:', evoParamsObj);
console.log('newGenome:', newGenome);
console.log('genomeString:', genomeString);

process.exit(0);