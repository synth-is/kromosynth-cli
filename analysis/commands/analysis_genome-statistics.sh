#!/bin/bash

/Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/commands/setup_analysis.py \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-testConfigs \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-test \
    genome-statistics \
    --plotting-script /Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/generic_plotter.py \
    --step-size 100 \
    --skip-analysis \
    --terrain-name "none" \
    --data-path "genomeStatistics.averageAsNEATPatchConnectionCounts" \
    --ylabel "DSP connections" \

/Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/commands/setup_analysis.py \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-testConfigs \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-test \
    genome-statistics \
    --plotting-script /Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/generic_plotter.py \
    --step-size 100 \
    --skip-analysis \
    --terrain-name "none" \
    --data-path "genomeStatistics.averageAsNEATPatchNodeCounts" \
    --ylabel "DSP nodes" \

/Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/commands/setup_analysis.py \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-testConfigs \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-test \
    genome-statistics \
    --plotting-script /Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/generic_plotter.py \
    --step-size 100 \
    --skip-analysis \
    --terrain-name "none" \
    --data-path "genomeStatistics.averageCppnNodeCounts" \
    --ylabel "CPPN nodes" \

/Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/commands/setup_analysis.py \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-testConfigs \
    /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-test \
    genome-statistics \
    --plotting-script /Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/generic_plotter.py \
    --step-size 100 \
    --skip-analysis \
    --terrain-name "none" \
    --data-path "genomeStatistics.averageCppnConnectionCounts" \
    --ylabel "CPPN conns." \