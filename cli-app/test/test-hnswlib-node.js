import fs from 'fs';
import hnswPkg from 'hnswlib-node';
const { HierarchicalNSW } = hnswPkg;

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

function getFeaturesFromFileTree( featureType, pathToTree, numberOfFilePathPartsAsKey = 1 ) {
  // find all .json files in the tree
  const files = findFiles( pathToTree, '.json' );
  // read each file and extract the features
  const features = {};
  for( let i = 0; i < files.length; i++ ) {
    const file = files[i];
    const parts = file.split('/');
    const key = parts.slice( -numberOfFilePathPartsAsKey ).join('/');
    // console.log( "fileName:", fileName );
    const feature = getFeaturesFromFile( featureType, file );
    // console.log( "featureType", featureType, ":", feature );
    features[key] = feature;
  }
  return features;
}

function getFirstFeatureFromFileTree( featureType, pathToTree ) {
  const files = findFiles( pathToTree, '.json', 1 );
  const file = files[0];
  return getFeaturesFromFile( featureType, file );
}

function findFiles( pathToTree, extension, maxFiles ) {
  const files = [];
  const tree = fs.readdirSync( pathToTree );
  for( let i = 0; i < tree.length; i++ ) {
    if( maxFiles && files.length >= maxFiles ) {
      break;
    }
    const item = tree[i];
    const itemPath = `${pathToTree}/${item}`;
    const stats = fs.statSync( itemPath );
    if( stats.isDirectory() ) {
      const subFiles = findFiles( itemPath, extension, maxFiles );
      subFiles.forEach( subFile => files.push( subFile ) );
    } else if( stats.isFile() && item.endsWith( extension ) ) {
      files.push( itemPath );
    }
  }
  return files;
}

function getFeaturesFromFile( featureType, file ) {
  const data = JSON.parse( fs.readFileSync( file, 'utf8' ) );
  return data[featureType];
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