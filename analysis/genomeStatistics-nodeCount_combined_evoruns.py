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

################ node type counts ################

def plot_bar_chart(legend_texts, node_type_counts, node_type_counts_std_devs, xtick_rotation, left, bottom, right, top, width, height, plot_title, xlabel, ylabel, filename_suffix):
    n_bars = len(legend_texts)
    # cut off the 'Node' suffix from the group labels
    groups = list(set().union(*[obj.keys() for obj in node_type_counts]))
    n_groups = len(groups)

    values = np.zeros((n_bars, n_groups))
    std_dev = np.zeros((n_bars, n_groups))

    for i in range(n_bars):
        values[i, :] = [node_type_counts[i].get(attribute, 0) for attribute in groups]
        std_dev[i, :] = [node_type_counts_std_devs[i].get(attribute, 0) for attribute in groups]

    fig, ax = plt.subplots(figsize=(width, height))

    bar_width = 0.85
    index = np.arange(n_groups)

    patterns = ["/", ".", "x", "-", "+"]

    for i in range(n_bars):
        ax.bar(index + i * bar_width / n_bars, values[i], bar_width / n_bars, yerr=std_dev[i],
               label=legend_texts[i],
               align="edge",
               hatch=patterns[i], edgecolor='black', linewidth=1)

    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.set_title(plot_title)
    ax.set_xticks(index + (bar_width / 2), minor=False)
    # cut off the 'Node' suffix from the group labels, if it exists
    groups = [group[:-4] if group.endswith('Node') else group for group in groups]
    ax.set_xticklabels(groups, rotation=xtick_rotation, minor=False)
    ax.tick_params(axis='x', which='major', pad=5) # adjust the position of the labels
    ax.legend()

    # plt.tight_layout() # Automatically adjusts subplot parameters to fit the plot elements nicely

    # fig.subplots_adjust(bottom=0.3) # adjust the bottom margin
    plt.subplots_adjust(left=left, bottom=bottom, right=right, top=top, wspace=0.1, hspace=0.1)

    # plt.tight_layout()
    plt.savefig(save_dir + title + filename_suffix + '.pdf')


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

plot_bar_chart(legend_texts, node_type_counts, node_type_counts_std_devs, 5, 0.08, 0.13, 0.99, 0.93, 7, 4, 'CPPN Node Type Counts', 'Activation Functions', 'Node Counts', '_node_type_count_CPPN')

plt.clf()

# legend_texts = []
# node_type_counts = []
# node_type_counts_std_devs = []
# for oneEvorun in data['evoRuns']:
#     asNEATPatchNodeTypeCounts = oneEvorun['aggregates']['genomeStatistics']['asNEATPatchNodeTypeCounts']
#     asNEATPatchNodeTypeCountsStdDevs = oneEvorun['aggregates']['genomeStatistics']['asNEATPatchNodeTypeCountsStdDevs']
    
#     node_type_counts.append(asNEATPatchNodeTypeCounts)
#     node_type_counts_std_devs.append(asNEATPatchNodeTypeCountsStdDevs)
#     legend_texts.append(oneEvorun['label'][9:])
    
    
# plot_bar_chart(legend_texts, node_type_counts, node_type_counts_std_devs, 70, 0.06, 0.32, 0.99, 0.93, 9, 5, 'Audio Graph Node Type Counts', 'DSP Nodes', 'Node Counts', '_node_type_count_asNEATPatch')
