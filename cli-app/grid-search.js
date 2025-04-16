import fs from 'fs';
import path from 'path';
import { runEvolution } from './quality-diversity-search.js';
import { Environment } from './environment.js';

/**
 * Runs a grid search for AURORA-XCon hyperparameters
 * @param {string} evolutionRunId Base ID for the grid search run
 * @param {object} evolutionRunConfig Configuration with grid search parameters
 * @param {object} evolutionaryHyperparameters Hyperparameters for evolution
 * @param {boolean} exitWhenDone Whether to exit process after completion
 */
export async function runGridSearch(
  evolutionRunId, evolutionRunConfig, evolutionaryHyperparameters,
  exitWhenDone = true
) {
  const {
    // Grid search parameters
    marginMultipliers = [0.05, 0.1, 0.5],
    learningRates = [0.001, 0.005, 0.01],
    trainingEpochs = [50, 100, 200],
    tripletFormationStrategies = ['random'], // ['random', 'fitness-binned', 'hybrid'],
    stagnationThreshold = 50,
    targetGenerations = 4687,
    evoRunsDirPath
  } = evolutionRunConfig;

  // Set up logging for grid search results
  const gridSearchResultsPath = `${evoRunsDirPath}grid_search_results_${evolutionRunId}.json`;
  const gridSearchCheckpointPath = `${evoRunsDirPath}grid_search_checkpoint_${evolutionRunId}.json`;
  let gridSearchResults = [];
  
  // Try to load existing results if this is a restart
  if (fs.existsSync(gridSearchResultsPath)) {
    try {
      gridSearchResults = JSON.parse(fs.readFileSync(gridSearchResultsPath, 'utf8'));
      console.log(`Loaded ${gridSearchResults.length} previous grid search results`);
    } catch (e) {
      console.error(`Error loading grid search results: ${e}`);
    }
  }
  
  // Load checkpoint if it exists
  let currentPosition = {marginIndex: 0, learningRateIndex: 0, epochsIndex: 0, strategyIndex: 0};
  if (fs.existsSync(gridSearchCheckpointPath)) {
    try {
      currentPosition = JSON.parse(fs.readFileSync(gridSearchCheckpointPath, 'utf8'));
      console.log(`Resuming grid search from position: ${JSON.stringify(currentPosition)}`);
    } catch (e) {
      console.error(`Error loading grid search checkpoint: ${e}`);
    }
  }
  
  // Generate all combinations
  const allCombinations = [];
  for (let mi = 0; mi < marginMultipliers.length; mi++) {
    for (let li = 0; li < learningRates.length; li++) {
      for (let ei = 0; ei < trainingEpochs.length; ei++) {
        for (let si = 0; si < tripletFormationStrategies.length; si++) {
          allCombinations.push({
            position: { marginIndex: mi, learningRateIndex: li, epochsIndex: ei, strategyIndex: si },
            params: {
              marginMultiplier: marginMultipliers[mi],
              learningRate: learningRates[li],
              epochs: trainingEpochs[ei],
              strategy: tripletFormationStrategies[si]
            }
          });
        }
      }
    }
  }
  
  // Skip combinations we've already tested
  const combinationsToTest = allCombinations.filter(combo => {
    // Check if we've already tested this combination
    return !gridSearchResults.some(result => 
      result.params.marginMultiplier === combo.params.marginMultiplier &&
      result.params.learningRate === combo.params.learningRate &&
      result.params.epochs === combo.params.epochs &&
      result.params.strategy === combo.params.strategy
    );
  });
  
  console.log(`Found ${combinationsToTest.length} remaining combinations to test`);
  
  // Find starting point in remaining combinations based on checkpoint
  let startIndex = 0;
  for (let i = 0; i < combinationsToTest.length; i++) {
    const combo = combinationsToTest[i];
    const pos = combo.position;
    
    if (pos.marginIndex >= currentPosition.marginIndex &&
        pos.learningRateIndex >= currentPosition.learningRateIndex &&
        pos.epochsIndex >= currentPosition.epochsIndex &&
        pos.strategyIndex >= currentPosition.strategyIndex) {
      startIndex = i;
      break;
    }
  }
  
  // Test remaining combinations
  for (let i = startIndex; i < combinationsToTest.length; i++) {
    const combo = combinationsToTest[i];
    const params = combo.params;
    const position = combo.position;
    
    console.log(`Testing combination ${i+1}/${combinationsToTest.length}: marginMultiplier=${params.marginMultiplier}, learningRate=${params.learningRate}, epochs=${params.epochs}, strategy=${params.strategy}`);
    
    // Update checkpoint
    fs.writeFileSync(gridSearchCheckpointPath, JSON.stringify(position));
    
    // Create run ID for this combination
    const comboRunId = `${evolutionRunId}_m${params.marginMultiplier}_lr${params.learningRate}_e${params.epochs}_${params.strategy}`;
    
    // Create modified config for this combination
    const combinationConfig = {
      ...evolutionRunConfig,
      auroraModeConfig: {
        ...evolutionRunConfig.auroraModeConfig || {},
        tripletMarginMultiplier: params.marginMultiplier,
        learningRate: params.learningRate,
        trainingEpochs: params.epochs,
        tripletFormationStrategy: params.strategy,
        gridSearchEvaluation: true,
        stagnationThreshold: stagnationThreshold
      }
    };
    
    // Run evolution with this configuration
    const startTime = Date.now();
    const result = await runEvolution(
      comboRunId, 
      combinationConfig, 
      evolutionaryHyperparameters,
      false // Don't exit between combinations
    );
    const runTime = Date.now() - startTime;
    
    // Record results
    gridSearchResults.push({
      params,
      position,
      results: {
        generationsReached: result.generationsReached,
        finalQDScore: result.finalQDScore,
        finalCoverage: result.finalCoverage,
        maxQDScoreWithoutIncrease: result.maxQDScoreWithoutIncrease,
        maxCoverageWithoutIncrease: result.maxCoverageWithoutIncrease,
        runTime,
        targetDifference: Math.abs(result.generationsReached - targetGenerations)
      }
    });
    
    // Save results after each combination
    fs.writeFileSync(gridSearchResultsPath, JSON.stringify(gridSearchResults, null, 2));
  }
  
  // Find best combination
  gridSearchResults.sort((a, b) => a.results.targetDifference - b.results.targetDifference);
  const bestCombination = gridSearchResults[0];
  
  console.log("Grid search complete. Best combination:");
  console.log(bestCombination);
  
  // Clear checkpoint when done
  if (fs.existsSync(gridSearchCheckpointPath)) {
    fs.unlinkSync(gridSearchCheckpointPath);
  }
  
  if (exitWhenDone) process.exit();
}