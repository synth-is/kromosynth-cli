import sys
import plotUtil
import json
import matplotlib.pyplot as plt
import numpy as np

json_file_path = sys.argv[1]
x_multiplier = int(sys.argv[2])  # Set this value as the step size in the JSON file name
title = "genomeSets_" + json_file_path.split('/')[4]
# read save directory path from argument 3 if it exists, otherwise use default of './'
if len(sys.argv) > 3:
    save_dir = sys.argv[3]
else:
    save_dir = './'

data = plotUtil.read_data_from_json(json_file_path)

# Plot the *aggregate* of genome counts, additions and removals, across all evoruns.

genomeCountsMeans = np.array(data['evoRuns'][0]['aggregates']['genomeSets']['genomeCounts']['means'])
genomeCountsStdDevs = np.array(data['evoRuns'][0]['aggregates']['genomeSets']['genomeCounts']['stdDevs'])
genomeSetsAdditionsMeans = np.array(data['evoRuns'][0]['aggregates']['genomeSets']['genomeSetsAdditions']['means'])
genomeSetsAdditionsStdDevs = np.array(data['evoRuns'][0]['aggregates']['genomeSets']['genomeSetsAdditions']['stdDevs'])
genomeSetsRemovalsMeans = np.array(data['evoRuns'][0]['aggregates']['genomeSets']['genomeSetsRemovals']['means'])
genomeSetsRemovalsStdDevs = np.array(data['evoRuns'][0]['aggregates']['genomeSets']['genomeSetsRemovals']['stdDevs'])

# Plot the three arrays in one plot with confidence intervals
plt.plot(np.arange(len(genomeCountsMeans)) * x_multiplier, genomeCountsMeans, label='Genomes')
plt.fill_between(np.arange(len(genomeCountsMeans)) * x_multiplier, genomeCountsMeans - genomeCountsStdDevs, genomeCountsMeans + genomeCountsStdDevs, alpha=0.2)
plt.plot(np.arange(len(genomeSetsAdditionsMeans)) * x_multiplier, genomeSetsAdditionsMeans, label='Additions')
plt.fill_between(np.arange(len(genomeSetsAdditionsMeans)) * x_multiplier, genomeSetsAdditionsMeans - genomeSetsAdditionsStdDevs, genomeSetsAdditionsMeans + genomeSetsAdditionsStdDevs, alpha=0.2)
plt.plot(np.arange(len(genomeSetsRemovalsMeans)) * x_multiplier, genomeSetsRemovalsMeans, label='Removals')
plt.fill_between(np.arange(len(genomeSetsRemovalsMeans)) * x_multiplier, genomeSetsRemovalsMeans - genomeSetsRemovalsStdDevs, genomeSetsRemovalsMeans + genomeSetsRemovalsStdDevs, alpha=0.2)
plt.xlabel('Iteration')
plt.ylabel('Genome count')
plt.title('Genome sets')
plt.legend()

# Save the plot
plt.savefig(save_dir + title + '.png')
plt.savefig(save_dir + title + '.pdf')