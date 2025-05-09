import fs from 'fs';
import path from 'path';
import async from 'async';
import { 
  calculateQDScoreForOneIteration,
  calculateQDScoresForAllIterations,
  calculateGridMeanFitnessForAllIterations,
  getGenomeStatisticsAveragedForOneIteration,
  getGenomeStatisticsAveragedForAllIterations,
  getCellScoresForOneIteration,
  getCellScoresForAllIterations,
  getCoverageForOneIteration,
  getCoverageForAllIterations,
  getScoreMatrixForLastIteration,
  getScoreMatricesForAllIterations,
  getCellSaturationGenerations,
  getGenomeSetsForOneIteration,
  getGenomeCountsForAllIterations,
  getGenomeCountsWithRenderingVariationsAsContainerDimensionsForAllIterations,
  getScoreVarianceForAllIterations,
  getScoreStatsForOneIteration,
  getElitesEnergy,
  getGoalSwitches,
  getGoalSwitchesThroughLineages,
  getLineageGraphData,
  getDurationPitchDeltaVelocityCombinations,
  getClassLabels,
  getNewEliteCountForAllIterations,
  getDiversityFromEmbeddingFiles,
  getTerrainNames,
  getEliteMapDiversityAtLastIteration,
  getEliteMapDiversityForAllIterations,
  getDiversityFromAllDiscoveredElites
} from './qd-run-analysis.js';

import {
  analyzePhylogeneticTreeMetrics,
  trackPhylogeneticMetricsOverTime,
  analyzeTerrainTransitions,
  analyzeDensityDependence,
  generatePhylogeneticReport,
  analyzeEnhancedPhylogeneticMetrics,
  trackEnhancedPhylogeneticMetricsOverTime
} from './qd-run-analysis.js';

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
  getEnhancedDiversityMetrics,
  trackDiversityOverTime
} from './qd-run-analysis-enhanced.js';

import { yamnetTags_non_musical, yamnetTags_musical } from './util/classificationTags.js';
import { readCompressedOrPlainJSON, writeCompressedJSON } from './util/qd-common-elite-map-persistence.js';

// Helper function to get compressed and plain file paths
function getCompressedAndPlainPaths(basePath, fileName) {
  return {
    gzipPath: `${basePath}/${fileName}.gz`,
    plainPath: `${basePath}/${fileName}`
  };
}

export async function qdAnalysis_evoRunsFromDir(cli) {
  const { 
    evoRunsDirPath, 
    analysisOperations, 
    stepSize, 
    scoreThreshold, 
    uniqueGenomes, 
    excludeEmptyCells, 
    classRestriction, 
    maxIterationIndex,
    terrainName,
    concurrencyLimit // New parameter for controlling parallel execution
  } = cli.flags;
  
  if (!evoRunsDirPath) {
    console.error("No evoRunsDirPath provided");
    process.exit(1);
  }

  const analysisOperationsList = analysisOperations.split(",");
  console.log("Analysis operations:", analysisOperationsList);
  
  let classRestrictionList;
  if (classRestriction) {
    classRestrictionList = JSON.parse(classRestriction);
  }
  
  // Create error log file
  const errorLogPath = path.join(evoRunsDirPath, 'error_log.txt');
  fs.writeFileSync(errorLogPath, `Analysis started at ${new Date().toISOString()}\n`);
  
  function logError(message) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] ${message}\n`;
    console.error(formattedMessage);
    fs.appendFileSync(errorLogPath, formattedMessage);
  }
  
  // Get all directories in the evoRunsDirPath
  let evoRunFolders;
  try {
    evoRunFolders = fs.readdirSync(evoRunsDirPath)
      .filter(item => fs.statSync(path.join(evoRunsDirPath, item)).isDirectory());
  } catch (err) {
    logError(`Failed to read directory: ${evoRunsDirPath}. Error: ${err.message}`);
    process.exit(1);
  }
  
  console.log(`Found ${evoRunFolders.length} potential evolution run folders`);

  // If concurrency limit is set, use parallel processing
  if (concurrencyLimit && concurrencyLimit > 1) {
    console.log(`Using parallel processing with concurrency limit: ${concurrencyLimit}`);
    await processEvoRunsInParallel(evoRunFolders, concurrencyLimit);
  } else {
    // Use the original sequential processing
    await processEvoRunsSequentially(evoRunFolders);
  }
  
  console.log(`Analysis complete. Processed ${evoRunFolders.length} evolution run folders.`);
  console.log(`Error log available at: ${errorLogPath}`);

  // Helper function for parallel processing
  async function processEvoRunsInParallel(folders, limit) {
    return new Promise((resolve, reject) => {
      // Create a queue with concurrency limit
      const queue = async.queue(async (evoRunFolder, callback) => {
        try {
          await processOneEvoRun(evoRunFolder);
          callback();
        } catch (err) {
          logError(`Error in parallel processing of ${evoRunFolder}: ${err.message}\n${err.stack}`);
          callback(err); // Pass the error but continue processing other items
        }
      }, limit);

      // Error handling for the queue
      queue.error((err, evoRunFolder) => {
        logError(`Queue error processing ${evoRunFolder}: ${err.message}`);
        // Continue processing other items
      });

      // Add all folders to the queue
      for (const folder of folders) {
        queue.push(folder);
      }

      // When all tasks are done
      queue.drain(() => {
        resolve();
      });
    });
  }

  // Helper function for sequential processing (original approach)
  async function processEvoRunsSequentially(folders) {
    for (const evoRunFolder of folders) {
      try {
        await processOneEvoRun(evoRunFolder);
      } catch (err) {
        logError(`Error processing evolution run folder ${evoRunFolder}: ${err.message}\n${err.stack}`);
      }
    }
  }

  // Processing logic for a single evolution run folder - extracted to avoid code duplication
  async function processOneEvoRun(evoRunFolder) {
    const fullEvoRunPath = path.join(evoRunsDirPath, evoRunFolder);
    console.log(`Processing evolution run folder: ${evoRunFolder}`);
    
    // Find the first elites_*.json file
    let eliteFiles = fs.readdirSync(fullEvoRunPath)
      .filter(file => file.startsWith('elites_') && (file.endsWith('.json') || file.endsWith('.json.gz')));
    
    if (eliteFiles.length === 0) {
      logError(`No elite map file found in ${evoRunFolder}`);
      return;
    }
    
    // Sort files to ensure consistent behavior
    eliteFiles.sort();
    const eliteFileName = eliteFiles[0];
    const eliteFilePath = path.join(fullEvoRunPath, eliteFileName);
    
    console.log(`Using elite map file: ${eliteFileName}`);
    
    // Load the JSON file
    let eliteMap;
    try {
      if (eliteFileName.endsWith('.json.gz')) {
        // Use the utility function to read compressed file
        const plainPath = eliteFilePath.replace('.json.gz', '.json');
        eliteMap = readCompressedOrPlainJSON(eliteFilePath, plainPath);
      } else {
        const fileContent = fs.readFileSync(eliteFilePath, 'utf8');
        eliteMap = JSON.parse(fileContent);
      }
      
      if (!eliteMap) {
        logError(`Failed to parse JSON from ${eliteFilePath}`);
        return;
      }
    } catch (err) {
      logError(`Failed to parse JSON from ${eliteFilePath}. Error: ${err.message}`);
      return;
    }
    
    // Use the folder name as the evolutionRunId
    const evolutionRunId = evoRunFolder;
    const evoRunConfig = eliteMap.evolutionRunConfig;
    const generationNumber = eliteMap.generationNumber;
    
    if (!evolutionRunId || !evoRunConfig) {
      logError(`Missing evolutionRunId or evolutionRunConfig in ${eliteFilePath}`);
      return;
    }

    // set evoRunsDirPath in evoRunConfig to evoRunsDirPath from command line
    evoRunConfig.evoRunsDirPath = evoRunsDirPath + '/'; // that trailing slash is important for subsequent use
    
    console.log(`Evolution run ID: ${evolutionRunId}`);
    console.log(`Generation Number: ${generationNumber}`);
    
    // Create analysis results directory if it doesn't exist
    const analysisResultsDir = path.join(fullEvoRunPath, 'analysisResults');
    if (!fs.existsSync(analysisResultsDir)) {
      fs.mkdirSync(analysisResultsDir, { recursive: true });
    }
    
    // Create base analysis result object
    const analysisResult = {
      evolutionRunId,
      generationNumber,
      evoRunConfig
    };
    
    // Process analysis operations
    // For parallel version, we could further parallelize operations within a single run
    // but keeping it simpler for now with parallelism at the folder level
    for (const oneAnalysisOperation of analysisOperationsList) {
      await processAnalysisOperation(oneAnalysisOperation, analysisResultsDir, analysisResult, eliteMap, evolutionRunId, evoRunConfig, generationNumber);
    }
    
    console.log(`Finished processing evolution run folder: ${evoRunFolder}`);
  }

  // Helper function to process a single analysis operation
  async function processAnalysisOperation(oneAnalysisOperation, analysisResultsDir, analysisResult, eliteMap, evolutionRunId, evoRunConfig, generationNumber) {
    console.log(`Performing analysis operation: ${oneAnalysisOperation}`);
    
    // File path for saving the analysis results
    const analysisFileName = `${oneAnalysisOperation}_${evolutionRunId}_step-${stepSize}${scoreThreshold ? '_thrshld_'+scoreThreshold : ''}${terrainName ? '_terrain-'+terrainName : ''}.json`;
    const analysisFilePath = path.join(analysisResultsDir, analysisFileName);
    const compressedAnalysisFilePath = `${analysisFilePath}.gz`;
    
    // Check if file already exists and if generation number matches
    let skipAnalysis = false;
    const paths = getCompressedAndPlainPaths(analysisResultsDir, analysisFileName);
    
    // Try to read existing analysis from either compressed or plain file
    const existingAnalysis = readCompressedOrPlainJSON(paths.gzipPath, paths.plainPath);
    if (existingAnalysis && existingAnalysis.generationNumber === generationNumber) {
      console.log(`Analysis file for ${oneAnalysisOperation} already exists with same generation number. Skipping.`);
      return;
    }
    
    // Handle lineage separately since other operations might need it
    let lineage;
    if (oneAnalysisOperation === "lineage" || 
        ["founder-innovation", "phylogenetic-metrics", "enhanced-phylogenetic-metrics", 
        "phylogenetic-metrics-over-time", "terrain-transitions", "density-dependence",
        "phylogenetic-report", "goal-switches-through-lineages"].includes(oneAnalysisOperation)) {
      
      // Check if lineage file already exists
      const lineageFileName = `lineage_${evolutionRunId}_step-${stepSize}.json`;
      const lineagePaths = getCompressedAndPlainPaths(analysisResultsDir, lineageFileName);
      
      // Try reading from either compressed or plain file
      lineage = readCompressedOrPlainJSON(lineagePaths.gzipPath, lineagePaths.plainPath)?.lineage;
      
      if (lineage) {
        console.log(`Loaded existing lineage data from ${lineageFileName}`);
      } else {
        // Generate lineage if not loaded from file
        try {
          console.log(`Generating lineage data...`);
          lineage = await getLineageGraphData(evoRunConfig, evolutionRunId, stepSize);
          
          // Save lineage for future use
          if (oneAnalysisOperation !== "lineage") {  // Only save if we're not already doing so
            const lineageResult = { ...analysisResult, lineage };
            writeCompressedJSON(lineagePaths.gzipPath, lineageResult);
            console.log(`Saved compressed lineage data to ${lineageFileName}.gz`);
          }
        } catch (err) {
          logError(`Error generating lineage data: ${err.message}`);
          return;
        }
      }
      
      if (oneAnalysisOperation === "lineage") {
        // Save the lineage analysis in compressed format
        const lineageResult = { ...analysisResult, lineage };
        writeCompressedJSON(compressedAnalysisFilePath, lineageResult);
        console.log(`Saved compressed lineage analysis to ${analysisFileName}.gz`);
        return;
      }
    }

    // Perform the selected analysis operation
    try {
      switch (oneAnalysisOperation) {
        case "qd-scores":
          const qdScores = await calculateQDScoresForAllIterations(
            evoRunConfig, evolutionRunId, stepSize, excludeEmptyCells, 
            classRestrictionList, maxIterationIndex
          );
          const qdScoresResult = { ...analysisResult, qdScores };
          writeCompressedJSON(compressedAnalysisFilePath, qdScoresResult);
          console.log(`Saved compressed QD scores analysis to ${analysisFileName}.gz`);
          break;
          
        case "grid-mean-fitness":
          const gridMeanFitness = await calculateGridMeanFitnessForAllIterations(
            evoRunConfig, evolutionRunId, stepSize
          );
          const gridMeanFitnessResult = { ...analysisResult, gridMeanFitness };
          writeCompressedJSON(compressedAnalysisFilePath, gridMeanFitnessResult);
          console.log(`Saved compressed grid mean fitness analysis to ${analysisFileName}.gz`);
          break;
          
        case "genome-statistics":
          const genomeStatistics = await getGenomeStatisticsAveragedForAllIterations(
            evoRunConfig, evolutionRunId, stepSize, excludeEmptyCells, 
            classRestrictionList, maxIterationIndex
          );
          const genomeStatisticsResult = { ...analysisResult, genomeStatistics };
          writeCompressedJSON(compressedAnalysisFilePath, genomeStatisticsResult);
          console.log(`Saved compressed genome statistics analysis to ${analysisFileName}.gz`);
          break;
          
        case "cell-scores":
          const cellScores = await getCellScoresForAllIterations(
            evoRunConfig, evolutionRunId, stepSize
          );
          const cellScoresResult = { ...analysisResult, cellScores };
          writeCompressedJSON(compressedAnalysisFilePath, cellScoresResult);
          console.log(`Saved compressed cell scores analysis to ${analysisFileName}.gz`);
          break;
          
        case "coverage":
          const coverage = await getCoverageForAllIterations(
            evoRunConfig, evolutionRunId, stepSize, scoreThreshold
          );
          const coverageResult = { ...analysisResult, coverage };
          writeCompressedJSON(compressedAnalysisFilePath, coverageResult);
          console.log(`Saved compressed coverage analysis to ${analysisFileName}.gz`);
          break;
          
        case "score-matrices":
          const { scoreMatrices, coveragePercentage } = await getScoreMatricesForAllIterations(
            evoRunConfig, evolutionRunId, stepSize, terrainName, false
          );
          const scoreMatricesResult = { ...analysisResult, scoreMatrices, coveragePercentage };
          writeCompressedJSON(compressedAnalysisFilePath, scoreMatricesResult);
          console.log(`Saved compressed score matrices analysis to ${analysisFileName}.gz`);
          break;
          
        case "score-and-genome-matrices":
          const { scoreMatrices: matrices, coveragePercentage: coverage2, evolutionRunConfig } = 
            await getScoreMatricesForAllIterations(
              evoRunConfig, evolutionRunId, stepSize, terrainName, true
            );
          const scoreAndGenomeMatricesResult = { 
            ...analysisResult, 
            scoreAndGenomeMatrices: matrices, 
            coveragePercentage: coverage2,
            evolutionRunConfig 
          };
          writeCompressedJSON(compressedAnalysisFilePath, scoreAndGenomeMatricesResult);
          console.log(`Saved compressed score and genome matrices analysis to ${analysisFileName}.gz`);
          break;
          
        case "score-matrix":
          const { scoreMatrix, coveragePercentage: matrixCoverage } = 
            await getScoreMatrixForLastIteration(evoRunConfig, evolutionRunId, terrainName);
          const scoreMatrixResult = { ...analysisResult, scoreMatrix, coveragePercentage: matrixCoverage };
          writeCompressedJSON(compressedAnalysisFilePath, scoreMatrixResult);
          console.log(`Saved compressed score matrix analysis to ${analysisFileName}.gz`);
          break;
          
        case "score-and-genome-matrix":
          const { scoreMatrix: genomeMatrix, coveragePercentage: genomeCoverage, evolutionRunConfig: genomeConfig } = 
            await getScoreMatrixForLastIteration(evoRunConfig, evolutionRunId, terrainName, true);
          const scoreAndGenomeMatrixResult = { 
            ...analysisResult, 
            scoreAndGenomeMatrix: genomeMatrix, 
            coveragePercentage: genomeCoverage,
            evolutionRunConfig: genomeConfig 
          };
          writeCompressedJSON(compressedAnalysisFilePath, scoreAndGenomeMatrixResult);
          console.log(`Saved compressed score and genome matrix analysis to ${analysisFileName}.gz`);
          break;
          
        case "new-elite-count":
          const newEliteCount = await getNewEliteCountForAllIterations(
            evoRunConfig, evolutionRunId, stepSize
          );
          const newEliteCountResult = { ...analysisResult, newEliteCount };
          writeCompressedJSON(compressedAnalysisFilePath, newEliteCountResult);
          console.log(`Saved compressed new elite count analysis to ${analysisFileName}.gz`);
          break;
          
        case "elite-generations":
          const eliteGenerations = await getCellSaturationGenerations(evoRunConfig, evolutionRunId);
          const eliteGenerationsLabeled = eliteGenerations;
          const eliteGenerationsResult = { 
            ...analysisResult, 
            eliteGenerations: Object.values(eliteGenerations),
            eliteGenerationsLabeled
          };
          writeCompressedJSON(compressedAnalysisFilePath, eliteGenerationsResult);
          console.log(`Saved compressed elite generations analysis to ${analysisFileName}.gz`);
          break;
          
        case "genome-sets":
          const genomeSets = await getGenomeCountsForAllIterations(
            evoRunConfig, evolutionRunId, stepSize
          );
          const genomeSetsResult = { ...analysisResult, genomeSets };
          writeCompressedJSON(compressedAnalysisFilePath, genomeSetsResult);
          console.log(`Saved compressed genome sets analysis to ${analysisFileName}.gz`);
          break;
          
        case "genome-sets-through-rendering-variations":
          const genomeSetsThroughRenderingVariations = 
            await getGenomeCountsWithRenderingVariationsAsContainerDimensionsForAllIterations(
              evoRunConfig, evolutionRunId, stepSize
            );
          const genomeSetsThroughRenderingVariationsResult = { 
            ...analysisResult, 
            genomeSetsThroughRenderingVariations 
          };
          writeCompressedJSON(compressedAnalysisFilePath, genomeSetsThroughRenderingVariationsResult);
          console.log(`Saved compressed genome sets through rendering variations analysis to ${analysisFileName}.gz`);
          break;
          
        case "variance":
          const scoreVariances = await getScoreVarianceForAllIterations(
            evoRunConfig, evolutionRunId, stepSize
          );
          const scoreVariancesResult = { ...analysisResult, scoreVariances };
          writeCompressedJSON(compressedAnalysisFilePath, scoreVariancesResult);
          console.log(`Saved compressed score variances analysis to ${analysisFileName}.gz`);
          break;
          
        case "elites-energy":
          const elitesEnergy = await getElitesEnergy(
            evoRunConfig, evolutionRunId, stepSize, excludeEmptyCells, 
            classRestrictionList, maxIterationIndex
          );
          const elitesEnergyResult = { ...analysisResult, elitesEnergy };
          writeCompressedJSON(compressedAnalysisFilePath, elitesEnergyResult);
          console.log(`Saved compressed elites energy analysis to ${analysisFileName}.gz`);
          break;
          
        case "goal-switches":
          const contextArrays = [yamnetTags_non_musical, yamnetTags_musical];
          const goalSwitches = await getGoalSwitches(
            evoRunConfig, evolutionRunId, stepSize, null, contextArrays
          );
          const goalSwitchesResult = { ...analysisResult, goalSwitches };
          writeCompressedJSON(compressedAnalysisFilePath, goalSwitchesResult);
          console.log(`Saved compressed goal switches analysis to ${analysisFileName}.gz`);
          break;
          
        case "goal-switches-through-lineages":
          const contextArraysLineages = [yamnetTags_non_musical, yamnetTags_musical];
          const goalSwitchesThroughLineages = await getGoalSwitchesThroughLineages(
            evoRunConfig, evolutionRunId, null, contextArraysLineages, lineage
          );
          const goalSwitchesThroughLineagesResult = { ...analysisResult, goalSwitchesThroughLineages };
          writeCompressedJSON(compressedAnalysisFilePath, goalSwitchesThroughLineagesResult);
          console.log(`Saved compressed goal switches through lineages analysis to ${analysisFileName}.gz`);
          break;
          
        case "duration-pitch-delta-velocity-combinations":
          const durationPitchDeltaVelocityCombinations = await getDurationPitchDeltaVelocityCombinations(
            evoRunConfig, evolutionRunId, stepSize, uniqueGenomes
          );
          const durationPitchDeltaVelocityCombinationsResult = { 
            ...analysisResult, 
            durationPitchDeltaVelocityCombinations 
          };
          writeCompressedJSON(compressedAnalysisFilePath, durationPitchDeltaVelocityCombinationsResult);
          console.log(`Saved compressed duration pitch delta velocity combinations analysis to ${analysisFileName}.gz`);
          break;
          
        case "diversity-from-embeddings":
          const diversityFromEmbeddings = getDiversityFromEmbeddingFiles(
            evoRunConfig, evolutionRunId
          );
          const diversityFromEmbeddingsResult = { ...analysisResult, diversityFromEmbeddings };
          writeCompressedJSON(compressedAnalysisFilePath, diversityFromEmbeddingsResult);
          console.log(`Saved compressed diversity from embeddings analysis to ${analysisFileName}.gz`);
          break;
          
        case "diversity-at-last-iteration":
          const diversityAtLastIteration = await getEliteMapDiversityAtLastIteration(
            evoRunConfig, evolutionRunId
          );
          const diversityAtLastIterationResult = { ...analysisResult, diversityAtLastIteration };
          writeCompressedJSON(compressedAnalysisFilePath, diversityAtLastIterationResult);
          console.log(`Saved compressed diversity at last iteration analysis to ${analysisFileName}.gz`);
          break;
          
        case "diversity-from-all-discovered-elites":
          const diversityFromAllDiscoveredElites = await getDiversityFromAllDiscoveredElites(
            evoRunConfig, evolutionRunId, true
          );
          const diversityFromAllDiscoveredElitesResult = { 
            ...analysisResult, 
            diversityFromAllDiscoveredElites 
          };
          writeCompressedJSON(compressedAnalysisFilePath, diversityFromAllDiscoveredElitesResult);
          console.log(`Saved compressed diversity from all discovered elites analysis to ${analysisFileName}.gz`);
          break;
          
        case "diversity-from-all-discovered-elites-enhanced":
          const diversityFromAllDiscoveredElitesEnhanced = await getEnhancedDiversityMetrics(
            evoRunConfig, evolutionRunId, true
          );
          const diversityFromAllDiscoveredElitesEnhancedResult = { 
            ...analysisResult, 
            diversityFromAllDiscoveredElitesEnhanced 
          };
          writeCompressedJSON(compressedAnalysisFilePath, diversityFromAllDiscoveredElitesEnhancedResult);
          console.log(`Saved compressed enhanced diversity from all discovered elites analysis to ${analysisFileName}.gz`);
          break;
          
        case "diversity-over-time":
          const diversityOverTime = await trackDiversityOverTime(
            evoRunConfig, evolutionRunId, stepSize
          );
          const diversityOverTimeResult = { ...analysisResult, diversityOverTime };
          writeCompressedJSON(compressedAnalysisFilePath, diversityOverTimeResult);
          console.log(`Saved compressed diversity over time analysis to ${analysisFileName}.gz`);
          break;
          
        case "diversity-measures":
          const diversityMeasures = await getEliteMapDiversityForAllIterations(
            evoRunConfig, evolutionRunId, stepSize
          );
          const diversityMeasuresResult = { ...analysisResult, diversityMeasures };
          writeCompressedJSON(compressedAnalysisFilePath, diversityMeasuresResult);
          console.log(`Saved compressed diversity measures analysis to ${analysisFileName}.gz`);
          break;

        case "founder-innovation":
          const founderInnovationAnalysis = await analyzeFoundersAndInnovations(
            evoRunConfig, evolutionRunId, lineage, false
          );
          const steppingStones = findConcreteSteppingStoneExamples(lineage);
          
          let enhancedFounderInnovation = null;
          if (founderInnovationAnalysis && founderInnovationAnalysis.topFounders && founderInnovationAnalysis.topFounders.length > 0) {
            const normalizedFounders = calculateNormalizedFounderImpact(
              lineage, 
              founderInnovationAnalysis.topFounders
            );
            
            const founderIdToDescendants = {};
            founderInnovationAnalysis.topFounders.forEach((founder) => {
              const founderId = founder.id;
              const descendants = findAllDescendants(lineage, founderId);
              founderIdToDescendants[founderId] = descendants;
            });

            const qualityFounders = calculateQualityImprovementFactors(
              lineage, 
              founderInnovationAnalysis.topFounders,
              founderIdToDescendants
            );
            
            const discoveryRateFounders = calculateClassDiscoveryRates(
              lineage, 
              founderInnovationAnalysis.topFounders,
              founderIdToDescendants
            );
            
            const burstPatterns = analyzeInnovationBurstPatterns(
              lineage, 
              founderInnovationAnalysis.innovationBursts
            );
            
            enhancedFounderInnovation = {
              normalizedFounders: normalizedFounders.slice(0, 5),
              qualityFounders: qualityFounders.slice(0, 5),
              discoveryRateFounders: discoveryRateFounders.slice(0, 5),
              burstPatterns
            };
          }
          
          const founderInnovationResult = { 
            ...analysisResult, 
            founderInnovation: founderInnovationAnalysis,
            steppingStones,
            enhancedFounderInnovation
          };
          
          writeCompressedJSON(compressedAnalysisFilePath, founderInnovationResult);
          console.log(`Saved compressed founder innovation analysis to ${analysisFileName}.gz`);
          break;

        case "phylogenetic-metrics":
          const phylogeneticMetrics = await analyzePhylogeneticTreeMetrics(
            evoRunConfig,
            evolutionRunId,
            lineage,
            false // saveToFile
          );
          
          const phylogeneticMetricsResult = { ...analysisResult, phylogeneticMetrics };
          writeCompressedJSON(compressedAnalysisFilePath, phylogeneticMetricsResult);
          console.log(`Saved compressed phylogenetic metrics analysis to ${analysisFileName}.gz`);
          break;
          
        case "phylogenetic-metrics-over-time":
          const metricsOverTime = await trackPhylogeneticMetricsOverTime(
            evoRunConfig, evolutionRunId, stepSize
          );
          
          const phylogeneticMetricsOverTimeResult = { ...analysisResult, phylogeneticMetricsOverTime: metricsOverTime };
          writeCompressedJSON(compressedAnalysisFilePath, phylogeneticMetricsOverTimeResult);
          console.log(`Saved compressed phylogenetic metrics over time analysis to ${analysisFileName}.gz`);
          break;
          
        case "terrain-transitions":
          const terrainAnalysis = await analyzeTerrainTransitions(
            evoRunConfig, evolutionRunId, lineage
          );
          
          const terrainTransitionsResult = { ...analysisResult, terrainTransitions: terrainAnalysis };
          writeCompressedJSON(compressedAnalysisFilePath, terrainTransitionsResult);
          console.log(`Saved compressed terrain transitions analysis to ${analysisFileName}.gz`);
          break;
          
        case "density-dependence":
          const densityAnalysis = await analyzeDensityDependence(
            evoRunConfig, evolutionRunId, lineage
          );
          
          const densityDependenceResult = { ...analysisResult, densityDependence: densityAnalysis };
          writeCompressedJSON(compressedAnalysisFilePath, densityDependenceResult);
          console.log(`Saved compressed density dependence analysis to ${analysisFileName}.gz`);
          break;
          
        case "phylogenetic-report":
          const report = await generatePhylogeneticReport(
            evoRunConfig, evolutionRunId, lineage
          );
          
          const phylogeneticReportResult = { ...analysisResult, phylogeneticReport: report };
          writeCompressedJSON(compressedAnalysisFilePath, phylogeneticReportResult);
          console.log(`Saved compressed phylogenetic report analysis to ${analysisFileName}.gz`);
          break;
          
        case "enhanced-phylogenetic-metrics":
          const { metrics } = await analyzeEnhancedPhylogeneticMetrics(
            evoRunConfig, evolutionRunId, lineage, false
          );
          
          const enhancedPhylogeneticMetricsResult = { ...analysisResult, enhancedPhylogeneticMetrics: metrics };
          writeCompressedJSON(compressedAnalysisFilePath, enhancedPhylogeneticMetricsResult);
          console.log(`Saved compressed enhanced phylogenetic metrics analysis to ${analysisFileName}.gz`);
          break;
          
        case "enhanced-phylogenetic-metrics-over-time":
          const enhancedMetricsOverTime = await trackEnhancedPhylogeneticMetricsOverTime(
            evoRunConfig, evolutionRunId, stepSize, lineage
          );
          
          const enhancedPhylogeneticMetricsOverTimeResult = { 
            ...analysisResult, 
            enhancedPhylogeneticMetricsOverTime: enhancedMetricsOverTime 
          };
          writeCompressedJSON(compressedAnalysisFilePath, enhancedPhylogeneticMetricsOverTimeResult);
          console.log(`Saved compressed enhanced phylogenetic metrics over time analysis to ${analysisFileName}.gz`);
          break;
          
        default:
          logError(`Unknown analysis operation: ${oneAnalysisOperation}`);
          break;
      }
    } catch (err) {
      logError(`Error performing ${oneAnalysisOperation} analysis: ${err.message}\n${err.stack}`);
    }
  }
}
