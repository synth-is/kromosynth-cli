#!/bin/bash

/Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/commands/setup_analysis.py \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-testConfigs \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-test \
    diversity-measures \
    --step-size 500 \
    --data-path "diversityMeasures" \
    --ylabel "Diversity" \
    --terrain-name "customRef1" \
    --plotting-script /Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/generic_plotter.py \
    --skip-analysis \
    # --terrain-name ALL

    # --plotting-script /Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/diversity_measures_plot.py \
    # 
