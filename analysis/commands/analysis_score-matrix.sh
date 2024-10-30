#!/bin/bash

/Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/commands/setup_analysis.py \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-testConfigs \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-test \
    score-matrix \
    --plotting-script /Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/scoreMatrixHeatMap.py \
    # --terrain-name ALL
    # --step-size 500