import sys
import plotUtil
import matplotlib.pyplot as plt
import numpy as np
from scipy.stats import norm

json_file_path = sys.argv[1]
x_multiplier = int(sys.argv[2])  # Set this value as the step size in the JSON file name
title = "genomeStatistics_" + json_file_path.split('/')[4]
# read save directory path from argument 3 if it exists, otherwise use default of './'
if len(sys.argv) > 3:
    save_dir = sys.argv[3]
else:
    save_dir = './'

data = plotUtil.read_data_from_json(json_file_path)

plt.clf()

legend_lines = []
for oneEvorun in data['evoRuns']:
    cppnNodeCountsMeans = np.array(oneEvorun['aggregates']['genomeStatistics']['averageCppnNodeCounts']['means'])
    cppnNodeCountsStdDevs = np.array(oneEvorun['aggregates']['genomeStatistics']['averageCppnNodeCounts']['stdDevs'])

    x_values = np.arange(len(cppnNodeCountsMeans)) * x_multiplier

    # https://stackoverflow.com/a/61369662/169858
    line, = plt.plot(x_values, cppnNodeCountsMeans)
    fill = plt.fill_between(x_values, cppnNodeCountsMeans - cppnNodeCountsStdDevs, cppnNodeCountsMeans + cppnNodeCountsStdDevs, alpha=0.2)

    legend_lines.append((line, fill))

plt.legend(legend_lines, [oneEvorun['label'] for oneEvorun in data['evoRuns']], title='CPPN node counts') # loc='upper left'
plt.xlabel('Iteration')
plt.ylabel('CPPN node count')
plt.title('CPPN node count')
# Save the plot
plt.savefig(save_dir + title + '_CPPN_node_count' + '.png')
plt.savefig(save_dir + title + '_CPPN_node_count' + '.pdf')

plt.clf()

legend_lines = []
for oneEvorun in data['evoRuns']:
    cppnConnectionCountsMeans = np.array(oneEvorun['aggregates']['genomeStatistics']['averageCppnConnectionCounts']['means'])
    cppnConnectionCountsStdDevs = np.array(oneEvorun['aggregates']['genomeStatistics']['averageCppnConnectionCounts']['stdDevs'])

    x_values = np.arange(len(cppnConnectionCountsMeans)) * x_multiplier

    # https://stackoverflow.com/a/61369662/169858
    line, = plt.plot(x_values, cppnConnectionCountsMeans)
    fill = plt.fill_between(x_values, cppnConnectionCountsMeans - cppnConnectionCountsStdDevs, cppnConnectionCountsMeans + cppnConnectionCountsStdDevs, alpha=0.2)

    legend_lines.append((line, fill))

plt.legend(legend_lines, [oneEvorun['label'] for oneEvorun in data['evoRuns']], title='CPPN connection counts') # loc='upper left'
plt.xlabel('Iteration')
plt.ylabel('CPPN connection count')
plt.title('CPPN connection count')
# Save the plot
plt.savefig(save_dir + title + '_CPPN_connection_count' + '.png')
plt.savefig(save_dir + title + '_CPPN_connection_count' + '.pdf')

plt.clf()

legend_lines = []
for oneEvorun in data['evoRuns']:
    asNEATPatchNodeCountsMeans = np.array(oneEvorun['aggregates']['genomeStatistics']['averageAsNEATPatchNodeCounts']['means'])
    asNEATPatchNodeCountsStdDevs = np.array(oneEvorun['aggregates']['genomeStatistics']['averageAsNEATPatchNodeCounts']['stdDevs'])

    x_values = np.arange(len(asNEATPatchNodeCountsMeans)) * x_multiplier

    # https://stackoverflow.com/a/61369662/169858
    line, = plt.plot(x_values, asNEATPatchNodeCountsMeans)
    fill = plt.fill_between(x_values, asNEATPatchNodeCountsMeans - asNEATPatchNodeCountsStdDevs, asNEATPatchNodeCountsMeans + asNEATPatchNodeCountsStdDevs, alpha=0.2)

    legend_lines.append((line, fill))

plt.legend(legend_lines, [oneEvorun['label'] for oneEvorun in data['evoRuns']], title='Audio graph node counts') # loc='upper left'
plt.xlabel('Iteration')
plt.ylabel('audio graph node count')
plt.title('audio graph node count')
# Save the plot
plt.savefig(save_dir + title + '_audio_graph_node_count' + '.png')
plt.savefig(save_dir + title + '_audio_graph_node_count' + '.pdf')

plt.clf()

legend_lines = []
for oneEvorun in data['evoRuns']:
    asNEATPatchConnectionCountsMeans = np.array(oneEvorun['aggregates']['genomeStatistics']['averageAsNEATPatchConnectionCounts']['means'])
    asNEATPatchConnectionCountsStdDevs = np.array(oneEvorun['aggregates']['genomeStatistics']['averageAsNEATPatchConnectionCounts']['stdDevs'])

    x_values = np.arange(len(asNEATPatchConnectionCountsMeans)) * x_multiplier

    # https://stackoverflow.com/a/61369662/169858
    line, = plt.plot(x_values, asNEATPatchConnectionCountsMeans)
    fill = plt.fill_between(x_values, asNEATPatchConnectionCountsMeans - asNEATPatchConnectionCountsStdDevs, asNEATPatchConnectionCountsMeans + asNEATPatchConnectionCountsStdDevs, alpha=0.2)

    legend_lines.append((line, fill))

plt.legend(legend_lines, [oneEvorun['label'] for oneEvorun in data['evoRuns']], title='Audio graph connection counts') # loc='upper left'
plt.xlabel('Iteration')
plt.ylabel('audio graph connection count')
plt.title('audio graph connection count')
# Save the plot
plt.savefig(save_dir + title + '_audio_graph_connection_count' + '.png')
plt.savefig(save_dir + title + '_audio_graph_connection_count' + '.pdf')



# # Plot the **aggregate* of the average numbers of nodes and connections in the CPPN and DSP networks in the sound genomes, aggregated from multiple evoruns.

# # Get the array of objects from the attribute genomeStatistics in the JSON file at evoRuns[0].iterations[0].genomeStatistics
# genome_statistics = data['evoRuns'][0]['iterations'][0]['genomeStatistics']
# x = np.arange(len(genome_statistics))  # x-coordinates for each line

# cppnNodeCountsMeans = data['evoRuns'][0]['aggregates']['genomeStatistics']['averageCppnNodeCounts']['means']
# cppnNodeCountsStdDevs = np.array(data['evoRuns'][0]['aggregates']['genomeStatistics']['averageCppnNodeCounts']['stdDevs'], dtype=np.float64)
# cppnConnectionCountsMeans = data['evoRuns'][0]['aggregates']['genomeStatistics']['averageCppnConnectionCounts']['means']
# cppnConnectionCountsStdDevs = np.array(data['evoRuns'][0]['aggregates']['genomeStatistics']['averageCppnConnectionCounts']['stdDevs'], dtype=np.float64)
# asNEATPatchNodeCountsMeans = data['evoRuns'][0]['aggregates']['genomeStatistics']['averageAsNEATPatchNodeCounts']['means']
# asNEATPatchNodeCountsStdDevs = np.array(data['evoRuns'][0]['aggregates']['genomeStatistics']['averageAsNEATPatchNodeCounts']['stdDevs'], dtype=np.float64)
# asNEATPatchConnectionCountsMeans = data['evoRuns'][0]['aggregates']['genomeStatistics']['averageAsNEATPatchConnectionCounts']['means']
# asNEATPatchConnectionCountsStdDevs = np.array(data['evoRuns'][0]['aggregates']['genomeStatistics']['averageAsNEATPatchConnectionCounts']['stdDevs'], dtype=np.float64)

# # # Compute Z-score for a 95% confidence interval
# # z_score = norm.ppf(0.975)

# # # Compute Z-score for an 80% confidence interval
# # significance_level = 0.80
# # z_score = norm.ppf((1 + significance_level) / 2)

# significance_level = 0.05
# z_score = norm.ppf((1 + significance_level) / 2)

# # Plotting lines with confidence intervals
# plt.plot(x, cppnNodeCountsMeans, label="Average CPPN Node Count")
# plt.fill_between(x, np.subtract(cppnNodeCountsMeans, z_score * cppnNodeCountsStdDevs),
#                  np.add(cppnNodeCountsMeans, z_score * cppnNodeCountsStdDevs), alpha=0.3)
# plt.plot(x, cppnConnectionCountsMeans, label="Average CPPN Connection Count")
# plt.fill_between(x, np.subtract(cppnConnectionCountsMeans, z_score * cppnConnectionCountsStdDevs),
#                  np.add(cppnConnectionCountsMeans, z_score * cppnConnectionCountsStdDevs), alpha=0.3)
# plt.plot(x, asNEATPatchNodeCountsMeans, label="Average AsNEAT Patch Node Count")
# plt.fill_between(x, np.subtract(asNEATPatchNodeCountsMeans, z_score * asNEATPatchNodeCountsStdDevs),
#                  np.add(asNEATPatchNodeCountsMeans, z_score * asNEATPatchNodeCountsStdDevs), alpha=0.3)
# plt.plot(x, asNEATPatchConnectionCountsMeans, label="Average AsNEAT Patch Connection Count")
# plt.fill_between(x, np.subtract(asNEATPatchConnectionCountsMeans, z_score * asNEATPatchConnectionCountsStdDevs),
#                  np.add(asNEATPatchConnectionCountsMeans, z_score * asNEATPatchConnectionCountsStdDevs), alpha=0.3)

# # Customize the plot
# plt.xlabel("Data Points")
# plt.ylabel("Values")
# plt.title("Line Plot with 5% Significance Level")
# plt.legend()

# # Save the plot
# plt.savefig(save_dir + title + '.png')
# plt.savefig(save_dir + title + '.pdf')