#!/bin/bash

# dependencies:
# python3 -m pip install matplotlib numpy scipy seaborn

# This script is used to plot the aggregate data from the analysis

# Read in the path to an analysis JSON file
analysisFile=$1

# Read in the step size as an int
stepSize=$2

python3 qdScores.py $analysisFile $stepSize
python3 cellScores.py $analysisFile $stepSize
python3 coverage.py $analysisFile $stepSize
python3 eliteGenerations.py $analysisFile $stepSize
python3 elitesEnergy.py $analysisFile $stepSize
python3 genomeSets.py $analysisFile $stepSize
python3 genomeStatistics.py $analysisFile $stepSize