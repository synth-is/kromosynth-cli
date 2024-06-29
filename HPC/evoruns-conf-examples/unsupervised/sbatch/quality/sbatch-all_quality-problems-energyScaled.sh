#!/usr/bin/env bash

ACCOUNT="ec12"
FEATURES_SCRIPT="/fp/projects01/ec29/bthj/kromosynth-evaluate/evaluation/unsupervised/features_mfcc.py --sample-rate 16000"
QUALITY_SCRIPT="/fp/projects01/ec29/bthj/kromosynth-evaluate/evaluation/unsupervised/quality_problems.py --sample-rate 16000 --quality-methods 'click_count_percentage,discontinuity_count_percentage,gaps_count_percentage,saturation_percentage,true_peak_clipping_percentage,noise_burst_percentage,compressibility_percentage,energy'"
PROJECTION_SCRIPT="/fp/projects01/ec29/bthj/kromosynth-evaluate/evaluation/unsupervised/projection_pca_quantised.py --dimensions 2 --dimension-cells 50"
VARIATION_SERVER_COUNT=4
RENDERING_SERVER_COUNT=8
FEATURES_SERVER_COUNT=8
QUALITY_SERVER_COUNT=8
PROJECTION_SERVER_COUNT=8
TOTAL_SERVER_COUNT=$((RENDERING_SERVER_COUNT + FEATURES_SERVER_COUNT + QUALITY_SERVER_COUNT + PROJECTION_SERVER_COUNT + 1)) # +1 for the controller
BATCH_COUNT=8

# /fp/projects01/ec29/bthj/QD/unsupervised/sbatch.sh /fp/projects01/ec29/bthj/QD/unsupervised/runsconf/problems/evolution-runs_mfcc_pca-quantised_quality-problems_parents-max-1_energyScaled.jsonc --features-script "${FEATURES_SCRIPT}" --quality-script "${QUALITY_SCRIPT}" --projection-script "${PROJECTION_SCRIPT}" --variation-server-count "${VARIATION_SERVER_COUNT}" --rendering-server-count "${RENDERING_SERVER_COUNT}" --features-server-count "${FEATURES_SERVER_COUNT}" --quality-server-count "${QUALITY_SERVER_COUNT}" --projection-server-count "${PROJECTION_SERVER_COUNT}" --total-server-count "${TOTAL_SERVER_COUNT}" --batch-count "${BATCH_COUNT}" --account "${ACCOUNT}"
/fp/projects01/ec29/bthj/QD/unsupervised/sbatch.sh /fp/projects01/ec29/bthj/QD/unsupervised/runsconf/problems/evolution-runs_mfcc_pca-quantised_quality-problems_parents-max-1_energyScaled_clsscSynth.jsonc --features-script "${FEATURES_SCRIPT}" --quality-script "${QUALITY_SCRIPT}" --projection-script "${PROJECTION_SCRIPT}" --variation-server-count "${VARIATION_SERVER_COUNT}" --rendering-server-count "${RENDERING_SERVER_COUNT}" --features-server-count "${FEATURES_SERVER_COUNT}" --quality-server-count "${QUALITY_SERVER_COUNT}" --projection-server-count "${PROJECTION_SERVER_COUNT}" --total-server-count "${TOTAL_SERVER_COUNT}" --batch-count "${BATCH_COUNT}" --account "${ACCOUNT}"