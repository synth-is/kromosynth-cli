import { has } from 'lodash-es';
import { mean, variance, std } from 'mathjs'
/**
 * Enhanced metrics aggregation for phylogenetic and founder-innovation analysis
 * Use this module to aggregate the most interesting metrics across multiple runs
 */

/**
 * Aggregates enhanced founder and innovation metrics across multiple iterations
 * @param {Object} evoRunsAnalysis - The analysis results containing iterations data
 * @param {number} currentEvolutionRunIndex - Index of the current evolution run
 */
export function aggregateEnhancedFounderInnovationMetrics(evoRunsAnalysis, currentEvolutionRunIndex) {
  
  // Initialize aggregates object if needed
  if (!evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates) {
    evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates = {};
  }
  
  if (!evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedFounderInnovation) {
    evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedFounderInnovation = {};
  }
  
  const iterations = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations;
  const validIterations = iterations.filter(iter => 
    iter.enhancedFounderInnovation && 
    iter.enhancedFounderInnovation.normalizedFounders && 
    iter.enhancedFounderInnovation.normalizedFounders.length > 0);
  
  // Skip if no valid data
  if (validIterations.length === 0) return;
  
  // ---- Enhanced Founder Metrics ----
  
  // Collect normalized founder impact
  const normalizedImpactScores = validIterations
    .map(iter => iter.enhancedFounderInnovation.normalizedFounders[0].normalizedImpact);
  
  // Collect effective generations
  const effectiveGenerations = validIterations
    .map(iter => iter.enhancedFounderInnovation.normalizedFounders[0].effectiveGenerations);
  
  // Collect quality improvement metrics
  const qualityImprovementScores = validIterations
    .map(iter => iter.enhancedFounderInnovation.qualityFounders[0].qualityImprovement);
  
  const avgQualityImprovementScores = validIterations
    .map(iter => iter.enhancedFounderInnovation.qualityFounders[0].avgQualityImprovement);
  
  // Collect class discovery rates
  const classDiscoveryRates = validIterations
    .map(iter => iter.enhancedFounderInnovation.discoveryRateFounders[0].classDiscoveryRate);
  
  // ---- Burst Pattern Metrics ----
  
  // Collect burst distribution across run segments
  const burstDistributions = validIterations
    .map(iter => iter.enhancedFounderInnovation.burstPatterns.burstDistribution);
  
  // Collect burst strength trends
  const burstStrengthTrends = validIterations
    .map(iter => iter.enhancedFounderInnovation.burstPatterns.burstStrengthTrend);
  
  // Collect burst gap metrics
  const avgBurstGaps = validIterations
    .map(iter => iter.enhancedFounderInnovation.burstPatterns.averageBurstGap);
  
  const maxBurstGaps = validIterations
    .map(iter => iter.enhancedFounderInnovation.burstPatterns.maxBurstGap);
  
  // Collect correlation metrics
  const magnitudeCorrelations = validIterations
    .map(iter => iter.enhancedFounderInnovation.burstPatterns.magnitudeToNewClassesCorrelation);
  
  // Collect late discovery scores
  const lateDiscoveryScores = validIterations
    .map(iter => iter.enhancedFounderInnovation.burstPatterns.lateDiscoveryScore);
  
  // ---- Composite Metrics ----
  
  // Calculate exploration-exploitation balance
  const explorationExploitationBalance = validIterations.map(iter => {
    const topFounder = iter.enhancedFounderInnovation.normalizedFounders[0];
    const lateDiscovery = iter.enhancedFounderInnovation.burstPatterns.lateDiscoveryScore;
    const classRate = iter.enhancedFounderInnovation.discoveryRateFounders[0].classDiscoveryRate;
    
    // Higher score indicates better balance between exploration and exploitation
    return (topFounder.normalizedImpact * classRate * (1 + lateDiscovery)) / 1000;
  });
  
  // Calculate adaptation capacity
  const adaptationCapacity = validIterations.map(iter => {
    const qualityImprovement = iter.enhancedFounderInnovation.qualityFounders[0].qualityImprovement;
    const burstGap = iter.enhancedFounderInnovation.burstPatterns.averageBurstGap;
    
    // Higher adaptation capacity means better ability to shift to new areas
    return qualityImprovement * (1 / Math.max(1, burstGap/100));
  });
  
  // ---- Calculate Statistics ----
  
  // Add enhanced founder metrics
  evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedFounderInnovation.normalizedFounderImpact = {
    mean: mean(normalizedImpactScores),
    variance: variance(normalizedImpactScores),
    stdDev: std(normalizedImpactScores)
  };
  
  evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedFounderInnovation.effectiveGenerations = {
    mean: mean(effectiveGenerations),
    variance: variance(effectiveGenerations),
    stdDev: std(effectiveGenerations)
  };
  
  evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedFounderInnovation.qualityImprovement = {
    mean: mean(qualityImprovementScores),
    variance: variance(qualityImprovementScores),
    stdDev: std(qualityImprovementScores)
  };
  
  evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedFounderInnovation.avgQualityImprovement = {
    mean: mean(avgQualityImprovementScores),
    variance: variance(avgQualityImprovementScores),
    stdDev: std(avgQualityImprovementScores)
  };
  
  evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedFounderInnovation.classDiscoveryRate = {
    mean: mean(classDiscoveryRates),
    variance: variance(classDiscoveryRates),
    stdDev: std(classDiscoveryRates)
  };
  
  // Add burst pattern metrics
  evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedFounderInnovation.burstDistribution = {
    means: burstDistributions.length > 0 ? mean(burstDistributions, 0) : [],
    variances: burstDistributions.length > 0 ? variance(burstDistributions, 0) : [],
    stdDevs: burstDistributions.length > 0 ? std(burstDistributions, 0) : []
  };
  
  evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedFounderInnovation.burstStrengthTrend = {
    means: burstStrengthTrends.length > 0 ? mean(burstStrengthTrends, 0) : [],
    variances: burstStrengthTrends.length > 0 ? variance(burstStrengthTrends, 0) : [],
    stdDevs: burstStrengthTrends.length > 0 ? std(burstStrengthTrends, 0) : []
  };
  
  evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedFounderInnovation.averageBurstGap = {
    mean: mean(avgBurstGaps),
    variance: variance(avgBurstGaps),
    stdDev: std(avgBurstGaps)
  };
  
  evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedFounderInnovation.maxBurstGap = {
    mean: mean(maxBurstGaps),
    variance: variance(maxBurstGaps),
    stdDev: std(maxBurstGaps)
  };
  
  evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedFounderInnovation.magnitudeToNewClassesCorrelation = {
    mean: mean(magnitudeCorrelations),
    variance: variance(magnitudeCorrelations),
    stdDev: std(magnitudeCorrelations)
  };
  
  evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedFounderInnovation.lateDiscoveryScore = {
    mean: mean(lateDiscoveryScores),
    variance: variance(lateDiscoveryScores),
    stdDev: std(lateDiscoveryScores)
  };
  
  // Add composite metrics
  evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedFounderInnovation.explorationExploitationBalance = {
    mean: mean(explorationExploitationBalance),
    variance: variance(explorationExploitationBalance),
    stdDev: std(explorationExploitationBalance)
  };
  
  evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedFounderInnovation.adaptationCapacity = {
    mean: mean(adaptationCapacity),
    variance: variance(adaptationCapacity),
    stdDev: std(adaptationCapacity)
  };
}

/**
 * Aggregates timeline data for key points to enable statistical analysis
 * @param {Object} evoRunsAnalysis - The analysis results containing iterations data
 * @param {number} currentEvolutionRunIndex - Index of the current evolution run
 */
export function aggregateTimelineData(evoRunsAnalysis, currentEvolutionRunIndex) {
  
  // Initialize timeline aggregates object if needed
  if (!evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates) {
    evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates = {};
  }
  
  if (!evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.timelineMetrics) {
    evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.timelineMetrics = {};
  }
  
  const iterations = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations;
  
  // Use either innovationTimeline or founderInnovation's timeline data
  const validIterations = iterations.filter(iter => 
    (iter.innovationTimeline && 
     iter.innovationTimeline.timeline && 
     iter.innovationTimeline.timeline.length > 0) ||
    (iter.founderInnovation && 
     iter.founderInnovation.innovationTimeline && 
     iter.founderInnovation.innovationTimeline.timeline && 
     iter.founderInnovation.innovationTimeline.timeline.length > 0));
  
  // Skip if no valid data
  if (validIterations.length === 0) return;
  
  // Determine key generation checkpoints
  // Find the max generation across all iterations
  const maxGeneration = Math.max(...validIterations.map(iter => {
    const timeline = iter.innovationTimeline?.timeline || 
                    iter.founderInnovation?.innovationTimeline?.timeline || [];
    return timeline.length > 0 ? timeline[timeline.length - 1].generation : 0;
  }));
  
  // Create checkpoints every 500 generations or similar interval
  const checkpointInterval = Math.max(100, Math.floor(maxGeneration / 10));
  const checkpoints = [];
  for (let gen = 0; gen <= maxGeneration; gen += checkpointInterval) {
    checkpoints.push(gen);
  }
  if (checkpoints[checkpoints.length - 1] < maxGeneration) {
    checkpoints.push(maxGeneration);
  }
  
  // Initialize data structure for timeline metrics at checkpoints
  const branchingRatesByCheckpoint = {};
  const newClassCountByCheckpoint = {};
  const burstCountByCheckpoint = {};
  
  checkpoints.forEach(checkpoint => {
    branchingRatesByCheckpoint[checkpoint] = [];
    newClassCountByCheckpoint[checkpoint] = [];
    burstCountByCheckpoint[checkpoint] = [];
  });
  
  // Collect data for each iteration at each checkpoint
  validIterations.forEach(iter => {
    const timeline = iter.innovationTimeline?.timeline || 
                    iter.founderInnovation?.innovationTimeline?.timeline || [];
    const bursts = iter.innovationBursts?.topBursts || 
                  iter.founderInnovation?.innovationBursts?.topBursts || [];
    
    if (timeline.length === 0) return;
    
    // Track cumulative data
    let cumulativeNewClasses = 0;
    
    // Process each checkpoint
    checkpoints.forEach(checkpoint => {
      // Find the closest timeline point to this checkpoint
      const closestPoint = timeline.reduce((closest, point) => {
        return Math.abs(point.generation - checkpoint) < Math.abs(closest.generation - checkpoint) ? 
          point : closest;
      }, timeline[0]);
      
      // Add branching rate at this checkpoint
      branchingRatesByCheckpoint[checkpoint].push(closestPoint.branchingRate || 0);
      
      // Update and add cumulative new classes
      cumulativeNewClasses += closestPoint.newClassCount || 0;
      newClassCountByCheckpoint[checkpoint].push(cumulativeNewClasses);
      
      // Count bursts up to this checkpoint
      const burstsToCheckpoint = bursts.filter(burst => burst.generation <= checkpoint);
      burstCountByCheckpoint[checkpoint].push(burstsToCheckpoint.length);
    });
  });
  
  // Calculate statistics for each checkpoint
  const timelineMetrics = {
    checkpoints,
    branchingRates: {},
    cumulativeNewClasses: {},
    burstCounts: {}
  };
  
  checkpoints.forEach(checkpoint => {
    if (branchingRatesByCheckpoint[checkpoint].length > 0) {
      timelineMetrics.branchingRates[checkpoint] = {
        mean: mean(branchingRatesByCheckpoint[checkpoint]),
        variance: variance(branchingRatesByCheckpoint[checkpoint]),
        stdDev: std(branchingRatesByCheckpoint[checkpoint])
      };
      
      timelineMetrics.cumulativeNewClasses[checkpoint] = {
        mean: mean(newClassCountByCheckpoint[checkpoint]),
        variance: variance(newClassCountByCheckpoint[checkpoint]),
        stdDev: std(newClassCountByCheckpoint[checkpoint])
      };
      
      timelineMetrics.burstCounts[checkpoint] = {
        mean: mean(burstCountByCheckpoint[checkpoint]),
        variance: variance(burstCountByCheckpoint[checkpoint]),
        stdDev: std(burstCountByCheckpoint[checkpoint])
      };
    }
  });
  
  // Add timeline metrics to aggregates
  evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.timelineMetrics = timelineMetrics;
}

/**
 * Aggregates phylogenetic metrics across iterations
 * Adds density dependence and terrain transitions metrics
 * @param {Object} evoRunsAnalysis - The analysis results containing iterations data
 * @param {number} currentEvolutionRunIndex - Index of the current evolution run
 */
export function aggregateEnhancedPhylogeneticMetrics(evoRunsAnalysis, currentEvolutionRunIndex) {
  
  // Initialize phylogenetic aggregates object if needed
  if (!evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates) {
    evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates = {};
  }
  
  if (!evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedPhylogeneticMetrics) {
    evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedPhylogeneticMetrics = {};
  }
  
  const iterations = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations;
  
  // Filter for iterations with density dependence data
  const densityIterations = iterations.filter(iter => 
    iter.densityDependence && 
    iter.densityDependence.densityDependenceCorrelation !== undefined);
  
  if (densityIterations.length > 0) {
    const correlations = densityIterations.map(iter => 
      iter.densityDependence.densityDependenceCorrelation);
    
    const isDensityDependentValues = densityIterations.map(iter => 
      iter.densityDependence.isDensityDependent ? 1 : 0);
    
    // If there's growth rate data, collect it
    const growthRateData = [];
    densityIterations.forEach(iter => {
      if (iter.densityDependence.growthRates && 
          iter.densityDependence.growthRates.length > 0) {
        iter.densityDependence.growthRates.forEach(rate => {
          growthRateData.push({
            diversity: rate.prevDiversity,
            growthRate: rate.growthRate
          });
        });
      }
    });
    
    // Add density dependence metrics
    evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedPhylogeneticMetrics.densityDependence = {
      correlation: {
        mean: mean(correlations),
        variance: variance(correlations),
        stdDev: std(correlations)
      },
      isDensityDependent: {
        // Calculate percentage of runs that are density-dependent
        percentage: (mean(isDensityDependentValues) * 100).toFixed(0)
      }
    };
    
    // Add growth rate statistics if available
    if (growthRateData.length > 0) {
      const diversityValues = growthRateData.map(d => d.diversity);
      const growthRateValues = growthRateData.map(d => d.growthRate);
      
      evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedPhylogeneticMetrics.densityDependence.growthRates = {
        diversityMean: mean(diversityValues),
        diversityStdDev: std(diversityValues),
        growthRateMean: mean(growthRateValues),
        growthRateStdDev: std(growthRateValues)
      };
    }
  }
  
  // Filter for iterations with terrain transition data
  const terrainIterations = iterations.filter(iter => 
    iter.terrainTransitions && 
    iter.terrainTransitions.terrainMetrics);
  
  if (terrainIterations.length > 0) {
    const adaptabilityValues = terrainIterations.map(iter => 
      iter.terrainTransitions.terrainMetrics.terrainAdaptability);
    
    const multiTerrainCounts = terrainIterations.map(iter => 
      iter.terrainTransitions.terrainMetrics.multiTerrainGenomeCount);
    
    // Add terrain adaptability metrics
    evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedPhylogeneticMetrics.terrainTransitions = {
      terrainAdaptability: {
        mean: mean(adaptabilityValues),
        variance: variance(adaptabilityValues),
        stdDev: std(adaptabilityValues)
      },
      multiTerrainGenomeCount: {
        mean: mean(multiTerrainCounts),
        variance: variance(multiTerrainCounts),
        stdDev: std(multiTerrainCounts)
      }
    };
  }
  
  // Add tree shape metrics if available
  const treeShapeIterations = iterations.filter(iter => 
    iter.phylogeneticMetrics && 
    iter.phylogeneticMetrics.metrics && 
    iter.phylogeneticMetrics.metrics.shape);
  
  if (treeShapeIterations.length > 0) {
    const sackinValues = treeShapeIterations.map(iter => 
      iter.phylogeneticMetrics.metrics.shape.sackinIndex);
    
    const collessValues = treeShapeIterations.map(iter => 
      iter.phylogeneticMetrics.metrics.shape.collessIndex);
    
    evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedPhylogeneticMetrics.treeShape = {
      sackinIndex: {
        mean: mean(sackinValues),
        variance: variance(sackinValues),
        stdDev: std(sackinValues)
      },
      collessIndex: {
        mean: mean(collessValues),
        variance: variance(collessValues),
        stdDev: std(collessValues)
      }
    };
  }
}


/**
 * Comprehensive aggregation function for both regular and enhanced phylogenetic metrics
 * @param {Object} evoRunsAnalysis - The analysis results containing iterations data
 * @param {number} currentEvolutionRunIndex - Index of the current evolution run
 * @param {Array} analysisOperationsList - List of analysis operations being performed
 */
export function aggregatePhylogeneticMetrics(evoRunsAnalysis, currentEvolutionRunIndex, analysisOperationsList) {
  // Skip if no iterations to aggregate
  if (!evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations.length) return false;
  
  // Initialize aggregates object if needed
  if (!evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates) {
    evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates = {};
  }
  
  // Create consolidated phylogenetic metrics container if it doesn't exist
  if (!evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.phylogeneticMetrics) {
    evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.phylogeneticMetrics = {};
  }
  
  // Determine which metrics to aggregate based on what's available
  const hasRegularMetrics = analysisOperationsList.includes("phylogenetic-metrics");
  const hasEnhancedMetrics = analysisOperationsList.includes("enhanced-phylogenetic-metrics");
  
  // ==== Regular Phylogenetic Metrics ====
  if (hasRegularMetrics) {
    // Get valid iterations with phylogenetic metrics data
    const validIterations = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations.filter(
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
      const sackinIndices = validIterations.map(iter => iter.phylogeneticMetrics.metrics.shape.sackinIndex);
      const collessIndices = validIterations.map(iter => iter.phylogeneticMetrics.metrics.shape.collessIndex);
      
      // ---- Terrain Transition Metrics ----
      const terrainAdaptability = validIterations.map(
        iter => iter.phylogeneticMetrics.metrics.terrainTransitions.terrainAdaptability
      );
      
      // ---- Density Dependence Metrics ----
      const densityDependence = validIterations.map(
        iter => iter.phylogeneticMetrics.metrics.densityDependence.densityDependenceCorrelation
      );
      
      const isDensityDependentCounts = validIterations.map(
        iter => iter.phylogeneticMetrics.metrics.densityDependence.isDensityDependent ? 1 : 0
      );
      
      // Calculate statistics and store in aggregates
      evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.phylogeneticMetrics = {
        treeSize: {
          extantLineages: {
            mean: mean(extantLineages),
            variance: variance(extantLineages),
            stdDev: std(extantLineages)
          },
          totalSamples: {
            mean: mean(totalSamples),
            variance: variance(totalSamples),
            stdDev: std(totalSamples)
          },
          uniqueLineages: {
            mean: mean(uniqueLineages),
            variance: variance(uniqueLineages),
            stdDev: std(uniqueLineages)
          }
        },
        events: {
          births: {
            mean: mean(birthCounts),
            variance: variance(birthCounts),
            stdDev: std(birthCounts)
          },
          deaths: {
            mean: mean(deathCounts),
            variance: variance(deathCounts),
            stdDev: std(deathCounts)
          },
          extinctions: {
            mean: mean(extinctionCounts),
            variance: variance(extinctionCounts),
            stdDev: std(extinctionCounts)
          }
        },
        shape: {
          sackinIndex: {
            mean: mean(sackinIndices),
            variance: variance(sackinIndices),
            stdDev: std(sackinIndices)
          },
          collessIndex: {
            mean: mean(collessIndices),
            variance: variance(collessIndices),
            stdDev: std(collessIndices)
          }
        },
        terrainTransitions: {
          terrainAdaptability: {
            mean: mean(terrainAdaptability),
            variance: variance(terrainAdaptability),
            stdDev: std(terrainAdaptability)
          }
        },
        densityDependence: {
          correlation: {
            mean: mean(densityDependence),
            variance: variance(densityDependence),
            stdDev: std(densityDependence)
          },
          isDensityDependent: {
            // Calculate percentage of runs that are density-dependent
            percentage: (mean(isDensityDependentCounts) * 100).toFixed(1) + '%'
          }
        }
      };
    }
  }
  
  // ==== Enhanced Phylogenetic Metrics ====
  if (hasEnhancedMetrics) {
    // Get valid iterations with enhanced phylogenetic metrics data
    const validIterations = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].iterations.filter(
      iter => iter.enhancedPhylogeneticMetrics && 
             (iter.enhancedPhylogeneticMetrics.treeSize || 
              iter.enhancedPhylogeneticMetrics.branchLengths ||
              iter.enhancedPhylogeneticMetrics.branchingPatterns ||
              iter.enhancedPhylogeneticMetrics.densityDependence ||
              iter.enhancedPhylogeneticMetrics.extinctions ||
              iter.enhancedPhylogeneticMetrics.terrainAdaptability)
    );
    
    if (validIterations.length > 0) {
      // Create enhanced metrics container if it doesn't exist
      if (!evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedPhylogeneticMetrics) {
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedPhylogeneticMetrics = {};
      }
      
      // ---- Tree Size Metrics ----
      const validTreeSizeIterations = validIterations.filter(iter => iter.enhancedPhylogeneticMetrics.treeSize);
      
      if (validTreeSizeIterations.length > 0) {
        const meanSizes = validTreeSizeIterations.map(iter => iter.enhancedPhylogeneticMetrics.treeSize.meanSize);
        const maxSizes = validTreeSizeIterations.map(iter => iter.enhancedPhylogeneticMetrics.treeSize.maxSize);
        const coefficientsOfVariation = validTreeSizeIterations.map(
          iter => iter.enhancedPhylogeneticMetrics.treeSize.coefficientOfVariation
        );
        
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedPhylogeneticMetrics.treeSize = {
          meanSize: {
            mean: mean(meanSizes),
            variance: variance(meanSizes),
            stdDev: std(meanSizes)
          },
          maxSize: {
            mean: mean(maxSizes),
            variance: variance(maxSizes),
            stdDev: std(maxSizes)
          },
          coefficientOfVariation: {
            mean: mean(coefficientsOfVariation),
            variance: variance(coefficientsOfVariation),
            stdDev: std(coefficientsOfVariation)
          }
        };
      }
      
      // ---- Branch Length Metrics ----
      const validBranchLengthIterations = validIterations.filter(iter => iter.enhancedPhylogeneticMetrics.branchLengths);
      
      if (validBranchLengthIterations.length > 0) {
        const means = validBranchLengthIterations.map(iter => iter.enhancedPhylogeneticMetrics.branchLengths.mean);
        const medians = validBranchLengthIterations.map(iter => iter.enhancedPhylogeneticMetrics.branchLengths.median);
        const variances = validBranchLengthIterations.map(iter => iter.enhancedPhylogeneticMetrics.branchLengths.variance);
        
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedPhylogeneticMetrics.branchLengths = {
          mean: {
            mean: mean(means),
            variance: variance(means),
            stdDev: std(means)
          },
          median: {
            mean: mean(medians),
            variance: variance(medians),
            stdDev: std(medians)
          },
          variance: {
            mean: mean(variances),
            variance: variance(variances),
            stdDev: std(variances)
          }
        };
      }
      
      // ---- Branching Patterns ----
      const validBranchingPatternIterations = validIterations.filter(
        iter => iter.enhancedPhylogeneticMetrics.branchingPatterns
      );
      
      if (validBranchingPatternIterations.length > 0) {
        const maxBranchingRates = validBranchingPatternIterations.map(
          iter => iter.enhancedPhylogeneticMetrics.branchingPatterns.maxBranchingRate
        );
        
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedPhylogeneticMetrics.branchingPatterns = {
          maxBranchingRate: {
            mean: mean(maxBranchingRates),
            variance: variance(maxBranchingRates),
            stdDev: std(maxBranchingRates)
          }
        };
      }
      
      // ---- Extinction Metrics ----
      const validExtinctionIterations = validIterations.filter(
        iter => iter.enhancedPhylogeneticMetrics.extinctions
      );
      
      if (validExtinctionIterations.length > 0) {
        const overallRates = validExtinctionIterations.map(
          iter => iter.enhancedPhylogeneticMetrics.extinctions.overallExtinctionRate
        );
        
        // Calculate average high-risk classes
        const highRiskClassCounts = {};
        validExtinctionIterations.forEach(iter => {
          if (iter.enhancedPhylogeneticMetrics.extinctions.highRiskClasses) {
            iter.enhancedPhylogeneticMetrics.extinctions.highRiskClasses.forEach(cls => {
              if (!highRiskClassCounts[cls.eliteClass]) {
                highRiskClassCounts[cls.eliteClass] = {
                  count: 0,
                  totalRate: 0
                };
              }
              highRiskClassCounts[cls.eliteClass].count++;
              highRiskClassCounts[cls.eliteClass].totalRate += cls.extinctionRate;
            });
          }
        });
        
        // Convert to array and sort by frequency
        const highRiskClassesAggregated = Object.entries(highRiskClassCounts).map(([eliteClass, data]) => ({
          eliteClass,
          frequency: data.count / validExtinctionIterations.length,
          averageExtinctionRate: data.totalRate / data.count
        })).sort((a, b) => b.frequency - a.frequency).slice(0, 5);
        
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedPhylogeneticMetrics.extinctions = {
          overallExtinctionRate: {
            mean: mean(overallRates),
            variance: variance(overallRates),
            stdDev: std(overallRates)
          },
          highRiskClasses: highRiskClassesAggregated
        };
      }
      
      // ---- Terrain Adaptability ----
      const validTerrainIterations = validIterations.filter(
        iter => iter.enhancedPhylogeneticMetrics.terrainAdaptability
      );
      
      if (validTerrainIterations.length > 0) {
        const adaptabilityScores = validTerrainIterations.map(
          iter => iter.enhancedPhylogeneticMetrics.terrainAdaptability.terrainAdaptability
        );
        
        const multiTerrainCounts = validTerrainIterations.map(
          iter => iter.enhancedPhylogeneticMetrics.terrainAdaptability.multiTerrainGenomeCount
        );
        
        evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedPhylogeneticMetrics.terrainAdaptability = {
          terrainAdaptability: {
            mean: mean(adaptabilityScores),
            variance: variance(adaptabilityScores),
            stdDev: std(adaptabilityScores)
          },
          multiTerrainGenomeCount: {
            mean: mean(multiTerrainCounts),
            variance: variance(multiTerrainCounts),
            stdDev: std(multiTerrainCounts)
          }
        };
      }
    }
  }
  
  // ==== Analysis Integration ====
  // Integrate metrics from both approaches for better cross-comparison
  if (hasRegularMetrics && hasEnhancedMetrics) {
    // Create integrated metrics section
    if (!evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.integratedPhylogeneticMetrics) {
      evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.integratedPhylogeneticMetrics = {};
    }
    
    // Add meaningful combinations from both types of metrics
    const regularMetrics = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.phylogeneticMetrics || {};
    const enhancedMetrics = evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.enhancedPhylogeneticMetrics || {};
    
    // Example of integration: Evolutionary dynamics index
    // Combine data from both sets of metrics to create a more comprehensive picture
    if (regularMetrics.treeSize && enhancedMetrics.branchingPatterns) {
      const treeSize = regularMetrics.treeSize;
      const branchingPatterns = enhancedMetrics.branchingPatterns;
      
      // Create a composite evolutionary dynamics score
      // This is just an example - adjust formula based on what makes sense for your analysis
      const dynamicsScore = {
        score: (treeSize.uniqueLineages.mean / 100) * branchingPatterns.maxBranchingRate.mean,
        description: "Composite score reflecting both tree diversity and branching dynamics"
      };
      
      evoRunsAnalysis.evoRuns[currentEvolutionRunIndex].aggregates.integratedPhylogeneticMetrics.evolutionaryDynamics = dynamicsScore;
    }
    
    // Add more integrated metrics as needed
  }
  return hasRegularMetrics || hasEnhancedMetrics;
}