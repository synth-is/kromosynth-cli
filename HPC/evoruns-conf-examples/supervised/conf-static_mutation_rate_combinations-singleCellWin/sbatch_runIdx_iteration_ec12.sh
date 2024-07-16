#!/bin/bash

command="/fp/projects01/ec29/bthj/QD/conf-static_mutation_rate_combinations-singleCellWin/sbatch_runIdx.sh"
iteration=0
project="ec12"
partition="accel"

# Loop calling the batch submission script with parameters
for ((index=11; index<=15; index++))
do
    # Execute the script with the current index
    $command $index $iteration $project $partition
done
