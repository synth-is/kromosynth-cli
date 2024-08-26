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


let hasInteracted = false;

let audioContext;
let zoomGainNode;
let convolverNode;
let dryGainNode;
let wetGainNode;
let reverbAmount = 10; // Default reverb amount (0-100)
let currentZoomTransform = null;

if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    zoomGainNode = audioContext.createGain();
    convolverNode = audioContext.createConvolver();
    dryGainNode = audioContext.createGain();
    wetGainNode = audioContext.createGain();
    
    // Connect the nodes
    zoomGainNode.connect(dryGainNode);
    zoomGainNode.connect(convolverNode);
    convolverNode.connect(wetGainNode);
    dryGainNode.connect(audioContext.destination);
    wetGainNode.connect(audioContext.destination);

    // Initialize reverb impulse response
    // fetch('/BIGHALLE003M2S.wav')
    fetch('/WIDEHALL-1.wav')
        .then(response => response.arrayBuffer())
        .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
        .then(audioBuffer => {
            // Ensure the impulse response matches the audio context settings
            const contextSampleRate = audioContext.sampleRate;
            const contextChannels = 2; // Assuming stereo output

            if (audioBuffer.sampleRate !== contextSampleRate || audioBuffer.numberOfChannels !== contextChannels) {
                // Resample and adjust channels if necessary
                const offlineCtx = new OfflineAudioContext(contextChannels, audioBuffer.duration * contextSampleRate, contextSampleRate);
                const bufferSource = offlineCtx.createBufferSource();
                bufferSource.buffer = audioBuffer;
                bufferSource.connect(offlineCtx.destination);
                bufferSource.start();
                return offlineCtx.startRendering();
            }
            return audioBuffer;
        })
        .then(adjustedBuffer => {
            convolverNode.buffer = adjustedBuffer;
        })
        .catch(error => console.error('Error loading reverb impulse response:', error));
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

    // Add custom tooltip div
    const tooltip = d3.select(container).append("div")
        .attr("class", "tooltip")
        .style("opacity", 0)
        .style("position", "absolute")
        .style("pointer-events", "none")
        .style("background-color", "white")
        .style("border", "1px solid #ddd")
        .style("border-radius", "5px")
        .style("padding", "10px")
        .style("font-size", "12px");

    function updateReverbMix() {
        const wetAmount = reverbAmount / 100;
        wetGainNode.gain.setValueAtTime(wetAmount, audioContext.currentTime);
        dryGainNode.gain.setValueAtTime(1 - wetAmount, audioContext.currentTime);
    }

    // Add download button
    // const downloadButton = d3.select(container).append("button")
    //     .text("Download Tree JSON")
    //     .style("position", "absolute")
    //     .style("top", "10px")
    //     .style("right", "10px")
    //     .on("click", () => downloadTreeJson(simplifiedRoot, data, iteration));


    let currentSource = null;
    let currentGainNode = null;
    let currentPlayingNode = null;

    const FADE_TIME = 0.1; // Time in seconds for fade in/out
    const BASE_VOLUME = 1; // Maximum volume at normal zoom level



    // Create a container for instructions and controls
    const controlsContainer = d3.select(container).append("div")
        .attr("id", "controls-container")
        .style("position", "absolute")
        .style("bottom", "10px")
        .style("left", "10px")
        .style("right", "10px")
        .style("display", "flex")
        .style("justify-content", "space-between")
        .style("align-items", "center");

    // Add instructions
    controlsContainer.append("p")
        .attr("id", "instructions")
        .style("margin", "0")
        .style("flex-grow", "1")
        .text("Hover over nodes to play sounds. Double-click to download a specific sound.");

    // Create a sub-container for the reverb controls and download button
    const reverbControlsContainer = controlsContainer.append("div")
        .style("display", "flex")
        .style("align-items", "center")
        .style("gap", "10px"); // This adds space between the elements

    // Add reverb label
    reverbControlsContainer.append("label")
        .attr("for", "reverb-slider")
        .text("Reverb")
        .style("margin-right", "5px");

    // Add reverb slider
    const reverbSlider = reverbControlsContainer.append("input")
        .attr("type", "range")
        .attr("min", "0")
        .attr("max", "100")
        .attr("value", reverbAmount)
        .attr("class", "reverb-slider")
        .style("width", "100px")
        .on("input", function() {
            reverbAmount = parseFloat(this.value);
            updateReverbMix();
        });

    // Add download button for current sound
    const downloadButton = reverbControlsContainer.append("button")
        .attr("id", "downloadCurrentSound")
        .text("Download Current Sound")
        .style("display", "none")
        .on("click", downloadCurrentSound);



    // Add interaction message
    let messageDiv;
    if (!hasInteracted) {
        messageDiv = d3.select(container).append("div")
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
            .text("Click anywhere to enable audio playback when hovering over nodes");
    }

    // Function to remove the message and resume audio context
    function enableAudio() {
        if (!hasInteracted) {
            if (messageDiv) {
                messageDiv.remove();
            }
            audioContext.resume().then(() => {
                console.log('AudioContext resumed successfully');
            });
            hasInteracted = true;
        }
    }
    

    // Add click event listener to the container
    d3.select(container).on("click", enableAudio);

    let currentSoundUrl = null;

    async function playAudioWithFade(d) {
        if (!hasInteracted) return;
        console.log("Playing audio for node:", d);
        if (currentPlayingNode === d) return;
        
        const fileName = `${d.data.id}-${d.data.duration}_${d.data.noteDelta}_${d.data.velocity}.wav`;
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
            currentSource.loop = false;

            currentGainNode = audioContext.createGain();
            currentGainNode.gain.setValueAtTime(0, audioContext.currentTime);
            currentGainNode.gain.linearRampToValueAtTime(1, audioContext.currentTime + FADE_TIME);

            currentSource.connect(currentGainNode);
            currentGainNode.connect(zoomGainNode);

            currentSource.start();
            currentPlayingNode = d;

            downloadButton.style("display", "inline-block");
            currentSoundUrl = audioUrl;

            // Apply current reverb mix
            updateReverbMix();

            // Set up onended callback
            currentSource.onended = () => {
                stopAudioWithFade();
            };
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
            setTimeout(() => {
                if (currentSource) {
                    currentSource.stop();
                    currentSource.disconnect();
                    currentSource = null;
                }
                if (currentGainNode) {
                    currentGainNode.disconnect();
                    currentGainNode = null;
                }
                currentPlayingNode = null;
                resolve();
            }, FADE_TIME * 1000);
        });
    }
    
    
    function downloadCurrentSound() {
        if (currentSoundUrl) {
            const link = document.createElement('a');
            link.href = currentSoundUrl;
            link.download = currentSoundUrl.split('/').pop();
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    function downloadNodeSound(d) {
        const fileName = "accordion_5_0_1_01J25K44BT544SAFR666DBH4Y4_4.wav" // `${d.data.id}-${d.data.duration}_${d.data.noteDelta}_${d.data.velocity}.wav`;
        const audioUrl = `/01J1ZZF2J09MM1YARNR9RYP6AB_YAMNet-durDims_noOsc/${fileName}`;
        
        const link = document.createElement('a');
        link.href = audioUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
        .on("mouseover", (event, d) => {
            tooltip.transition()
                .duration(200)
                .style("opacity", .9);
            tooltip.html(`ID: ${d.data.name}<br/>Score: ${d.data.s}<br/>Generation: ${d.data.gN}`)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
            playAudioWithFade(d);
        })
        .on("mouseout", (event, d) => {
            tooltip.transition()
                .duration(500)
                .style("opacity", 0);
            stopAudioWithFade();
            // We no longer hide the download button here
        })
        .on("dblclick", (event, d) => {
            event.preventDefault(); // Prevent text selection
            event.stopPropagation(); // Prevent zoom behavior
            downloadNodeSound(d);
        });
    
    // node.append("title")
    //     .text(d => `ID: ${d.data.name}\nScore: ${d.data.s}\nGeneration: ${d.data.gN}`);

    const zoom = d3.zoom()
        .scaleExtent([0.1, 10])
        .on("zoom", zoomed)
        .filter(event => {
            // Ignore double-clicks on nodes
            if (event.type === 'dblclick' && event.target.classList.contains('node-circle')) {
                return false;
            }
            // Allow all other events
            return true;
        });

    // Apply the stored zoom transform if it exists, otherwise use the initial zoom
    if (currentZoomTransform) {
        svg.call(zoom).call(zoom.transform, currentZoomTransform);
    } else {
        svg.call(zoom).call(zoom.transform, d3.zoomIdentity.translate(width/2, height/2).scale(initialZoom));
    }

    function zoomed(event) {
        if (!hasInteracted) return; // Don't adjust volume if there's been no interaction
    
        const transform = event.transform;

        // Store the current zoom transform
        currentZoomTransform = transform;
    
        // Apply the zoom transformation
        g.attr("transform", `translate(${transform.x},${transform.y}) scale(${transform.k})`);
        
        // Update circle sizes to maintain visual size during zoom
        g.selectAll(".node-circle")
            .attr("r", nodeRadius / transform.k);
    
        // Update link stroke width to maintain visual thickness during zoom
        g.selectAll(".link")
            .attr("stroke-width", linkStrokeWidth / transform.k);
    
        // Adjust audio volume based on zoom level
        const zoomFactor = transform.k;
        const newVolume = Math.min(BASE_VOLUME, BASE_VOLUME * zoomFactor);
        
        zoomGainNode.gain.cancelScheduledValues(audioContext.currentTime);
        zoomGainNode.gain.setValueAtTime(zoomGainNode.gain.value, audioContext.currentTime);
        zoomGainNode.gain.linearRampToValueAtTime(newVolume, audioContext.currentTime + 0.1);
    
        // Update tooltip position during zoom, only if sourceEvent exists
        if (event.sourceEvent) {
            tooltip.style("left", (event.sourceEvent.pageX + 10) + "px")
                   .style("top", (event.sourceEvent.pageY - 28) + "px");
        }
        
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