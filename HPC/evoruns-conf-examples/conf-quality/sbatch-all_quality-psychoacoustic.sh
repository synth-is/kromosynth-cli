#!/usr/bin/env bash

FEATURES_SCRIPT="/home/bthj/kromosynth-evaluate/evaluation/unsupervised/features_mfcc.py --sample-rate 48000 --host localhost --force-host true"
QUALITY_SCRIPT="/home/bthj/kromosynth-evaluate/evaluation/unsupervised/quality_psychoacoustic.py --host localhost --sample-rate 48000 --force-host true --quality-methods 'roughness_median'"
PROJECTION_SCRIPT="/home/bthj/kromosynth-evaluate/evaluation/unsupervised/projection_pca_quantised.py --dimensions 2 --dimension-cells 50 --host localhost --force-host true"
VARIATION_SERVER_COUNT=4
RENDERING_SERVER_COUNT=8
FEATURES_SERVER_COUNT=4
QUALITY_SERVER_COUNT=4
PROJECTION_SERVER_COUNT=16
TOTAL_SERVER_COUNT=$((RENDERING_SERVER_COUNT + FEATURES_SERVER_COUNT + QUALITY_SERVER_COUNT + PROJECTION_SERVER_COUNT + 1)) # +1 for the controller
BATCH_COUNT=1

/home/bthj/QD/conf-quality/sbatch.sh /home/bthj/QD/conf-quality/runsconf/psychoacoustic/evolution-runs_mfcc_pca-quantised_quality-psychoacoustic_parents-max-1.jsonc --features-script "${FEATURES_SCRIPT}" --quality-script "${QUALITY_SCRIPT}" --projection-script "${PROJECTION_SCRIPT}" --variation-server-count "${VARIATION_SERVER_COUNT}" --rendering-server-count "${RENDERING_SERVER_COUNT}" --features-server-count "${FEATURES_SERVER_COUNT}" --quality-server-count "${QUALITY_SERVER_COUNT}" --projection-server-count "${PROJECTION_SERVER_COUNT}" --total-server-count "${TOTAL_SERVER_COUNT}" --batch-count "${BATCH_COUNT}"
/home/bthj/QD/conf-quality/sbatch.sh /home/bthj/QD/conf-quality/runsconf/psychoacoustic/evolution-runs_mfcc_pca-quantised_quality-psychoacoustic_parents-max-10.jsonc --features-script "${FEATURES_SCRIPT}" --quality-script "${QUALITY_SCRIPT}" --projection-script "${PROJECTION_SCRIPT}" --variation-server-count "${VARIATION_SERVER_COUNT}" --rendering-server-count "${RENDERING_SERVER_COUNT}" --features-server-count "${FEATURES_SERVER_COUNT}" --quality-server-count "${QUALITY_SERVER_COUNT}" --projection-server-count "${PROJECTION_SERVER_COUNT}" --total-server-count "${TOTAL_SERVER_COUNT}" --batch-count "${BATCH_COUNT}"
