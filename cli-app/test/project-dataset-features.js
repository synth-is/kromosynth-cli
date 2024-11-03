import { getFeaturesFromFileTree, getDiversityFromWebsocket } from "./test-common.js";
import { saveEliteMapToDisk } from '../util/qd-common-elite-map-persistence.js';

const pathToFeaturesTree = process.argv[2];
if( !pathToFeaturesTree ) {
  console.error( "Please provide a path to a tree of feature files as argument" );
  process.exit(1);
}
const pathToEliteMaps = process.argv[3];
if( !pathToEliteMaps ) {
  console.error( "Please provide a path to a tree of elite map files as argument" );
  process.exit(1);
}
const evolutionRunId = process.argv[4];
if( !evolutionRunId ) {
  console.error( "Please provide an evolution run ID as argument" );
  process.exit(1);
}
const dimensionCells = process.argv[5];
if( !dimensionCells ) {
  console.error( "Please provide a number of dimension cells as argument" );
  process.exit(1);
}

// define feature vector types (and combinations of low-level features)
const features = [
  "manual-spectral_centroid",
  "manual-spectral_flatness",
  "manual-spectral_spread",
  "manual-spectral_skewness",
  "manual-spectral_kurtosis",
  "manual-spectral_rolloff",
  "manual-spectral_decrease",
  "manual-spectral_slope",
  "manual-spectral_flux",
  "manual-zero_crossing_rate",
];

// Get all 2D combinations of features
const combinations = [];
for (let i = 0; i < features.length; i++) {
  for (let j = i + 1; j < features.length; j++) {
    combinations.push([features[i], features[j]]);
  }
}
console.log(combinations);

// for each type (or combination of types), fetch all features from the dataset, recursively

// For all combinations
for (const combination of combinations) {
  const rawFeatures = getFeaturesFromFileTree(combination, pathToFeaturesTree, 3);
  const combinedFeatures = Object.values(rawFeatures).map(featuresArray => featuresArray.flat());
  console.log(combinedFeatures);

  // project the feature vectors to a lower-dimensional space
  const projection = await getDiversityFromWebsocket(combinedFeatures, "pca");
  const discretisedProjection = projection["feature_map"];
  console.log(discretisedProjection);

  if ( discretisedProjection ) {

    // save the projected feature vectors to a file with an elite-map style structure

    const eliteMap = { cells: {} };
    eliteMap._id = evolutionRunId + "__" + combination.join('X');
    eliteMap.dimensionLabels = combination;
    // for each dimension cell, instantiate a cell with a single element
    for( let i = 0; i < dimensionCells; i++ ) {
      for( let j = 0; j < dimensionCells; j++ ) {
        const cellKey = i + '_' + j;
        eliteMap.cells[cellKey] = {
          "elts": []
        }
      }
    }
    for( const oneFeature of discretisedProjection ) {
      const cellKey = oneFeature.join('_');
      eliteMap.cells[cellKey].elts.push({
        "s": 0.75,
      });
    }
    eliteMap.coverage = Object.keys(eliteMap.cells).filter(cellKey => eliteMap.cells[cellKey].elts.length > 0).length;
    eliteMap._coverage = eliteMap.coverage; // for convenience when opening the file in a text editor
    eliteMap.coveragePercentage = eliteMap.coverage / (dimensionCells * dimensionCells) * 100;
    eliteMap._coveragePercentage = eliteMap.coveragePercentage; // for convenience when opening the file in a text editor
    const eliteMapOrderedKeys = Object.keys(eliteMap).sort().reduce(   // https://stackoverflow.com/a/31102605
      (obj, key) => { 
        obj[key] = eliteMap[key]; 
        return obj;
      }, 
      {}
    );
    const terrainName = combination.join('X');
    saveEliteMapToDisk( eliteMapOrderedKeys, pathToEliteMaps+"/"+evolutionRunId, evolutionRunId, terrainName );

  } else {
    console.error("Failed to project the feature vectors to a lower-dimensional space for combination", combination);
  }
}
