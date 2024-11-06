#!/bin/bash

apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' --mount 'type=bind,source=/cluster/work/projects/ec29/bthj,destination=/cluster/work/projects/ec29/bthj' --env PYTHONPATH=$PYTHONPATH:/fp/projects01/ec29/bthj/kromosynth-evaluate /fp/projects01/ec29/bthj/kromosynth-runner-python-CPU_2024-11.sif python -u /fp/projects01/ec29/bthj/kromosynth-cli/analysis/commands/setup_analysis_fox.py \
    /fp/projects01/ec29/bthj/QD/unsupervised/runsconf/singleMapBDs \
    /fp/projects01/ec29/bthj/QD/analysis/unsupervised/singleMapBDs \
    goal-switches-through-lineages \
    --data-path "goalSwitchesThroughLineages" \
    --terrain-name "customRef1" \
    # --terrain-name ALL
    # --step-size 500