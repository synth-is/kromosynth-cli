import sys
import plotUtil
import matplotlib.pyplot as plt
import numpy as np
from cycler import cycler
from palettable.colorbrewer.qualitative import Set1_8 # Set1_4
colors = Set1_8.mpl_colors

json_file_path = sys.argv[1]
x_multiplier = int(sys.argv[2])  # Set this value as the step size in the JSON file name
title = "genomeStatistics" # + json_file_path.split('/')[4]
# read save directory path from argument 3 if it exists, otherwise use default of './'
if len(sys.argv) > 3:
    save_dir = sys.argv[3]
else:
    save_dir = './'

data = plotUtil.read_data_from_json(json_file_path)

plt.clf()

maxIterations = 50 # divided by x_multiplier

# https://github.com/jbmouret/matplotlib_for_papers#setting-the-limits-and-the-ticks
params = {
   'axes.labelsize': 10,
   'font.size': 8,
   'legend.fontsize': 10,
   'xtick.labelsize': 10,
   'ytick.labelsize': 10,
   'text.usetex': False,
   'figure.figsize': [7, 1] # instead of 4.5, 4.5
   }
plt.rcParams.update(params)

plt.subplots_adjust(left=0.1, bottom=0.1, right=0.99, top=0.95, wspace=0.2, hspace=0.2)

legend_lines = []
for oneEvorun in data['evoRuns']:
    cppnNodeCountsMeans = np.array(oneEvorun['aggregates']['genomeStatistics']['averageCppnNodeCounts']['means'])[:maxIterations]
    cppnNodeCountsStdDevs = np.array(oneEvorun['aggregates']['genomeStatistics']['averageCppnNodeCounts']['stdDevs'])[:maxIterations]

    x_values = np.arange(len(cppnNodeCountsMeans)) * x_multiplier

    linestyle_cycler = cycler('color', colors[:4]) + cycler('linestyle',['-','--',':','-.'])
    # for base run vs single class:
    # linestyle_cycler = cycler('color', colors[:2]) + cycler('linestyle',['-','--'])
    plt.rc('axes', prop_cycle=linestyle_cycler)

    # https://stackoverflow.com/a/61369662/169858
    line, = plt.plot(x_values, cppnNodeCountsMeans) # , linewidth=2
    fill = plt.fill_between(x_values, cppnNodeCountsMeans - cppnNodeCountsStdDevs, cppnNodeCountsMeans + cppnNodeCountsStdDevs, alpha=0.2)

    legend_lines.append((line, fill))

plt.legend(legend_lines, [oneEvorun['label'][9:] for oneEvorun in data['evoRuns']], title='CPPN node counts', loc='lower right') # loc='upper left'
plt.xlabel('Iteration')
plt.ylabel('CPPN node count')
plt.title('CPPN node count')
# Save the plot
# plt.savefig(save_dir + title + '_CPPN_node_count' + '.png')



plt.savefig(save_dir + title + '_CPPN_node_count' + '.pdf')

plt.clf()

legend_lines = []
for oneEvorun in data['evoRuns']:
    cppnConnectionCountsMeans = np.array(oneEvorun['aggregates']['genomeStatistics']['averageCppnConnectionCounts']['means'])[:maxIterations]
    cppnConnectionCountsStdDevs = np.array(oneEvorun['aggregates']['genomeStatistics']['averageCppnConnectionCounts']['stdDevs'])[:maxIterations]

    x_values = np.arange(len(cppnConnectionCountsMeans)) * x_multiplier

    linestyle_cycler = cycler('color', colors[:4]) + cycler('linestyle',['-','--',':','-.'])
    # for base run vs single class:
    # linestyle_cycler = cycler('color', colors[:2]) + cycler('linestyle',['-','--'])
    plt.rc('axes', prop_cycle=linestyle_cycler)

    # https://stackoverflow.com/a/61369662/169858
    line, = plt.plot(x_values, cppnConnectionCountsMeans) # , linewidth=2
    fill = plt.fill_between(x_values, cppnConnectionCountsMeans - cppnConnectionCountsStdDevs, cppnConnectionCountsMeans + cppnConnectionCountsStdDevs, alpha=0.2)

    legend_lines.append((line, fill))

plt.legend(legend_lines, [oneEvorun['label'][9:] for oneEvorun in data['evoRuns']], title='CPPN connection counts', loc='lower right') # loc='upper left'
plt.xlabel('Iteration')
plt.ylabel('CPPN connection count')
plt.title('CPPN connection count')
# Save the plot
# plt.savefig(save_dir + title + '_CPPN_connection_count' + '.png')
plt.savefig(save_dir + title + '_CPPN_connection_count' + '.pdf')

plt.clf()

legend_lines = []
for oneEvorun in data['evoRuns']:
    asNEATPatchNodeCountsMeans = np.array(oneEvorun['aggregates']['genomeStatistics']['averageAsNEATPatchNodeCounts']['means'])[:maxIterations]
    asNEATPatchNodeCountsStdDevs = np.array(oneEvorun['aggregates']['genomeStatistics']['averageAsNEATPatchNodeCounts']['stdDevs'])[:maxIterations]

    x_values = np.arange(len(asNEATPatchNodeCountsMeans)) * x_multiplier

    linestyle_cycler = cycler('color', colors[4:]) + cycler('linestyle',['-','--',':','-.'])
    # for base run vs single class:
    # linestyle_cycler = cycler('color', colors[2:]) + cycler('linestyle',['-','--'])
    plt.rc('axes', prop_cycle=linestyle_cycler)

    # https://stackoverflow.com/a/61369662/169858
    line, = plt.plot(x_values, asNEATPatchNodeCountsMeans) #, linewidth=2
    fill = plt.fill_between(x_values, asNEATPatchNodeCountsMeans - asNEATPatchNodeCountsStdDevs, asNEATPatchNodeCountsMeans + asNEATPatchNodeCountsStdDevs, alpha=0.2)

    legend_lines.append((line, fill))

plt.legend(legend_lines, [oneEvorun['label'][9:] for oneEvorun in data['evoRuns']], title='Audio graph node counts', loc='lower right') # loc='upper left'
plt.xlabel('Iteration')
plt.ylabel('audio graph node count')
plt.title('audio graph node count')
# Save the plot
# plt.savefig(save_dir + title + '_audio_graph_node_count' + '.png')
plt.savefig(save_dir + title + '_audio_graph_node_count' + '.pdf')

plt.clf()

legend_lines = []
for oneEvorun in data['evoRuns']:
    asNEATPatchConnectionCountsMeans = np.array(oneEvorun['aggregates']['genomeStatistics']['averageAsNEATPatchConnectionCounts']['means'])[:maxIterations]
    asNEATPatchConnectionCountsStdDevs = np.array(oneEvorun['aggregates']['genomeStatistics']['averageAsNEATPatchConnectionCounts']['stdDevs'])[:maxIterations]

    x_values = np.arange(len(asNEATPatchConnectionCountsMeans)) * x_multiplier

    linestyle_cycler = cycler('color', colors[4:]) + cycler('linestyle',['-','--',':','-.'])
    # for base run vs single class:
    # linestyle_cycler = cycler('color', colors[2:]) + cycler('linestyle',['-','--'])
    plt.rc('axes', prop_cycle=linestyle_cycler)

    # https://stackoverflow.com/a/61369662/169858
    line, = plt.plot(x_values, asNEATPatchConnectionCountsMeans) # , linewidth=2
    fill = plt.fill_between(x_values, asNEATPatchConnectionCountsMeans - asNEATPatchConnectionCountsStdDevs, asNEATPatchConnectionCountsMeans + asNEATPatchConnectionCountsStdDevs, alpha=0.2)

    legend_lines.append((line, fill))



plt.legend(legend_lines, [oneEvorun['label'][9:] for oneEvorun in data['evoRuns']], title='Audio graph connection counts', loc='lower right') # loc='upper left'
plt.xlabel('Iteration')
plt.ylabel('audio graph connection count')
plt.title('audio graph connection count')
# Save the plot
# plt.savefig(save_dir + title + '_audio_graph_connection_count' + '.png')
plt.savefig(save_dir + title + '_audio_graph_connection_count' + '.pdf')

plt.clf()


################ node type counts ################

# https://github.com/jbmouret/matplotlib_for_papers#setting-the-limits-and-the-ticks
params = {
   'axes.labelsize': 10,
   'font.size': 8,
   'legend.fontsize': 10,
   'xtick.labelsize': 10,
   'ytick.labelsize': 10,
   'text.usetex': False,
   'figure.figsize': [7, 1] # instead of 4.5, 4.5
   }
plt.rcParams.update(params)

plt.subplots_adjust(left=0.1, bottom=0.1, right=0.99, top=0.95, wspace=0.2, hspace=0.2)


legend_texts = []
node_type_counts = []
node_type_counts_std_devs = []
for oneEvorun in data['evoRuns']:
    cppnNodeTypeCounts = oneEvorun['aggregates']['genomeStatistics']['cppnNodeTypeCounts']
    cppnNodeTypeCountsStdDevs = oneEvorun['aggregates']['genomeStatistics']['cppnNodeTypeCountsStdDevs']
    
    node_type_counts.append(cppnNodeTypeCounts)
    node_type_counts_std_devs.append(cppnNodeTypeCountsStdDevs)
    legend_texts.append(oneEvorun['label'][9:])
    
    # asNEATPatchNodeTypeCounts = oneEvorun['aggregates']['genomeStatistics']['asNEATPatchNodeTypeCounts']
    # asNEATPatchNodeTypeCountsStdDevs = oneEvorun['aggregates']['genomeStatistics']['asNEATPatchNodeTypeCountsStdDevs']


n_bars = len(legend_texts)
groups = list(set().union(*[obj.keys() for obj in node_type_counts]))
n_groups = len(groups)

values = np.zeros((n_bars, n_groups))
std_dev = np.zeros((n_bars, n_groups))

for i in range(n_bars):
    values[i, :] = [node_type_counts[i].get(attribute, 0) for attribute in groups]
    std_dev[i, :] = [node_type_counts_std_devs[i].get(attribute, 0) for attribute in groups]

fig, ax = plt.subplots()

bar_width = 0.35
index = np.arange(n_groups)

for i in range(n_bars):
    ax.bar(index + i * bar_width / n_bars, values[i], bar_width / n_bars, yerr=std_dev[i],
           label=legend_texts[i])

ax.set_xlabel('Groups')
ax.set_ylabel('Values')
ax.set_title('Grouped Bar Chart with Standard Deviation')
ax.set_xticks(index)
ax.set_xticklabels(groups)
ax.legend()

plt.tight_layout() # Automatically adjusts subplot parameters to fit the plot elements nicely

plt.savefig(save_dir + title + '_node_type_count_CPPN' + '.pdf')