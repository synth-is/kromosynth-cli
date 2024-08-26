import { JSDOM } from 'jsdom';
import * as d3 from 'd3';
import { buildSimplifiedTree } from './phylogenetic-tree-common.js';

function generateSVG(data, options = {}) {
    console.log("Starting SVG generation");

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

    const radius = Math.min(width, height) / 2 - 300;

    const cluster = d3.cluster()
        .size([2 * Math.PI, radius])
        .separation((a, b) => (a.parent == b.parent ? 1 : 2) / a.depth);

    console.log("Building simplified tree");
    const simplifiedRoot = buildSimplifiedTree(data, maxDepth, measureContextSwitches, suffixFilter);

    console.log("Creating d3 hierarchy");
    const root = d3.hierarchy(simplifiedRoot);
    cluster(root);

    console.log("Creating SVG");
    const svg = d3.select(document.body).append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [-width / 2, -height / 2, width, height])
        .style("font", "10px sans-serif")
        .style("background", "#f0f0f0");

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
        .attr("stroke-linejoin", "round")
        .attr("stroke-width", 3)
        .selectAll("g")
        .data(root.descendants())
        .join("g")
        .attr("transform", d => `
        rotate(${d.x * 180 / Math.PI - 90})
        translate(${d.y},0)
        `);

    node.append("circle")
        .attr("fill", d => d3.interpolateViridis(d.data.s))
        .attr("r", d => Math.sqrt(d.data.count) + 3);

    const label = node.append("text")
        .attr("dy", "0.31em")
        .attr("x", d => d.x < Math.PI === !d.children ? 6 : -6)
        .attr("text-anchor", d => d.x < Math.PI === !d.children ? "start" : "end")
        .attr("transform", d => {
        const rotation = d.x < Math.PI === !d.children ? 0 : 180;
        const angle = (d.x - Math.PI / 2) * 180 / Math.PI;
        return `rotate(${angle}) rotate(${rotation})`;
        })
        .text(d => `${d.data.name} gN:${d.data.gN} s:${d.data.s.toFixed(2)}`)
        .style("font-size", d => `${Math.max(8, 16 - d.depth * 1.5)}px`)
        .style("fill", d => d.depth > 2 ? "#555" : "#000");

    label.clone(true).lower()
        .attr("stroke", "white")
        .attr("stroke-width", 3)
        .style("fill", "none");

    node.append("title")
        .text(d => `${d.data.name}\nCount: ${d.data.count}\nScore: ${d.data.s.toFixed(4)}\nGeneration: ${d.data.gN}`);

    console.log("SVG generation complete");
    return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + 
            document.body.innerHTML;
}

export { generateSVG };