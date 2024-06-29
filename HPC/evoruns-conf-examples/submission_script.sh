#!/usr/bin/env bash

#SBATCH --account=ec29
#SBATCH --partition=normal
#SBATCH --job-name=evolution-runs_mfcc_pca-quantised_quality-instrumentation_parents-max-1_classDims.jsonc
#SBATCH --output=/fp/projects01/ec29/bthj/slurm-output/evolution-runs_mfcc_pca-quantised_quality-instrumentation_parents-max-1_classDims.jsonc-12.out
#SBATCH --ntasks=29
#SBATCH --mem-per-cpu=8G
#SBATCH --cpus-per-task=1
#SBATCH --dependency=singleton
#SBATCH --time=03:00:30

# Declare an associative array
declare -A pids

cd /fp/projects01/ec29/bthj/kromosynth-cli/gRPC/
# Loop to create gRPC server instances
for ((i=1; i<=2; i++)); do
  # Generate a unique key using the loop index
  key="var_${i}"

  rm /fp/projects01/ec29/bthj/gRPC-hosts/grpc-evolution-runs_mfcc_pca-quantised_quality-instrumentation_parents-max-1_classDims.jsonc-host-$i
  apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node index.js --max-old-space-size=8192 --modelUrl file:///fp/projects01/ec29/bthj/tfjs-model_yamnet_tfjs_1/model.json --processTitle kromosynth-gRPC-evaluation --hostInfoFilePath /fp/projects01/ec29/bthj/gRPC-hosts/grpc-evolution-runs_mfcc_pca-quantised_quality-instrumentation_parents-max-1_classDims.jsonc-host-$i &

  # Assign a value to the associative array using the unique key
  pids[$key]="$!"
done

cd /fp/projects01/ec29/bthj/kromosynth-render/render-socket/
# Loop to create genome rendering server instances
for ((i=1; i<=4; i++)); do
  # Generate a unique key using the loop index
  key="render_${i}"

  rm /fp/projects01/ec29/bthj/gRPC-hosts/rendering-socket-evolution-runs_mfcc_pca-quantised_quality-instrumentation_parents-max-1_classDims.jsonc-host-$i
  apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node socket-server-floating-points.js --max-old-space-size=8192 --processTitle kromosynth-render-socket-server --hostInfoFilePath /fp/projects01/ec29/bthj/gRPC-hosts/rendering-socket-evolution-runs_mfcc_pca-quantised_quality-instrumentation_parents-max-1_classDims.jsonc-host-$i &

  # Assign a value to the associative array using the unique key
  pids[$key]="$!"
done


# cd not necessary here as the following uses absolute paths
cd /fp/projects01/ec29/bthj/kromosynth-evaluate/ 

# Loop to create evaluation-socket-server-features server instances
for ((i=1; i<=4; i++)); do
  # Generate a unique key using the loop index
  key="features_${i}"

  rm /fp/projects01/ec29/bthj/gRPC-hosts/evaluation-feature-socket-evolution-runs_mfcc_pca-quantised_quality-instrumentation_parents-max-1_classDims.jsonc-host-$i
  apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' --env PYTHONPATH=:/fp/projects01/ec29/bthj/kromosynth-evaluate /fp/projects01/ec29/bthj/kromosynth-runner-python-CPU.sif python /fp/projects01/ec29/bthj/kromosynth-evaluate/evaluation/unsupervised/features.py --host-info-file /fp/projects01/ec29/bthj/gRPC-hosts/evaluation-feature-socket-evolution-runs_mfcc_pca-quantised_quality-instrumentation_parents-max-1_classDims.jsonc-host-$i &

  # Assign a value to the associative array using the unique key
  pids[$key]="$!"
done

# Loop to create evaluation-socket-server-quality server instances
for ((i=1; i<=16; i++)); do
  # Generate a unique key using the loop index
  key="features_${i}"

  rm /fp/projects01/ec29/bthj/gRPC-hosts/evaluation-quality-socket-evolution-runs_mfcc_pca-quantised_quality-instrumentation_parents-max-1_classDims.jsonc-host-$i
  apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' --env PYTHONPATH=:/fp/projects01/ec29/bthj/kromosynth-evaluate /fp/projects01/ec29/bthj/kromosynth-runner-python-CPU.sif python /fp/projects01/ec29/bthj/kromosynth-evaluate/evaluation/unsupervised/quality_instrumentation.py --sample-rate 16000 --quality-methods 'nsynth_instrument_topscore' --models-path '/fp/projects01/ec29/bthj/kromosynth-evaluate/measurements/models' --host-info-file /fp/projects01/ec29/bthj/gRPC-hosts/evaluation-quality-socket-evolution-runs_mfcc_pca-quantised_quality-instrumentation_parents-max-1_classDims.jsonc-host-$i &

  # Assign a value to the associative array using the unique key
  pids[$key]="$!"
done

# Loop to create evaluation-socket-server-projection server instances
for ((i=1; i<=4; i++)); do
  # Generate a unique key using the loop index
  key="features_${i}"

  rm /fp/projects01/ec29/bthj/gRPC-hosts/evaluation-projection-socket-evolution-runs_mfcc_pca-quantised_quality-instrumentation_parents-max-1_classDims.jsonc-host-$i
  apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' --env PYTHONPATH=:/fp/projects01/ec29/bthj/kromosynth-evaluate /fp/projects01/ec29/bthj/kromosynth-runner-python-CPU.sif python /fp/projects01/ec29/bthj/kromosynth-evaluate/evaluation/unsupervised/projection_pca_quantised.py --dimensions 2 --dimension-cells 50 --host-info-file /fp/projects01/ec29/bthj/gRPC-hosts/evaluation-projection-socket-evolution-runs_mfcc_pca-quantised_quality-instrumentation_parents-max-1_classDims.jsonc-host-$i  &

  # Assign a value to the associative array using the unique key
  pids[$key]="$!"
done


cd /fp/projects01/ec29/bthj/kromosynth-cli/cli-app/
apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node kromosynth.js evolution-runs --evolution-runs-config-json-file /fp/projects01/ec29/bthj/QD/unsupervised/runsconf/instrumentation/evolution-runs_mfcc_pca-quantised_quality-instrumentation_parents-max-1_classDims.jsonc --max-old-space-size=8192 &

wait

# Access the pids stored in the associative array
for key in "${!pids[@]}"; do
  echo "Key: $key"
  echo "Value: ${pids[$key]}"
  kill -9 ${pids[$key]}
done

