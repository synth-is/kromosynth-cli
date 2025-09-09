import { 
  getAudioBufferChannelDataForGenomeAndMetaFromWebsocet 
} from '../service/websocket/ws-gene-evaluation.js';
import { readGenomeAndMetaFromDisk } from '../util/qd-common-elite-map-persistence.js';
import toWav from 'audiobuffer-to-wav';
import { getAudioContext } from '../util/rendering-common.js';
import { getAudioBuffer } from 'kromosynth';
import fs from 'fs';

// Helper function to compare Float32Arrays
function areArraysEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) {
    console.error(`Length mismatch: ${arr1.length} vs ${arr2.length}`);
    return { equal: false, mismatches: -1 };
  }
  
  let mismatchCount = 0;
  const mismatches = [];
  
  for (let i = 0; i < arr1.length; i++) {
    if (Math.abs(arr1[i] - arr2[i]) > 1e-6) {
      mismatchCount++;
      if (mismatches.length < 10) { // Show first 10 mismatches
        mismatches.push({
          index: i,
          value1: arr1[i],
          value2: arr2[i],
          difference: Math.abs(arr1[i] - arr2[i])
        });
      }
    }
  }
  
  return { 
    equal: mismatchCount === 0, 
    mismatches: mismatchCount,
    details: mismatches
  };
}

async function testPartialVsFullRender(
  genomeString, 
  duration, 
  noteDelta, 
  velocity, 
  useGPU, 
  antiAliasing, 
  frequencyUpdatesApplyToAllPathcNetworkOutputs,
  geneRenderingWebsocketServerHost,
  sampleRate,
  numPartitions
) {
  // Get full render
  const fullRender = await getAudioBufferChannelDataForGenomeAndMetaFromWebsocet(
    genomeString,
    duration,
    noteDelta,
    velocity,
    useGPU,
    antiAliasing,
    frequencyUpdatesApplyToAllPathcNetworkOutputs,
    geneRenderingWebsocketServerHost,
    sampleRate
  );

  // Get partial renders
  const totalSamples = sampleRate * duration;
  const samplesPerPartition = /*Math.floor(*/totalSamples / numPartitions /*)*/;
  const partialRenders = [];

  for (let i = 0; i < numPartitions; i++) {
    let partialRender = await getAudioBufferChannelDataForGenomeAndMetaFromWebsocet(
      genomeString,
      duration,
      noteDelta,
      velocity,
      useGPU,
      antiAliasing,
      frequencyUpdatesApplyToAllPathcNetworkOutputs,
      geneRenderingWebsocketServerHost,
      sampleRate,
      samplesPerPartition,
      i * samplesPerPartition
    );
    // partialRender = partialRender.subarray(6, partialRender.length - 6);
    partialRenders.push(partialRender);
  }

  // Concatenate partial renders
  const concatenatedPartialRenders = new Float32Array(totalSamples);
  let offset = 0;
  for (const render of partialRenders) {
    concatenatedPartialRenders.set(render, offset);
    offset += render.length;
  }

  // Compare results
  const comparison = areArraysEqual(fullRender, concatenatedPartialRenders);
  if (!comparison.equal) {
    console.error(`ERROR: Arrays differ in ${comparison.mismatches} positions out of ${fullRender.length} (${((comparison.mismatches/fullRender.length)*100).toFixed(2)}%)`);
    if (comparison.details.length > 0) {
      console.error("First few mismatches:");
      comparison.details.forEach(detail => {
        console.error(`  Index ${detail.index}: ${detail.value1} vs ${detail.value2} (diff: ${detail.difference})`);
      });
    }
  } else {
    console.log("SUCCESS: Full render and concatenated partial renders are identical!");
  }

  const audioCtx = getAudioContext(sampleRate);
  const sampleCount = duration * sampleRate;
  const audioBufferFullRender = getAudioBuffer( [fullRender], audioCtx, sampleCount);
  const audioBufferPartialRender = getAudioBuffer( [concatenatedPartialRenders], audioCtx, sampleCount);
  const audioBufferFullRenderWav = toWav(audioBufferFullRender);
  const audioBufferPartialRenderWav = toWav(audioBufferPartialRender);
  const audioBufferFullRenderWavBuffer = Buffer.from(new Uint8Array(audioBufferFullRenderWav));
  const audioBufferPartialRenderWavBuffer = Buffer.from(new Uint8Array(audioBufferPartialRenderWav));
  fs.writeFileSync("genome-rendering-full.wav", audioBufferFullRenderWavBuffer);
  fs.writeFileSync("genome-rendering-partial.wav", audioBufferPartialRenderWavBuffer);

  return { fullRender, concatenatedPartialRenders, comparison };
}

// Main execution
const genomeString = await readGenomeAndMetaFromDisk(
  "01JEFBE7HR76299N81G5CZF1J1_evoConf_singleMap_refSingleEmbeddings_x100_mfcc-statistics_pca_retrainIncr50_classDims",
  "01JEFC6Y3V6HFZNPSMNVWQ8PHW",
  "/Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/evoruns/01JEFBE7HR76299N81G5CZF1J1_evoConf_singleMap_refSingleEmbeddings_x100_mfcc-statistics_pca_retrainIncr50_classDims/"
);

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("Please provide the ws://websocket host as a command line argument.");
  process.exit(1);
}
const geneRenderingWebsocketServerHost = args[0];

// Test configuration
const duration = 10;
const noteDelta = 0;
const velocity = 1;
const antiAliasing = true;
const frequencyUpdatesApplyToAllPathcNetworkOutputs = true;
const sampleRate = 16000;
const useGPU = false;

// Ensure numPartitions is an even number
const numPartitions = /*Math.round(*/duration / 2/*)*/ * 2; // Number of parts to split the render into

// Run the test
const result = await testPartialVsFullRender(
  genomeString,
  duration,
  noteDelta,
  velocity,
  useGPU,
  antiAliasing,
  frequencyUpdatesApplyToAllPathcNetworkOutputs,
  geneRenderingWebsocketServerHost,
  sampleRate,
  numPartitions
);

console.log("Test completed.");