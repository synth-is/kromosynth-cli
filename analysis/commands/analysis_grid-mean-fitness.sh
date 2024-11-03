#!/bin/bash

/Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/commands/setup_analysis.py \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-testConfigs \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-test \
    grid-mean-fitness \
    --step-size 100 \
    --data-path "gridMeanFitness" \
    --ylabel "Grid Mean Fitnss." \
    --terrain-name "customRef1" \
    --skip-analysis \
    --plotting-script /Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/generic_plotter.py \