#!/bin/bash

command="/fp/projects01/ec29/bthj/QD/conf-static_mutation_rate_combinations-singleCellWin/sbatch_runIdx.sh"
iteration=0
project="ec29"
partition="ifi_accel"

# Loop calling the batch submission script with parameters
for ((index=0; index<=10; index++))
do
    # Execute the script with the current index
    $command $index $iteration $project $partition
done
