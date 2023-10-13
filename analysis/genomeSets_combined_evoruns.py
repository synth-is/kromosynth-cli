import sys
import plotUtil
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

legend_lines = []
for oneEvorun in data['evoRuns']:
    genomeCountsMeans = np.array(oneEvorun['aggregates']['genomeSets']['genomeCounts']['means'])
    genomeCountsStdDevs = np.array(oneEvorun['aggregates']['genomeSets']['genomeCounts']['stdDevs'])

    x_values = np.arange(len(genomeCountsMeans)) * x_multiplier

    # https://stackoverflow.com/a/61369662/169858
    line, = plt.plot(x_values, genomeCountsMeans)
    fill = plt.fill_between(x_values, genomeCountsMeans - genomeCountsStdDevs, genomeCountsMeans + genomeCountsStdDevs, alpha=0.2)

    legend_lines.append((line, fill))

plt.legend(legend_lines, [oneEvorun['label'] for oneEvorun in data['evoRuns']], title='Genome sets') # loc='upper left'

plt.xlabel('Iteration')
plt.ylabel('Genome count')

# plt.title('Genome sets')
# plt.legend()

# Save the plot
plt.savefig(save_dir + title + '.png')
plt.savefig(save_dir + title + '.pdf')