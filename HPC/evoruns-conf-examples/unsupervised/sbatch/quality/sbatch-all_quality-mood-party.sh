#!/usr/bin/env bash

ACCOUNT="ec12"
FEATURES_SCRIPT="/fp/projects01/ec29/bthj/kromosynth-evaluate/evaluation/unsupervised/features_mfcc.py --sample-rate 16000"
QUALITY_SCRIPT="/fp/projects01/ec29/bthj/kromosynth-evaluate/evaluation/unsupervised/quality_mood.py --sample-rate 16000 --quality-methods 'mood_party' --models-path '/fp/projects01/ec29/bthj/kromosynth-evaluate/measurements/models'"
PROJECTION_SCRIPT="/fp/projects01/ec29/bthj/kromosynth-evaluate/evaluation/unsupervised/projection_pca_quantised.py --dimensions 2 --dimension-cells 50"
VARIATION_SERVER_COUNT=4
RENDERING_SERVER_COUNT=4
FEATURES_SERVER_COUNT=4
QUALITY_SERVER_COUNT=4
PROJECTION_SERVER_COUNT=4
TOTAL_SERVER_COUNT=$((RENDERING_SERVER_COUNT + FEATURES_SERVER_COUNT + QUALITY_SERVER_COUNT + PROJECTION_SERVER_COUNT + 1)) # +1 for the controller
BATCH_COUNT=6

/fp/projects01/ec29/bthj/QD/unsupervised/sbatch.sh /fp/projects01/ec29/bthj/QD/unsupervised/runsconf/moods/evolution-runs_mfcc_pca-quantised_quality-mood-party_parents-max-1.jsonc --features-script "${FEATURES_SCRIPT}" --quality-script "${QUALITY_SCRIPT}" --projection-script "${PROJECTION_SCRIPT}" --variation-server-count "${VARIATION_SERVER_COUNT}" --rendering-server-count "${RENDERING_SERVER_COUNT}" --features-server-count "${FEATURES_SERVER_COUNT}" --quality-server-count "${QUALITY_SERVER_COUNT}" --projection-server-count "${PROJECTION_SERVER_COUNT}" --total-server-count "${TOTAL_SERVER_COUNT}" --batch-count "${BATCH_COUNT}" --account "${ACCOUNT}"
