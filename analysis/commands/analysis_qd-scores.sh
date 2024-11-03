#!/bin/bash

/Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/commands/setup_analysis.py \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-testConfigs \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-test \
    qd-scores \
    --plotting-script /Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/generic_plotter.py \
    --step-size 100 \
    --skip-analysis \
    --data-path "qdScores" \
    --ylabel "QD score" \
    --terrain-name "customRef1"
    

# --plotting-script /Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/qdScores_combined_evoruns.py \