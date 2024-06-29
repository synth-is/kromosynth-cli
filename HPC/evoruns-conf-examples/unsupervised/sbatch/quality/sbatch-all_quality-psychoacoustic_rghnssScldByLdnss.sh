#!/usr/bin/env bash

ACCOUNT="ec12"
FEATURES_SCRIPT="/fp/projects01/ec29/bthj/kromosynth-evaluate/evaluation/unsupervised/features_mfcc.py --sample-rate 48000"
QUALITY_SCRIPT="/fp/projects01/ec29/bthj/kromosynth-evaluate/evaluation/unsupervised/quality_psychoacoustic.py --sample-rate 48000 --quality-methods 'roughness_score_scaled_by_loudness'"
PROJECTION_SCRIPT="/fp/projects01/ec29/bthj/kromosynth-evaluate/evaluation/unsupervised/projection_pca_quantised.py --dimensions 2 --dimension-cells 50"
VARIATION_SERVER_COUNT=4
RENDERING_SERVER_COUNT=8
FEATURES_SERVER_COUNT=8
QUALITY_SERVER_COUNT=32
PROJECTION_SERVER_COUNT=8
TOTAL_SERVER_COUNT=$((RENDERING_SERVER_COUNT + FEATURES_SERVER_COUNT + QUALITY_SERVER_COUNT + PROJECTION_SERVER_COUNT + 1)) # +1 for the controller
BATCH_COUNT=16

/fp/projects01/ec29/bthj/QD/unsupervised/sbatch.sh /fp/projects01/ec29/bthj/QD/unsupervised/runsconf/psychoacoustic/evolution-runs_mfcc_pca-quantised_quality-psychoacoustic_parents-max-1_rghnssScldByLdnss.jsonc --features-script "${FEATURES_SCRIPT}" --quality-script "${QUALITY_SCRIPT}" --projection-script "${PROJECTION_SCRIPT}" --variation-server-count "${VARIATION_SERVER_COUNT}" --rendering-server-count "${RENDERING_SERVER_COUNT}" --features-server-count "${FEATURES_SERVER_COUNT}" --quality-server-count "${QUALITY_SERVER_COUNT}" --projection-server-count "${PROJECTION_SERVER_COUNT}" --total-server-count "${TOTAL_SERVER_COUNT}" --batch-count "${BATCH_COUNT}" --account "${ACCOUNT}"
/fp/projects01/ec29/bthj/QD/unsupervised/sbatch.sh /fp/projects01/ec29/bthj/QD/unsupervised/runsconf/psychoacoustic/evolution-runs_mfcc_pca-quantised_quality-psychoacoustic_parents-max-1_rghnssScldByLdnss_clsscSynth.jsonc --features-script "${FEATURES_SCRIPT}" --quality-script "${QUALITY_SCRIPT}" --projection-script "${PROJECTION_SCRIPT}" --variation-server-count "${VARIATION_SERVER_COUNT}" --rendering-server-count "${RENDERING_SERVER_COUNT}" --features-server-count "${FEATURES_SERVER_COUNT}" --quality-server-count "${QUALITY_SERVER_COUNT}" --projection-server-count "${PROJECTION_SERVER_COUNT}" --total-server-count "${TOTAL_SERVER_COUNT}" --batch-count "${BATCH_COUNT}" --account "${ACCOUNT}"