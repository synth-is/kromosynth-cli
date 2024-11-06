#!/bin/bash

/Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/commands/setup_analysis.py \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-testConfigs \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-test \
    coverage \
    --plotting-script /Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/generic_plotter.py \
    --step-size 100 \
    --data-path "coverage" \
    --ylabel "Coverage" \
    --terrain-name "customRef1" \
    --skip-analysis \
    # --terrain-name ALL
    
#    --plotting-script /Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/coverage_combined_maps.py \