#!/bin/bash

/Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/commands/setup_analysis.py \
    /Users/bjornpjo/QD/analysis/unsupervised/mapSwitch_analysisConfigs \
    /Users/bjornpjo/QD/analysis/unsupervised/mapSwitch \
    lineage \
    --step-size 1 \
    --data-path "lineage" \
    --skip-if-exists \
#    --terrain-name ALL \

# --terrain-name "customRef1" \