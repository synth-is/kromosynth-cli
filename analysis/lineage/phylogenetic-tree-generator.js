import { JSDOM } from 'jsdom';
import * as d3 from 'd3';
import { yamnetTags_musical, yamnetTags_non_musical } from './yamnetMusicalTags.js';
import { max } from 'mathjs';

function normalizeClassName(className) {
    return className.replace('YAM_', '').split('_')[0];
}

function isMusicalClass(className) {
    const normalizedName = normalizeClassName(className);
    return yamnetTags_musical.some(tag => normalizedName.includes(tag));
}

function findLatestDescendantsByClass(data, suffixFilter = null) {
    const classMap = new Map();
    
    data.evoRuns[0].iterations[0].lineage.forEach(item => {
        const normalizedClass = normalizeClassName(item.eliteClass);
        if (
          (!classMap.has(normalizedClass) || item.gN > classMap.get(normalizedClass).gN)
          && (!suffixFilter || normalizedClass.endsWith(suffixFilter))
        ) {
            classMap.set(normalizedClass, item);
        }
    });

    console.log(`Total unique classes: ${classMap.size}`);
    console.log(`Musical classes: ${Array.from(classMap.values()).filter(item => isMusicalClass(item.eliteClass)).length}`);

    return Array.from(classMap.values()).filter(item => isMusicalClass(item.eliteClass));
}

function traceLineage(data, descendant, maxDepth = Infinity) {
    const lineage = [];
    let current = descendant;
    let depth = 0;
    
    while (current && depth < maxDepth) {
        lineage.push(current);
        if (current.parents.length === 0) break;
        
        const parentId = current.parents[0].genomeId;
        current = data.evoRuns[0].iterations[0].lineage.find(item => item.id === parentId);
        depth++;
    }
    
    return lineage.reverse();
}

function buildSimplifiedTree(data, maxDepth = Infinity, measureContextSwitches = false, suffixFilter = null) {
  const root = { name: "root", children: [], depth: 0 };
  const latestDescendants = findLatestDescendantsByClass(data, suffixFilter);

  console.log(`Processing ${latestDescendants.length} latest musical descendants`);

  latestDescendants.forEach((descendant, index) => {
      console.log(`Processing descendant ${index + 1} of ${latestDescendants.length}`);
      const lineage = traceLineage(data, descendant, maxDepth);
      let currentNode = root;
      let prevClass = null;

      // Process lineage from latest to earliest, but limit by maxDepth
      lineage.slice(-maxDepth).reverse().forEach((item, depth) => {
          const normalizedClass = normalizeClassName(item.eliteClass);
          
          let isSwitching = false;
          if (measureContextSwitches) {
              let isPreviousMusical = prevClass ? isMusicalClass(prevClass) : false;
              let isCurrentMusical = isMusicalClass(normalizedClass);
              isSwitching = isPreviousMusical !== isCurrentMusical;
          } else {
              isSwitching = normalizedClass !== prevClass;
          }

          if (isSwitching || depth === 0) {
              let childNode = currentNode.children.find(child => child.name === normalizedClass);
              if (!childNode) {
                  childNode = {
                      name: normalizedClass,
                      children: [],
                      count: 0,
                      s: 0,
                      gN: 0,
                      depth: depth + 1
                  };
                  currentNode.children.push(childNode);
              }
              currentNode = childNode;
              prevClass = normalizedClass;
          }

          currentNode.count++;
          currentNode.s = Math.max(currentNode.s, item.s);
          currentNode.gN = Math.max(currentNode.gN, item.gN);
      });
  });

  // Ensure only filtered nodes are at the outermost level
  if (suffixFilter) {
      root.children = root.children.map(child => {
          if (!child.name.endsWith(suffixFilter)) {
              return { name: "Other", children: [child], depth: child.depth };
          }
          return child;
      });
  }

  console.log(`Built simplified tree with ${countNodes(root)} nodes`);
  return root;
}

function countNodes(node) {
    let count = 1;
    if (node.children) {
        node.children.forEach(child => {
            count += countNodes(child);
        });
    }
    return count;
}

function generateSVG(data, options = {}) {
    console.log("Starting SVG generation");
    console.log("Options:", JSON.stringify(options, null, 2));

    const dom = new JSDOM(`<!DOCTYPE html><body></body>`, {
        pretendToBeVisual: true,
        runScripts: "dangerously"
    });
    
    const { window } = dom;
    const { document } = window;

    global.navigator = { userAgent: 'node.js', platform: 'node.js' };
    global.window = window;
    global.document = document;

    const width = options.width || 8000;
    const height = options.height || 8000;
    const margin = options.margin || 400;
    const maxDepth = options.maxDepth || Infinity;
    const measureContextSwitches = options.measureContextSwitches || false;
    const suffixFilter = options.suffixFilter || null;

    console.log("Building simplified tree");
    const simplifiedRoot = buildSimplifiedTree(data, maxDepth, measureContextSwitches, suffixFilter);

    console.log("Creating d3 hierarchy");
    const root = d3.hierarchy(simplifiedRoot);
    const nodeCount = root.descendants().length;

    // console.log("Root structure:", JSON.stringify(root, (key, value) => key === 'parent' ? undefined : value, 2));
    
    // Calculate default scale factors
    const defaultRadiusScale = Math.max(0.5, Math.min(1, 500 / nodeCount));
    const defaultFontScale = Math.max(0.5, Math.min(1, 300 / Math.sqrt(nodeCount)));
    const defaultLineageSpacing = Math.max(1, Math.min(2, 100 / nodeCount));

    // Use provided options or defaults
    const radiusScale = options.radiusScale || defaultRadiusScale;
    const fontScale = options.fontScale || defaultFontScale;
    const lineageSpacing = options.lineageSpacing || defaultLineageSpacing;

    console.log(`Using radiusScale: ${radiusScale}, fontScale: ${fontScale}, lineageSpacing: ${lineageSpacing}`);

    const radius = (Math.min(width, height) / 2 - margin) * radiusScale;
    
    // Determine the actual max depth of the tree
    const actualMaxDepth = Math.max(...root.descendants().map(d => d.depth));

    const cluster = d3.cluster()
        .size([2 * Math.PI, radius])
        .separation((a, b) => (a.parent == b.parent ? 1 : lineageSpacing) / (actualMaxDepth - a.depth + 1));

    cluster(root);

    console.log("Creating SVG");
    const svg = d3.create("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [-width / 2, -height / 2, width, height])
        .attr("style", "max-width: 100%; height: auto; font: 10px sans-serif;")
        .style("background", "#f0f0f0");

    const style = svg.append("style").attr("type", "text/css");
    style.text(`
        .label-left {
          transform: rotate(180deg);
          text-anchor: end;
        }
        .label-right {
          text-anchor: start;
        }
    `);

    const g = svg.append("g");

    console.log("Drawing links");
    const link = g.append("g")
        .attr("fill", "none")
        .attr("stroke", "#555")
        .attr("stroke-opacity", 0.4)
        .attr("stroke-width", 1.5)
        .selectAll("path")
        .data(root.links())
        .join("path")
        .attr("d", d3.linkRadial()
          .angle(d => d.x)
          .radius(d => d.y));

          console.log("Drawing nodes");
          const node = g.append("g")
              .selectAll("g")
              .data(root.descendants().slice(1)) // Skip the root node
              .join("g")
              .attr("transform", d => `
                rotate(${d.x * 180 / Math.PI - 90})
                translate(${d.y},0)
              `);
      
          node.append("circle")
              .attr("fill", d => d.data && d.data.s !== undefined ? d3.interpolateViridis(d.data.s) : "#ccc")
              .attr("r", d => d.data && d.data.count !== undefined ? Math.sqrt(d.data.count) + 3 : 3);
          
          const baseFontSize = 16;
          const fontSize = baseFontSize * fontScale;
          
          const label = node.append("text")
              .attr("dy", "0.31em")
              .attr("x", d => d.x < Math.PI ? 6 : -6)
              .attr("transform", d => {
                  let angle = (d.x - Math.PI / 2) * 180 / Math.PI;
                  if (angle > 90 || angle < -90) {
                      angle += 180;
                      return `rotate(${angle}) translate(${d.x < Math.PI ? 6 : -6},0) rotate(180)`;
                  }
                  angle = 0;
                  return `rotate(${angle})`;
              })
              .text(d => d.data && d.data.name ? `${d.data.name}` : "")
              .style("font-size", `${fontSize}px`)
              .attr("class", d => d.x < Math.PI ? "label-right" : "label-left")
              .style("fill", d => d.depth > 2 ? "#555" : "#000");
          
          // Add background to labels for better readability
          label.clone(true).lower()
              .attr("stroke", "white")
              .attr("stroke-width", 3)
              .style("fill", "none");
          
          node.append("title")
              .text(d => {
                  if (d.data) {
                      const name = d.data.name || "Unnamed";
                      const count = d.data.count !== undefined ? d.data.count : "N/A";
                      const score = d.data.s !== undefined ? d.data.s.toFixed(4) : "N/A";
                      const generation = d.data.gN !== undefined ? d.data.gN : "N/A";
                      return `${name}\nCount: ${count}\nScore: ${score}\nGeneration: ${generation}`;
                  }
                  return "No data available";
              });
          
          console.log("SVG generation complete");
    
    // Ensure proper SVG formatting for macOS QuickLook
    const svgString = svg.node().outerHTML;
    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1"${svgString.slice(4)}`;
}

export { generateSVG };