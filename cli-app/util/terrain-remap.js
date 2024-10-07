///// map elites from one map to another with (possibly) different Behaviour Descriptors and/or fitness evaluations
import {
  getEliteMapKey,
  readEliteMapFromDisk, getMapFromEliteKeysToGenomeIds, readGenomeAndMetaFromDisk,
  saveEliteMapToDisk
} from './qd-common-elite-map-persistence.js';
import { getFeaturesForGenomeString, getDurationNoteDeltaVelocityFromGenomeString } from './qd-common.js';
import { 
  getDiversityFromWebsocket, 
  getQualityFromWebsocketForEmbedding,
} from '../service/websocket/ws-gene-evaluation.js';

// TODO: needs separation between qualityFeatureExtractionEndpoint and projectionFeatureExtractionEndpoint

export async function mapEliteMapToMapWithDifferentBDs( 
  evolutionRunId, evoRunDirPath, terrainNameFrom, terrainNameTo,
  genomeRenderingHost,
  featureExtractionHost, qualityEvaluationFeatureExtractionEndpoint, projectionFeatureExtractionEndpoint,
  qualityEvaluationHost, qualityEvaluationEndpoint,
  projectionHost, projectionEndpoint,
  useGPU,
  sampleRate
) {
  // doing similar things as in getFeaturesAndScoresForGenomeIds ... and even getFeaturesAndScoresFromEliteMap
  // - but but not reusing those completely, as there are some idiosyncrasies
  const eliteMap = readEliteMapFromDisk( evolutionRunId, evoRunDirPath, terrainNameFrom );
  const { 
    classScoringVariationsAsContainerDimensions, antiAliasing, frequencyUpdatesApplyToAllPathcNetworkOutputs 
  } = eliteMap.evolutionRunConfig;
  let shouldCalculateSurprise = false;
  let shouldCalculateNovelty = false;
  if( eliteMap.evolutionRunConfig.classifiers[0].classConfigurations && eliteMap.evolutionRunConfig.classifiers[0].classConfigurations.length ) {
    shouldCalculateSurprise = eliteMap.evolutionRunConfig.classifiers[0].classConfigurations[0].shouldCalculateSurprise;
    shouldCalculateNovelty = eliteMap.evolutionRunConfig.classifiers[0].classConfigurations[0].shouldCalculateNovelty;
  }
  const eliteKeysToGenomeIds = getMapFromEliteKeysToGenomeIds( eliteMap );
  const qualityEvaluationFeatures = [];
  let projectionFeatures;
  let scores;
  const surpriseScores = [];
  const noveltyScores = [];
  const durationsNoteDeltasVelocities = [];
  const invalidProjectionVectors = [];
  if( terrainNameTo !== "random" ) { // "random" a special case for testing
    projectionFeatures = [];
    scores = []
    for( const [eliteKey, genomneId] of eliteKeysToGenomeIds ) {
      if( ! genomneId ) throw new Error("Genome file for eliteGenomeId not found:", genomneId);
      const genomeAndMetaString = await readGenomeAndMetaFromDisk( evolutionRunId, genomneId, evoRunDirPath );
      const { duration, noteDelta, velocity } = getDurationNoteDeltaVelocityFromGenomeString(genomeAndMetaString, eliteKey);
      durationsNoteDeltasVelocities.push( { duration, noteDelta, velocity } );
      let qualityFeaturesResponse, projectionFeaturesResponse;
      const maxRetries = 3;
      let attempt = 0;
      let success = false;

      while (attempt < maxRetries && !success) {
        try {
          if (qualityEvaluationFeatureExtractionEndpoint === projectionFeatureExtractionEndpoint) {
            const featuresResponse = await getFeaturesForGenomeString(
              genomeAndMetaString,
              duration, noteDelta, velocity,
              useGPU,
              antiAliasing,
              frequencyUpdatesApplyToAllPathcNetworkOutputs,
              genomeRenderingHost,
              featureExtractionHost, qualityEvaluationFeatureExtractionEndpoint,
              sampleRate,
              undefined // ckptDir
            );
            qualityFeaturesResponse = projectionFeaturesResponse = featuresResponse;
          } else {
            qualityFeaturesResponse = await getFeaturesForGenomeString(
              genomeAndMetaString,
              duration, noteDelta, velocity,
              useGPU,
              antiAliasing,
              frequencyUpdatesApplyToAllPathcNetworkOutputs,
              genomeRenderingHost,
              featureExtractionHost, qualityEvaluationFeatureExtractionEndpoint,
              sampleRate,
              undefined // ckptDir
            );
            projectionFeaturesResponse = await getFeaturesForGenomeString(
              genomeAndMetaString,
              duration, noteDelta, velocity,
              useGPU,
              antiAliasing,
              frequencyUpdatesApplyToAllPathcNetworkOutputs,
              genomeRenderingHost,
              featureExtractionHost, projectionFeatureExtractionEndpoint,
              sampleRate,
              undefined // ckptDir
            );
          }
          success = true;
        } catch (error) {
          console.error(`Attempt ${attempt + 1} failed:`, error);
          attempt++;
        if (attempt < maxRetries) {
          console.log(`Retrying... (${attempt + 1}/${maxRetries})`);
        } else {
          throw new Error(`Failed to get features after ${maxRetries} attempts for eliteGenomeId: ${genomneId}`);
        }
        }
      }
      if( ! qualityFeaturesResponse.features || ! projectionFeaturesResponse.features ) {
        throw new Error("Features not found for eliteGenomeId:", genomneId);
      }
      qualityEvaluationFeatures.push( qualityFeaturesResponse.features );
      projectionFeatures.push( projectionFeaturesResponse.features );
      const genomeQuality = await getQualityFromWebsocketForEmbedding(
        qualityFeaturesResponse.features,
        undefined, //refSetEmbedsPath,
        undefined, //querySetEmbedsPath,
        undefined, //measureCollectivePerformance,
        qualityEvaluationHost + qualityEvaluationEndpoint,
        undefined, //ckptDir
      );
      scores.push( genomeQuality.fitness );
      // collect vectors from projectionFeatures where any value is larger than 1
      if( projectionFeaturesResponse.features.some( v => v > 1 ) ) {
        invalidProjectionVectors.push( projectionFeatures[i] );
      }
    }
  } else {
    // generate temporary array of random two dimensional feature vectors, with values between 0 and 1
    projectionFeatures = Array.from({length: 10000}, () => Array.from({length: 2}, () => Math.random()/**(.01-0)+0*/ ));
    // generate temporary array of random scores, with values between 0 and 1
    scores = Array.from({length: 10000}, () => Math.random()/**(.01-0)+0*/ );
  }

  if( invalidProjectionVectors.length ) {
    console.error(`Invalid vectors found in projectionFeatures:`, invalidProjectionVectors);
  }

  const diversityProjection = await getDiversityFromWebsocket(
    projectionFeatures,
    undefined, // fitnessValues; TODO: needs cleaning up
    projectionHost + projectionEndpoint,
    evoRunDirPath,
    true, //shouldFit
    undefined, //pcaComponents
    shouldCalculateSurprise,
    shouldCalculateNovelty,
  ).catch(e => {
    console.error(`Error projecting diversity at generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`, e);
  });

  // TODO: should we not scale scores by surprise (and novelty), but rather only use it to bias selection from the map?
  if( shouldCalculateSurprise && diversityProjection.surprise_scores && diversityProjection.surprise_scores.length === scores.length ) {
    for( let i = 0; i < diversityProjection.surprise_scores.length; i++ ) {
      scores[i] *= diversityProjection.surprise_scores[i];
      surpriseScores.push( diversityProjection.surprise_scores[i] );
    }
  }
  if( shouldCalculateNovelty && diversityProjection.novelty_scores && diversityProjection.novelty_scores.length ) {
    for( let i = 0; i < diversityProjection.novelty_scores.length; i++ ) {
      // scores[i] *= diversityProjection.novelty_scores[i];
      noveltyScores.push( diversityProjection.novelty_scores[i] );
    }
  }

  const newEliteMap = {
    "_id": getEliteMapKey(evolutionRunId, terrainNameTo),
    "terrainNameFrom": terrainNameFrom,
    "terrainNameTo": terrainNameTo,
    "qualityEvaluationFeatureExtractionEndpoint": qualityEvaluationFeatureExtractionEndpoint, 
    "projectionFeatureExtractionEndpoint": projectionFeatureExtractionEndpoint,
    "qualityEvaluationEndpoint": qualityEvaluationEndpoint,
    "cells": {}
  };
  for( const eliteKey in eliteMap.cells ) {
    newEliteMap.cells[eliteKey] = { elts: [] };
  }
  // relying on all arrays being in the same order
  const eliteGenomeIds = Array.from(eliteKeysToGenomeIds.values());
  for( let i = 0; i < diversityProjection.feature_map.length; i++ ) {
    let newCellKey;
    if( classScoringVariationsAsContainerDimensions ) {
      const { duration, noteDelta, velocity } = durationsNoteDeltasVelocities[i];
      newCellKey = diversityProjection.feature_map[i].join('_') + `-${duration}_${noteDelta}_${velocity}`;
    } else {
      newCellKey = diversityProjection.feature_map[i].join('_');
    } 
    if( newEliteMap.cells[newCellKey] && newEliteMap.cells[newCellKey].elts.length ) {
      const currentElite = newEliteMap.cells[newCellKey].elts[0];
      if( scores[i] > currentElite.s ) {
        newEliteMap.cells[newCellKey].elts[0] = {
          g: eliteGenomeIds[i],
          s: scores[i],
          ss: surpriseScores && i < surpriseScores.length ? surpriseScores[i] : undefined,
          ns: noveltyScores && i < noveltyScores.length ? noveltyScores[i] : undefined,
        };
      }
    } else {
      newEliteMap.cells[newCellKey] = {
        elts: [ {
          g: eliteGenomeIds[i],
          s: scores[i],
          ss: surpriseScores && i < surpriseScores.length ? surpriseScores[i] : undefined,
          ns: noveltyScores && i < noveltyScores.length ? noveltyScores[i] : undefined,
        } ]
      };
    }
  }

  saveEliteMapToDisk( newEliteMap, evoRunDirPath, evolutionRunId, terrainNameTo );
}