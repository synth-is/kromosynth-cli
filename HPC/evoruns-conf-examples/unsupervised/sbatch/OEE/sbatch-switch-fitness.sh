#!/usr/bin/env bash

ACCOUNT="ec29"
PARTITION="ifi_accel"
FEATURES_SCRIPT="/fp/projects01/ec29/bthj/kromosynth-evaluate/evaluation/unsupervised/features.py"
QUALITY_SCRIPT="/fp/projects01/ec29/bthj/kromosynth-evaluate/evaluation/unsupervised/quality_fad.py"
PROJECTION_SCRIPT="/fp/projects01/ec29/bthj/kromosynth-evaluate/evaluation/unsupervised/projection_pca_quantised.py --dimensions 2 --dimension-cells 20"
VARIATION_SERVER_COUNT=1
RENDERING_SERVER_COUNT=3
FEATURES_SERVER_COUNT=3
QUALITY_SERVER_COUNT=3
PROJECTION_SERVER_COUNT=2
TOTAL_SERVER_COUNT=$((RENDERING_SERVER_COUNT + FEATURES_SERVER_COUNT + QUALITY_SERVER_COUNT + PROJECTION_SERVER_COUNT + 1)) # +1 for the controller
BATCH_COUNT=21

/fp/projects01/ec29/bthj/QD/unsupervised/sbatch-ifi_accel.sh /fp/projects01/ec29/bthj/QD/unsupervised/runsconf/OEE/switch-fitness.jsonc  --features-script "${FEATURES_SCRIPT}" --quality-script "${QUALITY_SCRIPT}" --projection-script "${PROJECTION_SCRIPT}" --variation-server-count "${VARIATION_SERVER_COUNT}" --rendering-server-count "${RENDERING_SERVER_COUNT}" --features-server-count "${FEATURES_SERVER_COUNT}" --quality-server-count "${QUALITY_SERVER_COUNT}" --projection-server-count "${PROJECTION_SERVER_COUNT}" --total-server-count "${TOTAL_SERVER_COUNT}" --batch-count "${BATCH_COUNT}" --account "${ACCOUNT}" --partition "${PARTITION}"