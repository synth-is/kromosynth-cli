#!/bin/bash

apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' --mount 'type=bind,source=/cluster/work/projects/ec29/bthj,destination=/cluster/work/projects/ec29/bthj' --env PYTHONPATH=$PYTHONPATH:/fp/projects01/ec29/bthj/kromosynth-evaluate /fp/projects01/ec29/bthj/kromosynth-runner-python-CPU_2024-11.sif python -u /fp/projects01/ec29/bthj/kromosynth-cli/analysis/commands/setup_analysis_fox.py \
    /fp/projects01/ec29/bthj/QD/unsupervised/runsconf/singleMapBDs \
    /fp/projects01/ec29/bthj/QD/analysis/unsupervised/singleMapBDs \
    coverage \
    --step-size 100 \
    --data-path "coverage" \
    --ylabel "Coverage" \
    --terrain-name "customRef1" \
    --plotting-script /fp/projects01/ec29/bthj/kromosynth-cli/analysis/generic_plotter.py \
    --skip-if-exists \
    # --skip-analysis \
    # --terrain-name ALL

