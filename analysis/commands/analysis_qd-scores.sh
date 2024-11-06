#!/bin/bash

/Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/commands/setup_analysis.py \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-testConfigs \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-test \
    qd-scores \
    --step-size 100 \
    --data-path "qdScores" \
    --ylabel "QD score" \
    --terrain-name "customRef1"

#    --skip-analysis \
#    --plotting-script /Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/generic_plotter.py \    

# --plotting-script /Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/qdScores_combined_evoruns.py \