#!/bin/bash

/Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/commands/setup_analysis.py \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-testConfigs \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-test \
    score-matrices \
    --plotting-script /Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/scoreMatricesHeatMaps.py \
    --step-size 500 \
    --transparent-background \
    --color-map plasma \
    --data-path "scoreMatrices" \
    --terrain-name "customRef1" \
    # --terrain-name ALL \