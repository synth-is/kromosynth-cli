import fs from 'fs';
import { parse } from 'jsonc-parser';

export function getEvolutionRunsConfig( cli ) {
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

export function getParamsFromJSONFile( fileName ) {
	const evoParamsJsonString = readJSONFromFile( fileName );
	return getParamsFromJSONString( evoParamsJsonString );
}

export function getParamsFromJSONString( evoParamsJsonString ) {
	return parse( evoParamsJsonString );
}

export function readJSONFromFile( fileName ) {
  let jsonString;
  try {
    jsonString = fs.readFileSync(fileName, 'utf8');
  } catch (err) {
    console.error("readJSONFromFile: ", err);
  }
  return jsonString;
}

export function getEvolutionRunConfig( evolutionRunConfigJsonFile, cli ) {
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

export function getEvoParams( evoParamsJsonFile, cli ) {
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