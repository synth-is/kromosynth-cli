import { buildSimplifiedTree } from './phylogenetic-tree-common.js';

// Interactive Web Version
export function createInteractiveVisualization(data, container) {
    const width = 1000;
    const height = 1000;
    const radius = Math.min(width, height) / 2 - 100;

    const tree = d3.tree()
        .size([2 * Math.PI, radius])
        .separation((a, b) => (a.parent == b.parent ? 1 : 2) / a.depth);


    const simplifiedRoot = buildSimplifiedTree(data, 
        // maxDepth, measureContextSwitches, suffixFilter
    );

    const root = d3.hierarchy(simplifiedRoot);
    tree(root);

    const svg = d3.select(container).append("svg")
        .attr("width", width)
        .attr("height", height)
        .style("font", "10px sans-serif");

    const g = svg.append("g")
        .attr("transform", `translate(${width/2},${height/2})`);

    const link = g.selectAll(".link")
        .data(root.links())
        .join("path")
        .attr("class", "link")
        .attr("fill", "none")
        .attr("stroke", "#555")
        .attr("stroke-opacity", 0.4)
        .attr("stroke-width", 1.5)
        .attr("d", d3.linkRadial()
            .angle(d => d.x)
            .radius(d => d.y));

    const node = g.selectAll(".node")
        .data(root.descendants())
        .join("g")
        .attr("class", "node")
        .attr("transform", d => `rotate(${d.x * 180 / Math.PI - 90}) translate(${d.y},0)`);

    node.append("circle")
        .attr("fill", d => d.data.s ? d3.interpolateViridis(d.data.s) : "#999")
        .attr("r", 3);

    node.append("title")
        .text(d => `ID: ${d.data.name}\nScore: ${d.data.s}\nGeneration: ${d.data.gN}`);

    // Add zooming functionality
    const zoom = d3.zoom()
        .scaleExtent([0.1, 10])
        .on("zoom", zoomed);

    svg.call(zoom);

    function zoomed(event) {
        g.attr("transform", event.transform);
    }

    // Optional: Add a search function
    d3.select(container).append("input")
        .attr("type", "text")
        .attr("placeholder", "Search by ID...")
        .on("input", function() {
            const searchTerm = this.value.toLowerCase();
            node.style("opacity", d => d.data.name.toLowerCase().includes(searchTerm) ? 1 : 0.1);
            link.style("opacity", d => d.target.data.name.toLowerCase().includes(searchTerm) ? 1 : 0.1);
        });
}
