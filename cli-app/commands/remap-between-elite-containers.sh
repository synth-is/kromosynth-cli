#!/bin/sh

# for testing:
# --terrain-name-from "customRef1" --terrain-name-to "random" \

if [ "$#" -ne 7 ]; then
  echo "Usage: $0 <base-path> <evo-run-id> <terrain-name-from> <terrain-name-to> <quality-evaluation-feature-type> <projection-feature-extraction-endpoint-type> <projection-endpoint>"
  exit 1
fi

BASE_PATH=$1
EVO_RUN_ID=$2
EVO_RUN_DIR_PATH="${BASE_PATH}/${EVO_RUN_ID}"
TERRAIN_NAME_FROM=$3
TERRAIN_NAME_TO=$4
QUALITY_EVALUATION_FEATURE_TYPE=$5
PROJECTION_FEATURE_EXTRACTION_ENDPOINT_TYPE=$6
PROJECTION_ENDPOINT=$7

kromosynth map-elite-map-to-map-with-different-bd \
  --evolution-run-id "${EVO_RUN_ID}" \
  --evo-run-dir-path "${EVO_RUN_DIR_PATH}" \
  --terrain-name-from "${TERRAIN_NAME_FROM}" --terrain-name-to "${TERRAIN_NAME_TO}" \
  --genome-rendering-host ws://127.0.0.1:30051 \
  --feature-extraction-host ws://127.0.0.1:31051 --quality-evaluation-feature-extraction-endpoint "/${QUALITY_EVALUATION_FEATURE_TYPE}" --projection-feature-extraction-endpoint "${PROJECTION_FEATURE_EXTRACTION_ENDPOINT_TYPE}" \
  --quality-evaluation-host ws://127.0.0.1:32051 --quality-evaluation-endpoint "/adaptive?reference_embedding_path=/Users/bjornpjo/Downloads/nsynth-valid/family-split_features/string/string_acoustic_057-070-127.json&reference_embedding_key=${QUALITY_EVALUATION_FEATURE_TYPE}" \
  --projection-host ws://127.0.0.1:33051 --projection-endpoint "${PROJECTION_ENDPOINT}" \
  --use-gpu true --sample-rate 16000

# example:
# - start relevant services:
# pm2 start ecosystem_services_only.config.js
# - run the analysis:
# ./kromosynth-cli/cli-app/commands/remap-between-elite-containers.sh /Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/evoruns 01J9FBJJ61V48BJJ8E5JCE4642_evoConf_singleMap_refSingleEmbeddings_x100_vggish_pca_retrain__2024-10 customRef1 spectralCentroidXflatness vggish "/manual?features=spectral_centroid,spectral_flatness" "/raw"