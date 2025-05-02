/**
 * Visualizations for Founder Genomes and Innovation Bursts
 * 
 * This module provides specialized visualization functions for displaying
 * founder genomes and innovation burst data from MAP-Elites runs.
 * The visualizations are designed to work with D3.js or other visualization libraries.
 */

/**
 * Creates a radial tree visualization for a founder genome and its descendants
 * @param {Object} descendantTree - Tree data from generateFounderDescendantTree
 * @returns {Object} D3-compatible radial tree visualization data
 */
export function createFounderRadialTreeVisualization(descendantTree) {
  if (!descendantTree || !descendantTree.tree) {
    return null;
  }
  
  const { tree, stats } = descendantTree;
  
  // Create visualization configuration
  const visualization = {
    type: 'radialTree',
    data: tree,
    config: {
      // Dimensions
      width: 800,
      height: 800,
      margin: { top: 20, right: 20, bottom: 20, left: 20 },
      // Tree configuration
      nodeRadius: 5,
      nodeRadiusRange: [3, 10], // Scale node size based on score
      linkWidth: 1.5,
      // Color configuration
      colorByClass: true, // Color nodes by elite class
      colorByTerrain: false, // Alternative: color by terrain
      // Label configuration
      showLabels: true,
      labelSize: 10,
      // Interaction
      zoomable: true,
      tooltips: true
    },
    stats
  };
  
  // Generate color scale based on unique elite classes
  const uniqueClasses = getAllUniqueClasses(tree);
  visualization.config.colorScale = {
    domain: uniqueClasses,
    range: generateColorPalette(uniqueClasses.length)
  };
  
  return visualization;
}

/**
 * Creates a burst timeline visualization showing innovation over time
 * @param {Object} innovationTimeline - Timeline data from generateInnovationBurstTimeline
 * @returns {Object} D3-compatible timeline visualization data
 */
export function createBurstTimelineVisualization(innovationTimeline) {
  if (!innovationTimeline || !innovationTimeline.timeline) {
    return null;
  }
  
  const { timeline, innovationPeaks, averageBranchingRate } = innovationTimeline;
  
  // Create visualization configuration
  const visualization = {
    type: 'burstTimeline',
    data: {
      timeline,
      peaks: innovationPeaks,
      average: averageBranchingRate
    },
    config: {
      // Dimensions
      width: 900,
      height: 400,
      margin: { top: 50, right: 80, bottom: 50, left: 60 },
      // Bar configuration
      barWidth: 6,
      burstBarColor: '#FF5722',
      regularBarColor: '#2196F3',
      // Line configuration
      lineWidth: 2,
      lineColor: '#4CAF50',
      averageLineColor: '#FFC107',
      // Label configuration
      showLabels: true,
      labelSize: 12,
      // Annotation configuration
      annotationRadius: 6,
      annotationColor: '#E91E63',
      // Tooltip configuration
      showTooltips: true
    },
    // Calculate domain ranges for axes
    domains: {
      x: [timeline[0].generation, timeline[timeline.length - 1].generation],
      y: [0, Math.max(...timeline.map(d => d.branchingRate)) * 1.1]
    },
    // Generate markers for annotation points (burst peaks)
    markers: innovationPeaks.map(peak => ({
      generation: peak.generation,
      value: peak.branchingRate,
      label: `Burst (${peak.burstMagnitude.toFixed(1)}x)`,
      notable: peak.notableGenomes.length > 0 ? 
        `${peak.notableGenomes.length} notable genomes` : null
    }))
  };
  
  return visualization;
}

/**
 * Creates a combined dashboard visualization showing both founder and innovation data
 * @param {Object} analysis - Complete analysis from analyzeFoundersAndInnovations
 * @returns {Object} Complete dashboard visualization configuration
 */
export function createFounderInnovationDashboard(analysis) {
  const { topFounders, innovationBursts, founderVisualizations, innovationTimeline } = analysis;
  
  // Create founder table data
  const founderTableData = topFounders.map(founder => ({
    id: founder.id,
    eliteClass: founder.eliteClass,
    generation: founder.gN || founder.generation,
    score: founder.s || founder.score,
    descendantCount: founder.descendantCount,
    uniqueClassCount: founder.uniqueClassCount,
    founderScore: founder.founderScore,
    // Calculate a normalized influence score (0-100)
    influenceScore: Math.min(100, Math.round(founder.founderScore / topFounders[0].founderScore * 100))
  }));
  
  // Create burst timeline visualization
  const burstViz = createBurstTimelineVisualization(innovationTimeline);
  
  // Create founder tree visualizations
  const founderTrees = founderVisualizations.map(vizData => 
    createFounderRadialTreeVisualization(vizData.descendantTree)
  ).filter(viz => viz !== null);
  
  // Create correlation visualization between founder emergence and bursts
  const correlationData = correlateFoundersAndBursts(topFounders, innovationBursts.topBursts);
  
  return {
    dashboard: {
      title: "Founder & Innovation Analysis Dashboard",
      sections: [
        {
          title: "Innovation Timeline",
          description: "Shows branching rates over time with highlighted innovation bursts",
          visualization: burstViz
        },
        {
          title: "Top Founder Genomes",
          description: "Genomes that spawned many diverse descendants",
          data: founderTableData
        },
        {
          title: "Founder Descendant Trees",
          description: "Visualizes the descendants of key founder genomes",
          visualizations: founderTrees
        },
        {
          title: "Founder-Burst Correlation",
          description: "Shows the relationship between founder emergence and innovation bursts",
          visualization: correlationData
        }
      ],
      summary: {
        totalFoundersAnalyzed: topFounders.length,
        totalBurstsIdentified: innovationBursts.topBursts.length,
        averageBranchingRate: innovationBursts.averageBranchingRate,
        topFounderScore: topFounders.length > 0 ? topFounders[0].founderScore : 0,
        topBurstMagnitude: innovationBursts.topBursts.length > 0 ? 
          innovationBursts.topBursts[0].burstMagnitude : 0
      }
    }
  };
}

/**
 * Creates a visualizable timeline highlighting both founders and bursts
 * @param {Array} founders - Top founder genomes
 * @param {Array} bursts - Top innovation bursts
 * @returns {Object} Timeline correlation visualization data
 */
function correlateFoundersAndBursts(founders, bursts) {
  // Create unified timeline
  const timelineEvents = [
    // Add founder emergence events
    ...founders.map(founder => ({
      type: 'founder',
      generation: founder.gN || founder.generation,
      id: founder.id,
      eliteClass: founder.eliteClass,
      score: founder.score || founder.s,
      founderScore: founder.founderScore
    })),
    
    // Add burst events
    ...bursts.map(burst => ({
      type: 'burst',
      generation: burst.generation,
      branchingRate: burst.branchingRate,
      burstMagnitude: burst.burstMagnitude,
      newClassCount: burst.newClassCount
    }))
  ].sort((a, b) => a.generation - b.generation);
  
  // Find correlations (bursts that follow shortly after founder emergence)
  const correlations = [];
  
  for (let i = 0; i < timelineEvents.length - 1; i++) {
    const event = timelineEvents[i];
    const nextEvent = timelineEvents[i + 1];
    
    // Check if this is a founder followed by a burst
    if (event.type === 'founder' && nextEvent.type === 'burst') {
      const generationGap = nextEvent.generation - event.generation;
      
      // If burst happens within 5 generations after a founder, consider it correlated
      if (generationGap > 0 && generationGap <= 5) {
        correlations.push({
          founderGeneration: event.generation,
          founderId: event.id,
          founderClass: event.eliteClass,
          burstGeneration: nextEvent.generation,
          generationGap,
          burstMagnitude: nextEvent.burstMagnitude
        });
      }
    }
  }
  
  return {
    timelineEvents,
    correlations,
    // Visualization config
    config: {
      width: 800,
      height: 200,
      margin: { top: 20, right: 20, bottom: 30, left: 40 },
      founderColor: '#4CAF50',
      burstColor: '#FF5722',
      correlationColor: '#9C27B0',
      eventRadius: 8,
      timelineHeight: 2
    }
  };
}

/**
 * Helper function to get all unique elite classes in a tree
 * @param {Object} treeNode - Node in the tree
 * @param {Set} classesSet - Set to accumulate classes
 * @returns {Array} Array of unique elite classes
 */
function getAllUniqueClasses(treeNode, classesSet = new Set()) {
  if (!treeNode) return [];
  
  // Add this node's class
  if (treeNode.eliteClass) {
    classesSet.add(treeNode.eliteClass);
  }
  
  // Process children
  if (treeNode.children) {
    treeNode.children.forEach(child => {
      getAllUniqueClasses(child, classesSet);
    });
  }
  
  return Array.from(classesSet);
}

/**
 * Helper function to generate a color palette
 * @param {number} count - Number of colors needed
 * @returns {Array} Array of color hex codes
 */
function generateColorPalette(count) {
  // Curated color palette for better visual distinction
  const baseColors = [
    '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
    '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
    '#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5'
  ];
  
  // If we need more colors than in the base palette, generate them
  if (count <= baseColors.length) {
    return baseColors.slice(0, count);
  }
  
  // Generate additional colors using HSL color space
  const additionalColors = [];
  for (let i = 0; i < count - baseColors.length; i++) {
    const hue = Math.floor((i / (count - baseColors.length)) * 360);
    const saturation = 70 + Math.random() * 20; // 70-90%
    const lightness = 45 + Math.random() * 10; // 45-55%
    additionalColors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
  }
  
  return [...baseColors, ...additionalColors];
}

/**
 * Creates exportable SVG data for a visualization
 * @param {Object} visualization - Visualization data
 * @returns {Object} SVG export configuration
 */
export function prepareVisualizationForExport(visualization) {
  // This function would prepare the visualization data for export to SVG
  // The implementation depends on your specific visualization library
  
  // For example, with D3.js you might:
  return {
    width: visualization.config.width,
    height: visualization.config.height,
    exportSettings: {
      filename: `${visualization.type}_export.svg`,
      includeStyles: true,
      responsive: false
    }
  };
}

/**
 * Creates interactive HTML dashboard content for the analysis
 * @param {Object} analysis - Complete analysis from analyzeFoundersAndInnovations
 * @returns {string} HTML content for the dashboard
 */
export function generateDashboardHTML(analysis) {
  // This would generate HTML that could be embedded in a web page
  // Implementation depends on your specific UI framework
  
  const dashboard = createFounderInnovationDashboard(analysis);
  
  // This is a simplified example - a real implementation would generate
  // complete HTML with embedded JavaScript for interactive visualizations
  
  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Founder & Innovation Analysis</title>
    <style>
      body { font-family: sans-serif; margin: 0; padding: 20px; }
      .dashboard { max-width: 1200px; margin: 0 auto; }
      .dashboard-header { margin-bottom: 20px; }
      .dashboard-section { margin-bottom: 40px; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; }
      .section-title { margin-top: 0; color: #333; }
      .section-description { color: #666; margin-bottom: 20px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; padding: 12px; border-bottom: 1px solid #ddd; }
      th { background-color: #f5f5f5; }
      .influence-bar { background-color: #4CAF50; height: 10px; border-radius: 5px; }
      .visualization-container { height: 500px; border: 1px solid #ddd; border-radius: 4px; }
      .summary-box { background-color: #f9f9f9; padding: 15px; border-radius: 4px; }
      .summary-stats { display: flex; flex-wrap: wrap; }
      .summary-stat { flex: 1; min-width: 200px; padding: 10px; }
      .stat-value { font-size: 24px; font-weight: bold; color: #333; }
      .stat-label { font-size: 14px; color: #666; }
    </style>
  </head>
  <body>
    <div class="dashboard">
      <div class="dashboard-header">
        <h1>${dashboard.dashboard.title}</h1>
        <p>Analysis of founder genomes and innovation bursts in evolutionary run.</p>
      </div>
      
      <!-- Innovation Timeline Section -->
      <div class="dashboard-section">
        <h2 class="section-title">${dashboard.dashboard.sections[0].title}</h2>
        <p class="section-description">${dashboard.dashboard.sections[0].description}</p>
        <div id="timeline-visualization" class="visualization-container">
          <!-- Timeline visualization would be rendered here -->
        </div>
      </div>
      
      <!-- Top Founder Genomes Section -->
      <div class="dashboard-section">
        <h2 class="section-title">${dashboard.dashboard.sections[1].title}</h2>
        <p class="section-description">${dashboard.dashboard.sections[1].description}</p>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Elite Class</th>
              <th>Generation</th>
              <th>Descendants</th>
              <th>Unique Classes</th>
              <th>Influence Score</th>
            </tr>
          </thead>
          <tbody>
            ${dashboard.dashboard.sections[1].data.map(founder => `
              <tr>
                <td>${founder.id.substring(0, 8)}...</td>
                <td>${founder.eliteClass}</td>
                <td>${founder.generation}</td>
                <td>${founder.descendantCount}</td>
                <td>${founder.uniqueClassCount}</td>
                <td>
                  <div class="influence-bar" style="width: ${founder.influenceScore}%"></div>
                  ${founder.influenceScore}/100
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      <!-- Founder Trees Section -->
      <div class="dashboard-section">
        <h2 class="section-title">${dashboard.dashboard.sections[2].title}</h2>
        <p class="section-description">${dashboard.dashboard.sections[2].description}</p>
        <div class="trees-container">
          ${dashboard.dashboard.sections[2].visualizations.map((viz, index) => `
            <div id="founder-tree-${index}" class="visualization-container">
              <!-- Founder tree visualization would be rendered here -->
            </div>
          `).join('')}
        </div>
      </div>
      
      <!-- Founder-Burst Correlation Section -->
      <div class="dashboard-section">
        <h2 class="section-title">${dashboard.dashboard.sections[3].title}</h2>
        <p class="section-description">${dashboard.dashboard.sections[3].description}</p>
        <div id="correlation-visualization" class="visualization-container">
          <!-- Correlation visualization would be rendered here -->
        </div>
      </div>
      
      <!-- Summary Section -->
      <div class="dashboard-section summary-box">
        <h2 class="section-title">Summary</h2>
        <div class="summary-stats">
          <div class="summary-stat">
            <div class="stat-value">${dashboard.dashboard.summary.totalFoundersAnalyzed}</div>
            <div class="stat-label">Significant Founder Genomes</div>
          </div>
          <div class="summary-stat">
            <div class="stat-value">${dashboard.dashboard.summary.totalBurstsIdentified}</div>
            <div class="stat-label">Innovation Bursts</div>
          </div>
          <div class="summary-stat">
            <div class="stat-value">${dashboard.dashboard.summary.averageBranchingRate.toFixed(2)}</div>
            <div class="stat-label">Avg Branching Rate</div>
          </div>
          <div class="summary-stat">
            <div class="stat-value">${dashboard.dashboard.summary.topBurstMagnitude.toFixed(1)}x</div>
            <div class="stat-label">Strongest Burst</div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- This section would include the necessary scripts to render the visualizations -->
    <script>
      // Visualization rendering would be implemented here
      // This would typically use D3.js or another visualization library
    </script>
  </body>
  </html>
  `;
  
  return html;
}