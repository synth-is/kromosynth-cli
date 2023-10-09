#!/bin/bash

# dependencies:
# python3 -m pip install matplotlib numpy scipy seaborn

# This script is used to plot the aggregate data from the analysis

# Read in the path to an analysis JSON file
analysisFile=$1

# Read in the step size as an int
stepSize=$2

# Read in the path to the output directory, if none is provided, use the current directory
if [ -z "$3" ]
then
    outputDir="."
else
    outputDir=$3
fi

python3 qdScores.py $analysisFile $stepSize $outputDir
python3 cellScores.py $analysisFile $stepSize $outputDir
python3 coverage.py $analysisFile $stepSize $outputDir
python3 eliteGenerations.py $analysisFile $stepSize $outputDir
python3 elitesEnergy.py $analysisFile $stepSize $outputDir
python3 genomeSets.py $analysisFile $stepSize $outputDir
python3 genomeStatistics.py $analysisFile $stepSize $outputDir