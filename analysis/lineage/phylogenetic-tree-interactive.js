import { buildSimplifiedTree } from './phylogenetic-tree-common.js';

export function createInteractiveVisualization(data, container) {
    // Customizable parameters
    const width = 1000;
    const height = 1000;
    const separationFactor = 3; // Adjust this to change space between nodes
    const siblingSpacingFactor = 1.1; // Adjust this to change space between sibling nodes
    const nodeRadius = 3; // Adjust this to change individual node size
    const initialZoom = 0.8; // Adjust this to change initial zoom level

    const simplifiedRoot = buildSimplifiedTree(data);
    const root = d3.hierarchy(simplifiedRoot);

    // Calculate the maximum depth of the tree
    const maxDepth = d3.max(root.descendants(), d => d.depth);

    // Dynamically calculate marginRadius based on tree depth
    const marginRadius = Math.max(100, maxDepth * 20); // Adjust the multiplier (50) as needed
    console.log(`Max depth: ${maxDepth}, Margin radius: ${marginRadius}`);
    const radius = Math.min(width, height) / 2 - marginRadius;

    const tree = d3.tree()
        .size([2 * Math.PI, radius])
        .separation((a, b) => {
            return (a.parent == b.parent ? 1 : 2) / a.depth * separationFactor;
        });

    function adjustNodes(node, depth = 0) {
        if (node.children) {
            const siblings = node.children;
            const spacing = 2 * Math.PI / Math.pow(siblings.length, siblingSpacingFactor);
            siblings.forEach((child, i) => {
                child.x = node.x + (i - (siblings.length - 1) / 2) * spacing / (depth + 1);
                adjustNodes(child, depth + 1);
            });
        }
    }

    tree(root);
    adjustNodes(root);

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
        .attr("r", nodeRadius);

    node.append("title")
        .text(d => `ID: ${d.data.name}\nScore: ${d.data.s}\nGeneration: ${d.data.gN}`);

    const zoom = d3.zoom()
        .scaleExtent([0.1, 10])
        .on("zoom", zoomed);

    svg.call(zoom)
       .call(zoom.transform, d3.zoomIdentity.scale(initialZoom));

    function zoomed(event) {
        g.attr("transform", `translate(${width/2},${height/2}) ${event.transform}`);
    }

    d3.select(container).append("input")
        .attr("type", "text")
        .attr("placeholder", "Search by ID...")
        .style("position", "absolute")
        .style("top", "10px")
        .style("left", "10px")
        .on("input", function() {
            const searchTerm = this.value.toLowerCase();
            node.style("opacity", d => d.data.name.toLowerCase().includes(searchTerm) ? 1 : 0.1);
            link.style("opacity", d => d.target.data.name.toLowerCase().includes(searchTerm) ? 1 : 0.1);
        });
}