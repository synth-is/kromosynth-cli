#!/bin/bash
set -e
set -u
set -x  # Enable debug mode

# Print all environment variables for debugging
env

# Initialize variables if they're not set
PYTHONPATH=${PYTHONPATH:-}

# Fallback for LOCALSCRATCH_DIR if SLURM_JOB_ID is not available
if [ -z "${SLURM_JOB_ID:-}" ]; then
    LOCALSCRATCH_DIR=${LOCALSCRATCH_DIR:-"/tmp/localscratch_$$"}
else
    LOCALSCRATCH_DIR=${LOCALSCRATCH_DIR:-"/localscratch/$SLURM_JOB_ID"}
fi

FILE_NAME=${FILE_NAME:-"default_file_name"}
VARIATION_SERVER_COUNT=${VARIATION_SERVER_COUNT:-2}
RENDERING_SERVER_COUNT=${RENDERING_SERVER_COUNT:-4}
FEATURES_SERVER_COUNT=${FEATURES_SERVER_COUNT:-4}
QUALITY_SERVER_COUNT=${QUALITY_SERVER_COUNT:-4}
PROJECTION_SERVER_COUNT=${PROJECTION_SERVER_COUNT:-4}
FEATURES_SCRIPT=${FEATURES_SCRIPT:-"/path/to/default/features_script.py"}
QUALITY_SCRIPT=${QUALITY_SCRIPT:-"/path/to/default/quality_script.py"}
PROJECTION_SCRIPT=${PROJECTION_SCRIPT:-"/path/to/default/projection_script.py"}
CONFIG_FILE_PATH=${CONFIG_FILE_PATH:-"/path/to/default/config.json"}

# Print the values of all variables
echo "PYTHONPATH: $PYTHONPATH"
echo "LOCALSCRATCH_DIR: $LOCALSCRATCH_DIR"
echo "FILE_NAME: $FILE_NAME"
echo "VARIATION_SERVER_COUNT: $VARIATION_SERVER_COUNT"
echo "RENDERING_SERVER_COUNT: $RENDERING_SERVER_COUNT"
echo "FEATURES_SERVER_COUNT: $FEATURES_SERVER_COUNT"
echo "QUALITY_SERVER_COUNT: $QUALITY_SERVER_COUNT"
echo "PROJECTION_SERVER_COUNT: $PROJECTION_SERVER_COUNT"
echo "FEATURES_SCRIPT: $FEATURES_SCRIPT"
echo "QUALITY_SCRIPT: $QUALITY_SCRIPT"
echo "PROJECTION_SCRIPT: $PROJECTION_SCRIPT"
echo "CONFIG_FILE_PATH: $CONFIG_FILE_PATH"

# Create LOCALSCRATCH_DIR if it doesn't exist
mkdir -p "$LOCALSCRATCH_DIR"

# Define function to copy files
copy_files() {
    local src_dir=$1
    local dest_dir=$2
    echo "Copying files from $src_dir to $dest_dir"
    mkdir -p "$dest_dir"
    cd "$src_dir"
    for file in *; do
        if [ -f "$file" ]; then
            echo "Copying file: $file"
            cp "$file" "$dest_dir/$file"
        fi
    done
}

## copy model files
echo "Copying model files..."
copy_files "/fp/projects01/ec29/bthj/kromosynth-evaluate/measurements/models" "$LOCALSCRATCH_DIR/models"
copy_files "/fp/projects01/ec29/bthj/tfjs-model_yamnet_tfjs_1" "$LOCALSCRATCH_DIR/tfjs-model_yamnet_tfjs_1"

# Use a normal array instead of an associative array
pids=()

echo "Starting gRPC server instances..."
cd /fp/projects01/ec29/bthj/kromosynth-cli/gRPC/
# Loop to create gRPC server instances
for ((i=1; i<=$VARIATION_SERVER_COUNT; i++)); do
  rm -f "/fp/projects01/ec29/bthj/gRPC-hosts/grpc-$FILE_NAME-host-$i"
  apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node index.js --max-old-space-size=8192 --modelUrl file:///fp/projects01/ec29/bthj/tfjs-model_yamnet_tfjs_1/model.json --processTitle kromosynth-gRPC-evaluation --hostInfoFilePath "/fp/projects01/ec29/bthj/gRPC-hosts/grpc-$FILE_NAME-host-$i" &
  pids+=($!)
done

echo "Starting genome rendering server instances..."
cd /fp/projects01/ec29/bthj/kromosynth-render/render-socket/
# Loop to create genome rendering server instances
for ((i=1; i<=$RENDERING_SERVER_COUNT; i++)); do
  rm -f "/fp/projects01/ec29/bthj/gRPC-hosts/rendering-socket-$FILE_NAME-host-$i"
  apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node socket-server-floating-points.js --max-old-space-size=8192 --processTitle kromosynth-render-socket-server --hostInfoFilePath "/fp/projects01/ec29/bthj/gRPC-hosts/rendering-socket-$FILE_NAME-host-$i" &
  pids+=($!)
done

cd /fp/projects01/ec29/bthj/kromosynth-evaluate/ 

echo "Starting evaluation-socket-server-features instances..."
# Loop to create evaluation-socket-server-features server instances
for ((i=1; i<=$FEATURES_SERVER_COUNT; i++)); do
  rm -f "/fp/projects01/ec29/bthj/gRPC-hosts/evaluation-feature-socket-$FILE_NAME-host-$i"
  echo "Starting feature server $i..."
  export PYTHONPATH="/fp/projects01/ec29/bthj/kromosynth-evaluate:$PYTHONPATH"
  apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' --env PYTHONPATH="/fp/projects01/ec29/bthj/kromosynth-evaluate:$PYTHONPATH" /fp/projects01/ec29/bthj/kromosynth-runner-python-CPU_2024-10.sif python -u "$FEATURES_SCRIPT" --host-info-file "/fp/projects01/ec29/bthj/gRPC-hosts/evaluation-feature-socket-$FILE_NAME-host-$i" &
  pids+=($!)
  echo "Feature server $i started with PID ${pids[-1]}"
done

echo "Starting evaluation-socket-server-quality instances..."
# Loop to create evaluation-socket-server-quality server instances
for ((i=1; i<=$QUALITY_SERVER_COUNT; i++)); do
  rm -f "/fp/projects01/ec29/bthj/gRPC-hosts/evaluation-quality-socket-$FILE_NAME-host-$i"
  echo "Starting quality server $i..."
  export PYTHONPATH="/fp/projects01/ec29/bthj/kromosynth-evaluate:$PYTHONPATH"
  apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' --env PYTHONPATH="/fp/projects01/ec29/bthj/kromosynth-evaluate:$PYTHONPATH" /fp/projects01/ec29/bthj/kromosynth-runner-python-CPU_2024-10.sif python -u "$QUALITY_SCRIPT" --models-path "$LOCALSCRATCH_DIR/models" --host-info-file "/fp/projects01/ec29/bthj/gRPC-hosts/evaluation-quality-socket-$FILE_NAME-host-$i" &
  pids+=($!)
  echo "Quality server $i started with PID ${pids[-1]}"
done

echo "Starting evaluation-socket-server-projection instances..."
# Loop to create evaluation-socket-server-projection server instances
for ((i=1; i<=$PROJECTION_SERVER_COUNT; i++)); do
  rm -f "/fp/projects01/ec29/bthj/gRPC-hosts/evaluation-projection-socket-$FILE_NAME-host-$i"
  echo "Starting projection server $i..."
  export PYTHONPATH="/fp/projects01/ec29/bthj/kromosynth-evaluate:$PYTHONPATH"
  apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' --env PYTHONPATH="/fp/projects01/ec29/bthj/kromosynth-evaluate:$PYTHONPATH" /fp/projects01/ec29/bthj/kromosynth-runner-python-CPU_2024-10.sif python -u "$PROJECTION_SCRIPT" --host-info-file "/fp/projects01/ec29/bthj/gRPC-hosts/evaluation-projection-socket-$FILE_NAME-host-$i" &
  pids+=($!)
  echo "Projection server $i started with PID ${pids[-1]}"
done

echo "Starting main process..."
cd /fp/projects01/ec29/bthj/kromosynth-cli/cli-app/
apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node kromosynth.js evolution-runs --evolution-runs-config-json-file "$CONFIG_FILE_PATH" --max-old-space-size=8192 &
pids+=($!)

echo "Waiting for all processes to complete..."
wait

echo "Killing all background processes..."
# Kill all background processes
for pid in "${pids[@]}"; do
  echo "Killing process: $pid"
  kill -9 $pid 2>/dev/null || true
done

echo "Job completed at $(date)"