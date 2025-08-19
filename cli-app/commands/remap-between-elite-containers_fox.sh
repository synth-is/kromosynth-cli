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

apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node /fp/projects01/ec29/bthj/kromosynth-cli/cli-app/kromosynth.js map-elite-map-to-map-with-different-bd \
  --evolution-run-id "${EVO_RUN_ID}" \
  --evo-run-dir-path "${EVO_RUN_DIR_PATH}" \
  --terrain-name-from "${TERRAIN_NAME_FROM}" --terrain-name-to "${TERRAIN_NAME_TO}" \
  --genome-rendering-host ws://int-2.fox.ad.fp.educloud.no:11406 \
  --feature-extraction-host ws://int-2.fox.ad.fp.educloud.no:15021 --quality-evaluation-feature-extraction-endpoint "/${QUALITY_EVALUATION_FEATURE_TYPE}" --projection-feature-extraction-endpoint "${PROJECTION_FEATURE_EXTRACTION_ENDPOINT_TYPE}" \
  --quality-evaluation-host ws://int-2.fox.ad.fp.educloud.no:60603 --quality-evaluation-endpoint "/adaptive?reference_embedding_path=/fp/projects01/ec29/bthj/dataset-features/nsynth-valid/family-split_features/string/string_acoustic_057-070-127.json&reference_embedding_key=${QUALITY_EVALUATION_FEATURE_TYPE}" \
  --projection-host ws://int-2.fox.ad.fp.educloud.no:54929 --projection-endpoint "${PROJECTION_ENDPOINT}" \
  --use-gpu true --sample-rate 16000

# example:
# - start relevant services:
# pm2 start ecosystem_services_only.config.js
# - run the analysis:
# ./kromosynth-cli/cli-app/commands/remap-between-elite-containers.sh /Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/evoruns 01J9FBJJ61V48BJJ8E5JCE4642_evoConf_singleMap_refSingleEmbeddings_x100_vggish_pca_retrain__2024-10 customRef1 spectralCentroidXflatness vggish "/manual?features=spectral_centroid,spectral_flatness" "/raw"