import fs from 'fs';
import hnswPkg from 'hnswlib-node';
const { HierarchicalNSW } = hnswPkg;
import { findFiles, getFeaturesFromFile, getFeaturesFromFileTree } from './test-common.js';

function getHnswIndexWithFeatures( spaceName, featureType, pathToTree, numberOfFilePathPartsAsKey, indexPersistencePath, indexFileName = 'hnswIndex.dat', indexToKeyFileName = 'indexToKey.json' ) {
  let index;
  let indexToKey;
  const indexPath = indexPersistencePath + "/" + indexFileName;
  const indexToKeyPath = indexPersistencePath + "/" + indexToKeyFileName;
  if( fs.existsSync( indexPath ) ) {
    const queryFeature = getFirstFeatureFromFileTree( featureType, pathToTree );
    const numDimensions = queryFeature.length;
    index = new HierarchicalNSW(spaceName, numDimensions);
    index.readIndexSync( indexPath );
    indexToKey = JSON.parse( fs.readFileSync( indexToKeyPath, 'utf8' ) );
  } else {
    const features = getFeaturesFromFileTree( featureType, pathToTree, numberOfFilePathPartsAsKey );
    const firstFeature = features[Object.keys( features )[0]];
    const numDimensions = firstFeature.length;
    const maxElements = Object.keys( features ).length;
    index = new HierarchicalNSW(spaceName, numDimensions);
    index.initIndex(maxElements);
    indexToKey = {};
    for( const [i, [key, feature]] of Object.entries(Object.entries( features )) ) { // https://stackoverflow.com/a/45254514/169858
      if( ! Array.isArray( feature ) ) {
        console.error( "Feature is not an array:", feature, ", key:", key );
        continue;
      }
      if( feature.length !== numDimensions ) {
        console.error( "Feature has wrong number of dimensions:", feature.length, ", expected:", numDimensions, ", key:", key );
        continue;
      }
      index.addPoint( feature, parseInt(i) );
      indexToKey[i] = key;
    }
    // if indexPersistencePath does not exist, create it
    if( !fs.existsSync( indexPersistencePath ) ) {
      fs.mkdirSync( indexPersistencePath, { recursive: true } );
    }
    index.writeIndexSync( indexPath );
    fs.writeFileSync( indexToKeyPath, JSON.stringify( indexToKey, null, 2 ) );
  }
  return { index, indexToKey};
}

function getFirstFeatureFromFileTree( featureType, pathToTree ) {
  const files = findFiles( pathToTree, '.json', 1 );
  const file = files[0];
  return getFeaturesFromFile( featureType, file );
}


// get featureType from command line argument
const featureType = process.argv[2];
if( !featureType ) {
  console.error( "Please provide a feature type as argument" );
  process.exit(1);
}
const pathToFeaturesTree = process.argv[3];
if( !pathToFeaturesTree ) {
  console.error( "Please provide a path to a tree of feature files as argument" );
  process.exit(1);
}
const indexPersistencePath = process.argv[4] || pathToFeaturesTree;
const numberOfFilePathPartsAsKey = parseInt( process.argv[5] ) || 1;

// spaceName can be 'l2', 'ip, or 'cosine'
// const {index, indexToKey} = getHnswIndexWithFeatures( 'cosine', 'mfcc', '/Users/bjornpjo/Downloads/nsynth-valid/family-split_features' );
const {index, indexToKey} = getHnswIndexWithFeatures( 'cosine', featureType, pathToFeaturesTree, numberOfFilePathPartsAsKey, indexPersistencePath );

// test a query
const queryFeature = getFirstFeatureFromFileTree( featureType, pathToFeaturesTree );
const numNeighbors = 5;
const result = index.searchKnn( queryFeature, numNeighbors );
console.table( result );

console.log("Query feature key:", indexToKey[0] );
// print result keys
const resultKeys = result.neighbors.map( r => indexToKey[r] );
console.log( "Result keys:", resultKeys );

console.log("Number of items in index:", index.getCurrentCount() );

// example command:
// node test-hnswlib-node.js mfcc /Users/bjornpjo/Downloads/audio-features/OneBillionWav_features_filtered /Users/bjornpjo/Downloads/hnsw-indexes/OneBillionWav_features_filtered_mfcc 3