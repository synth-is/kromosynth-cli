import { buildSimplifiedTree, pruneTreeForContextSwitches } from './phylogenetic-tree-common.js';

function serializeTreeToJson(node) {
return {
    name: node.name,
    id: node.id,
    count: node.count,
    s: node.s,
    gN: node.gN,
    uBC: node.uBC,
    class: node.class,
    duration: node.duration,
    noteDelta: node.noteDelta,
    velocity: node.velocity,
    children: node.children ? node.children.map(serializeTreeToJson) : []
};
}

function downloadTreeJson(root, data, iteration = 0) {
    const iterationId = data.evoRuns[0].iterations[iteration].id;
    const fileName = `tree_${iterationId}.json`;
    const jsonTree = serializeTreeToJson(root);

    const blob = new Blob([JSON.stringify(
        jsonTree
        // , null, 2
    )], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function createInteractiveVisualization(
        data, 
        treeData,
        container, options = {}
) {
    // Customizable parameters
    const width = 1000;
    const height = 1000;
    const separationFactor = 3;
    const siblingSpacingFactor = 1.1;
    const nodeRadius = 6; // options.nodeRadius || 3;
    const initialZoom = 0.8;
    const linkStrokeWidth = 3;
    const iteration = options.iteration || 0;

    const maxDepth = Infinity; // options.maxDepth || Infinity;
    const measureContextSwitches = options.measureContextSwitches || false;
    const suffixFilter = options.suffixFilter || null;

    let simplifiedRoot;
    if( treeData ) {
        if (measureContextSwitches) {
            simplifiedRoot = pruneTreeForContextSwitches(treeData);
        } else {
            simplifiedRoot = treeData;
        }
    } else { // assume data is supplied
        simplifiedRoot = buildSimplifiedTree(data, maxDepth, measureContextSwitches, suffixFilter, iteration);
    }

    // Add download button
    const downloadButton = d3.select(container).append("button")
        .text("Download Tree JSON")
        .style("position", "absolute")
        .style("top", "10px")
        .style("right", "10px")
        .on("click", () => downloadTreeJson(simplifiedRoot, data, iteration));


    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    let currentSource = null;
    let currentGainNode = null;
    let currentPlayingNode = null;
    let hasInteracted = false;

    // Create a persistent gain node for zoom-based volume control
    const zoomGainNode = audioContext.createGain();
    zoomGainNode.connect(audioContext.destination);

    const FADE_TIME = 0.1; // Time in seconds for fade in/out
    const BASE_VOLUME = 1; // Maximum volume at normal zoom level

    // Add interaction message
    const messageDiv = d3.select(container).append("div")
        .attr("id", "interaction-message")
        .style("position", "absolute")
        .style("top", "50%")
        .style("left", "50%")
        .style("transform", "translate(-50%, -50%)")
        .style("background-color", "rgba(0,0,0,0.7)")
        .style("color", "white")
        .style("padding", "20px")
        .style("border-radius", "10px")
        .style("text-align", "center")
        .style("z-index", "1000")
        .text("Click anywhere to enable audio playback");

    // Function to remove the message and resume audio context
    function enableAudio() {
        if (!hasInteracted) {
            messageDiv.remove();
            audioContext.resume().then(() => {
                console.log('AudioContext resumed successfully');
            });
            hasInteracted = true;
        }
    }

    // Add click event listener to the container
    d3.select(container).on("click", enableAudio);

    async function playAudioWithFade(d) {
        if (!hasInteracted) return; // Don't play audio if there's been no interaction
        console.log("Playing audio for node:", d);
        if (currentPlayingNode === d) return;

        
        const fileName = `${d.data.id}-${d.data.duration}_${d.data.noteDelta}_${d.data.velocity}.wav`;
        // const audioUrl = `/path/to/audio/files/${fileName}`; // Update this path to your audio files location
        const audioUrl = "/01J1ZZF2J09MM1YARNR9RYP6AB_YAMNet-durDims_noOsc/accordion_5_0_1_01J25K44BT544SAFR666DBH4Y4_4.wav";
        
        try {
            const response = await fetch(audioUrl);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            if (currentSource) {
                await stopAudioWithFade();
            }

            currentSource = audioContext.createBufferSource();
            currentSource.buffer = audioBuffer;

            currentGainNode = audioContext.createGain();
            currentGainNode.gain.setValueAtTime(0, audioContext.currentTime);
            currentGainNode.gain.linearRampToValueAtTime(1, audioContext.currentTime + FADE_TIME);

            currentSource.connect(currentGainNode);
            currentGainNode.connect(zoomGainNode);  // Connect to zoomGainNode instead of destination

            currentSource.start();
            currentPlayingNode = d;
        } catch (error) {
            console.error("Error playing audio:", error);
        }
    }

    async function stopAudioWithFade() {
        console.log("Stopping audio");
        if (!currentGainNode || !currentSource) return;

        const stopTime = audioContext.currentTime + FADE_TIME;
        
        // Fade to a very small value instead of 0
        currentGainNode.gain.setValueAtTime(currentGainNode.gain.value, audioContext.currentTime);
        currentGainNode.gain.exponentialRampToValueAtTime(0.0001, stopTime);

        return new Promise(resolve => {
            currentSource.onended = () => {
                if (currentSource) {
                    currentSource.disconnect();
                    currentSource = null;
                }
                if (currentGainNode) {
                    currentGainNode.disconnect();
                    currentGainNode = null;
                }
                currentPlayingNode = null;
                resolve();
            };

            currentSource.stop(stopTime);
        });
    }
    
    


    const root = d3.hierarchy(simplifiedRoot);

    // Calculate the maximum depth of the tree
    const maxMeasuredDepth = d3.max(root.descendants(), d => d.depth);

    // Dynamically calculate marginRadius based on tree depth
    const marginRadius = Math.max(100, maxMeasuredDepth * 50); // Adjust the multiplier (50) as needed
    console.log(`Max depth: ${maxMeasuredDepth}, Margin radius: ${marginRadius}`);
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
        .attr("stroke-width", linkStrokeWidth)
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
        .attr("r", nodeRadius)
        .attr("class", "node-circle")
        .on("mouseover", (event, d) => playAudioWithFade(d))
        .on("mouseout", stopAudioWithFade);

    node.append("title")
        .text(d => `ID: ${d.data.name}\nScore: ${d.data.s}\nGeneration: ${d.data.gN}`);

    const zoom = d3.zoom()
        .scaleExtent([0.1, 10])
        .on("zoom", zoomed);

    svg.call(zoom)
       .call(zoom.transform, d3.zoomIdentity.scale(initialZoom));

    function zoomed(event) {
        if (!hasInteracted) return; // Don't adjust volume if there's been no interaction

        g.attr("transform", `translate(${width/2},${height/2}) ${event.transform}`);
        
        // Update circle sizes to maintain visual size during zoom
        g.selectAll(".node-circle")
            .attr("r", nodeRadius / event.transform.k);
    
        // Update link stroke width to maintain visual thickness during zoom
        g.selectAll(".link")
            .attr("stroke-width", linkStrokeWidth / event.transform.k);
    
        // Adjust audio volume based on zoom level
        const zoomFactor = event.transform.k;
        const newVolume = Math.min(BASE_VOLUME, BASE_VOLUME * zoomFactor);
        
        zoomGainNode.gain.cancelScheduledValues(audioContext.currentTime);
        zoomGainNode.gain.setValueAtTime(zoomGainNode.gain.value, audioContext.currentTime);
        zoomGainNode.gain.linearRampToValueAtTime(newVolume, audioContext.currentTime + 0.1);
        
        console.log(`Zoom factor: ${zoomFactor}, New volume: ${newVolume}`);
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

    // Add event listeners for parameter changes
    d3.select('#maxDepth').on('input', updateVisualization);
    d3.select('#measureContextSwitches').on('change', updateVisualization);
    d3.select('#suffixFilter').on('input', updateVisualization);

    function updateVisualization() {
        const newMaxDepth = parseInt(d3.select('#maxDepth').property('value'));
        const newMeasureContextSwitches = d3.select('#measureContextSwitches').property('checked');
        const newSuffixFilter = d3.select('#suffixFilter').property('value') || null;

        // Clear existing visualization
        d3.select(container).selectAll('*').remove();

        // Recreate visualization with new parameters
        createInteractiveVisualization(data, treeData, container, {
            maxDepth: newMaxDepth,
            measureContextSwitches: newMeasureContextSwitches,
            suffixFilter: newSuffixFilter
        });
    }
}