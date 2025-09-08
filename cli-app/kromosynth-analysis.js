import { 
  calculateQDScoreForOneIteration,
	calculateQDScoresForAllIterations,
	calculateGridMeanFitnessForAllIterations,
	playAllClassesInEliteMap,
	playOneClassAcrossEvoRun,
	getGenomeStatisticsAveragedForOneIteration,
	getGenomeStatisticsAveragedForAllIterations,
	getCellScoresForOneIteration,
	getCellScoresForAllIterations,
	getCoverageForOneIteration,
	getCoverageForAllIterations,
	getScoreMatrixForLastIteration, getScoreMatricesForAllIterations,
	getCellSaturationGenerations,
	getGenomeSetsForOneIteration,
	getGenomeCountsForAllIterations,
	getGenomeCountsWithRenderingVariationsAsContainerDimensionsForAllIterations,
	getScoreVarianceForAllIterations,
	getScoreStatsForOneIteration,
	getElitesEnergy,
	getGoalSwitches, getGoalSwitchesThroughLineages,
	getLineageGraphData,
	getDurationPitchDeltaVelocityCombinations,
	getClassLabels,
	getNewEliteCountForAllIterations,
	getDiversityFromEmbeddingFiles,
	getTerrainNames,
	getEliteMapDiversityAtLastIteration, getEliteMapDiversityForAllIterations, getDiversityFromAllDiscoveredElites,

  analyzeEnhancedPhylogeneticMetrics, 
  trackEnhancedPhylogeneticMetricsOverTime
  // , compareConfigurationVariants 
} from './qd-run-analysis.js';
import { 
  getEvolutionRunsConfig,
  getEvolutionRunConfig,
  getEvoParams,
} from './kromosynth-common.js';
import {
  analyzePhylogeneticTreeMetrics,
  trackPhylogeneticMetricsOverTime,
  analyzeTerrainTransitions,
  analyzeDensityDependence,
  generatePhylogeneticReport,
  createFounderDashboard
} from './qd-run-analysis.js';
import { 
	runCmd,
	averageAttributes, standardDeviationAttributes,
} from './util/qd-common.js';
import { 
  runPhylogeneticAnalysis, 
  comparePhylogeneticMetrics,
  comparePhylogeneticMetricsAcrossConfigurations 
} from './phylogenetic-analysis-cli.js';
import { 
  analyzeFoundersAndInnovations,
  findConcreteSteppingStoneExamples,
  calculateNormalizedFounderImpact,
  calculateQualityImprovementFactors,
  calculateClassDiscoveryRates,
  analyzeInnovationBurstPatterns,
  findAllDescendants
} from './founder-innovation-analysis.js';
import {
  aggregateEnhancedFounderInnovationMetrics,
  aggregateTimelineData,
  aggregateEnhancedPhylogeneticMetrics,
  aggregatePhylogeneticMetrics
} from './enhanced-metrics-aggregation.js';
import {
	getEnhancedDiversityMetrics, trackDiversityOverTime,
} from './qd-run-analysis-enhanced.js'
import { yamnetTags_non_musical, yamnetTags_musical } from './util/classificationTags.js';
import { initializeKuzuDB, populateKuzuDBWithLineage } from './kuzu-db-integration.js';
import merge from 'deepmerge';
import path from 'path';
import fs from 'fs';
import { mean, median, variance, std, map } from 'mathjs'

///// elite map analysis

export async function qdAnalysis_eliteMapQDScore( cli ) {
  let {evolutionRunId, evolutionRunIteration} = cli.flags;
  if( evolutionRunId ) {
    const evoRunConfig = getEvolutionRunConfig(undefined, cli);
    const qdScore = await calculateQDScoreForOneIteration( evoRunConfig, evolutionRunId, evolutionRunIteration );
    console.log(qdScore);
  }
}

export async function qdAnalysis_eliteMapCellScores( cli ) {
  let {evolutionRunId, evolutionRunIteration} = cli.flags;
  if( evolutionRunId ) {
    const evoRunConfig = getEvolutionRunConfig(undefined, cli);
    const cellScores = await getCellScoresForOneIteration( evoRunConfig, evolutionRunId, evolutionRunIteration );
    console.log(cellScores);
  }
}

export async function qdAnalysis_eliteMapGenomeStatistics( cli ) {
  let {evolutionRunId, evolutionRunIteration} = cli.flags;
  if( evolutionRunId ) {
    const evoRunConfig = getEvolutionRunConfig(undefined, cli);
    const {
      averageCppnNodeCount, averageCppnConnectionCount, averageAsNEATPatchNodeCount, averageAsNEATPatchConnectionCount
    } = await getGenomeStatisticsAveragedForOneIteration( evoRunConfig, evolutionRunId, evolutionRunIteration );
    console.log("averageCppnNodeCount:", averageCppnNodeCount, "averageCppnConnectionCount:", averageCppnConnectionCount, "averageAsNEATPatchNodeCount:", averageAsNEATPatchNodeCount, "averageAsNEATPatchConnectionCount:", averageAsNEATPatchConnectionCount);
    process.exit();
  }
}

export async function qdAnalysis_eliteMapCoverage( cli ) {
  let {evolutionRunId, evolutionRunIteration, scoreThreshold} = cli.flags;
  if( evolutionRunId ) {
    const evoRunConfig = getEvolutionRunConfig(undefined, cli);
    const coverage = await getCoverageForOneIteration( evoRunConfig, evolutionRunId, evolutionRunIteration, scoreThreshold );
    console.log(coverage);
  }
}

export async function qdAnalysis_eliteMapGenomeSets( cli ) {
  let {evolutionRunId, evolutionRunIteration, scoreThreshold} = cli.flags;
  if( evolutionRunId ) {
    const evoRunConfig = getEvolutionRunConfig(undefined, cli);
    const genomeSets = await getGenomeSetsForOneIteration( evoRunConfig, evolutionRunId, evolutionRunIteration, scoreThreshold );
    console.log(genomeSets);
  }
}

export async function qdAnalysis_eliteMapScoreVariance( cli ) {
  let {evolutionRunId, evolutionRunIteration} = cli.flags;
  if( evolutionRunId ) {
    const evoRunConfig = getEvolutionRunConfig(undefined, cli);
    const scoreVariance = await getScoreStatsForOneIteration( evoRunConfig, evolutionRunId, evolutionRunIteration );
    console.log(scoreVariance);
  }
}

///// evo runs analysis

export async function qdAnalysis_evoRunQDScores( cli ) {
  let {evolutionRunId, stepSize} = cli.flags;
  if( evolutionRunId ) {
    const evoRunConfig = getEvolutionRunConfig(undefined, cli);
    const qdScores = await calculateQDScoresForAllIterations( evoRunConfig, evolutionRunId, stepSize );
    console.log(qdScores);
  }
}

export async function qdAnalysis_evoRunGenomeStatistics( cli ) {
  let {evolutionRunId, stepSize} = cli.flags;
  if( evolutionRunId ) {
    const evoRunConfig = getEvolutionRunConfig(undefined, cli);
    const genomeStatistics = await getGenomeStatisticsAveragedForAllIterations( evoRunConfig, evolutionRunId, stepSize );
    console.log(genomeStatistics);
  }
}

export async function qdAnalysis_evoRunCellScores( cli ) {
  let {evolutionRunId, stepSize} = cli.flags;
  if( evolutionRunId ) {
    const evoRunConfig = getEvolutionRunConfig(undefined, cli);
    const cellScores = await getCellScoresForAllIterations( evoRunConfig, evolutionRunId, stepSize );
    console.log(cellScores);
  }
}

export async function qdAnalysis_evoRunCoverage( cli ) {
  let {evolutionRunId, stepSize, scoreThreshold} = cli.flags;
  if( evolutionRunId ) {
    const evoRunConfig = getEvolutionRunConfig(undefined, cli);
    const coverage = await getCoverageForAllIterations( evoRunConfig, evolutionRunId, stepSize, scoreThreshold );
    console.log(coverage);
  }
}

export async function qdAnalysis_evoRunGenomeSets( cli ) {
  let {evolutionRunId, stepSize, scoreThreshold} = cli.flags;
  if( evolutionRunId ) {
    const evoRunConfig = getEvolutionRunConfig(undefined, cli);
    const genomeSets = await getGenomeCountsForAllIterations( evoRunConfig, evolutionRunId, stepSize, scoreThreshold );
    console.log(genomeSets);
  }
}

export async function qdAnalysis_evoRunScoreVariances( cli ) {
  let {evolutionRunId, stepSize} = cli.flags;
  if( evolutionRunId ) {
    const evoRunConfig = getEvolutionRunConfig(undefined, cli);
    const scoreVariances = await getScoreVarianceForAllIterations( evoRunConfig, evolutionRunId, stepSize );
    console.log(scoreVariances);
  }
}

export async function qdAnalysis_evoRunCellSaturationGenerations( cli ) {
  let {evolutionRunId, stepSize} = cli.flags;
  if( evolutionRunId ) {
    const evoRunConfig = getEvolutionRunConfig(undefined, cli);
    const cellSaturationGenerations = await getCellSaturationGenerations( evoRunConfig, evolutionRunId );
    console.log(cellSaturationGenerations);
  }
}

export async function qdAnalysis_evoRunElitesEnergy( cli ) {
  let {evolutionRunId, stepSize} = cli.flags;
  if( evolutionRunId ) {
    const evoRunConfig = getEvolutionRunConfig(undefined, cli);
    const eliteEnergy = await getElitesEnergy( evoRunConfig, evolutionRunId, stepSize );
    console.log(eliteEnergy);
  }
}

export async function qdAnalysis_evoRunGoalSwitches( cli ) {
  let {evolutionRunId, stepSize} = cli.flags;
  if( evolutionRunId ) {
    const evoParams = getEvoParams(undefined, cli);
    const evoRunConfig = getEvolutionRunConfig(undefined, cli);
    const goalSwitches = await getGoalSwitches( evoRunConfig, evolutionRunId, stepSize, evoParams );
    console.log(goalSwitches);
  }
}

export async function qdAnalysis_evoRunLineage( cli ) {
  let {evolutionRunId, stepSize, scoreThreshold} = cli.flags;
  if( evolutionRunId ) {
    const evoRunConfig = getEvolutionRunConfig(undefined, cli);
    const lineage = await getLineageGraphData( evoRunConfig, evolutionRunId, stepSize );
    console.log(lineage);
  }
}

export async function qdAnalysis_evoRunDurationPitchDeltaVelocityCombinations( cli ) {
  let {evolutionRunId, stepSize, uniqueGenomes} = cli.flags;
  if( evolutionRunId ) {
    const evoRunConfig = getEvolutionRunConfig(undefined, cli);
    const durationDeltaPitchCombinations = await getDurationPitchDeltaVelocityCombinations( evoRunConfig, evolutionRunId, stepSize, uniqueGenomes );
    console.log(durationDeltaPitchCombinations);
  }
}

export async function qdAnalysis_evoRunPopulateKuzuDB( cli ) {
  let {evolutionRunId, stepSize} = cli.flags;
  if( evolutionRunId ) {
    const evoRunConfig = getEvolutionRunConfig(undefined, cli);
    
    console.log(`Populating KuzuDB for evolution run: ${evolutionRunId}`);
    
    try {
      // Extract lineage data
      console.log(`Extracting lineage data...`);
      const lineageData = await getLineageGraphData(evoRunConfig, evolutionRunId, stepSize);
      
      // Initialize and populate KuzuDB
      const dbPath = `${evoRunConfig.evoRunsDirPath}${evolutionRunId}/${evolutionRunId}.kuzu`;
      console.log(`Initializing KuzuDB at: ${dbPath}`);
      
      const dbInitResult = await initializeKuzuDB(dbPath);
      const populateResult = await populateKuzuDBWithLineage(evoRunConfig, evolutionRunId, lineageData);
      
      console.log(`✅ KuzuDB populated successfully!`);
      console.log(`   Database: ${populateResult.dbPath}`);
      console.log(`   Sounds: ${populateResult.stats.total_sounds}`);
      console.log(`   Relationships: ${populateResult.stats.total_parent_relationships}`);
      
      // Output result as JSON for potential piping
      console.log(JSON.stringify({
        success: true,
        dbPath: populateResult.dbPath,
        stats: populateResult.stats,
        timestamp: new Date().toISOString()
      }, null, 2));
      
    } catch (error) {
      console.error(`❌ Error populating KuzuDB:`, error);
      console.log(JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }, null, 2));
      process.exit(1);
    }
  } else {
    console.error('No evolutionRunId provided');
    process.exit(1);
  }
}

// run git garbage collection on all evolution run iterations
export function qdAnalysis_gitGC( cli ) {
  const evoRunsConfig = getEvolutionRunsConfig( cli );
  for( let currentEvolutionRunIndex = 0; currentEvolutionRunIndex < evoRunsConfig.evoRuns.length; currentEvolutionRunIndex++ ) {
    const currentEvoConfig = evoRunsConfig.evoRuns[currentEvolutionRunIndex];
    for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
      let { id: evolutionRunId } = currentEvoConfig.iterations[currentEvolutionRunIteration];
      if( evolutionRunId ) {
        const evoRunConfigMain = getEvolutionRunConfig( evoRunsConfig.baseEvolutionRunConfigFile, cli );
        const evoRunConfigDiff = getEvolutionRunConfig( currentEvoConfig.diffEvolutionRunConfigFile, cli );
        const evoRunConfig = {...evoRunConfigMain, ...evoRunConfigDiff};
        const evoRunDirPath = `${evoRunConfig.evoRunsDirPath}${evolutionRunId}/`;
        console.log(`Performing git garbage collection on ${evoRunDirPath}...`);
        runCmd(`git -C ${evoRunDirPath} gc`);
      }
    }
  }
}

export async function qdAnalysis_percentCompletion( cli ) {
  const evoRunsConfig = getEvolutionRunsConfig( cli );
  const evoRunsPercentCompleted = {...evoRunsConfig};
  let sumTerminationConditionNumberOfEvals = 0;
  let sumNumberOfGenerations = 0;
  for( let currentEvolutionRunIndex = 0; currentEvolutionRunIndex < evoRunsConfig.evoRuns.length; currentEvolutionRunIndex++ ) {
    const currentEvoConfig = evoRunsConfig.evoRuns[currentEvolutionRunIndex];
    const evoRunConfigMain = getEvolutionRunConfig( evoRunsConfig.baseEvolutionRunConfigFile, cli );
    const evoRunConfigDiff = getEvolutionRunConfig( currentEvoConfig.diffEvolutionRunConfigFile, cli );
    const evoRunConfig = {...evoRunConfigMain, ...evoRunConfigDiff};
    let terrainNames = getTerrainNames( evoRunConfig );
    if( !terrainNames || !terrainNames.length ) {
      terrainNames = [''];
    }
    for( const oneTerraineName of terrainNames ) {
      const terrainNameSuffix = oneTerraineName ? '_' + oneTerraineName : '';
      if( evoRunConfig.terminationCondition.numberOfEvals ) {
        for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
          sumTerminationConditionNumberOfEvals += evoRunConfig.terminationCondition.numberOfEvals;
          let { id: evolutionRunId } = currentEvoConfig.iterations[currentEvolutionRunIteration];
          if( evolutionRunId ) {
            const evoRunDirPath = `${evoRunConfig.evoRunsDirPath}${evolutionRunId}/`;
            const eliteMapFileName = `${evoRunDirPath}elites_${evoRunsConfig.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].id}${terrainNameSuffix}.json`;
            const eliteMap = JSON.parse(fs.readFileSync( eliteMapFileName, "utf8" ));
            const generationNumber = eliteMap.generationNumber;
            sumNumberOfGenerations += generationNumber * eliteMap.searchBatchSize;
            const percentCompleted = (generationNumber * eliteMap.searchBatchSize) / evoRunConfig.terminationCondition.numberOfEvals;
            evoRunsPercentCompleted.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].percentCompleted = percentCompleted;
          }
        }
      }
    }
  }
  const totalPercentCompleted = sumNumberOfGenerations / sumTerminationConditionNumberOfEvals;
  evoRunsPercentCompleted.totalPercentCompleted = totalPercentCompleted;
  const evoRunsConfigFile = cli.flags.evolutionRunsConfigJsonFile || evoRunsConfig.baseEvolutionRunConfigFile;
  const evoRunConfigFileName = path.basename(evoRunsConfigFile, path.extname(evoRunsConfigFile));
  const percentCompletedResultsFilePath = `${path.dirname(evoRunsConfig.baseEvolutionRunConfigFile)}/evoRunsPercentCompleted_${evoRunConfigFileName}.json`;
  const percentCompletedResultsFileContents = JSON.stringify(evoRunsPercentCompleted, null, 2);
  fs.writeFileSync(percentCompletedResultsFilePath, percentCompletedResultsFileContents);
  console.log(`Wrote percent completed results to ${percentCompletedResultsFilePath}`);
}

export async function qdAnalysis_evoRuns( cli ) {
  const evoRunsConfig = getEvolutionRunsConfig( cli );
  const {
    analysisOperations, stepSize, scoreThreshold, uniqueGenomes, excludeEmptyCells, classRestriction, maxIterationIndex, 
    writeToFolder, terrainName, lineageDataFile
  } = cli.flags;
  const analysisOperationsList = analysisOperations.split(",");
  let classRestrictionList;
  if (classRestriction) {
    classRestrictionList = JSON.parse(classRestriction);
  }
  console.log("analysisOperationsList", analysisOperationsList);
  const evoRunsAnalysis = {...evoRunsConfig};
  
  // Setup analysis result file path
  let analysisResultFilePath;
  if (writeToFolder === './') {
    analysisResultFilePath = `${path.dirname(evoRunsConfig.baseEvolutionRunConfigFile)}/evolution-run-analysis_${analysisOperationsList}_step-${stepSize}${scoreThreshold ? '_thrshld_'+scoreThreshold:''}_${Date.now()}.json`;
  } else {
    analysisResultFilePath = `${writeToFolder}/evolution-run-analysis_${analysisOperationsList}${terrainName ? '_terrain-'+terrainName : ''}_step-${stepSize}${scoreThreshold ? '_thrshld_'+scoreThreshold:''}_${Date.now()}.json`;
  }
  
  // Read lineage data from file if provided
  let lineageData;
  if (lineageDataFile) {
    try {
      lineageData = JSON.parse(fs.readFileSync(lineageDataFile, 'utf8'));
      console.log(`Loaded lineage data from ${lineageDataFile}`);
    } catch (error) {
      console.error(`Error reading lineage data file: ${error}`);
    }
  }
  
  // Collect run IDs for phylogenetic comparison if needed
  const runIdsForComparison = [];
  
  for (let currentEvolutionRunIndex = 0; currentEvolutionRunIndex < evoRunsConfig.evoRuns.length; currentEvolutionRunIndex++) {
    const currentEvoConfig = evoRunsConfig.evoRuns[currentEvolutionRunIndex];
    for (let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++) {
      let { id: evolutionRunId } = currentEvoConfig.iterations[currentEvolutionRunIteration];
      if (evolutionRunId) {
      const evoRunConfigMain = getEvolutionRunConfig(evoRunsConfig.baseEvolutionRunConfigFile, cli);
      const evoRunConfigDiff = getEvolutionRunConfig(currentEvoConfig.diffEvolutionRunConfigFile, cli);
      const evoRunConfig = {...evoRunConfigMain, ...evoRunConfigDiff};

      const evoParamsMain = getEvoParams(evoRunsConfig.baseEvolutionaryHyperparametersFile, cli);
      const evoParamsDiff = getEvoParams(currentEvoConfig.diffEvolutionaryHyperparametersFile, cli);
      const evoParams = merge(evoParamsMain, evoParamsDiff);
      
      // Add this run ID to the comparison list if needed
      if (analysisOperationsList.includes("phylogenetic-comparison")) {
        runIdsForComparison.push(evolutionRunId);
      }

      let lineage;
      // BEGIN: Check for per-iteration lineage file
      if (lineageDataFile) {
        const ext = path.extname(lineageDataFile);
        const base = lineageDataFile.slice(0, -ext.length);
        const perIterationFilePath = `${base}_iteration-${currentEvolutionRunIteration}_lineage${ext}`;
        console.log(`Checking for per-iteration lineage file: ${perIterationFilePath}`);
        if (fs.existsSync(perIterationFilePath)) {
          console.log(`Found per-iteration lineage file: ${perIterationFilePath}`);
          try {
            const perIterationData = JSON.parse(fs.readFileSync(perIterationFilePath, 'utf8'));
            // Try to extract the lineage for this run/iteration
            if (
              perIterationData.evoRuns &&
              perIterationData.evoRuns[currentEvolutionRunIndex] &&
              perIterationData.evoRuns[currentEvolutionRunIndex].iterations &&
              perIterationData.evoRuns[currentEvolutionRunIndex].iterations[0] &&
              perIterationData.evoRuns[currentEvolutionRunIndex].iterations[0].lineage !== undefined
            ) {
              lineage = perIterationData.evoRuns[currentEvolutionRunIndex].iterations[0].lineage;
            } else {
              lineage = undefined;
            }
          } catch (error) {
            console.error(`Error reading per-iteration lineage data file: ${error}`);
            lineage = undefined;
          }
        } else if (
          lineageData.evoRuns &&
          lineageData.evoRuns[currentEvolutionRunIndex] &&
          lineageData.evoRuns[currentEvolutionRunIndex].iterations &&
          lineageData.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration]
        ) {
          lineage = lineageData.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].lineage;
        } else {
          lineage = undefined;
          }
      } else {
        lineage = await getLineageGraphData(evoRunConfig, evolutionRunId, stepSize);
      }
      // END: Check for per-iteration lineage file

      for (const oneAnalysisOperation of analysisOperationsList) {
        const classLabels = await getClassLabels(evoRunConfig, evolutionRunId);
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].classLabels = classLabels;


        // "enhanced-phylogenetic-metrics","enhanced-phylogenetic-metrics-over-time","phylogenetic-configuration-comparison"
        await enhancedQdAnalysisEvoRuns(oneAnalysisOperation, evoRunsAnalysis, currentEvolutionRunIndex, currentEvolutionRunIteration, evoRunConfig, evolutionRunId, lineage);
        writeAnalysisResult(analysisResultFilePath, evoRunsAnalysis);

        if (oneAnalysisOperation === "founder-innovation") {
          console.log(`Analyzing founder genomes and innovation bursts for iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
          
          // Perform the analysis
          const founderInnovationAnalysis = await analyzeFoundersAndInnovations(
            evoRunConfig, evolutionRunId, lineage, false // Don't save separate file
          );
          
          // Store in the analysis results
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].founderInnovation = founderInnovationAnalysis;
          console.log(`Added founder and innovation analysis to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
          writeAnalysisResult(analysisResultFilePath, evoRunsAnalysis);
          
          // Find concrete stepping stone examples
          const steppingStones = findConcreteSteppingStoneExamples(lineage);
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].steppingStones = steppingStones;
          console.log(`Added concrete stepping stone examples to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
          writeAnalysisResult(analysisResultFilePath, evoRunsAnalysis);

          if( cli.flags.generateDashboard ) {
            await createFounderDashboard(evoRunConfig, evolutionRunId, founderInnovationAnalysis);
          }

          // Calculate enhanced metrics if we have valid founder and innovation data
          if (evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].founderInnovation) {
            console.log(`Enhancing founder and innovation analysis for iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            const iteration = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
            const founderInnovation = iteration.founderInnovation;
            
            // Only proceed if we have valid lineage and founder data
            if (lineage && founderInnovation.topFounders && founderInnovation.topFounders.length > 0) {
              // Calculate enhanced metrics
              const normalizedFounders = calculateNormalizedFounderImpact(
                lineage, 
                founderInnovation.topFounders
              );
              
              const founderIdToDescendants = {};
              founderInnovation.topFounders.map((founder) => {
                const founderId = founder.id;
                const descendants = findAllDescendants(lineage, founderId);
                founderIdToDescendants[founderId] = descendants;
              });

              const qualityFounders = calculateQualityImprovementFactors(
                lineage, 
                founderInnovation.topFounders,
                founderIdToDescendants
              );
              
              const discoveryRateFounders = calculateClassDiscoveryRates(
                lineage, 
                founderInnovation.topFounders,
                founderIdToDescendants
              );
              
              const burstPatterns = analyzeInnovationBurstPatterns(
                lineage, 
                founderInnovation.innovationBursts
              );
              
              // Add enhanced metrics to the results
              evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].enhancedFounderInnovation = {
                normalizedFounders: normalizedFounders.slice(0, 5), // Top 5 by normalized impact
                qualityFounders: qualityFounders.slice(0, 5), // Top 5 by quality improvement
                discoveryRateFounders: discoveryRateFounders.slice(0, 5), // Top 5 by discovery rate
                burstPatterns
              };
              
              console.log(`Added enhanced founder metrics to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
              writeAnalysisResult(analysisResultFilePath, evoRunsAnalysis);
            }
          }

        }

   
        // Add phylogenetic analysis operations
        if (oneAnalysisOperation === "phylogenetic-metrics") {
            console.log(`Running phylogenetic metrics analysis for iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            
            // Run basic phylogenetic analysis (no visualization to save time)
            const options = {
              visualize: false,
              trackOverTime: false,
              stepSize: stepSize,
              report: false
            };
            
            try {
              const phylogeneticMetrics = await runPhylogeneticAnalysis(evoRunConfig, evolutionRunId, options, lineage);
              evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].phylogeneticMetrics = phylogeneticMetrics;
              console.log(`Added phylogenetic metrics to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
              writeAnalysisResult(analysisResultFilePath, evoRunsAnalysis);
            } catch (error) {
              console.error(`Error running phylogenetic analysis for ${evolutionRunId}:`, error);
            }
          }
          
          if (oneAnalysisOperation === "phylogenetic-metrics-over-time") {
            console.log(`Running phylogenetic metrics over time for iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            
            try {
              // Use the trackPhylogeneticMetricsOverTime function directly
              const metricsOverTime = await trackPhylogeneticMetricsOverTime(evoRunConfig, evolutionRunId, stepSize);
              evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].phylogeneticMetricsOverTime = metricsOverTime;
              console.log(`Added phylogenetic metrics over time to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
              writeAnalysisResult(analysisResultFilePath, evoRunsAnalysis);
            } catch (error) {
              console.error(`Error tracking phylogenetic metrics over time for ${evolutionRunId}:`, error);
            }
          }
          
          if (oneAnalysisOperation === "terrain-transitions") {
            console.log(`Analyzing terrain transitions for iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            
            try {
              const terrainAnalysis = await analyzeTerrainTransitions(evoRunConfig, evolutionRunId, lineage);
              evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].terrainTransitions = terrainAnalysis;
              console.log(`Added terrain transitions analysis to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
              writeAnalysisResult(analysisResultFilePath, evoRunsAnalysis);
            } catch (error) {
              console.error(`Error analyzing terrain transitions for ${evolutionRunId}:`, error);
            }
          }
          
          if (oneAnalysisOperation === "density-dependence") {
            console.log(`Analyzing density dependence for iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            
            try {
              const densityAnalysis = await analyzeDensityDependence(evoRunConfig, evolutionRunId, lineage);
              evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].densityDependence = densityAnalysis;
              console.log(`Added density dependence analysis to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
              writeAnalysisResult(analysisResultFilePath, evoRunsAnalysis);
            } catch (error) {
              console.error(`Error analyzing density dependence for ${evolutionRunId}:`, error);
            }
          }
          
          if (oneAnalysisOperation === "phylogenetic-report") {
            console.log(`Generating phylogenetic report for iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            
            try {
              const report = await generatePhylogeneticReport(evoRunConfig, evolutionRunId, lineage);
              evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].phylogeneticReport = report;
              console.log(`Added phylogenetic report to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
              writeAnalysisResult(analysisResultFilePath, evoRunsAnalysis);
            } catch (error) {
              console.error(`Error generating phylogenetic report for ${evolutionRunId}:`, error);
            }
          }


          if( oneAnalysisOperation === "diversity-from-embeddings" ) {
            const diversityFromEmbeddings = getDiversityFromEmbeddingFiles( evoRunConfig, evolutionRunId);
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].diversityFromEmbeddings = diversityFromEmbeddings;
            console.log(`Added diversity from embeddings to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
          if( oneAnalysisOperation === "diversity-at-last-iteration" ) {
            const diversityAtLastIteration = await getEliteMapDiversityAtLastIteration( evoRunConfig, evolutionRunId );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].diversityAtLastIteration = diversityAtLastIteration;
            console.log(`Added diversity at last iteration to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
          if( oneAnalysisOperation === "diversity-from-all-discovered-elites" ) {
            const diversityFromAllDiscoveredElites = await getDiversityFromAllDiscoveredElites( evoRunConfig, evolutionRunId, true/* useDirectFeatureReading */ );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].diversityFromAllDiscoveredElites = diversityFromAllDiscoveredElites;
            console.log(`Added diversity from all discovered elites to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
          if( oneAnalysisOperation === "diversity-from-all-discovered-elites-enhanced" ) {
            const diversityFromAllDiscoveredElitesEnhanced = await getEnhancedDiversityMetrics( 
              evoRunConfig, evolutionRunId, true/* useDirectFeatureReading */ 
              // ,
              // {
              // 	maxVectors: Infinity,               // Maximum number of vectors to process (sampling)
              // 	distanceSamplingRatio: 1.0,     // For pairwise calculations, sample this ratio of all possible pairs
              // 	skipExpensiveMetrics: false,    // Skip metrics that require O(n²) calculations
              // 	memoryEfficientMode: true       // Use algorithms optimized for memory efficiency
              // }
            );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].diversityFromAllDiscoveredElitesEnhanced = diversityFromAllDiscoveredElitesEnhanced;
            console.log(`Added enhanced diversity metrics from all discovered elites to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
          if( oneAnalysisOperation === "diversity-over-time" ) {
            const diversityOverTime = await trackDiversityOverTime( evoRunConfig, evolutionRunId, stepSize );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].diversityOverTime = diversityOverTime;
            console.log(`Added diversity over time to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }

        if( oneAnalysisOperation === "populate-kuzudb" ) {
          console.log(`Populating KuzuDB for iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
          
          try {
            // Extract lineage data if not already available
            let kuzuLineageData = lineage;
            if (!kuzuLineageData) {
              console.log(`Extracting lineage data for ${evolutionRunId}...`);
              kuzuLineageData = await getLineageGraphData(evoRunConfig, evolutionRunId, stepSize);
            }
            
            // Initialize and populate KuzuDB
            const dbInitResult = await initializeKuzuDB(`${evoRunConfig.evoRunsDirPath}${evolutionRunId}/${evolutionRunId}.kuzu`);
            const populateResult = await populateKuzuDBWithLineage(evoRunConfig, evolutionRunId, kuzuLineageData);
            
            // Store results in analysis data
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].kuzuDBPopulation = {
              dbPath: populateResult.dbPath,
              stats: populateResult.stats,
              success: populateResult.success,
              timestamp: new Date().toISOString()
            };
            
            console.log(`✅ KuzuDB populated successfully for ${evolutionRunId}`);
            console.log(`   Database: ${populateResult.dbPath}`);
            console.log(`   Sounds: ${populateResult.stats.total_sounds}`);
            console.log(`   Relationships: ${populateResult.stats.total_parent_relationships}`);
            
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
            
          } catch (error) {
            console.error(`❌ Error populating KuzuDB for ${evolutionRunId}:`, error);
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].kuzuDBPopulation = {
              success: false,
              error: error.message,
              timestamp: new Date().toISOString()
            };
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
        }
          if( oneAnalysisOperation === "diversity-measures" ) { // across all iterations
            const diversityMeasures = await getEliteMapDiversityForAllIterations( evoRunConfig, evolutionRunId, stepSize );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].diversityMeasures = diversityMeasures;
            console.log(`Added diversity measures to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
          if( oneAnalysisOperation === "qd-scores" ) {
            const qdScores = await calculateQDScoresForAllIterations( evoRunConfig, evolutionRunId, stepSize, excludeEmptyCells, classRestrictionList, maxIterationIndex );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].qdScores = qdScores;
            console.log(`Added ${qdScores.length} QD scores to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
          if( oneAnalysisOperation === "grid-mean-fitness" ) {
            const gridMeanFitness = await calculateGridMeanFitnessForAllIterations( evoRunConfig, evolutionRunId, stepSize );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].gridMeanFitness = gridMeanFitness;
            console.log(`Added grid mean fitness to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
          if( oneAnalysisOperation === "genome-statistics" ) {
            const genomeStatistics = await getGenomeStatisticsAveragedForAllIterations( evoRunConfig, evolutionRunId, stepSize, excludeEmptyCells, classRestrictionList, maxIterationIndex );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].genomeStatistics = genomeStatistics;
            console.log(`Added genome statistics to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
          if( oneAnalysisOperation === "cell-scores" ) {
            const cellScores = await getCellScoresForAllIterations( evoRunConfig, evolutionRunId, stepSize );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].cellScores = cellScores;
            console.log(`Added cell scores to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
          if( oneAnalysisOperation === "coverage" ) {
            const coverage = await getCoverageForAllIterations( evoRunConfig, evolutionRunId, stepSize, scoreThreshold );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].coverage = coverage;
            console.log(`Added coverage to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
          if( oneAnalysisOperation === "score-matrices" ) {
            const {scoreMatrices, coveragePercentage} = await getScoreMatricesForAllIterations( evoRunConfig, evolutionRunId, stepSize, terrainName, false/*includeGenomeId*/ );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].scoreMatrices = scoreMatrices;
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].coveragePercentage = coveragePercentage;
            console.log(`Added score matrices to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
          if( oneAnalysisOperation === "score-and-genome-matrices" ) {
            const {scoreMatrices, coveragePercentage, evolutionRunConfig} = await getScoreMatricesForAllIterations( evoRunConfig, evolutionRunId, stepSize, terrainName, true/*includeGenomeId*/ );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].scoreAndGenomeMatrices = scoreMatrices;
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].coveragePercentage = coveragePercentage;
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].evolutionRunConfig = evolutionRunConfig;
            console.log(`Added score matrices to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
          if( oneAnalysisOperation === "score-matrix" ) {
            const {scoreMatrix, coveragePercentage} = await getScoreMatrixForLastIteration( evoRunConfig, evolutionRunId, terrainName );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].scoreMatrix = scoreMatrix;
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].coveragePercentage = coveragePercentage;
            console.log(`Added score matrix to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
          if( oneAnalysisOperation === "score-and-genome-matrix" ) {
            const {scoreMatrix, coveragePercentage, evolutionRunConfig} = await getScoreMatrixForLastIteration( evoRunConfig, evolutionRunId, terrainName, true/*includeGenomeId*/ );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].scoreAndGenomeMatrix = scoreMatrix;
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].coveragePercentage = coveragePercentage;
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].evolutionRunConfig = evolutionRunConfig;
            console.log(`Added score matrix to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
          if( oneAnalysisOperation === "new-elite-count") {
            const newEliteCount = await getNewEliteCountForAllIterations( evoRunConfig, evolutionRunId, stepSize );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].newEliteCount = newEliteCount;
            console.log(`Added new elite count to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
          if( oneAnalysisOperation === "elite-generations" ) {
            const eliteGenerations = await getCellSaturationGenerations( evoRunConfig, evolutionRunId );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].eliteGenerationsLabeled = eliteGenerations;
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].eliteGenerations = Object.values(eliteGenerations);
            console.log(`Added elite generations to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
          if( oneAnalysisOperation === "genome-sets" ) {
            const genomeSets = await getGenomeCountsForAllIterations( evoRunConfig, evolutionRunId, stepSize );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].genomeSets = genomeSets;
            console.log(`Added genome sets to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
          if( oneAnalysisOperation === "genome-sets-through-rendering-variations" ) {
            const genomeSetsThroughRenderingVariations = await getGenomeCountsWithRenderingVariationsAsContainerDimensionsForAllIterations( evoRunConfig, evolutionRunId, stepSize );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].genomeSetsThroughRenderingVariations = genomeSetsThroughRenderingVariations;
            console.log(`Added genome sets through rendering variations to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
          if( oneAnalysisOperation == "variance" ) {
            const scoreVariances = await getScoreVarianceForAllIterations( evoRunConfig, evolutionRunId, stepSize );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].scoreVariances = scoreVariances;
            console.log(`Added score variances to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
          if( oneAnalysisOperation == "elites-energy" ) {
            const elitesEnergy = await getElitesEnergy( evoRunConfig, evolutionRunId, stepSize, excludeEmptyCells, classRestrictionList, maxIterationIndex );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].elitesEnergy = elitesEnergy;
            console.log(`Added elites energy to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
          if( oneAnalysisOperation === "goal-switches" ) {
            // TODO: make contextArrays configurable
            const contextArrays = [yamnetTags_non_musical, yamnetTags_musical];
            const goalSwitches = await getGoalSwitches( evoRunConfig, evolutionRunId, stepSize, evoParams, contextArrays );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].goalSwitches = goalSwitches;
            console.log(`Added goal switches to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
          if( oneAnalysisOperation === "goal-switches-through-lineages" ) {
            // TODO: make contextArrays configurable
            const contextArrays = [yamnetTags_non_musical, yamnetTags_musical];
            const goalSwitchesThroughLineages = await getGoalSwitchesThroughLineages( evoRunConfig, evolutionRunId, evoParams, contextArrays );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].goalSwitchesThroughLineages = goalSwitchesThroughLineages;
            console.log(`Added goal switches through lineages to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
          if( oneAnalysisOperation === "lineage" ) {
            // const lineage = await getLineageGraphData( evoRunConfig, evolutionRunId, stepSize );
            // Clear out lineage data from other iterations, only keep for the current one
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations.forEach((it, idx) => {
              if (idx !== currentEvolutionRunIteration && it.lineage !== undefined) {
                delete it.lineage;
              }
            });
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].lineage = lineage;
            console.log(`Added lineage to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis, currentEvolutionRunIteration );
          }
          if( oneAnalysisOperation === "populate-kuzudb" ) {
            console.log(`Populating KuzuDB with lineage data for iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            
            if (lineage && lineage.length > 0) {
              try {
                // Construct KuzuDB path for this evolution run
                const evoRunDirPath = `${evoRunConfig.evoRunsDirPath}${evolutionRunId}/`;
                const kuzuDbPath = path.join(evoRunDirPath, `${evolutionRunId}.kuzu`);
                
                // Initialize KuzuDB for this evolution run
                const initResult = await initializeKuzuDB(kuzuDbPath);
                console.log(`Initialized KuzuDB: ${initResult.dbPath}`);
                
                // Populate with lineage data
                const populateResult = await populateKuzuDBWithLineage(evoRunConfig, evolutionRunId, lineage);
                console.log(`Populated KuzuDB with ${populateResult.stats.total_sounds} sounds and ${populateResult.stats.total_parent_relationships} relationships`);
                
                // Store database info in analysis results
                evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].kuzudb = {
                  dbPath: populateResult.dbPath,
                  stats: populateResult.stats,
                  success: populateResult.success
                };
                
                writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
              } catch (error) {
                console.error(`Error populating KuzuDB for ${evolutionRunId}:`, error);
                evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].kuzudb = {
                  error: error.message,
                  success: false
                };
                writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
              }
            } else {
              console.warn(`No lineage data available for KuzuDB population for ${evolutionRunId}`);
              evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].kuzudb = {
                error: "No lineage data available",
                success: false
              };
              writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
            }
          }
          if( oneAnalysisOperation === "duration-pitch-delta-velocity-combinations" ) {
            const durationPitchDeltaVelocityCombinations = await getDurationPitchDeltaVelocityCombinations( evoRunConfig, evolutionRunId, stepSize, uniqueGenomes );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].durationPitchDeltaVelocityCombinations = durationPitchDeltaVelocityCombinations;
            console.log(`Added duration delta pitch combinations to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
            writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
          }
        }
      }
    }

    // aggregate iterations
    evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"] = {};
    for( const oneAnalysisOperation of analysisOperationsList ) {
      if( oneAnalysisOperation === "diversity-measures" ) {
        // assume diversityMeasures is an object with keys for each terrain / eliteMap
        const diversityMeasuresAcrossIterations = {};
        for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
          const { diversityMeasures } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
          for( const oneTerrainName in diversityMeasures ) {
            if( ! diversityMeasuresAcrossIterations[oneTerrainName] ) {
              diversityMeasuresAcrossIterations[oneTerrainName] = [];
            }
            diversityMeasuresAcrossIterations[oneTerrainName].push( diversityMeasures[oneTerrainName] );
          }
        }
        for( const oneTerrainName in diversityMeasuresAcrossIterations ) {
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["diversityMeasures"] = {};
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["diversityMeasures"][oneTerrainName] = {};
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["diversityMeasures"][oneTerrainName]["means"] = mean( diversityMeasuresAcrossIterations[oneTerrainName], 0 );
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["diversityMeasures"][oneTerrainName]["variances"] = variance( diversityMeasuresAcrossIterations[oneTerrainName], 0 );
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["diversityMeasures"][oneTerrainName]["stdDevs"] = std( diversityMeasuresAcrossIterations[oneTerrainName], 0 );
        }
        writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
      }
      if( oneAnalysisOperation === "grid-mean-fitness" ) {
        // assume gridMeanFitness is an object with keys for each terrain / eliteMap
        const gridMeanFitnessAcrossIterations = {};
        for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
          const { gridMeanFitness } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
          for( const oneTerrainName in gridMeanFitness ) {
            if( ! gridMeanFitnessAcrossIterations[oneTerrainName] ) {
              gridMeanFitnessAcrossIterations[oneTerrainName] = [];
            }
            gridMeanFitnessAcrossIterations[oneTerrainName].push( gridMeanFitness[oneTerrainName] );
          }
        }
        for( const oneTerrainName in gridMeanFitnessAcrossIterations ) {
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["gridMeanFitness"] = {};
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["gridMeanFitness"][oneTerrainName] = {};
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["gridMeanFitness"][oneTerrainName]["means"] = mean( gridMeanFitnessAcrossIterations[oneTerrainName], 0 );
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["gridMeanFitness"][oneTerrainName]["variances"] = variance( gridMeanFitnessAcrossIterations[oneTerrainName], 0 );
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["gridMeanFitness"][oneTerrainName]["stdDevs"] = std( gridMeanFitnessAcrossIterations[oneTerrainName], 0 );
        }
        writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
      }
      if( oneAnalysisOperation === "qd-scores" ) {
        console.log("aggregating qd scores for evolution run #", currentEvolutionRunIndex, "...");
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["qdScores"] = {};
        if( Array.isArray(evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[0].qdScores) ) {
          const qdScoresAcrossIterations = [];
          for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
            // sum each iteration's qd scores
            const { qdScores } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
            qdScoresAcrossIterations.push( qdScores );
          }
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["qdScores"]["means"] = mean( qdScoresAcrossIterations, 0 );
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["qdScores"]["variances"] = variance( qdScoresAcrossIterations, 0 );
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["qdScores"]["stdDevs"] = std( qdScoresAcrossIterations, 0 );
        } else {
          // assume qdScores is an object with keys for each terrain / eliteMap
          const qdScoresAcrossIterations = {};
          for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
            // sum each iteration's qd scores
            const { qdScores } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
            for( const oneTerrainName in qdScores ) {	
              if( ! qdScoresAcrossIterations[oneTerrainName] ) {
                qdScoresAcrossIterations[oneTerrainName] = [];
              }
              qdScoresAcrossIterations[oneTerrainName].push( qdScores[oneTerrainName] );
            }
          }
          for( const oneTerrainName in qdScoresAcrossIterations ) {
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["qdScores"][oneTerrainName] = {};
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["qdScores"][oneTerrainName]["means"] = mean( qdScoresAcrossIterations[oneTerrainName], 0 );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["qdScores"][oneTerrainName]["variances"] = variance( qdScoresAcrossIterations[oneTerrainName], 0 );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["qdScores"][oneTerrainName]["stdDevs"] = std( qdScoresAcrossIterations[oneTerrainName], 0 );
          }
        }
        writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
      }
      if( oneAnalysisOperation === "genome-statistics" ) {
        console.log("aggregating genome statistics for evolution run #", currentEvolutionRunIndex, "...");
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"] = {};
        const averageCppnNodeCountsAcrossIterations = [];
        const averageCppnConnectionCountsAcrossIterations = [];
        const averageAsNEATPatchNodeCountsAcrossIterations = [];
        const averageAsNEATPatchConnectionCountsAcrossIterations = [];
        
        const averageNetworkOuputsCountsAcrossIterations = [];
        const averageFrequencyRangesCountsAcrossIterations = [];
        const cppnCountsAcrossIterations = [];

        const cppnNodeTypeCountObjectsAcrossIterations = [];
        const asNEATPatchNodeTypeCountObjectsAcrossIterations = [];
        for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
          const { genomeStatistics } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
          averageCppnNodeCountsAcrossIterations.push( genomeStatistics.map( statsAtEvoIt => statsAtEvoIt.averageCppnNodeCount ) );
          averageCppnConnectionCountsAcrossIterations.push( genomeStatistics.map( statsAtEvoIt => statsAtEvoIt.averageCppnConnectionCount ) );
          averageAsNEATPatchNodeCountsAcrossIterations.push( genomeStatistics.map( statsAtEvoIt => statsAtEvoIt.averageAsNEATPatchNodeCount ) );
          averageAsNEATPatchConnectionCountsAcrossIterations.push( genomeStatistics.map( statsAtEvoIt => statsAtEvoIt.averageAsNEATPatchConnectionCount ) );

          averageNetworkOuputsCountsAcrossIterations.push( genomeStatistics.map( statsAtEvoIt => statsAtEvoIt.averageNetworkOutputsCount ) );
          averageFrequencyRangesCountsAcrossIterations.push( genomeStatistics.map( statsAtEvoIt => statsAtEvoIt.averageFrequencyRangesCount ) );
          cppnCountsAcrossIterations.push( genomeStatistics.map( statsAtEvoIt => statsAtEvoIt.cppnCount ) );

          cppnNodeTypeCountObjectsAcrossIterations.push( genomeStatistics[genomeStatistics.length-1].cppnNodeTypeCounts );
          asNEATPatchNodeTypeCountObjectsAcrossIterations.push( genomeStatistics[genomeStatistics.length-1].asNEATPatchNodeTypeCounts );
        }
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageCppnNodeCounts"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageCppnNodeCounts"]["means"] = mean( averageCppnNodeCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageCppnNodeCounts"]["variances"] = variance( averageCppnNodeCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageCppnNodeCounts"]["stdDevs"] = std( averageCppnNodeCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageCppnConnectionCounts"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageCppnConnectionCounts"]["means"] = mean( averageCppnConnectionCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageCppnConnectionCounts"]["variances"] = variance( averageCppnConnectionCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageCppnConnectionCounts"]["stdDevs"] = std( averageCppnConnectionCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageAsNEATPatchNodeCounts"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageAsNEATPatchNodeCounts"]["means"] = mean( averageAsNEATPatchNodeCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageAsNEATPatchNodeCounts"]["variances"] = variance( averageAsNEATPatchNodeCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageAsNEATPatchNodeCounts"]["stdDevs"] = std( averageAsNEATPatchNodeCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageAsNEATPatchConnectionCounts"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageAsNEATPatchConnectionCounts"]["means"] = mean( averageAsNEATPatchConnectionCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageAsNEATPatchConnectionCounts"]["variances"] = variance( averageAsNEATPatchConnectionCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageAsNEATPatchConnectionCounts"]["stdDevs"] = std( averageAsNEATPatchConnectionCountsAcrossIterations, 0 );

        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageNetworkOutputsCounts"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageNetworkOutputsCounts"]["means"] = mean( averageNetworkOuputsCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageNetworkOutputsCounts"]["variances"] = variance( averageNetworkOuputsCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageNetworkOutputsCounts"]["stdDevs"] = std( averageNetworkOuputsCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageFrequencyRangesCounts"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageFrequencyRangesCounts"]["means"] = mean( averageFrequencyRangesCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageFrequencyRangesCounts"]["variances"] = variance( averageFrequencyRangesCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["averageFrequencyRangesCounts"]["stdDevs"] = std( averageFrequencyRangesCountsAcrossIterations, 0 );

        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["cppnCounts"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["cppnCounts"]["means"] = mean( cppnCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["cppnCounts"]["variances"] = variance( cppnCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["cppnCounts"]["stdDevs"] = std( cppnCountsAcrossIterations, 0 );

        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["cppnNodeTypeCounts"] = averageAttributes( cppnNodeTypeCountObjectsAcrossIterations );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["cppnNodeTypeCountsStdDevs"] = standardDeviationAttributes( cppnNodeTypeCountObjectsAcrossIterations, 0 );	
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["asNEATPatchNodeTypeCounts"] = averageAttributes( asNEATPatchNodeTypeCountObjectsAcrossIterations );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeStatistics"]["asNEATPatchNodeTypeCountsStdDevs"] = standardDeviationAttributes( asNEATPatchNodeTypeCountObjectsAcrossIterations, 0 );

        writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
      }
      if( oneAnalysisOperation === "cell-scores" ) {
        console.log("aggregating cell scores for evolution run #", currentEvolutionRunIndex, "...");
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["cellScores"] = {};
        const cellScoreSums = new Array( currentEvoConfig.iterations.length );
        const cellScoresAcrossIterations = [];
        for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
          const { cellScores } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
          cellScoresAcrossIterations.push( cellScores );
        }
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["cellScores"]["means"] = mean( cellScoresAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["cellScores"]["variances"] = variance( cellScoresAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["cellScores"]["stdDevs"] = std( cellScoresAcrossIterations, 0 );

        writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
      }
      if( oneAnalysisOperation === "coverage" ) {
        console.log("aggregating coverage for evolution run #", currentEvolutionRunIndex, "...");
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["coverage"] = {};

        if( Array.isArray(evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[0].coverage) ) {
          const coverageAcrossIterations = [];
          for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
            const { coverage } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
            coverageAcrossIterations.push( coverage );
          }
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["coverage"]["means"] = mean( coverageAcrossIterations, 0 );
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["coverage"]["variances"] = variance( coverageAcrossIterations, 0 );
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["coverage"]["stdDevs"] = std( coverageAcrossIterations, 0 );
        } else {
          // assume coverage is an object with keys for each terrain / eliteMap
          const coverageAcrossIterations = {};
          for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
            const { coverage } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
            for( const oneTerrainName in coverage ) {
              if( ! coverageAcrossIterations[oneTerrainName] ) {
                coverageAcrossIterations[oneTerrainName] = [];
              }
              coverageAcrossIterations[oneTerrainName].push( coverage[oneTerrainName] );
            }
          }
          for( const oneTerrainName in coverageAcrossIterations ) {
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["coverage"][oneTerrainName] = {};
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["coverage"][oneTerrainName]["means"] = mean( coverageAcrossIterations[oneTerrainName], 0 );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["coverage"][oneTerrainName]["variances"] = variance( coverageAcrossIterations[oneTerrainName], 0 );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["coverage"][oneTerrainName]["stdDevs"] = std( coverageAcrossIterations[oneTerrainName], 0 );
          }
        }
        writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
      }
      if( oneAnalysisOperation === "new-elite-count") {
        console.log("aggregating new elite count for evolution run #", currentEvolutionRunIndex, "...");
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["newEliteCount"] = {};
        if( Array.isArray(evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[0].newEliteCount) ) {
          const newEliteCountAcrossIterations = [];
          for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
            const { newEliteCount } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
            newEliteCountAcrossIterations.push( newEliteCount );
          }
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["newEliteCount"]["means"] = mean( newEliteCountAcrossIterations, 0 );
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["newEliteCount"]["variances"] = variance( newEliteCountAcrossIterations, 0 );
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["newEliteCount"]["stdDevs"] = std( newEliteCountAcrossIterations, 0 );
        } else {
          // assume newEliteCount is an object with keys for each terrain / eliteMap
          const newEliteCountAcrossIterations = {};
          for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
            const { newEliteCount } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
            for( const oneTerrainName in newEliteCount ) {
              if( ! newEliteCountAcrossIterations[oneTerrainName] ) {
                newEliteCountAcrossIterations[oneTerrainName] = [];
              }
              newEliteCountAcrossIterations[oneTerrainName].push( newEliteCount[oneTerrainName] );
            }
          }
          for( const oneTerrainName in newEliteCountAcrossIterations ) {
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["newEliteCount"][oneTerrainName] = {};
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["newEliteCount"][oneTerrainName]["means"] = mean( newEliteCountAcrossIterations[oneTerrainName], 0 );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["newEliteCount"][oneTerrainName]["variances"] = variance( newEliteCountAcrossIterations[oneTerrainName], 0 );
            evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["newEliteCount"][oneTerrainName]["stdDevs"] = std( newEliteCountAcrossIterations[oneTerrainName], 0 );
          }
        }
        writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
      }
      if( oneAnalysisOperation === "genome-sets" ) {
        console.log("aggregating genome sets for evolution run #", currentEvolutionRunIndex, "...");
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"] = {};
        const genomeCountsAcrossIterations = [];
        const nodeAndConnectionCountSetAcrossIterations = [];
        const genomeSetsAdditionsAcrossIterations = [];
        const genomeSetsRemovalsAcrossIterations = [];
        for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
          const { genomeSets } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
          let { genomeCount, nodeAndConnectionCountSetCount, genomeSetsAdditions, genomeSetsRemovals } = genomeSets;
          genomeCountsAcrossIterations.push( genomeCount );
          nodeAndConnectionCountSetAcrossIterations.push( nodeAndConnectionCountSetCount );
          // replace undefined array elements with zeros
          for( let i = 0; i < genomeSetsAdditions.length; i++ ) {
            if( genomeSetsAdditions[i] === undefined ) genomeSetsAdditions[i] = 0;
          }
          genomeSetsAdditionsAcrossIterations.push( genomeSetsAdditions );
          // replace undefined values with 0
          for( let i = 0; i < genomeSetsRemovals.length; i++ ) {
            if( genomeSetsRemovals[i] === undefined ) genomeSetsRemovals[i] = 0;
          }
          genomeSetsRemovalsAcrossIterations.push( genomeSetsRemovals );
        }
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeCounts"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeCounts"]["means"] = mean( genomeCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeCounts"]["variances"] = variance( genomeCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeCounts"]["stdDevs"] = std( genomeCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["nodeAndConnectionCountSetCounts"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["nodeAndConnectionCountSetCounts"]["means"] = mean( nodeAndConnectionCountSetAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["nodeAndConnectionCountSetCounts"]["variances"] = variance( nodeAndConnectionCountSetAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["nodeAndConnectionCountSetCounts"]["stdDevs"] = std( nodeAndConnectionCountSetAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeSetsAdditions"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeSetsAdditions"]["means"] = mean( genomeSetsAdditionsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeSetsAdditions"]["variances"] = variance( genomeSetsAdditionsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeSetsAdditions"]["stdDevs"] = std( genomeSetsAdditionsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeSetsRemovals"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeSetsRemovals"]["means"] = mean( genomeSetsRemovalsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeSetsRemovals"]["variances"] = variance( genomeSetsRemovalsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSets"]["genomeSetsRemovals"]["stdDevs"] = std( genomeSetsRemovalsAcrossIterations, 0 );
        
        writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
      }
      if( oneAnalysisOperation === "genome-sets-through-rendering-variations" ) {
        console.log("aggregating genome sets through rendering variations for evolution run #", currentEvolutionRunIndex, "...");
        function calculateGenomeCountStatistics(data) {
          // Extract all genomeCount arrays
          const genomeCounts = data.map(item => item.genomeSetsThroughRenderingVariations.genomeCount);
        
          // Determine the number of positions in genomeCount
          const numPositions = genomeCounts[0].length;
        
          // Initialize arrays to store statistics for each position
          const positionStats = Array(numPositions).fill().map(() => ({
            sums: {},
            sumOfSquares: {},
            counts: {}
          }));
        
          // Iterate through all genomeCount arrays
          genomeCounts.forEach(genomeCountArray => {
            genomeCountArray.forEach((obj, position) => {
              Object.entries(obj).forEach(([key, value]) => {
                if (!positionStats[position].sums[key]) {
                  positionStats[position].sums[key] = 0;
                  positionStats[position].sumOfSquares[key] = 0;
                  positionStats[position].counts[key] = 0;
                }
                positionStats[position].sums[key] += value;
                positionStats[position].sumOfSquares[key] += value * value;
                positionStats[position].counts[key]++;
              });
            });
          });
        
          // Calculate means, variances, and standard deviations for each position
          const means = [];
          const variances = [];
          const stdDevs = [];
        
          positionStats.forEach((stats, position) => {
            means[position] = {};
            variances[position] = {};
            stdDevs[position] = {};
        
            Object.keys(stats.sums).forEach(key => {
              const mean = stats.sums[key] / stats.counts[key];
              means[position][key] = mean;
        
              const variance = (stats.sumOfSquares[key] / stats.counts[key]) - (mean * mean);
              variances[position][key] = variance;
        
              stdDevs[position][key] = Math.sqrt(variance);
            });
          });
        
          // Structure the results
          return {
            aggregates: {
              genomeSetsThroughRenderingVariations: {
                genomeCount: {
                  means,
                  variances,
                  stdDevs
                }
              }
            }
          };
        }
        const genomeSetsThroughRenderingVariations = calculateGenomeCountStatistics(evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations);
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["genomeSetsThroughRenderingVariations"] = genomeSetsThroughRenderingVariations.aggregates.genomeSetsThroughRenderingVariations;
        writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
      }
      if( oneAnalysisOperation == "elites-energy" ) {
        console.log("aggregating elites energy for evolution run #", currentEvolutionRunIndex, "...");
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["elitesEnergy"] = {};
        const averageEnergiesAcrossIterations = [];
        const eliteIterationEnergiesAcrossIterations = [];
        for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
          const { elitesEnergy } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
          const { averageEnergy, eliteIterationEnergies } = elitesEnergy;
          averageEnergiesAcrossIterations.push( averageEnergy );
          eliteIterationEnergiesAcrossIterations.push( eliteIterationEnergies );
        }
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["elitesEnergy"]["averageEnergies"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["elitesEnergy"]["averageEnergies"]["means"] = mean( averageEnergiesAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["elitesEnergy"]["averageEnergies"]["variances"] = variance( averageEnergiesAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["elitesEnergy"]["averageEnergies"]["stdDevs"] = std( averageEnergiesAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["elitesEnergy"]["eliteIterationEnergies"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["elitesEnergy"]["eliteIterationEnergies"]["means"] = mean( eliteIterationEnergiesAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["elitesEnergy"]["eliteIterationEnergies"]["variances"] = variance( eliteIterationEnergiesAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["elitesEnergy"]["eliteIterationEnergies"]["stdDevs"] = std( eliteIterationEnergiesAcrossIterations, 0 );

        writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
      }
      if( oneAnalysisOperation === "goal-switches" ) {
        console.log("aggregating goal switches for evolution run #", currentEvolutionRunIndex, "...");
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"] = {};
        const averageChampionCountsAcrossIterations = [];
        const averageGoalSwitchCountsAcrossIterations = [];
        const goalSwitchScoreCorrelationsAcrossIterations = [];
        const averageContextSwitchCountAcrossIterations = [];
        const averageContextDwellCountAcrossIterations = [];
        const contextSwitchDwellRatioAcrossIterations = [];
        for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
          const { goalSwitches } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
          const { 
            averageChampionCount, averageGoalSwitchCount, 
            goalSwitchScoreCorrelation, 
            averageContextSwitchCount, averageContextDwellCount, contextSwitchDwellRatio
          } = goalSwitches;
          averageChampionCountsAcrossIterations.push( averageChampionCount );
          averageGoalSwitchCountsAcrossIterations.push( averageGoalSwitchCount );
          goalSwitchScoreCorrelationsAcrossIterations.push( goalSwitchScoreCorrelation );
          averageContextSwitchCountAcrossIterations.push( averageContextSwitchCount );
          averageContextDwellCountAcrossIterations.push( averageContextDwellCount );
          contextSwitchDwellRatioAcrossIterations.push( contextSwitchDwellRatio );
        }
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageChampionCounts"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageChampionCounts"]["means"] = mean( averageChampionCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageChampionCounts"]["variances"] = variance( averageChampionCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageChampionCounts"]["stdDevs"] = std( averageChampionCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageGoalSwitchCounts"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageGoalSwitchCounts"]["means"] = mean( averageGoalSwitchCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageGoalSwitchCounts"]["variances"] = variance( averageGoalSwitchCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageGoalSwitchCounts"]["stdDevs"] = std( averageGoalSwitchCountsAcrossIterations, 0 );

        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["goalSwitchScoreCorrelations"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["goalSwitchScoreCorrelations"]["means"] = mean( goalSwitchScoreCorrelationsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["goalSwitchScoreCorrelations"]["variances"] = variance( goalSwitchScoreCorrelationsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["goalSwitchScoreCorrelations"]["stdDevs"] = std( goalSwitchScoreCorrelationsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageContextSwitchCount"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageContextSwitchCount"]["means"] = mean( averageContextSwitchCountAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageContextSwitchCount"]["variances"] = variance( averageContextSwitchCountAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageContextSwitchCount"]["stdDevs"] = std( averageContextSwitchCountAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageContextDwellCount"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageContextDwellCount"]["means"] = mean( averageContextDwellCountAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageContextDwellCount"]["variances"] = variance( averageContextDwellCountAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["averageContextDwellCount"]["stdDevs"] = std( averageContextDwellCountAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["contextSwitchDwellRatio"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["contextSwitchDwellRatio"]["means"] = mean( contextSwitchDwellRatioAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["contextSwitchDwellRatio"]["variances"] = variance( contextSwitchDwellRatioAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitches"]["contextSwitchDwellRatio"]["stdDevs"] = std( contextSwitchDwellRatioAcrossIterations, 0 );

        writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
      }
      if( oneAnalysisOperation === "goal-switches-through-lineages" ) {
        console.log("aggregating goal switches through lineages for evolution run #", currentEvolutionRunIndex, "...");
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"] = {};
        const averageGoalSwitchCountsAcrossIterations = [];
        const goalSwitchScoreCorrelationsAcrossIterations = [];
        const averageContextSwitchCountsAcrossIterations = [];
        const averageContextDwellCountsAcrossIterations = [];
        const contextSwitchDwellRatiosAcrossIterations = [];
        for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
          const { goalSwitchesThroughLineages } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
          const { 
            goalSwitchesToCells, averageGoalSwitchCount,
            goalSwitchScoreCorrelation,
            averageContextSwitchCount, averageContextDwellCount, contextSwitchDwellRatio
          } = goalSwitchesThroughLineages;
          averageGoalSwitchCountsAcrossIterations.push( averageGoalSwitchCount );
          goalSwitchScoreCorrelationsAcrossIterations.push( goalSwitchScoreCorrelation );
          averageContextSwitchCountsAcrossIterations.push( averageContextSwitchCount );
          averageContextDwellCountsAcrossIterations.push( averageContextDwellCount );
          contextSwitchDwellRatiosAcrossIterations.push( contextSwitchDwellRatio );
        }
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageGoalSwitchCounts"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageGoalSwitchCounts"]["means"] = mean( averageGoalSwitchCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageGoalSwitchCounts"]["variances"] = variance( averageGoalSwitchCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageGoalSwitchCounts"]["stdDevs"] = std( averageGoalSwitchCountsAcrossIterations, 0 );

        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageGoalSwitchScoreCorrelations"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageGoalSwitchScoreCorrelations"]["means"] = mean( goalSwitchScoreCorrelationsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageGoalSwitchScoreCorrelations"]["variances"] = variance( goalSwitchScoreCorrelationsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageGoalSwitchScoreCorrelations"]["stdDevs"] = std( goalSwitchScoreCorrelationsAcrossIterations, 0 );

        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageContextSwitchCounts"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageContextSwitchCounts"]["means"] = mean( averageContextSwitchCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageContextSwitchCounts"]["variances"] = variance( averageContextSwitchCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageContextSwitchCounts"]["stdDevs"] = std( averageContextSwitchCountsAcrossIterations, 0 );

        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageContextDwellCounts"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageContextDwellCounts"]["means"] = mean( averageContextDwellCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageContextDwellCounts"]["variances"] = variance( averageContextDwellCountsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["averageContextDwellCounts"]["stdDevs"] = std( averageContextDwellCountsAcrossIterations, 0 );

        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["contextSwitchDwellRatios"] = {};
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["contextSwitchDwellRatios"]["means"] = mean( contextSwitchDwellRatiosAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["contextSwitchDwellRatios"]["variances"] = variance( contextSwitchDwellRatiosAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["goalSwitchesThroughLineages"]["contextSwitchDwellRatios"]["stdDevs"] = std( contextSwitchDwellRatiosAcrossIterations, 0 );

        writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
      }
      if( oneAnalysisOperation === "elite-generations" ) {
        console.log("aggregating elite generations for evolution run #", currentEvolutionRunIndex, "...");
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["eliteGenerations"] = {};
        const eliteGenerationsAcrossIterations = [];
        for( let currentEvolutionRunIteration = 0; currentEvolutionRunIteration < currentEvoConfig.iterations.length; currentEvolutionRunIteration++ ) {
          const { eliteGenerations } = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration];
          eliteGenerationsAcrossIterations.push( eliteGenerations );
        }
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["eliteGenerations"]["means"] = mean( eliteGenerationsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["eliteGenerations"]["variances"] = variance( eliteGenerationsAcrossIterations, 0 );
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["eliteGenerations"]["stdDevs"] = std( eliteGenerationsAcrossIterations, 0 );

        writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis );
      }
      /**
       * aggregation for founder-innovation analysis
       */
      if (oneAnalysisOperation === "founder-innovation") {
        console.log("aggregating founder and innovation metrics for evolution run #", currentEvolutionRunIndex, "...");
        
        // Helper function to calculate statistics from an array of values
        function calculateStats(values) {
          if (!values || values.length === 0) {
            return { mean: 0, variance: 0, stdDev: 0 };
          }
          
          const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
          
          // Calculate variance
          const variance = values.length > 1 ? 
            values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length : 0;
          
          // Calculate standard deviation
          const stdDev = Math.sqrt(variance);
          
          return { mean, variance, stdDev };
        }
        
        // Filter out iterations without valid data
        const validIterations = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations
          .filter(iter => iter.founderInnovation && iter.founderInnovation.topFounders && iter.founderInnovation.topFounders.length > 0);
        
        // Extract data arrays for statistical calculations
        const founderScores = validIterations
          .map(iter => iter.founderInnovation.topFounders[0].founderScore);
          
        const founderDescendantCounts = validIterations
          .map(iter => iter.founderInnovation.topFounders[0].descendantCount);
          
        const founderClassCounts = validIterations
          .map(iter => iter.founderInnovation.topFounders[0].uniqueClassCount || 1);
        
        // Get burst data from valid iterations
        const validBurstIterations = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations
          .filter(iter => 
            iter.founderInnovation && 
            iter.founderInnovation.innovationBursts && 
            iter.founderInnovation.innovationBursts.topBursts && 
            iter.founderInnovation.innovationBursts.topBursts.length > 0
          );
          
        const burstMagnitudes = validBurstIterations
          .map(iter => iter.founderInnovation.innovationBursts.topBursts[0].burstMagnitude);
          
        const burstCounts = validBurstIterations
          .map(iter => iter.founderInnovation.innovationBursts.topBursts.length);
        
        // Get stepping stone data
        const validSteppingStoneIterations = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations
          .filter(iter => iter.steppingStones && iter.steppingStones.length > 0);
          
        const steppingStoneScores = validSteppingStoneIterations
          .map(iter => iter.steppingStones[0].steppingStoneScore);
          
        const steppingStoneDescendantCounts = validSteppingStoneIterations
          .map(iter => iter.steppingStones[0].descendantCount);
        
        // Calculate statistics for each metric
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["founderInnovation"] = {
          founders: {
            // Top founder score statistics
            topFounderScore: calculateStats(founderScores),
            
            // Descendant count statistics
            descendantCount: calculateStats(founderDescendantCounts),
            
            // Unique class count statistics
            uniqueClassCount: calculateStats(founderClassCounts)
          },
          
          bursts: {
            // Burst magnitude statistics
            burstMagnitude: calculateStats(burstMagnitudes),
            
            // Burst count statistics
            burstCount: calculateStats(burstCounts)
          },
          
          steppingStones: {
            // Stepping stone score statistics
            steppingStoneScore: calculateStats(steppingStoneScores),
            
            // Stepping stone descendant count statistics
            descendantCount: calculateStats(steppingStoneDescendantCounts)
          }
        };
        
        // Calculate innovation potential score across iterations (composite score)
        const innovationPotentialScores = validIterations.map(iter => {
          const topFounder = iter.founderInnovation.topFounders[0] || { founderScore: 0 };
          const topBurst = iter.founderInnovation.innovationBursts.topBursts[0] || { burstMagnitude: 0 };
          const terrainAdaptability = topFounder.uniqueTerrainCount || 1;
          
          // Rough approximation of extinction rate
          const totalLineages = iter.founderInnovation.topFounders.reduce(
            (sum, founder) => sum + (founder.descendantCount || 0), 0
          );
          const extinctionRate = totalLineages > 0 ? 
            1 - (iter.founderInnovation.topFounders.length / totalLineages) : 0.5;
          
          // Calculate innovation potential score
          return (topBurst.burstMagnitude * terrainAdaptability) / Math.max(0.1, extinctionRate);
        });
        
        // Add composite metrics
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["founderInnovation"]["compositeMetrics"] = {
          innovationPotential: calculateStats(innovationPotentialScores)
        };
        
        writeAnalysisResult(analysisResultFilePath, evoRunsAnalysis);



        ////// enhanced:

        console.log("aggregating enhanced founder and innovation metrics for evolution run #", currentEvolutionRunIndex, "...");
  
        // Initialize enhanced metrics section if it doesn't exist
        if (!evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["enhancedFounderInnovation"]) {
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["enhancedFounderInnovation"] = {};
        }
        
        // Get valid iterations with enhanced founder innovation metrics
        const validEnhancedIterations = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations
          .filter(iter => 
            iter.enhancedFounderInnovation && 
            iter.enhancedFounderInnovation.normalizedFounders && 
            iter.enhancedFounderInnovation.normalizedFounders.length > 0);
        
        if (validEnhancedIterations.length > 0) {
          // --- Normalized Founder Metrics ---
          const normalizedImpactScores = validEnhancedIterations
            .map(iter => iter.enhancedFounderInnovation.normalizedFounders[0].normalizedImpact);
          
          const effectiveGenerations = validEnhancedIterations
            .map(iter => iter.enhancedFounderInnovation.normalizedFounders[0].effectiveGenerations);
          
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["enhancedFounderInnovation"]["normalizedFounderImpact"] = {
            mean: mean(normalizedImpactScores),
            variance: variance(normalizedImpactScores),
            stdDev: std(normalizedImpactScores)
          };
          
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["enhancedFounderInnovation"]["effectiveGenerations"] = {
            mean: mean(effectiveGenerations),
            variance: variance(effectiveGenerations),
            stdDev: std(effectiveGenerations)
          };
          
          // --- Quality Improvement Metrics ---
          const qualityImprovementScores = validEnhancedIterations
            .map(iter => iter.enhancedFounderInnovation.qualityFounders[0].qualityImprovement);
          
          const avgQualityImprovementScores = validEnhancedIterations
            .map(iter => iter.enhancedFounderInnovation.qualityFounders[0].avgQualityImprovement);
          
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["enhancedFounderInnovation"]["qualityImprovement"] = {
            mean: mean(qualityImprovementScores),
            variance: variance(qualityImprovementScores),
            stdDev: std(qualityImprovementScores)
          };
          
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["enhancedFounderInnovation"]["avgQualityImprovement"] = {
            mean: mean(avgQualityImprovementScores),
            variance: variance(avgQualityImprovementScores),
            stdDev: std(avgQualityImprovementScores)
          };
          
          // --- Class Discovery Rate Metrics ---
          const classDiscoveryRates = validEnhancedIterations
            .map(iter => iter.enhancedFounderInnovation.discoveryRateFounders[0].classDiscoveryRate);
          
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["enhancedFounderInnovation"]["classDiscoveryRate"] = {
            mean: mean(classDiscoveryRates),
            variance: variance(classDiscoveryRates),
            stdDev: std(classDiscoveryRates)
          };
          
          // --- Burst Pattern Metrics ---
          // Aggregate burst distribution across run segments
          const burstDistributions = validEnhancedIterations
            .map(iter => iter.enhancedFounderInnovation.burstPatterns.burstDistribution);
          
          const burstStrengthTrends = validEnhancedIterations
            .map(iter => iter.enhancedFounderInnovation.burstPatterns.burstStrengthTrend);
          
          const avgBurstGaps = validEnhancedIterations
            .map(iter => iter.enhancedFounderInnovation.burstPatterns.averageBurstGap);
          
          const maxBurstGaps = validEnhancedIterations
            .map(iter => iter.enhancedFounderInnovation.burstPatterns.maxBurstGap);
          
          const magnitudeCorrelations = validEnhancedIterations
            .map(iter => iter.enhancedFounderInnovation.burstPatterns.magnitudeToNewClassesCorrelation);
          
          const lateDiscoveryScores = validEnhancedIterations
            .map(iter => iter.enhancedFounderInnovation.burstPatterns.lateDiscoveryScore);
          
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["enhancedFounderInnovation"]["burstDistribution"] = {
            mean: mean(burstDistributions),
            variance: variance(burstDistributions),
            stdDev: std(burstDistributions)
          };
          
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["enhancedFounderInnovation"]["burstStrengthTrend"] = {
            mean: mean(burstStrengthTrends),
            variance: variance(burstStrengthTrends),
            stdDev: std(burstStrengthTrends)
          };
          
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["enhancedFounderInnovation"]["averageBurstGap"] = {
            mean: mean(avgBurstGaps),
            variance: variance(avgBurstGaps),
            stdDev: std(avgBurstGaps)
          };
          
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["enhancedFounderInnovation"]["maxBurstGap"] = {
            mean: mean(maxBurstGaps),
            variance: variance(maxBurstGaps),
            stdDev: std(maxBurstGaps)
          };
          
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["enhancedFounderInnovation"]["magnitudeToNewClassesCorrelation"] = {
            mean: mean(magnitudeCorrelations),
            variance: variance(magnitudeCorrelations),
            stdDev: std(magnitudeCorrelations)
          };
          
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["enhancedFounderInnovation"]["lateDiscoveryScore"] = {
            mean: mean(lateDiscoveryScores),
            variance: variance(lateDiscoveryScores),
            stdDev: std(lateDiscoveryScores)
          };
          
          // --- Composite Metrics ---
          // Calculate exploration-exploitation balance
          const explorationExploitationBalance = validEnhancedIterations.map(iter => {
            const topFounder = iter.enhancedFounderInnovation.normalizedFounders[0];
            const lateDiscovery = iter.enhancedFounderInnovation.burstPatterns.lateDiscoveryScore;
            const classRate = iter.enhancedFounderInnovation.discoveryRateFounders[0].classDiscoveryRate;
            
            // Higher score indicates better balance between exploration and exploitation
            return (topFounder.normalizedImpact * classRate * (1 + lateDiscovery)) / 1000;
          });
          
          // Calculate adaption capacity
          const adaptationCapacity = validEnhancedIterations.map(iter => {
            const qualityImprovement = iter.enhancedFounderInnovation.qualityFounders[0].qualityImprovement;
            const burstGap = iter.enhancedFounderInnovation.burstPatterns.averageBurstGap;
            
            // Higher adaptation capacity means better ability to shift to new areas
            return qualityImprovement * (1 / Math.max(1, burstGap/100));
          });
          
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["enhancedFounderInnovation"]["explorationExploitationBalance"] = {
            mean: mean(explorationExploitationBalance),
            variance: variance(explorationExploitationBalance),
            stdDev: std(explorationExploitationBalance)
          };
          
          evoRunsAnalysis.evoRuns[currentEvolutionRunIndex]["aggregates"]["enhancedFounderInnovation"]["adaptationCapacity"] = {
            mean: mean(adaptationCapacity),
            variance: variance(adaptationCapacity),
            stdDev: std(adaptationCapacity)
          };
          
          console.log(`Added enhanced founder and innovation aggregates to evolution run #${currentEvolutionRunIndex}`);
        } else {
          console.log(`No valid enhanced founder and innovation data for evolution run #${currentEvolutionRunIndex}`);
        }

        // aggregatePhylogeneticMetrics(evoRunsAnalysis, currentEvolutionRunIndex, analysisOperationsList);
        
        writeAnalysisResult(analysisResultFilePath, evoRunsAnalysis);
      }


      if (analysisOperationsList.includes("founder-innovation")) {
        console.log(`Aggregating enhanced metrics for evolution run #${currentEvolutionRunIndex}...`);
        
        // Aggregate founder and innovation metrics
        aggregateEnhancedFounderInnovationMetrics(evoRunsAnalysis, currentEvolutionRunIndex);
        
        // Aggregate timeline data at key checkpoints
        aggregateTimelineData(evoRunsAnalysis, currentEvolutionRunIndex);
        
        console.log(`Enhanced metrics aggregation complete for evolution run #${currentEvolutionRunIndex}`);
        writeAnalysisResult(analysisResultFilePath, evoRunsAnalysis);
      }
      
      // Similarly, for phylogenetic metrics
      if (analysisOperationsList.includes("phylogenetic-metrics") || 
          analysisOperationsList.includes("terrain-transitions") || 
          analysisOperationsList.includes("density-dependence")) {
        
        console.log(`Aggregating enhanced phylogenetic metrics for evolution run #${currentEvolutionRunIndex}...`);
        
        // Aggregate enhanced phylogenetic metrics
        aggregateEnhancedPhylogeneticMetrics(evoRunsAnalysis, currentEvolutionRunIndex);
        
        console.log(`Enhanced phylogenetic metrics aggregation complete for evolution run #${currentEvolutionRunIndex}`);
        writeAnalysisResult(analysisResultFilePath, evoRunsAnalysis);
      }
      

    } // end for( const oneAnalysisOperation of analysisOperationsList ) {
    const aggregatedPhylogeneticMetrics = aggregatePhylogeneticMetrics(evoRunsAnalysis, currentEvolutionRunIndex, analysisOperationsList);
    if( aggregatedPhylogeneticMetrics ) writeAnalysisResult(analysisResultFilePath, evoRunsAnalysis);
  }

  // Run comparison between all runs if requested
  if (analysisOperationsList.includes("phylogenetic-comparison") && runIdsForComparison.length > 1) {
    console.log("Running phylogenetic comparison between all runs...");
    try {
      const comparisonResults = await comparePhylogeneticMetrics(
        getEvolutionRunConfig(evoRunsConfig.baseEvolutionRunConfigFile, cli), 
        runIdsForComparison
      );
      evoRunsAnalysis.phylogeneticComparison = comparisonResults;
      writeAnalysisResult(analysisResultFilePath, evoRunsAnalysis);
    } catch (error) {
      console.error("Error during phylogenetic comparison:", error);
    }
  }

  // Check if aggregate comparison was requested
  if (analysisOperationsList.includes("phylogenetic-aggregate-comparison")) {
    console.log("Running phylogenetic comparison between configuration types...");
    try {
      const comparisonResults = await comparePhylogeneticMetricsAcrossConfigurations(
        evoRunsConfig, 
        evoRunsAnalysis,
        writeToFolder === './' ? 
          `${path.dirname(evoRunsConfig.baseEvolutionRunConfigFile)}/phylogenetic-configuration-comparison.json` : 
          `${writeToFolder}/phylogenetic-configuration-comparison.json`
      );
      evoRunsAnalysis.phylogeneticConfigurationComparison = comparisonResults;
      writeAnalysisResult(analysisResultFilePath, evoRunsAnalysis);
    } catch (error) {
      console.error("Error during phylogenetic configuration comparison:", error);
    }
  }
  
  return evoRunsAnalysis;
}

///// Enhanced Phylogenetic Metrics Analysis

async function enhancedQdAnalysisEvoRuns(oneAnalysisOperation, evoRunsAnalysis, currentEvolutionRunIndex, currentEvolutionRunIteration, evoRunConfig, evolutionRunId, lineage) {
  // This would go in the qdAnalysis_evoRuns function in kromosynth.js
  if (oneAnalysisOperation === "enhanced-phylogenetic-metrics") {
    console.log(`Running enhanced phylogenetic metrics analysis for iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
    
    // Run enhanced phylogenetic analysis
    const options = {
      saveResults: true
    };
    
    try {
      const { metrics } = await analyzeEnhancedPhylogeneticMetrics(evoRunConfig, evolutionRunId, lineage, true);
      evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].enhancedPhylogeneticMetrics = metrics;
      console.log(`Added enhanced phylogenetic metrics to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
      
      // Save to file here or later
    } catch (error) {
      console.error(`Error running enhanced phylogenetic analysis for ${evolutionRunId}:`, error);
    }
  }
  
  if (oneAnalysisOperation === "enhanced-phylogenetic-metrics-over-time") {
    console.log(`Running enhanced phylogenetic metrics over time for iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
    
    try {
      // Use stepSize from cli.flags
      const stepSize = 10; // Default, or use cli.flags.stepSize
      const metricsOverTime = trackEnhancedPhylogeneticMetricsOverTime(evoRunConfig, evolutionRunId, stepSize);
      evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations[currentEvolutionRunIteration].enhancedPhylogeneticMetricsOverTime = metricsOverTime;
      console.log(`Added enhanced phylogenetic metrics over time to iteration ${currentEvolutionRunIteration} of evolution run #${currentEvolutionRunIndex}, ID: ${evolutionRunId}`);
      
      // Save to file
    } catch (error) {
      console.error(`Error tracking enhanced phylogenetic metrics over time for ${evolutionRunId}:`, error);
    }
  }
  
  // if (oneAnalysisOperation === "phylogenetic-configuration-comparison") {
  //   console.log("Running configuration comparison for all runs...");
    
  //   try {
  //     const comparisonResults = compareConfigurationVariants(
  //       evoRunsConfig, // This would be available in the outer scope of qdAnalysis_evoRuns
  //       { saveResults: true }
  //     );
  //     evoRunsAnalysis.enhancedPhylogeneticConfigurationComparison = comparisonResults;
      
  //     // Print summary for user
  //     console.log("\n===== PHYLOGENETIC CONFIGURATION COMPARISON SUMMARY =====");
      
  //     if (comparisonResults.summary.mostDiverseConfiguration) {
  //       console.log(`Most Diverse Configuration: ${comparisonResults.summary.mostDiverseConfiguration}`);
  //     }
      
  //     if (comparisonResults.summary.mostAdaptableConfiguration) {
  //       console.log(`Most Adaptable Configuration: ${comparisonResults.summary.mostAdaptableConfiguration}`);
  //     }
      
  //     if (comparisonResults.summary.mostEfficientConfiguration) {
  //       console.log(`Most Efficient Configuration: ${comparisonResults.summary.mostEfficientConfiguration}`);
  //     }
      
  //     if (comparisonResults.summary.significantComparisons.length > 0) {
  //       console.log("\nSignificant Differences Between Configurations:");
  //       comparisonResults.summary.significantComparisons.forEach(comparison => {
  //         console.log(`\n${comparison.comparison}:`);
  //         comparison.differences.forEach(diff => {
  //           console.log(`  - ${diff.metric}: ${diff.better} is better (effect size: ${Math.abs(diff.effectSize).toFixed(2)})`);
  //         });
  //       });
  //     }
      
  //     console.log("\n=========================================================");
      
  //   } catch (error) {
  //     console.error("Error during phylogenetic configuration comparison:", error);
  //   }
  // }
}

///// End of Enhanced Phylogenetic Metrics Analysis




function writeAnalysisResult( analysisResultFilePath, evoRunsAnalysis, iterationIndex ) {
  let filePath = analysisResultFilePath;
  if (typeof iterationIndex === "number") {
    const ext = path.extname(analysisResultFilePath);
    const base = analysisResultFilePath.slice(0, -ext.length);
    filePath = `${base}_iteration-${iterationIndex}_lineage${ext}`;
    // Only write the lineage data for this iteration, but keep the same JSON structure as the main analysis file
    const output = {
      baseEvolutionRunConfigFile: evoRunsAnalysis.baseEvolutionRunConfigFile,
      baseEvolutionaryHyperparametersFile: evoRunsAnalysis.baseEvolutionaryHyperparametersFile,
      evoRuns: evoRunsAnalysis.evoRuns.map((run, runIdx) => ({
        ...(run.label ? { label: run.label } : {}),
        ...(run.diffEvolutionRunConfigFile ? { diffEvolutionRunConfigFile: run.diffEvolutionRunConfigFile } : {}),
        ...(run.diffEvolutionaryHyperparametersFile ? { diffEvolutionaryHyperparametersFile: run.diffEvolutionaryHyperparametersFile } : {}),
        iterations: run.iterations && run.iterations[iterationIndex] && run.iterations[iterationIndex].lineage !== undefined
          ? [ { ...run.iterations[iterationIndex], onlyLineage: true } ]
          : []
      }))
    };
    fs.writeFileSync(filePath, JSON.stringify(output));
    console.log(`Wrote: ${filePath}`);
    return;
  }
  const evoRunsAnalysisJSONString = JSON.stringify( evoRunsAnalysis, null, 2 );
  fs.writeFileSync(filePath, evoRunsAnalysisJSONString);
  console.log(`Wrote: ${filePath}`);	
}

export async function qdAnalysis_playClass( cli ) {
  let {evolutionRunId, cellKey, stepSize, ascending} = cli.flags;
  if( evolutionRunId ) {
    const evoRunConfig = getEvolutionRunConfig(cli);
    await playOneClassAcrossEvoRun( cellKey, evoRunConfig, evolutionRunId, stepSize, ascending );
  }
}
