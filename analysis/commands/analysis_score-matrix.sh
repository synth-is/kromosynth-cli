#!/bin/bash

/Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/commands/setup_analysis.py \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-testConfigs \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-test \
    score-matrix \
    --plotting-script /Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/scoreMatrixHeatMap.py \
    --transparent-background \
    --color-map plasma \
    --data-path "scoreMatrix" \
    --terrain-name "customRef1" \
    # --terrain-name ALL
    # --step-size 500