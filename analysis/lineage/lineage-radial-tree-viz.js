import { generateSVG } from './phylogenetic-tree-generator.js';
import fs from 'fs/promises';

async function main() {
    try {
        const data = JSON.parse(await fs.readFile('/Users/bjornpjo/QD/analysis/supervised/conf-classScoringVariationsAsContainerDimensions_noOsc/evolution-run-analysis_lineage_step-1_1723727836945.json', 'utf8'));
        const svgContent = generateSVG(data, {
            width: 6000,
            height: 6000,
            margin: 400,
            radiusScale: 0.8,
            fontScale: 2.0,
            lineageSpacing: 0.05,
            maxDepth: 15,
            measureContextSwitches: true,
            suffixFilter: '-5'
          });
        await fs.writeFile('output.svg', svgContent, 'utf8');
        console.log('SVG file generated successfully');
    } catch (error) {
        console.error('Error generating SVG:', error);
    }
}

main();