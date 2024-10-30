import fs from 'fs';
import { getScoreMatrixFromEliteMap } from '../qd-run-analysis.js';

const eliteMapsPath = process.argv[2];
if( !eliteMapsPath ) {
  console.error( "Please provide a path to a tree of elite map files as argument" );
  process.exit(1);
}
const analysisPath = process.argv[3];
if( !analysisPath ) {
  console.error( "Please provide a path to an analysis directory as argument" );
  process.exit(1);
}

// for each JSON file starting with "elites_" at eliteMapsPath, read the elite map
const files = fs.readdirSync( eliteMapsPath );
const scoreMatrixes = {};
// align the data structure with plotting routines
scoreMatrixes["evoRuns"] = [
  {
    "iterations": [
      {
        "scoreMatrix": {},
        "coveragePercentage": {}
      }
    ]
  }
];
for( const file of files ) {
  if( file.startsWith("elites_") && file.endsWith(".json") ) {
    const filePath = `${eliteMapsPath}/${file}`;
    const fileData = fs.readFileSync(filePath, 'utf8');
    const eliteMap = JSON.parse(fileData);
    // console.log( eliteMap );
    const scoreMatrix = await getScoreMatrixFromEliteMap( eliteMap );
    let dimensionLabel;
    if( eliteMap.dimensionLabels && eliteMap.dimensionLabels.length > 0 ) {
      // remove "manual-" from dimension labels
      const dimensionLabels = eliteMap.dimensionLabels.map( label => label.replace("manual-", "") );
      dimensionLabel = dimensionLabels.join('X');
    } else {
      // set dimensionLabel as the part of the file name after the last "_" and before ".json"
      const parts = file.split("_");
      dimensionLabel = parts[parts.length - 1].replace(".json", "");
    }
    scoreMatrixes["evoRuns"][0]["iterations"][0]["id"] = eliteMap._id;
    scoreMatrixes["evoRuns"][0]["iterations"][0]["coveragePercentage"][dimensionLabel] = eliteMap.coveragePercentage;
    scoreMatrixes["evoRuns"][0]["iterations"][0]["scoreMatrix"][dimensionLabel] = scoreMatrix;
  }
}
fs.writeFileSync( `${analysisPath}/scoreMatrix.json`, JSON.stringify(scoreMatrixes, null, 2) );
