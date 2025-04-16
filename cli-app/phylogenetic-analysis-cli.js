/**
 * Command-line interface for phylogenetic tree analysis
 * This module integrates the phylogenetic metrics into the main CLI workflow
 */

import {
  analyzePhylogeneticTreeMetrics,
  trackPhylogeneticMetricsOverTime,
  analyzeTerrainTransitions,
  analyzeDensityDependence,
  generatePhylogeneticReport
} from './qd-run-analysis.js';

import { createVisualizationPackage } from './visualization-utils.js';
import fs from 'fs';
import path from 'path';
import figlet from 'figlet';
import { getEvoRunDirPath } from './util/qd-common.js';

/**
 * Main entry point for running phylogenetic analysis
 * @param {Object} evoRunConfig - Configuration for the evolutionary run
 * @param {string} evoRunId - ID of the evolutionary run
 * @param {Object} options - Analysis options
 */
export async function runPhylogeneticAnalysis(evoRunConfig, evoRunId, options = {}, lineage) {
  const {
    visualize = true,
    trackOverTime = true,
    stepSize = 10,
    report = true
  } = options;
  
  console.log(figlet.textSync('Phylogenetic Analysis', { font: 'Standard' }));
  console.log(`Analyzing evolutionary run: ${evoRunId}`);
  
  try {
    // Create output directory for visualizations if needed
    const evoRunDirPath = getEvoRunDirPath(evoRunConfig, evoRunId);
    const visualizationPath = path.join(evoRunDirPath, 'visualizations');
    if (visualize && !fs.existsSync(visualizationPath)) {
      fs.mkdirSync(visualizationPath, { recursive: true });
    }
    
    // Step 1: Calculate basic metrics
    console.log('Calculating basic phylogenetic metrics...');
    const metrics = await analyzePhylogeneticTreeMetrics(evoRunConfig, evoRunId, lineage);
    logMetricsSummary(metrics);
    
    // Step 2: Track metrics over time if requested
    if (trackOverTime) {
      console.log(`Tracking metrics over time (step size: ${stepSize})...`);
      await trackPhylogeneticMetricsOverTime(evoRunConfig, evoRunId, stepSize);
    }
    
    // Step 3: Analyze terrain transitions
    console.log('Analyzing terrain transitions...');
    const terrainAnalysis = await analyzeTerrainTransitions(evoRunConfig, evoRunId, lineage);
    
    // Step 4: Analyze density dependence
    console.log('Analyzing density dependence...');
    const densityAnalysis = await analyzeDensityDependence(evoRunConfig, evoRunId, lineage);
    
    // Step 5: Generate visualization data if requested
    if (visualize) {
      console.log('Generating visualization data...');
      const lineageData = lineage ? lineage : await getLineageGraphData(evoRunConfig, evoRunId);
      const visualizationData = createVisualizationPackage(lineageData, metrics);
      
      // Save visualization data
      const visDataStringified = JSON.stringify(visualizationData, null, 2);
      const visDataPath = path.join(visualizationPath, 'visualization-data.json');
      fs.writeFileSync(visDataPath, visDataStringified);
      console.log(`Saved visualization data to ${visDataPath}`);
    }
    
    // Step 6: Generate comprehensive report if requested
    if (report) {
      console.log('Generating comprehensive report...');
      const reportData = await generatePhylogeneticReport(evoRunConfig, evoRunId, lineage);
      console.log('Report complete!');
      
      // Print key findings
      console.log('\n==== KEY FINDINGS ====');
      console.log(`Total unique solutions: ${reportData.summary.totalGenomes}`);
      console.log(`Extant lineages: ${reportData.summary.extantLineages}`);
      console.log(`Birth events: ${reportData.summary.births}`);
      console.log(`Death events: ${reportData.summary.deaths}`);
      console.log(`Density-dependent diversification: ${reportData.summary.isDensityDependent}`);
      console.log(`Terrain adaptability: ${(reportData.summary.terrainAdaptability * 100).toFixed(2)}%`);
      console.log(`Tree shape (imbalance): ${reportData.treeMetrics.shape.collessIndex.toFixed(4)}`);
      console.log('=====================\n');
    }
    
    console.log('Phylogenetic analysis complete!');
    return { metrics, terrainAnalysis, densityAnalysis };
    
  } catch (error) {
    console.error('Error during phylogenetic analysis:', error);
    throw error;
  }
}

/**
 * Log a summary of the metrics to the console
 * @param {Object} metrics - The calculated metrics
 */
function logMetricsSummary(metrics) {
  console.log('\n==== METRICS SUMMARY ====');
  console.log(`Extant Lineages (N): ${metrics.extantLineages}`);
  console.log(`Total Samples (M): ${metrics.totalSamples}`);
  console.log(`Unique Lineages Sampled (M̃): ${metrics.uniqueLineages}`);
  console.log('\n==== EVOLUTIONARY EVENTS ====');
  console.log(`Births: ${metrics.events.birthCount}`);
  console.log(`Deaths: ${metrics.events.deathCount}`);
  console.log(`Extinctions: ${metrics.events.extinctionCount}`);
  console.log('\n==== TREE SHAPE ====');
  console.log(`Sackin Index: ${metrics.shape.sackinIndex.toFixed(4)}`);
  console.log(`Colless Index: ${metrics.shape.collessIndex.toFixed(4)}`);
  console.log(`Average Branch Length: ${metrics.shape.averageBranchLength.toFixed(4)}`);
  console.log('\n==== TERRAIN TRANSITIONS ====');
  console.log(`Terrain Adaptability: ${(metrics.terrainTransitions.terrainAdaptability * 100).toFixed(2)}%`);
  console.log(`Multi-terrain Genomes: ${metrics.terrainTransitions.multiTerrainGenomeCount}`);
  console.log('\n==== DENSITY DEPENDENCE ====');
  console.log(`Correlation: ${metrics.densityDependence.densityDependenceCorrelation.toFixed(4)}`);
  console.log(`Is Density Dependent: ${metrics.densityDependence.isDensityDependent}`);
  console.log('==========================\n');
}

/**
 * Compare phylogenetic metrics between multiple runs
 * @param {Object} evoRunConfig - Configuration for the evolutionary runs
 * @param {Array} evoRunIds - Array of evolutionary run IDs to compare
 */
export async function comparePhylogeneticMetrics(evoRunConfig, evoRunIds) {
  console.log(figlet.textSync('Metric Comparison', { font: 'Standard' }));
  console.log(`Comparing ${evoRunIds.length} evolutionary runs`);
  
  const results = {};
  
  // Analyze each run
  for (const evoRunId of evoRunIds) {
    console.log(`\nAnalyzing run: ${evoRunId}`);
    const metrics = await analyzePhylogeneticTreeMetrics(evoRunConfig, evoRunId, false);
    results[evoRunId] = metrics;
  }
  
  // Compare key metrics
  console.log('\n==== COMPARISON SUMMARY ====');
  
  // Tree size metrics
  console.log('\nTree Size Metrics:');
  console.log('Run ID\t\tExtant (N)\tTotal (M)\tUnique (M̃)');
  evoRunIds.forEach(id => {
    console.log(`${id}\t${results[id].extantLineages}\t\t${results[id].totalSamples}\t\t${results[id].uniqueLineages}`);
  });
  
  // Tree shape
  console.log('\nTree Shape Metrics:');
  console.log('Run ID\t\tSackin\t\tColless\t\tAvg Branch');
  evoRunIds.forEach(id => {
    console.log(`${id}\t${results[id].shape.sackinIndex.toFixed(4)}\t${results[id].shape.collessIndex.toFixed(4)}\t${results[id].shape.averageBranchLength.toFixed(4)}`);
  });
  
  // Evolutionary events
  console.log('\nEvolutionary Events:');
  console.log('Run ID\t\tBirths\t\tDeaths\t\tExtinctions');
  evoRunIds.forEach(id => {
    console.log(`${id}\t${results[id].events.birthCount}\t\t${results[id].events.deathCount}\t\t${results[id].events.extinctionCount}`);
  });
  
  // Terrain adaptability
  console.log('\nTerrain Adaptability:');
  console.log('Run ID\t\tAdaptability\tMulti-terrain');
  evoRunIds.forEach(id => {
    console.log(`${id}\t${(results[id].terrainTransitions.terrainAdaptability * 100).toFixed(2)}%\t${results[id].terrainTransitions.multiTerrainGenomeCount}`);
  });
  
  // Density dependence
  console.log('\nDensity Dependence:');
  console.log('Run ID\t\tCorrelation\tIs DD');
  evoRunIds.forEach(id => {
    console.log(`${id}\t${results[id].densityDependence.densityDependenceCorrelation.toFixed(4)}\t${results[id].densityDependence.isDensityDependent}`);
  });
  
  // Save comparison to file
  const evoRunDirPath = getEvoRunDirPath(evoRunConfig, evoRunIds[0]);
  const parentDir = path.dirname(evoRunDirPath);
  const comparisonPath = path.join(parentDir, 'phylogenetic-comparison.json');
  fs.writeFileSync(comparisonPath, JSON.stringify(results, null, 2));
  console.log(`\nSaved detailed comparison to ${comparisonPath}`);
  
  return results;
}





/**
 * Compare phylogenetic metrics between different evolution run types (configurations)
 * Uses aggregate data from multiple iterations of each configuration type
 * @param {Object} evoRunsConfig - The complete evolution runs configuration object
 * @param {Object} evoRunsAnalysis - The analysis results containing aggregated metrics
 * @param {string} outputPath - Where to save the comparison results
 * @returns {Object} Comparison results
 */
export async function comparePhylogeneticMetricsAcrossConfigurations(evoRunsConfig, evoRunsAnalysis, outputPath) {
  console.log(figlet.textSync('Configuration Comparison', { font: 'Standard' }));
  console.log(`Comparing ${evoRunsConfig.evoRuns.length} evolution run configurations`);
  
  // Create comparison object
  const comparison = {
    configurations: {},
    summaryTables: {},
    statisticalTests: {}
  };
  
  // Extract data for each configuration type
  for (let i = 0; i < evoRunsConfig.evoRuns.length; i++) {
    const configLabel = evoRunsConfig.evoRuns[i].label;
    console.log(`Processing configuration: ${configLabel}`);
    
    // Skip if no aggregates available
    if (!evoRunsAnalysis.evoRuns[i].aggregates || !evoRunsAnalysis.evoRuns[i].aggregates.phylogeneticMetrics) {
      console.log(`No phylogenetic metrics found for configuration: ${configLabel}`);
      continue;
    }
    
    // Extract the aggregate metrics
    const metrics = evoRunsAnalysis.evoRuns[i].aggregates.phylogeneticMetrics;
    
    // Store in comparison object
    comparison.configurations[configLabel] = {
      treeSize: {
        extantLineages: metrics.treeSize.extantLineages,
        totalSamples: metrics.treeSize.totalSamples,
        uniqueLineages: metrics.treeSize.uniqueLineages
      },
      events: {
        births: metrics.events.births,
        deaths: metrics.events.deaths,
        extinctions: metrics.events.extinctions
      },
      shape: {
        sackinIndex: metrics.shape.sackinIndex,
        collessIndex: metrics.shape.collessIndex
      },
      terrainTransitions: {
        terrainAdaptability: metrics.terrainTransitions?.terrainAdaptability
      },
      densityDependence: {
        correlation: metrics.densityDependence?.correlation,
        isDensityDependent: metrics.densityDependence?.isDensityDependent
      }
    };
  }
  
  // Generate summary tables for easy comparison
  comparison.summaryTables = generateComparisonTables(comparison.configurations);
  
  // Calculate effect sizes and statistical significance
  comparison.statisticalTests = calculateStatisticalComparisons(comparison.configurations);
  
  // Print summary comparison
  printComparisonSummary(comparison);
  
  // Save comparison results
  const comparisonPath = outputPath || path.join(
    path.dirname(evoRunsConfig.baseEvolutionRunConfigFile), 
    'phylogenetic-configuration-comparison.json'
  );
  
  fs.writeFileSync(comparisonPath, JSON.stringify(comparison, null, 2));
  console.log(`Saved configuration comparison to ${comparisonPath}`);
  
  return comparison;
}

/**
 * Generate formatted comparison tables
 * @param {Object} configurations - Configuration data to compare
 * @returns {Object} Formatted tables
 */
function generateComparisonTables(configurations) {
  const configLabels = Object.keys(configurations);
  
  // Tree size table
  const treeSizeTable = {
    headers: ['Configuration', 'Extant Lineages (N)', 'Total Samples (M)', 'Unique Lineages (M̃)'],
    rows: configLabels.map(label => [
      label,
      `${configurations[label].treeSize.extantLineages.mean.toFixed(2)} ± ${configurations[label].treeSize.extantLineages.stdDev.toFixed(2)}`,
      `${configurations[label].treeSize.totalSamples.mean.toFixed(2)} ± ${configurations[label].treeSize.totalSamples.stdDev.toFixed(2)}`,
      `${configurations[label].treeSize.uniqueLineages.mean.toFixed(2)} ± ${configurations[label].treeSize.uniqueLineages.stdDev.toFixed(2)}`
    ])
  };
  
  // Events table
  const eventsTable = {
    headers: ['Configuration', 'Births', 'Deaths', 'Extinctions'],
    rows: configLabels.map(label => [
      label,
      `${configurations[label].events.births.mean.toFixed(2)} ± ${configurations[label].events.births.stdDev.toFixed(2)}`,
      `${configurations[label].events.deaths.mean.toFixed(2)} ± ${configurations[label].events.deaths.stdDev.toFixed(2)}`,
      `${configurations[label].events.extinctions.mean.toFixed(2)} ± ${configurations[label].events.extinctions.stdDev.toFixed(2)}`
    ])
  };
  
  // Tree shape table
  const shapeTable = {
    headers: ['Configuration', 'Sackin Index', 'Colless Index'],
    rows: configLabels.map(label => [
      label,
      `${configurations[label].shape.sackinIndex.mean.toFixed(4)} ± ${configurations[label].shape.sackinIndex.stdDev.toFixed(4)}`,
      `${configurations[label].shape.collessIndex.mean.toFixed(4)} ± ${configurations[label].shape.collessIndex.stdDev.toFixed(4)}`
    ])
  };
  
  // Terrain table
  const terrainTable = {
    headers: ['Configuration', 'Terrain Adaptability'],
    rows: configLabels.map(label => [
      label,
      configurations[label].terrainTransitions.terrainAdaptability ? 
        `${(configurations[label].terrainTransitions.terrainAdaptability.mean * 100).toFixed(2)}% ± ${(configurations[label].terrainTransitions.terrainAdaptability.stdDev * 100).toFixed(2)}%` : 
        'N/A'
    ])
  };
  
  // Density dependence table
  const densityTable = {
    headers: ['Configuration', 'DD Correlation', 'Is Density Dependent'],
    rows: configLabels.map(label => [
      label,
      configurations[label].densityDependence.correlation ? 
        `${configurations[label].densityDependence.correlation.mean.toFixed(4)} ± ${configurations[label].densityDependence.correlation.stdDev.toFixed(4)}` : 
        'N/A',
      configurations[label].densityDependence.isDensityDependent ? 
        `${configurations[label].densityDependence.isDensityDependent.percentage.toFixed(0)}%` : 
        'N/A'
    ])
  };
  
  return {
    treeSize: treeSizeTable,
    events: eventsTable,
    shape: shapeTable,
    terrain: terrainTable,
    density: densityTable
  };
}

/**
 * Calculate statistical comparisons between configurations
 * Returns effect sizes and p-values where possible
 * @param {Object} configurations - Configuration data to compare
 * @returns {Object} Statistical comparison results
 */
function calculateStatisticalComparisons(configurations) {
  const configLabels = Object.keys(configurations);
  if (configLabels.length < 2) {
    return { note: "At least two configurations are needed for statistical comparison" };
  }
  
  // Simple effect size calculation using Cohen's d
  function calculateCohenD(mean1, mean2, sd1, sd2) {
    // Pooled standard deviation
    const pooledSD = Math.sqrt(((sd1 * sd1) + (sd2 * sd2)) / 2);
    // Cohen's d
    return Math.abs(mean1 - mean2) / pooledSD;
  }
  
  const comparisons = {};
  
  // Compare each pair of configurations
  for (let i = 0; i < configLabels.length; i++) {
    for (let j = i + 1; j < configLabels.length; j++) {
      const label1 = configLabels[i];
      const label2 = configLabels[j];
      const comparisonKey = `${label1} vs ${label2}`;
      
      comparisons[comparisonKey] = {
        treeSize: {
          extantLineages: calculateCohenD(
            configurations[label1].treeSize.extantLineages.mean,
            configurations[label2].treeSize.extantLineages.mean,
            configurations[label1].treeSize.extantLineages.stdDev,
            configurations[label2].treeSize.extantLineages.stdDev
          ),
          totalSamples: calculateCohenD(
            configurations[label1].treeSize.totalSamples.mean,
            configurations[label2].treeSize.totalSamples.mean,
            configurations[label1].treeSize.totalSamples.stdDev,
            configurations[label2].treeSize.totalSamples.stdDev
          ),
          uniqueLineages: calculateCohenD(
            configurations[label1].treeSize.uniqueLineages.mean,
            configurations[label2].treeSize.uniqueLineages.mean,
            configurations[label1].treeSize.uniqueLineages.stdDev,
            configurations[label2].treeSize.uniqueLineages.stdDev
          )
        },
        events: {
          births: calculateCohenD(
            configurations[label1].events.births.mean,
            configurations[label2].events.births.mean,
            configurations[label1].events.births.stdDev,
            configurations[label2].events.births.stdDev
          ),
          deaths: calculateCohenD(
            configurations[label1].events.deaths.mean,
            configurations[label2].events.deaths.mean,
            configurations[label1].events.deaths.stdDev,
            configurations[label2].events.deaths.stdDev
          )
        },
        shape: {
          collessIndex: calculateCohenD(
            configurations[label1].shape.collessIndex.mean,
            configurations[label2].shape.collessIndex.mean,
            configurations[label1].shape.collessIndex.stdDev,
            configurations[label2].shape.collessIndex.stdDev
          )
        }
      };
      
      // Add terrain adaptability comparison if available for both
      if (configurations[label1].terrainTransitions.terrainAdaptability && 
          configurations[label2].terrainTransitions.terrainAdaptability) {
        comparisons[comparisonKey].terrain = {
          adaptability: calculateCohenD(
            configurations[label1].terrainTransitions.terrainAdaptability.mean,
            configurations[label2].terrainTransitions.terrainAdaptability.mean,
            configurations[label1].terrainTransitions.terrainAdaptability.stdDev,
            configurations[label2].terrainTransitions.terrainAdaptability.stdDev
          )
        };
      }
    }
  }
  
  return comparisons;
}

/**
 * Print a human-readable summary of the configuration comparison
 * @param {Object} comparison - The comparison results
 */
function printComparisonSummary(comparison) {
  const tables = comparison.summaryTables;
  
  console.log('\n===== PHYLOGENETIC METRICS COMPARISON ACROSS CONFIGURATIONS =====');
  
  // Print tree size table
  console.log('\nTREE SIZE METRICS:');
  console.log(tables.treeSize.headers.join('\t'));
  tables.treeSize.rows.forEach(row => {
    console.log(row.join('\t'));
  });
  
  // Print evolutionary events table
  console.log('\nEVOLUTIONARY EVENTS:');
  console.log(tables.events.headers.join('\t'));
  tables.events.rows.forEach(row => {
    console.log(row.join('\t'));
  });
  
  // Print tree shape table
  console.log('\nTREE SHAPE:');
  console.log(tables.shape.headers.join('\t'));
  tables.shape.rows.forEach(row => {
    console.log(row.join('\t'));
  });
  
  // Print terrain adaptability
  console.log('\nTERRAIN ADAPTABILITY:');
  console.log(tables.terrain.headers.join('\t'));
  tables.terrain.rows.forEach(row => {
    console.log(row.join('\t'));
  });
  
  // Print density dependence
  console.log('\nDENSITY DEPENDENCE:');
  console.log(tables.density.headers.join('\t'));
  tables.density.rows.forEach(row => {
    console.log(row.join('\t'));
  });
  
  // Print statistical significance
  console.log('\nSTATISTICAL EFFECT SIZES (Cohen\'s d):');
  console.log('Effect size interpretation: Small: 0.2, Medium: 0.5, Large: 0.8');
  const comparisons = comparison.statisticalTests;
  Object.keys(comparisons).forEach(key => {
    console.log(`\n${key}:`);
    
    const effectSizes = comparisons[key];
    console.log(`- Tree Size:`);
    console.log(`  Extant Lineages: ${effectSizes.treeSize.extantLineages.toFixed(2)}`);
    console.log(`  Total Samples: ${effectSizes.treeSize.totalSamples.toFixed(2)}`);
    console.log(`  Unique Lineages: ${effectSizes.treeSize.uniqueLineages.toFixed(2)}`);
    
    console.log(`- Events:`);
    console.log(`  Births: ${effectSizes.events.births.toFixed(2)}`);
    console.log(`  Deaths: ${effectSizes.events.deaths.toFixed(2)}`);
    
    console.log(`- Shape:`);
    console.log(`  Colless Index: ${effectSizes.shape.collessIndex.toFixed(2)}`);
    
    if (effectSizes.terrain) {
      console.log(`- Terrain:`);
      console.log(`  Adaptability: ${effectSizes.terrain.adaptability.toFixed(2)}`);
    }
  });
  
  console.log('\n================================================================');
}
