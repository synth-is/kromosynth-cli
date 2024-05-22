// Description: This script reads features from a directory, projects them using a projection method, and calculates the average number of subarrays sharing the same coordinates in the projection.

import fs from 'fs';
import path from 'path';
import {
  getDiversityFromWebsocket
} from "./test-common.js";

const projectionMethods = ['pca', 'umap', 'tsne', 'mds'];

const fitnessMetrics = ['...', '...'];
const distanceMetrics = ['euclidean', 'cosine', 'correlation', 'cityblock', 'chebyshev', 'canberra', 'braycurtis', 'mahalanobis', 'minkowski'];

const diversityMetrics = ['coverage', 'qd'];

// load features / embeddings from all files recursively in a directory, by the supplied key, and return as an array
export function loadFeaturesFromDirectory(
  directory,
  key,
) {
  const features = [];
  const files = fs.readdirSync(directory);
  for (const file of files) {
    const filePath = path.join(directory, file);
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      const subFeatures = loadFeaturesFromDirectory(filePath, key);
      features.push(...subFeatures);
    } else if (stats.isFile() && file.endsWith('.json')) {
      const fileData = fs.readFileSync(filePath, 'utf8');
      const fileFeatures = JSON.parse(fileData);
      features.push(fileFeatures[key]);
    }
  }
  return features;
}


// project features using the supplied projection method and parameters
async function projectFeatures(
  features,
  projectionMethod,
  // projectionParams,
) {
  // const projection = {
  //   "method": projectionMethod,
  //   "params": projectionParams,
  //   "features": features,
  // };
  const projection = await getDiversityFromWebsocket(features, projectionMethod);
  return projection["feature_map"];
}

async function projectFeaturesFromDirectory(
  directory,
  key,
  projectionMethod,
  // projectionParams,
) {
  const features = loadFeaturesFromDirectory(directory, key);
  // console.log('features:', features);
  return await projectFeatures(features, projectionMethod);
}

function calculateAverageNumberOfSubarraysSharingTheSameCoordinates(projection) {
  const coordinateSetCount = {};
  for (const point of projection) {
    const coordinates = point.join(',');
    if (coordinateSetCount[coordinates]) {
      coordinateSetCount[coordinates]++;
    } else {
      coordinateSetCount[coordinates] = 1;
    }
  }
  const coordinateSetCounts = Object.values(coordinateSetCount);
  const average = coordinateSetCounts.reduce((a, b) => a + b, 0) / coordinateSetCounts.length;
  return average;
}

// read directory path, featureKey and projection method from command line arguments
const directory = process.argv[2];
const key = process.argv[3];
const projectionMethod = process.argv[4];
const testRunCount = process.argv[5];

let sumAverageNumberOfElementsPerCell = 0;
for (let i = 0; i < testRunCount; i++) {
  // project features from directory
  const projection = await projectFeaturesFromDirectory(directory, key, projectionMethod);
  console.log('projection:', projection);
  // calculate the average number of subarrays sharing the same coordinates
  const averageNumberOfElementsPerCell = calculateAverageNumberOfSubarraysSharingTheSameCoordinates(projection);
  console.log('average number of elements per cell:', averageNumberOfElementsPerCell);
  sumAverageNumberOfElementsPerCell += averageNumberOfElementsPerCell;
}
const averageNumberOfElementsPerCellFromAllTestRuns = sumAverageNumberOfElementsPerCell / testRunCount;

console.log('average number of elements per cell from all test runs:', averageNumberOfElementsPerCellFromAllTestRuns);