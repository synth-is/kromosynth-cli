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
import { mean, variance, std } from 'mathjs';
import { buildSimplifiedTree } from '../analysis/lineage/phylogenetic-tree-common.js';
import { saveTreeToJson } from '../analysis/lineage/tree-serialization.js';

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
import { getEvolutionRunsConfig } from './kromosynth-common.js';

// Helper function to get compressed and plain file paths
function getCompressedAndPlainPaths(basePath, fileName) {
  return {
    gzipPath: `${basePath}/${fileName}.gz`,
    plainPath: `${basePath}/${fileName}`
  };
}

// Helper function to group evolution run folders by type
// Folders with the same name pattern (ignoring ULID prefix) are considered the same type
function groupEvoRunFoldersByType(evoRunFolders) {
  const groupedFolders = {};
  
  for (const folder of evoRunFolders) {
    // Extract the folder type by removing the ULID prefix
    // The format is assumed to be: ULID_folderType
    const folderTypeParts = folder.split('_');
    
    if (folderTypeParts.length > 1) {
      // Remove the first part (ULID) and join the rest
      const folderType = folderTypeParts.slice(1).join('_');
      
      if (!groupedFolders[folderType]) {
        groupedFolders[folderType] = [];
      }
      
      groupedFolders[folderType].push(folder);
    } else {
      // If the folder name doesn't follow the expected pattern, use the whole name as the type
      const folderType = folder;
      
      if (!groupedFolders[folderType]) {
        groupedFolders[folderType] = [];
      }
      
      groupedFolders[folderType].push(folder);
    }
  }
  
  return groupedFolders;
}

// Helper function to find analysis result files across folders
function findAnalysisResultsFilesForOperation(evoRunFolders, evoRunsDirPath, oneAnalysisOperation, stepSize, scoreThreshold, terrainName) {
  const resultFiles = [];
  
  for (const folder of evoRunFolders) {
    const analysisResultsDir = path.join(evoRunsDirPath, folder, 'analysisResults');
    if (!fs.existsSync(analysisResultsDir)) {
      continue;
    }
    
    const filePattern = `${oneAnalysisOperation}_${folder}_step-${stepSize}`;
    const files = fs.readdirSync(analysisResultsDir).filter(file => 
      file.startsWith(filePattern) &&
      (file.endsWith('.json') || file.endsWith('.json.gz'))
    );
    
    if (files.length > 0) {
      // Sort to get the most recent if there are multiple
      files.sort();
      const latestFile = files[files.length - 1];
      const paths = getCompressedAndPlainPaths(analysisResultsDir, latestFile.replace(/\.gz$/, ''));
      
      // Try to read from either compressed or plain file
      const analysisResult = readCompressedOrPlainJSON(paths.gzipPath, paths.plainPath);
      if (analysisResult) {
        resultFiles.push({
          folder,
          file: latestFile,
          path: analysisResultsDir,
          result: analysisResult
        });
      }
    }
  }
  
  return resultFiles;
}

// Function to aggregate analysis results from files of the same type
function aggregateAnalysisResults(analysisFiles, oneAnalysisOperation) {
  if (analysisFiles.length === 0) {
    return null;
  }
  
  // Start with a copy of the first result
  const aggregatedResult = JSON.parse(JSON.stringify(analysisFiles[0].result));
  
  // Add an array to store individual run results
  aggregatedResult.individualRuns = analysisFiles.map(file => ({
    evolutionRunId: file.folder,
    result: file.result
  }));
  
  // Depending on the analysis operation, perform different aggregation logic
  switch(oneAnalysisOperation) {
    case 'qd-score':
    case 'grid-mean-fitness':
      // For metrics with a single value, compute statistics
      if (analysisFiles.length > 1) {
        const allValues = analysisFiles.map(file => file.result.value || 0);
        aggregatedResult.aggregation = calculateStatistics(allValues);
        
        // For QD scores, we can also track evolution over time if available
        if (aggregatedResult.qdScoresOverTime || aggregatedResult.valuesOverTime) {
          const overTimeData = aggregatedResult.qdScoresOverTime || aggregatedResult.valuesOverTime;
          if (overTimeData && overTimeData.length > 0) {
            // Create arrays for each generation across all runs
            const overTimeByGeneration = {};
            
            // Collect all data by generation
            analysisFiles.forEach(file => {
              const timeData = file.result.qdScoresOverTime || file.result.valuesOverTime || [];
              timeData.forEach(point => {
                const gen = point.generation || point.x;
                if (!overTimeByGeneration[gen]) {
                  overTimeByGeneration[gen] = [];
                }
                overTimeByGeneration[gen].push(point.value || point.y || 0);
              });
            });
            
            // Calculate statistics for each generation point
            const aggregatedOverTime = Object.entries(overTimeByGeneration)
              .map(([gen, values]) => ({
                generation: parseInt(gen),
                statistics: calculateStatistics(values)
              }))
              .sort((a, b) => a.generation - b.generation);
            
            aggregatedResult.aggregation.overTime = aggregatedOverTime;
          }
        }
      }
      break;
    
    case 'coverage':
      // For coverage, we compute statistics on coverage percentage
      if (analysisFiles.length > 1) {
        const allValues = analysisFiles.map(file => {
          const coverage = file.result.coverage || 0;
          const totalCells = file.result.totalCells || 1;
          return (coverage / totalCells) * 100; // Coverage percentage
        });
        
        aggregatedResult.aggregation = calculateStatistics(allValues);
        aggregatedResult.aggregation.unit = "percentage";
        
        // Also handle coverage over time if available
        if (aggregatedResult.coverageOverTime) {
          // Similar approach as QD scores over time
          const overTimeByGeneration = {};
          
          analysisFiles.forEach(file => {
            const coverageData = file.result.coverageOverTime || [];
            coverageData.forEach(point => {
              const gen = point.generation;
              if (!overTimeByGeneration[gen]) {
                overTimeByGeneration[gen] = [];
              }
              
              const totalCells = file.result.totalCells || 1;
              const coveragePercent = (point.coverage / totalCells) * 100;
              overTimeByGeneration[gen].push(coveragePercent);
            });
          });
          
          const aggregatedOverTime = Object.entries(overTimeByGeneration)
            .map(([gen, values]) => ({
              generation: parseInt(gen),
              statistics: calculateStatistics(values)
            }))
            .sort((a, b) => a.generation - b.generation);
          
          aggregatedResult.aggregation.overTime = aggregatedOverTime;
        }
      }
      break;
    
    case 'cell-scores':
      // For cell scores, we can aggregate by cell position
      if (analysisFiles.length > 1) {
        const allScores = analysisFiles.map(file => file.result.cellScores || {});
        const allCells = new Set();
        
        // Collect all cell positions
        allScores.forEach(scoreMap => {
          Object.keys(scoreMap).forEach(cell => allCells.add(cell));
        });
        
        // For each cell, compute statistics across runs
        const aggregatedCellScores = {};
        allCells.forEach(cell => {
          const cellScores = allScores
            .map(scoreMap => scoreMap[cell] || 0)
            .filter(score => score > 0);  // Only consider filled cells
          
          if (cellScores.length > 0) {
            aggregatedCellScores[cell] = calculateStatistics(cellScores);
          }
        });
        
        aggregatedResult.aggregation = {
          cellScores: aggregatedCellScores,
          filledCellsStatistics: calculateStatistics(
            allScores.map(scoreMap => Object.keys(scoreMap).filter(k => scoreMap[k] > 0).length)
          )
        };
      }
      break;
    
    case 'lineage':
      // For lineage data, we calculate tree statistics
      if (analysisFiles.length > 1) {
        const treeStats = analysisFiles.map(file => {
          const lineage = file.result.lineage;
          if (!lineage) return null;
          
          // Calculate tree depth, node count, branching factor, etc.
          const nodeCount = Object.keys(lineage).length;
          const depths = calculateTreeDepths(lineage);
          const maxDepth = Math.max(...Object.values(depths));
          
          // Calculate branching factor (children per node)
          let totalChildren = 0;
          let nodeWithChildren = 0;
          
          Object.values(lineage).forEach(node => {
            if (node.children && node.children.length > 0) {
              totalChildren += node.children.length;
              nodeWithChildren++;
            }
          });
          
          const avgBranchingFactor = nodeWithChildren > 0 ? totalChildren / nodeWithChildren : 0;
          
          return {
            nodeCount,
            maxDepth,
            avgBranchingFactor,
            // We could add more metrics here
          };
        }).filter(Boolean);
        
        if (treeStats.length > 0) {
          aggregatedResult.aggregation = {
            nodeCount: calculateStatistics(treeStats.map(s => s.nodeCount)),
            maxDepth: calculateStatistics(treeStats.map(s => s.maxDepth)),
            avgBranchingFactor: calculateStatistics(treeStats.map(s => s.avgBranchingFactor))
          };
        }
      }
      break;
    
    case 'enhanced-phylogenetic-metrics':
    case 'founder-innovation':
      // For phylogenetic and innovation metrics
      if (analysisFiles.length > 1) {
        // Aggregate key metrics like founder impact, innovations per founder, etc.
        const aggregation = {};
        
        // Try to extract common metrics from these analysis types
        try {
          if (analysisFiles[0].result.metrics || analysisFiles[0].result.overallMetrics) {
            const metricsKey = analysisFiles[0].result.metrics ? 'metrics' : 'overallMetrics';
            const metricNames = Object.keys(analysisFiles[0].result[metricsKey] || {});
            
            metricNames.forEach(metricName => {
              const values = analysisFiles
                .map(file => file.result[metricsKey]?.[metricName])
                .filter(value => value !== undefined && value !== null);
              
              if (values.length > 0) {
                if (!aggregation.metrics) {
                  aggregation.metrics = {};
                }
                aggregation.metrics[metricName] = calculateStatistics(values);
              }
            });
          }
          
          // For founder-innovation, also aggregate founder statistics
          if (oneAnalysisOperation === 'founder-innovation') {
            const founderCounts = analysisFiles
              .map(file => file.result.topFounders?.length || 0)
              .filter(count => count > 0);
              
            if (founderCounts.length > 0) {
              aggregation.founderStats = {
                counts: calculateStatistics(founderCounts)
              };
            }
          }
        } catch (err) {
          console.error(`Error aggregating ${oneAnalysisOperation} data:`, err);
        }
        
        if (Object.keys(aggregation).length > 0) {
          aggregatedResult.aggregation = aggregation;
        }
      }
      break;
    
    case 'goal-switches':
    case 'goal-switches-through-lineages':
      // Aggregate goal switching metrics
      if (analysisFiles.length > 1) {
        const switchCounts = analysisFiles
          .map(file => file.result.totalSwitches || 0)
          .filter(count => count !== undefined);
        
        if (switchCounts.length > 0) {
          aggregatedResult.aggregation = {
            totalSwitches: calculateStatistics(switchCounts)
          };
          
          // Try to aggregate switch distributions if available
          try {
            const distributions = analysisFiles
              .map(file => file.result.switchDistribution || {})
              .filter(dist => Object.keys(dist).length > 0);
              
            if (distributions.length > 0) {
              // Combine all switch distributions
              const combinedDistribution = {};
              
              distributions.forEach(dist => {
                Object.entries(dist).forEach(([key, value]) => {
                  if (!combinedDistribution[key]) {
                    combinedDistribution[key] = [];
                  }
                  combinedDistribution[key].push(value);
                });
              });
              
              // Calculate statistics for each key
              const aggregatedDistribution = {};
              Object.entries(combinedDistribution).forEach(([key, values]) => {
                aggregatedDistribution[key] = calculateStatistics(values);
              });
              
              aggregatedResult.aggregation.switchDistribution = aggregatedDistribution;
            }
          } catch (err) {
            console.error(`Error aggregating switch distribution:`, err);
          }
        }
      }
      break;
    
    // Add more case handlers for different analysis operations as needed
    
    default:
      // For unknown operations, try generic aggregation for numeric values
      console.log(`No specific aggregation logic for operation: ${oneAnalysisOperation}, trying generic aggregation`);
      try {
        const genericAggregation = performGenericAggregation(analysisFiles);
        if (Object.keys(genericAggregation).length > 0) {
          aggregatedResult.aggregation = genericAggregation;
        }
      } catch (err) {
        console.log(`Generic aggregation failed for ${oneAnalysisOperation}:`, err.message);
      }
  }
  
  return aggregatedResult;
}

// Helper function to perform generic aggregation on numeric values in objects
function performGenericAggregation(analysisFiles) {
  const aggregation = {};
  
  // Try to find common numeric properties at the top level
  const firstResult = analysisFiles[0].result;
  for (const key of Object.keys(firstResult)) {
    const values = analysisFiles
      .map(file => file.result[key])
      .filter(val => typeof val === 'number');
    
    if (values.length === analysisFiles.length) {
      aggregation[key] = calculateStatistics(values);
    }
  }
  
  return aggregation;
}

// Helper function to calculate standard statistical measures
function calculateStatistics(values) {
  if (!values || values.length === 0) {
    return {
      count: 0,
      mean: 0,
      median: 0,
      max: 0,
      min: 0,
      stdDev: 0,
      variance: 0,
      confidenceInterval95: [0, 0]
    };
  }
  
  const sortedValues = [...values].sort((a, b) => a - b);
  const count = values.length;
  // Use mathjs for statistical calculations
  const meanValue = mean(values);
  const median = sortedValues[Math.floor(count / 2)];
  const max = Math.max(...values);
  const min = Math.min(...values);
  
  // Use mathjs functions for variance and standard deviation
  const varianceValue = variance(values);
  const stdDevValue = std(values);
  
  // Calculate 95% confidence interval
  const marginOfError = 1.96 * (stdDevValue / Math.sqrt(count));
  const confidenceInterval95 = [meanValue - marginOfError, meanValue + marginOfError];
  
  return {
    count,
    mean: meanValue,
    median,
    max,
    min,
    stdDev: stdDevValue,
    variance: varianceValue,
    confidenceInterval95
  };
}

// Helper function to calculate standard deviation using mathjs
function calculateStandardDeviation(values) {
  if (!values || values.length === 0) {
    return 0;
  }
  return std(values);
}

// Function to calculate tree depths for all nodes in a lineage
function calculateTreeDepths(lineage) {
  const depths = {};
  
  function getDepth(nodeId) {
    if (depths[nodeId] !== undefined) {
      return depths[nodeId];
    }
    
    const node = lineage[nodeId];
    if (!node) {
      return 0;
    }
    
    if (!node.parent || node.parent === "null") {
      depths[nodeId] = 0;
      return 0;
    }
    
    const parentDepth = getDepth(node.parent);
    depths[nodeId] = parentDepth + 1;
    return depths[nodeId];
  }
  
  // Calculate depths for all nodes
  for (const nodeId of Object.keys(lineage)) {
    getDepth(nodeId);
  }
  
  return depths;
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
    concurrencyLimit, // New parameter for controlling parallel execution
    writeToFolder
  } = cli.flags;
  
  if (!evoRunsDirPath) {
    console.error("No evoRunsDirPath provided");
    process.exit(1);
  }

  const analysisOperationsList = analysisOperations.split(",");
  console.log("Analysis operations:", analysisOperationsList);
  
  // Check if we're doing aggregation and call the appropriate function
  if (analysisOperationsList.includes("evo-runs-dir-analysis-aggregate")) {
    console.log("Running directory-based analysis aggregation...");
    return await evoRunsDirAnalysisAggregate(cli);
  }
  
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
      const queue = async.queue((evoRunFolder, callback) => {
        processOneEvoRun(evoRunFolder)
          .then(() => callback())
          .catch(err => {
            logError(`Error in parallel processing of ${evoRunFolder}: ${err.message}\n${err.stack}`);
            callback(err); // Pass the error but continue processing other items
          });
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
        "phylogenetic-report", "goal-switches-through-lineages", "phylogenetic-tree"].includes(oneAnalysisOperation)) {
      
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
          
        case "phylogenetic-tree":
          console.log(`Generating phylogenetic trees for evolution run ${evolutionRunId}...`);
          
          // Create directory for tree files
          const treeOutputDir = path.join(analysisResultsDir, 'trees');
          if (!fs.existsSync(treeOutputDir)) {
            fs.mkdirSync(treeOutputDir, { recursive: true });
          }
          
          // Process each iteration in the lineage data
          if (lineage) {
            // Create a compatible data structure for the buildSimplifiedTree function
            const treeData = {
              evoRuns: [
                {
                  iterations: [
                    { id: evolutionRunId, lineage: lineage }
                  ]
                }
              ]
            };
            
            // Build and save the tree for all classes (both musical and non-musical)
            const treeDataAll = buildSimplifiedTree(treeData, Infinity, false, null, 0, true, true);
            saveTreeToJson(treeDataAll, treeData, 0, treeOutputDir, '_all', true); // Use compression
            
            // Optionally add musical and non-musical trees as in lineage-to-tree-files.js
            // const treeDataMusical = buildSimplifiedTree(treeData, Infinity, false, null, 0, true, false);
            // saveTreeToJson(treeDataMusical, treeData, 0, treeOutputDir, '_musical', true); // Use compression
            // const treeDataNonMusical = buildSimplifiedTree(treeData, Infinity, false, null, 0, false, true);
            // saveTreeToJson(treeDataNonMusical, treeData, 0, treeOutputDir, '_nonmusical', true); // Use compression
            
            // Get list of compressed tree files (*.json.gz)
            const treeFiles = fs.readdirSync(treeOutputDir).filter(file => file.endsWith('.json.gz'));
            
            const phylogeneticTreeResult = { 
              ...analysisResult,
              phylogeneticTree: { 
                status: "Generated", 
                outputDir: treeOutputDir,
                files: treeFiles,
                compression: true
              } 
            };
            writeCompressedJSON(compressedAnalysisFilePath, phylogeneticTreeResult);
            console.log(`Saved compressed phylogenetic tree analysis and generated tree files in ${treeOutputDir}`);
          } else {
            logError(`No lineage data available for phylogenetic tree generation for evolution run ${evolutionRunId}`);
          }
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

export async function evoRunsDirAnalysisAggregate(cli) {
  const { 
    evoRunsDirPath, 
    analysisOperations, 
    stepSize, 
    scoreThreshold, 
    writeToFolder,
    terrainName,
    excludeOperationsFromAggregate, // Optional operations to exclude from aggregation
    includeRawData // Whether to include raw data in output or just aggregated statistics
  } = cli.flags;
  
  if (!evoRunsDirPath) {
    console.error("No evoRunsDirPath provided");
    process.exit(1);
  }
  
  if (!writeToFolder) {
    console.error("No writeToFolder provided for aggregation results");
    process.exit(1);
  }
  
  // Parse operations to be aggregated
  const analysisOperationsList = analysisOperations.split(",")
    .filter(op => op !== "evo-runs-dir-analysis-aggregate"); // Remove the aggregate operation itself
  
  // Parse operations to exclude from aggregation if provided
  const excludeOperations = excludeOperationsFromAggregate ? 
    excludeOperationsFromAggregate.split(",") : [];
  
  // Filter out excluded operations
  const operationsToAggregate = analysisOperationsList
    .filter(op => !excludeOperations.includes(op));
  
  console.log("Aggregating analysis operations:", operationsToAggregate);
  if (excludeOperations.length > 0) {
    console.log("Excluding operations from aggregation:", excludeOperations);
  }
  
  // Get all directories in the evoRunsDirPath
  let evoRunFolders;
  try {
    evoRunFolders = fs.readdirSync(evoRunsDirPath)
      .filter(item => {
        const fullPath = path.join(evoRunsDirPath, item);
        return fs.statSync(fullPath).isDirectory() && 
               fs.existsSync(path.join(fullPath, 'analysisResults'));
      });
  } catch (err) {
    console.error(`Failed to read directory: ${evoRunsDirPath}. Error: ${err.message}`);
    process.exit(1);
  }
  
  console.log(`Found ${evoRunFolders.length} potential evolution run folders with analysis results`);
  
  // If no folders found, exit
  if (evoRunFolders.length === 0) {
    console.error(`No evolution run folders with analysis results found in: ${evoRunsDirPath}`);
    process.exit(1);
  }
  
  // Group folders by type (removing ULID prefix)
  const groupedFolders = groupEvoRunFoldersByType(evoRunFolders);
  console.log(`Grouped into ${Object.keys(groupedFolders).length} folder types`);
  
  // Create the output directory if it doesn't exist
  if (!fs.existsSync(writeToFolder)) {
    fs.mkdirSync(writeToFolder, { recursive: true });
    console.log(`Created output directory: ${writeToFolder}`);
  }
  
  // Track the overall results
  const overallResults = {
    timestamp: new Date().toISOString(),
    folderTypes: Object.keys(groupedFolders).length,
    totalFolders: evoRunFolders.length,
    parameters: {
      stepSize,
      scoreThreshold,
      terrainName
    },
    results: {}
  };
  
  // For each group, aggregate results for each analysis operation
  for (const [folderType, folders] of Object.entries(groupedFolders)) {
    console.log(`\n========== Processing folder type: ${folderType} with ${folders.length} folders ==========`);
    
    // Create a directory for this folder type
    const folderTypeDirName = folderType.replace(/[^a-zA-Z0-9_-]/g, '_');
    const folderTypeDir = path.join(writeToFolder, folderTypeDirName);
    if (!fs.existsSync(folderTypeDir)) {
      fs.mkdirSync(folderTypeDir, { recursive: true });
    }
    
    // Track operations processed for this folder type
    const operationsWithData = [];
    const operationResults = {};
    
    // Create an analysis result object in the same structure as qdAnalysis_evoRuns
    const evoRunsAnalysis = {
      baseEvolutionRunConfigFile: null,
      baseEvolutionaryHyperparametersFile: null,
      evoRuns: [
        {
          iterations: [],
          aggregates: {}
        }
      ]
    };

    // First, build the iterations structure by operation
    for (const oneAnalysisOperation of operationsToAggregate) {
      console.log(`\nCollecting data for operation '${oneAnalysisOperation}' from folder type: ${folderType}`);
      
      // Find all analysis result files for this operation across folders of this type
      const analysisFiles = findAnalysisResultsFilesForOperation(
        folders, evoRunsDirPath, oneAnalysisOperation, stepSize, scoreThreshold, terrainName
      );
      
      console.log(`Found ${analysisFiles.length} analysis files for operation '${oneAnalysisOperation}'`);
      
      if (analysisFiles.length > 0) {
        // For each file, add its data to the iterations array
        analysisFiles.forEach((file, index) => {
          // Initialize the iteration in the array if it doesn't exist
          if (!evoRunsAnalysis.evoRuns[0].iterations[index]) {
            evoRunsAnalysis.evoRuns[0].iterations[index] = {
              id: file.folder
            };
          }

          // Add the operation data to this iteration
          evoRunsAnalysis.evoRuns[0].iterations[index][oneAnalysisOperation] = file.result;
        });

        operationsWithData.push(oneAnalysisOperation);
      } else {
        console.log(`No analysis files found for operation '${oneAnalysisOperation}' with folder type: ${folderType}`);
      }
    }

    // Now aggregate each operation across all iterations
    for (const oneAnalysisOperation of operationsWithData) {
      console.log(`\nAggregating operation '${oneAnalysisOperation}' for folder type: ${folderType}`);

      const aggregatesForOperation = aggregateOperationAcrossIterations(
        evoRunsAnalysis.evoRuns[0].iterations,
        oneAnalysisOperation
      );
      
      if (aggregatesForOperation) {
        // Store the aggregates in the structure
        evoRunsAnalysis.evoRuns[0].aggregates[oneAnalysisOperation] = aggregatesForOperation;
        
        // Save the aggregated data to a file
        const outputFileName = `${folderTypeDir}/${oneAnalysisOperation}_step-${stepSize}${scoreThreshold ? '_thrshld_'+scoreThreshold:''}${terrainName ? '_terrain-'+terrainName:''}.json`;
        const outputData = {
          timestamp: new Date().toISOString(),
          folderType,
          operation: oneAnalysisOperation,
          parameters: { stepSize, scoreThreshold, terrainName },
          aggregates: aggregatesForOperation,
          // Include individual runs data if requested
          ...(includeRawData && { 
            individualRuns: evoRunsAnalysis.evoRuns[0].iterations.map(iter => ({
              id: iter.id,
              data: iter[oneAnalysisOperation]
            }))
          })
        };
        
        try {
          fs.writeFileSync(outputFileName, JSON.stringify(outputData, null, 2));
          console.log(`Wrote aggregated results for operation '${oneAnalysisOperation}' to: ${outputFileName}`);
          
          operationResults[oneAnalysisOperation] = {
            outputFile: outputFileName,
            timestamp: new Date().toISOString()
          };
          
        } catch (err) {
          console.error(`Failed to write aggregated results for operation '${oneAnalysisOperation}': ${err.message}`);
        }
      } else {
        console.log(`Failed to aggregate results for operation '${oneAnalysisOperation}'`);
      }
    }

    // Save aggregated data for all operations in a single file
    if (operationsWithData.length > 0) {
      const allOperationsFileName = `${folderTypeDir}/all-operations_step-${stepSize}${scoreThreshold ? '_thrshld_'+scoreThreshold:''}${terrainName ? '_terrain-'+terrainName:''}.json`;
      
      try {
        fs.writeFileSync(allOperationsFileName, JSON.stringify(evoRunsAnalysis, null, 2));
        console.log(`\nWrote all aggregated operations to: ${allOperationsFileName}`);
        
        // Track in operation results
        operationResults['all-operations'] = {
          outputFile: allOperationsFileName,
          timestamp: new Date().toISOString()
        };
      } catch (err) {
        console.error(`Failed to write all operations file: ${err.message}`);
      }
    }
    
    // Create a summary file for this folder type
    const summaryFileName = `${folderTypeDir}/_summary.json`;
    const summaryData = {
      folderType,
      folderCount: folders.length,
      folders: folders.map(f => ({
        id: f,
        path: path.join(evoRunsDirPath, f)
      })),
      operationsWithData,
      operationResults,
      timestamp: new Date().toISOString(),
      parameters: {
        stepSize,
        scoreThreshold,
        terrainName
      }
    };
    
    try {
      fs.writeFileSync(summaryFileName, JSON.stringify(summaryData, null, 2));
      console.log(`\nWrote folder type summary to: ${summaryFileName}`);
      
      // Store in overall results
      overallResults.results[folderType] = {
        summaryFile: summaryFileName,
        folderCount: folders.length,
        operationsWithData,
        operationResults
      };
    } catch (err) {
      console.error(`Failed to write folder type summary to: ${summaryFileName}. Error: ${err.message}`);
    }
  }
  
  // Write the overall summary
  const overallOutputFileName = `${writeToFolder}/_aggregation-summary_step-${stepSize}${scoreThreshold ? '_thrshld_'+scoreThreshold:''}${terrainName ? '_terrain-'+terrainName:''}.json`;
  
  try {
    fs.writeFileSync(overallOutputFileName, JSON.stringify(overallResults, null, 2));
    console.log(`\nWrote overall aggregation summary to: ${overallOutputFileName}`);
  } catch (err) {
    console.error(`Failed to write aggregation summary: ${err.message}`);
  }
  
  console.log(`\nAggregation analysis complete. Processed ${evoRunFolders.length} folders grouped into ${Object.keys(groupedFolders).length} types.`);
  console.log(`Results are available in directory: ${writeToFolder}`);
}

/**
 * Aggregates data for a specific operation across all iterations
 * using the same structure and statistical functions as in qdAnalysis_evoRuns
 */
function aggregateOperationAcrossIterations(iterations, oneAnalysisOperation) {
  if (!iterations || iterations.length === 0) {
    return null;
  }

  // Check if any iteration has data for this operation
  const iterationsWithData = iterations.filter(iter => iter[oneAnalysisOperation]);
  if (iterationsWithData.length === 0) {
    return null;
  }
  
  // Handle different operations with appropriate aggregation logic
  switch (oneAnalysisOperation) {
    case "qd-scores":
      return aggregateQdScores(iterationsWithData);
    
    case "grid-mean-fitness":
      return aggregateGridMeanFitness(iterationsWithData);
    
    case "genome-statistics":
      return aggregateGenomeStatistics(iterationsWithData);
      
    case "cell-scores":
      return aggregateCellScores(iterationsWithData);
    
    case "coverage":
      return aggregateCoverage(iterationsWithData);
    
    case "new-elite-count":
      return aggregateNewEliteCount(iterationsWithData);
      
    case "genome-sets":
      return aggregateGenomeSets(iterationsWithData);
      
    case "elites-energy":
      return aggregateElitesEnergy(iterationsWithData);
      
    case "variance":
      return aggregateVariance(iterationsWithData);
      
    case "goal-switches":
      return aggregateGoalSwitches(iterationsWithData);
      
    case "goal-switches-through-lineages":
      return aggregateGoalSwitchesThroughLineages(iterationsWithData);
      
    case "elite-generations":
      return aggregateEliteGenerations(iterationsWithData);
      
    case "diversity-measures":
      return aggregateDiversityMeasures(iterationsWithData);
      
    case "founder-innovation":
      return aggregateFounderInnovation(iterationsWithData);
      
    case "phylogenetic-metrics":
      return aggregatePhylogeneticMetricsOperation(iterationsWithData);
      
    case "enhanced-phylogenetic-metrics":
      return aggregateEnhancedPhylogeneticMetricsOperation(iterationsWithData);
      
    case "terrain-transitions":
      return aggregateTerrainTransitions(iterationsWithData);
      
    case "density-dependence":
      return aggregateDensityDependence(iterationsWithData);
      
    case "phylogenetic-tree":
      return aggregatePhylogeneticTree(iterationsWithData);
    
    // Add more specific aggregation functions as needed
      
    default:
      // Use a generic aggregation for numeric properties
      return aggregateGeneric(iterationsWithData, oneAnalysisOperation);
  }
}

/**
 * Aggregates founder innovation metrics across iterations
 * @param {Array} iterationsWithData - Iterations containing founder innovation data
 * @returns {Object} Aggregated metrics
 */
function aggregateFounderInnovation(iterationsWithData) {
  const aggregates = { founderInnovation: {}, enhancedFounderInnovation: {} };
  
  // Helper function to calculate statistics from an array of values using mathjs
  function calculateStats(values) {
    if (!values || values.length === 0) {
      return { mean: 0, variance: 0, stdDev: 0 };
    }
    
    // Use mathjs statistical functions for calculations
    return { 
      mean: mean(values), 
      variance: variance(values), 
      stdDev: std(values) 
    };
  }
  
  // --- Basic Founder Innovation Metrics ---
  // Filter out iterations without valid data
  const validIterations = iterationsWithData
    .filter(iter => iter["founder-innovation"].founderInnovation && iter["founder-innovation"].founderInnovation.topFounders && iter["founder-innovation"].founderInnovation.topFounders.length > 0);
  
  // Handle case when there is no valid data
  if (validIterations.length > 0) {
    // Extract data arrays for statistical calculations
    const founderScores = validIterations
      .map(iter => iter["founder-innovation"].founderInnovation.topFounders[0].founderScore);
      
    const founderDescendantCounts = validIterations
      .map(iter => iter["founder-innovation"].founderInnovation.topFounders[0].descendantCount);
      
    const founderClassCounts = validIterations
      .map(iter => iter["founder-innovation"].founderInnovation.topFounders[0].uniqueClassCount || 1);
    
    // Get burst data from valid iterations
    const validBurstIterations = iterationsWithData
      .filter(iter => 
        iter["founder-innovation"].founderInnovation && 
        iter["founder-innovation"].founderInnovation.innovationBursts && 
        iter["founder-innovation"].founderInnovation.innovationBursts.topBursts && 
        iter["founder-innovation"].founderInnovation.innovationBursts.topBursts.length > 0
      );
      
    const burstMagnitudes = validBurstIterations
      .map(iter => iter["founder-innovation"].founderInnovation.innovationBursts.topBursts[0].burstMagnitude);
      
    const burstCounts = validBurstIterations
      .map(iter => iter["founder-innovation"].founderInnovation.innovationBursts.topBursts.length);
    
    // Get stepping stone data
    const validSteppingStoneIterations = iterationsWithData
      .filter(iter => iter["founder-innovation"].steppingStones && iter["founder-innovation"].steppingStones.length > 0);
      
    const steppingStoneScores = validSteppingStoneIterations
      .map(iter => iter["founder-innovation"].steppingStones[0].steppingStoneScore);
      
    const steppingStoneDescendantCounts = validSteppingStoneIterations
      .map(iter => iter["founder-innovation"].steppingStones[0].descendantCount);
    
    // Calculate statistics for each metric
    aggregates.founderInnovation = {
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
      const topFounder = iter["founder-innovation"].founderInnovation.topFounders[0] || { founderScore: 0 };
      const topBurst = iter["founder-innovation"].founderInnovation.innovationBursts && 
                       iter["founder-innovation"].founderInnovation.innovationBursts.topBursts && 
                       iter["founder-innovation"].founderInnovation.innovationBursts.topBursts[0] || 
                       { burstMagnitude: 0 };
      const terrainAdaptability = topFounder.uniqueTerrainCount || 1;
      
      // Rough approximation of extinction rate
      const totalLineages = iter["founder-innovation"].founderInnovation.topFounders.reduce(
        (sum, founder) => sum + (founder.descendantCount || 0), 0
      );
      const extinctionRate = totalLineages > 0 ? 
        1 - (iter["founder-innovation"].founderInnovation.topFounders.length / totalLineages) : 0.5;
      
      // Calculate innovation potential score
      return (topBurst.burstMagnitude * terrainAdaptability) / Math.max(0.1, extinctionRate);
    });
    
    // Add composite metrics
    aggregates.founderInnovation.compositeMetrics = {
      innovationPotential: calculateStats(innovationPotentialScores)
    };
  }
  
  // --- Enhanced Founder Innovation Metrics ---
  // Get valid iterations with enhanced founder innovation metrics
  const validEnhancedIterations = iterationsWithData
    .filter(iter => 
      iter["founder-innovation"].enhancedFounderInnovation && 
      iter["founder-innovation"].enhancedFounderInnovation.normalizedFounders && 
      iter["founder-innovation"].enhancedFounderInnovation.normalizedFounders.length > 0);
  
  if (validEnhancedIterations.length > 0) {
    // --- Normalized Founder Metrics ---
    const normalizedImpactScores = validEnhancedIterations
      .map(iter => iter["founder-innovation"].enhancedFounderInnovation.normalizedFounders[0].normalizedImpact);
    
    const effectiveGenerations = validEnhancedIterations
      .map(iter => iter["founder-innovation"].enhancedFounderInnovation.normalizedFounders[0].effectiveGenerations);
    
    aggregates.enhancedFounderInnovation.normalizedFounderImpact = 
      calculateStats(normalizedImpactScores);
    
    aggregates.enhancedFounderInnovation.effectiveGenerations = 
      calculateStats(effectiveGenerations);
    
    // --- Quality Improvement Metrics ---
    const qualityImprovementScores = validEnhancedIterations
      .map(iter => iter["founder-innovation"].enhancedFounderInnovation.qualityFounders[0].qualityImprovement);
    
    const avgQualityImprovementScores = validEnhancedIterations
      .map(iter => iter["founder-innovation"].enhancedFounderInnovation.qualityFounders[0].avgQualityImprovement);
    
    aggregates.enhancedFounderInnovation.qualityImprovement = 
      calculateStats(qualityImprovementScores);
    
    aggregates.enhancedFounderInnovation.avgQualityImprovement = 
      calculateStats(avgQualityImprovementScores);
    
    // --- Class Discovery Rate Metrics ---
    const classDiscoveryRates = validEnhancedIterations
      .map(iter => iter["founder-innovation"].enhancedFounderInnovation.discoveryRateFounders[0].classDiscoveryRate);
    
    aggregates.enhancedFounderInnovation.classDiscoveryRate = 
      calculateStats(classDiscoveryRates);
    
    // --- Burst Pattern Metrics ---
    // Aggregate burst distribution across run segments
    const burstDistributions = validEnhancedIterations
      .map(iter => iter["founder-innovation"].enhancedFounderInnovation.burstPatterns.burstDistribution);
    
    const burstStrengthTrends = validEnhancedIterations
      .map(iter => iter["founder-innovation"].enhancedFounderInnovation.burstPatterns.burstStrengthTrend);
    
    const avgBurstGaps = validEnhancedIterations
      .map(iter => iter["founder-innovation"].enhancedFounderInnovation.burstPatterns.averageBurstGap);
    
    const maxBurstGaps = validEnhancedIterations
      .map(iter => iter["founder-innovation"].enhancedFounderInnovation.burstPatterns.maxBurstGap);
    
    const magnitudeCorrelations = validEnhancedIterations
      .map(iter => iter["founder-innovation"].enhancedFounderInnovation.burstPatterns.magnitudeToNewClassesCorrelation);
    
    const lateDiscoveryScores = validEnhancedIterations
      .map(iter => iter["founder-innovation"].enhancedFounderInnovation.burstPatterns.lateDiscoveryScore);
    
    aggregates.enhancedFounderInnovation.burstDistribution = 
      calculateStats(burstDistributions);
    
    aggregates.enhancedFounderInnovation.burstStrengthTrend = 
      calculateStats(burstStrengthTrends);
    
    aggregates.enhancedFounderInnovation.averageBurstGap = 
      calculateStats(avgBurstGaps);
    
    aggregates.enhancedFounderInnovation.maxBurstGap = 
      calculateStats(maxBurstGaps);
    
    aggregates.enhancedFounderInnovation.magnitudeToNewClassesCorrelation = 
      calculateStats(magnitudeCorrelations);
    
    aggregates.enhancedFounderInnovation.lateDiscoveryScore = 
      calculateStats(lateDiscoveryScores);
    
    // --- Composite Metrics ---
    // Calculate exploration-exploitation balance
    const explorationExploitationBalance = validEnhancedIterations.map(iter => {
      const topFounder = iter["founder-innovation"].enhancedFounderInnovation.normalizedFounders[0];
      const lateDiscovery = iter["founder-innovation"].enhancedFounderInnovation.burstPatterns.lateDiscoveryScore;
      const classRate = iter["founder-innovation"].enhancedFounderInnovation.discoveryRateFounders[0].classDiscoveryRate;
      
      // Higher score indicates better balance between exploration and exploitation
      return (topFounder.normalizedImpact * classRate * (1 + lateDiscovery)) / 1000;
    });
    
    // Calculate adaption capacity
    const adaptationCapacity = validEnhancedIterations.map(iter => {
      const qualityImprovement = iter["founder-innovation"].enhancedFounderInnovation.qualityFounders[0].qualityImprovement;
      const burstGap = iter["founder-innovation"].enhancedFounderInnovation.burstPatterns.averageBurstGap;
      
      // Higher adaptation capacity means better ability to shift to new areas
      return qualityImprovement * (1 / Math.max(1, burstGap/100));
    });
    
    aggregates.enhancedFounderInnovation.explorationExploitationBalance = 
      calculateStats(explorationExploitationBalance);
    
    aggregates.enhancedFounderInnovation.adaptationCapacity = 
      calculateStats(adaptationCapacity);
  }
  
  return aggregates;
}

/**
 * Aggregates phylogenetic metrics across iterations
 * @param {Array} iterationsWithData - Iterations containing phylogenetic metrics data
 * @returns {Object} Aggregated metrics
 */
function aggregatePhylogeneticMetricsOperation(iterationsWithData) {
  const aggregates = { phylogeneticMetrics: {} };
  
  // Helper function to calculate statistics from an array of values using mathjs
  function calculateStats(values) {
    if (!values || values.length === 0) {
      return { mean: 0, variance: 0, stdDev: 0 };
    }
    
    // Use mathjs statistical functions for calculations
    return { 
      mean: mean(values), 
      variance: variance(values), 
      stdDev: std(values) 
    };
  }
  
  // Get valid iterations with phylogenetic metrics data
  const validIterations = iterationsWithData.filter(
    iter => iter.phylogeneticMetrics && iter.phylogeneticMetrics.metrics
  );
  
  if (validIterations.length > 0) {
    // ---- Tree Size Metrics ----
    const extantLineages = validIterations.map(iter => iter.phylogeneticMetrics.metrics.extantLineages);
    const totalSamples = validIterations.map(iter => iter.phylogeneticMetrics.metrics.totalSamples);
    const uniqueLineages = validIterations.map(iter => iter.phylogeneticMetrics.metrics.uniqueLineages);
    
    // ---- Event Metrics ----
    const birthCounts = validIterations.map(iter => iter.phylogeneticMetrics.metrics.events.birthCount);
    const deathCounts = validIterations.map(iter => iter.phylogeneticMetrics.metrics.events.deathCount);
    const extinctionCounts = validIterations.map(iter => iter.phylogeneticMetrics.metrics.events.extinctionCount);
    
    // ---- Tree Shape Metrics ----
    const sackinIndices = validIterations
      .filter(iter => iter.phylogeneticMetrics.metrics.shape)
      .map(iter => iter.phylogeneticMetrics.metrics.shape.sackinIndex);
    
    const collessIndices = validIterations
      .filter(iter => iter.phylogeneticMetrics.metrics.shape)
      .map(iter => iter.phylogeneticMetrics.metrics.shape.collessIndex);
    
    // ---- Diversification Metrics ----
    const netDiversificationRates = validIterations
      .filter(iter => iter.phylogeneticMetrics.metrics.diversification)
      .map(iter => iter.phylogeneticMetrics.metrics.diversification.netDiversificationRate);
    
    const meanExtinctionRates = validIterations
      .filter(iter => iter.phylogeneticMetrics.metrics.diversification)
      .map(iter => iter.phylogeneticMetrics.metrics.diversification.meanExtinctionRate);
    
    // ---- Diversity Metrics ----
    const phylogeneticDiversities = validIterations
      .filter(iter => iter.phylogeneticMetrics.metrics.diversity)
      .map(iter => iter.phylogeneticMetrics.metrics.diversity.phylogeneticDiversity);
    
    const faithPDs = validIterations
      .filter(iter => iter.phylogeneticMetrics.metrics.diversity)
      .map(iter => iter.phylogeneticMetrics.metrics.diversity.faithPD);
    
    // Add all metrics to aggregates
    aggregates.phylogeneticMetrics = {
      treeSize: {
        extantLineages: calculateStats(extantLineages),
        totalSamples: calculateStats(totalSamples),
        uniqueLineages: calculateStats(uniqueLineages)
      },
      events: {
        birthCount: calculateStats(birthCounts),
        deathCount: calculateStats(deathCounts),
        extinctionCount: calculateStats(extinctionCounts)
      },
      shape: {
        sackinIndex: calculateStats(sackinIndices),
        collessIndex: calculateStats(collessIndices)
      },
      diversification: {
        netDiversificationRate: calculateStats(netDiversificationRates),
        meanExtinctionRate: calculateStats(meanExtinctionRates)
      },
      diversity: {
        phylogeneticDiversity: calculateStats(phylogeneticDiversities),
        faithPD: calculateStats(faithPDs)
      }
    };
    
    // Add composite metrics
    const treeBalanceScores = validIterations
      .filter(iter => 
        iter.phylogeneticMetrics.metrics.shape && 
        iter.phylogeneticMetrics.metrics.diversity)
      .map(iter => {
        const colless = iter.phylogeneticMetrics.metrics.shape.collessIndex || 0;
        const pd = iter.phylogeneticMetrics.metrics.diversity.phylogeneticDiversity || 0;
        // Higher balance score indicates more balanced tree with higher diversity
        return (1 / (1 + Math.abs(colless))) * pd;
      });
    
    const adaptiveRadiationScores = validIterations
      .filter(iter => 
        iter.phylogeneticMetrics.metrics.diversification && 
        iter.phylogeneticMetrics.metrics.events)
      .map(iter => {
        const diversification = iter.phylogeneticMetrics.metrics.diversification.netDiversificationRate || 0;
        const birthRate = iter.phylogeneticMetrics.metrics.events.birthCount / Math.max(1, iter.phylogeneticMetrics.metrics.totalSamples);
        // Higher score indicates rapid diversification with high birth rate
        return diversification * birthRate * 100;
      });
    
    aggregates.phylogeneticMetrics.compositeMetrics = {
      treeBalanceScore: calculateStats(treeBalanceScores),
      adaptiveRadiationScore: calculateStats(adaptiveRadiationScores)
    };
  }
  
  return aggregates;
}

/**
 * Aggregates enhanced phylogenetic metrics across iterations
 * @param {Array} iterationsWithData - Iterations containing enhanced phylogenetic metrics data
 * @returns {Object} Aggregated metrics
 */
function aggregateEnhancedPhylogeneticMetricsOperation(iterationsWithData) {
  const aggregates = { enhancedPhylogeneticMetrics: {} };
  
  // Helper function to calculate statistics from an array of values using mathjs
  function calculateStats(values) {
    if (!values || values.length === 0) {
      return { mean: 0, variance: 0, stdDev: 0 };
    }
    
    // Use mathjs statistical functions for calculations
    return { 
      mean: mean(values), 
      variance: variance(values), 
      stdDev: std(values) 
    };
  }
  
  // Get valid iterations with enhanced phylogenetic metrics data
  const validIterations = iterationsWithData.filter(
    iter => iter.enhancedPhylogeneticMetrics && 
           iter.enhancedPhylogeneticMetrics.lineageMetrics
  );
  
  if (validIterations.length > 0) {
    // ---- Enhanced Lineage Metrics ----
    const persistenceScores = validIterations
      .map(iter => iter.enhancedPhylogeneticMetrics.lineageMetrics.persistenceScore);
      
    const innovationScores = validIterations
      .map(iter => iter.enhancedPhylogeneticMetrics.lineageMetrics.innovationScore);
      
    const adaptabilityScores = validIterations
      .map(iter => iter.enhancedPhylogeneticMetrics.lineageMetrics.adaptabilityScore);
    
    const resilienceScores = validIterations
      .map(iter => iter.enhancedPhylogeneticMetrics.lineageMetrics.resilienceScore);
    
    // ---- Temporal Metrics ----
    const temporalTurnoverRates = validIterations
      .filter(iter => iter.enhancedPhylogeneticMetrics.temporalMetrics)
      .map(iter => iter.enhancedPhylogeneticMetrics.temporalMetrics.turnoverRate);
    
    const temporalInnovationRates = validIterations
      .filter(iter => iter.enhancedPhylogeneticMetrics.temporalMetrics)
      .map(iter => iter.enhancedPhylogeneticMetrics.temporalMetrics.innovationRate);
    
    // ---- Class Dispersal Metrics ----
    const classDispersionScores = validIterations
      .filter(iter => iter.enhancedPhylogeneticMetrics.classMetrics)
      .map(iter => iter.enhancedPhylogeneticMetrics.classMetrics.dispersionScore);
    
    const classCoverageRates = validIterations
      .filter(iter => iter.enhancedPhylogeneticMetrics.classMetrics)
      .map(iter => iter.enhancedPhylogeneticMetrics.classMetrics.coverageRate);
    
    // Add all metrics to aggregates
    aggregates.enhancedPhylogeneticMetrics = {
      lineageMetrics: {
        persistenceScore: calculateStats(persistenceScores),
        innovationScore: calculateStats(innovationScores),
        adaptabilityScore: calculateStats(adaptabilityScores),
        resilienceScore: calculateStats(resilienceScores)
      },
      temporalMetrics: {
        turnoverRate: calculateStats(temporalTurnoverRates),
        innovationRate: calculateStats(temporalInnovationRates)
      },
      classMetrics: {
        dispersionScore: calculateStats(classDispersionScores),
        coverageRate: calculateStats(classCoverageRates)
      }
    };
    
    // Add composite metrics
    const evolutionaryPotentialScores = validIterations
      .filter(iter => 
        iter.enhancedPhylogeneticMetrics.lineageMetrics &&
        iter.enhancedPhylogeneticMetrics.temporalMetrics)
      .map(iter => {
        const innovation = iter.enhancedPhylogeneticMetrics.lineageMetrics.innovationScore || 0;
        const adaptability = iter.enhancedPhylogeneticMetrics.lineageMetrics.adaptabilityScore || 0;
        const turnover = iter.enhancedPhylogeneticMetrics.temporalMetrics.turnoverRate || 0;
        
        // Higher score indicates better evolutionary potential
        return (innovation * adaptability) * (1 + turnover);
      });
    
    aggregates.enhancedPhylogeneticMetrics.compositeMetrics = {
      evolutionaryPotential: calculateStats(evolutionaryPotentialScores)
    };
    
    // Add tree shape metrics if available
    const treeShapeIterations = validIterations.filter(iter => 
      iter.phylogeneticMetrics && 
      iter.phylogeneticMetrics.metrics && 
      iter.phylogeneticMetrics.metrics.shape);
    
    if (treeShapeIterations.length > 0) {
      const sackinValues = treeShapeIterations.map(iter => 
        iter.phylogeneticMetrics.metrics.shape.sackinIndex);
      
      const collessValues = treeShapeIterations.map(iter => 
        iter.phylogeneticMetrics.metrics.shape.collessIndex);
      
      aggregates.enhancedPhylogeneticMetrics.treeShape = {
        sackinIndex: calculateStats(sackinValues),
        collessIndex: calculateStats(collessValues)
      };
    }
  }
  
  return aggregates;
}

/**
 * Aggregates terrain transitions metrics across iterations
 * @param {Array} iterationsWithData - Iterations containing terrain transitions data
 * @returns {Object} Aggregated metrics
 */
function aggregateTerrainTransitions(iterationsWithData) {
  const aggregates = { terrainTransitions: {} };
  
  // Helper function to calculate statistics from an array of values using mathjs
  function calculateStats(values) {
    if (!values || values.length === 0) {
      return { mean: 0, variance: 0, stdDev: 0 };
    }
    
    // Use mathjs statistical functions for calculations
    return { 
      mean: mean(values), 
      variance: variance(values), 
      stdDev: std(values) 
    };
  }
  
  // Filter for iterations with terrain transition data
  const terrainIterations = iterationsWithData.filter(iter => 
    iter.terrainTransitions && 
    iter.terrainTransitions.terrainMetrics);
  
  if (terrainIterations.length > 0) {
    const adaptabilityValues = terrainIterations.map(iter => 
      iter.terrainTransitions.terrainMetrics.terrainAdaptability);
    
    const multiTerrainCounts = terrainIterations.map(iter => 
      iter.terrainTransitions.terrainMetrics.multiTerrainGenomeCount);
    
    const successfulTransitions = terrainIterations
      .filter(iter => iter.terrainTransitions.transitionMetrics)
      .map(iter => iter.terrainTransitions.transitionMetrics.successfulTransitions);
    
    const averageTransitionTime = terrainIterations
      .filter(iter => iter.terrainTransitions.transitionMetrics)
      .map(iter => iter.terrainTransitions.transitionMetrics.averageTransitionTime);
    
    // Add terrain metrics to aggregates
    aggregates.terrainTransitions = {
      terrainMetrics: {
        terrainAdaptability: calculateStats(adaptabilityValues),
        multiTerrainGenomeCount: calculateStats(multiTerrainCounts)
      }
    };
    
    // Add transition metrics if available
    if (successfulTransitions.length > 0) {
      aggregates.terrainTransitions.transitionMetrics = {
        successfulTransitions: calculateStats(successfulTransitions),
        averageTransitionTime: calculateStats(averageTransitionTime)
      };
    }
  }
  
  return aggregates;
}

/**
 * Aggregates density dependence metrics across iterations
 * @param {Array} iterationsWithData - Iterations containing density dependence data
 * @returns {Object} Aggregated metrics
 */
function aggregateDensityDependence(iterationsWithData) {
  const aggregates = { densityDependence: {} };
  
  // Helper function to calculate statistics from an array of values using mathjs
  function calculateStats(values) {
    if (!values || values.length === 0) {
      return { mean: 0, variance: 0, stdDev: 0 };
    }
    
    // Use mathjs statistical functions for calculations
    return { 
      mean: mean(values), 
      variance: variance(values), 
      stdDev: std(values) 
    };
  }
  
  // Filter for iterations with density dependence data
  const densityIterations = iterationsWithData.filter(iter => 
    iter.densityDependence && 
    iter.densityDependence.metrics);
  
  if (densityIterations.length > 0) {
    const densityEffects = densityIterations.map(iter => 
      iter.densityDependence.metrics.densityEffect);
    
    const competitionCoefficients = densityIterations.map(iter => 
      iter.densityDependence.metrics.competitionCoefficient);
    
    const nicheOverlapScores = densityIterations
      .filter(iter => iter.densityDependence.nicheMetrics)
      .map(iter => iter.densityDependence.nicheMetrics.nicheOverlap);
    
    const nicheBreadthScores = densityIterations
      .filter(iter => iter.densityDependence.nicheMetrics)
      .map(iter => iter.densityDependence.nicheMetrics.nicheBreadth);
    
    // Add metrics to aggregates
    aggregates.densityDependence = {
      metrics: {
        densityEffect: calculateStats(densityEffects),
        competitionCoefficient: calculateStats(competitionCoefficients)
      }
    };
    
    // Add niche metrics if available
    if (nicheOverlapScores.length > 0) {
      aggregates.densityDependence.nicheMetrics = {
        nicheOverlap: calculateStats(nicheOverlapScores),
        nicheBreadth: calculateStats(nicheBreadthScores)
      };
    }
    
    // Calculate niche packing score as composite metric if both metrics are available
    if (nicheOverlapScores.length > 0 && nicheBreadthScores.length > 0) {
      const nichePackingScores = densityIterations
        .filter(iter => 
          iter.densityDependence.nicheMetrics && 
          iter.densityDependence.nicheMetrics.nicheOverlap !== undefined && 
          iter.densityDependence.nicheMetrics.nicheBreadth !== undefined)
        .map(iter => {
          const overlap = iter.densityDependence.nicheMetrics.nicheOverlap;
          const breadth = iter.densityDependence.nicheMetrics.nicheBreadth;
          // Higher score indicates more efficient niche packing
          return breadth / Math.max(0.1, overlap);
        });
      
      if (nichePackingScores.length > 0) {
        aggregates.densityDependence.compositeMetrics = {
          nichePackingScore: calculateStats(nichePackingScores)
        };
      }
    }
  }
  
  return aggregates;
}

/**
 * Aggregates phylogenetic tree data across iterations
 * @param {Array} iterationsWithData - Iterations containing phylogenetic tree data
 * @returns {Object} Aggregated metrics for phylogenetic trees
 */
function aggregatePhylogeneticTree(iterationsWithData) {
  const aggregates = { phylogeneticTree: {} };
  
  // Helper function to calculate statistics from an array of values using mathjs
  function calculateStats(values) {
    if (!values || values.length === 0) {
      return { mean: 0, variance: 0, stdDev: 0 };
    }
    
    // Use mathjs statistical functions for calculations
    return {
      mean: mean(values),
      variance: variance(values),
      stdDev: std(values)
    };
  }
  
  // Filter iterations with phylogenetic tree data
  const treeIterations = iterationsWithData.filter(iter => 
    iter.phylogeneticTree && iter.phylogeneticTree.status === "Generated");
  
  if (treeIterations.length > 0) {
    // Collect tree statistics
    const treeCounts = treeIterations.map(iter => 
      iter.phylogeneticTree.files ? iter.phylogeneticTree.files.length : 0);
    
    // Get directories
    const treeDirectories = treeIterations.map(iter => iter.phylogeneticTree.outputDir)
      .filter(dir => dir); // Filter out undefined/null values
    
    // Get unique tree types (based on file name patterns)
    const allFileNames = treeIterations
      .flatMap(iter => iter.phylogeneticTree.files || []);
    
    aggregates.phylogeneticTree = {
      status: "Aggregated",
      treeCountStatistics: calculateStats(treeCounts),
      directories: treeDirectories,
      fileCount: allFileNames.length,
      examples: allFileNames.slice(0, 5) // Show a few examples
    };
  }
  
  return aggregates;
}
