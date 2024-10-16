#!/usr/bin/env bash

ACCOUNT="ec29"
PARTITION="normal"
FEATURES_SCRIPT="/fp/projects01/ec29/bthj/kromosynth-evaluate/evaluation/unsupervised/features.py"
QUALITY_SCRIPT="/fp/projects01/ec29/bthj/kromosynth-evaluate/evaluation/unsupervised/quality_instrumentation.py --models-path /fp/projects01/ec29/bthj/kromosynth-evaluate/measurements/models"
PROJECTION_SCRIPT="/fp/projects01/ec29/bthj/kromosynth-evaluate/evaluation/unsupervised/projection_quantised.py --dimensions 2 --dimension-cells 100"
VARIATION_SERVER_COUNT=4
RENDERING_SERVER_COUNT=16
FEATURES_SERVER_COUNT=4
QUALITY_SERVER_COUNT=11
PROJECTION_SERVER_COUNT=4
TOTAL_SERVER_COUNT=$((RENDERING_SERVER_COUNT + FEATURES_SERVER_COUNT + QUALITY_SERVER_COUNT + PROJECTION_SERVER_COUNT + 1)) # +1 for the controller
BATCH_COUNT=1

/fp/projects01/ec29/bthj/QD/unsupervised/sbatch.sh /fp/projects01/ec29/bthj/QD/unsupervised/runsconf/singleMapBDs/evoConf_singleMap_nsynthTopScore_mfcc_pca_retrainIncr50__2024-09.jsonc --features-script "${FEATURES_SCRIPT}" --quality-script "${QUALITY_SCRIPT}" --projection-script "${PROJECTION_SCRIPT}" --variation-server-count "${VARIATION_SERVER_COUNT}" --rendering-server-count "${RENDERING_SERVER_COUNT}" --features-server-count "${FEATURES_SERVER_COUNT}" --quality-server-count "${QUALITY_SERVER_COUNT}" --projection-server-count "${PROJECTION_SERVER_COUNT}" --total-server-count "${TOTAL_SERVER_COUNT}" --batch-count "${BATCH_COUNT}" --account "${ACCOUNT}" --partition "${PARTITION}"
