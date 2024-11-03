#!/bin/bash

# node cli-app/test/project-dataset-features.js /Users/bjornpjo/Downloads/audio-features/filtered_nsynth/nsynth-train-features_filtered /Users/bjornpjo/QD/analysis/datasetProjections nsynth-train_filtered 100
# node cli-app/test/project-dataset-features.js /Users/bjornpjo/Downloads/audio-features/filtered_OneBillion/OneBillionWav_features_filtered /Users/bjornpjo/QD/analysis/datasetProjections OneBillionWav_features_filtered 100

node cli-app/test/project-dataset-features.js /Users/bjornpjo/Downloads/audio-features/unfiltered/nsynth-train-features /Users/bjornpjo/QD/analysis/datasetProjections nsynth-train 100
node cli-app/test/project-dataset-features.js /Users/bjornpjo/Downloads/audio-features/unfiltered/OneBillionWav_features_unfiltered /Users/bjornpjo/QD/analysis/datasetProjections OneBillionWav 100

# node cli-app/test/project-dataset-features.js /Users/bjornpjo/Downloads/audio-features/unfiltered/nsynth-train-features /Users/bjornpjo/QD/analysis/datasetProjections nsynth-train 100
# node cli-app/test/project-dataset-features.js /Users/bjornpjo/Downloads/audio-features/unfiltered/OneBillionWav_features_unfiltered /Users/bjornpjo/QD/analysis/datasetProjections OneBillionWav_features 100

### then to analyse score matrices:
# node cli-app/test/score-matrix-from-elite-maps.js /Users/bjornpjo/QD/analysis/datasetProjections/nsynth-train_filtered /Users/bjornpjo/QD/analysis/datasetProjections/nsynth-train_filtered/score-matrix
# node cli-app/test/score-matrix-from-elite-maps.js /Users/bjornpjo/QD/analysis/datasetProjections/OneBillionWav_features_filtered /Users/bjornpjo/QD/analysis/datasetProjections/OneBillionWav_features_filtered/score-matix

### and to plot the heatmaps:
# python3 /Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/scoreMatrixHeatMap.py /Users/bjornpjo/QD/analysis/datasetProjections/nsynth-train_filtered/score-matrix/scoreMatrix.json 1 /Users/bjornpjo/QD/analysis/datasetProjections/nsynth-train_filtered/plot/ green
# python3 /Users/bjornpjo/Developer/apps/kromosynth-cli/analysis/scoreMatrixHeatMap.py /Users/bjornpjo/QD/analysis/datasetProjections/OneBillionWav_features_filtered/score-matix/scoreMatrix.json 1 /Users/bjornpjo/QD/analysis/datasetProjections/OneBillionWav_features_filtered/plot/ green