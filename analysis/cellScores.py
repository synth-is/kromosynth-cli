import sys
import plotUtil
import json
import matplotlib.pyplot as plt
import numpy as np

json_file_path = sys.argv[1]
x_multiplier = int(sys.argv[2])  # Set this value as the step size in the JSON file name
title = "cellScores_" + json_file_path.split('/')[4]
# read save directory path from argument 3 if it exists, otherwise use default of './'
if len(sys.argv) > 3:
    save_dir = sys.argv[3]
else:
    save_dir = './'

# read save directory path from argument 3

data = plotUtil.read_data_from_json(json_file_path)

oneEvorun = data['evoRuns'][1]

cellScoresMeans = oneEvorun['aggregates']['cellScores']['means']
label = oneEvorun['label'][9:]



# # Plot a heatmap of the cellScores 2D array with a colorbar, with the y axis inverted
plt.imshow(cellScoresMeans, cmap='hot', interpolation='nearest', aspect='auto')
plt.gca().invert_yaxis()
plt.colorbar()

plt.title('Cell scores (' + label + ')' )
plt.xlabel('Cell index')
plt.ylabel('Iteration')

# multiply the yticks by the x_multiplier
# Define the constant by which the y-values need to be multiplied
constant = x_multiplier
# Get the current y-axis tick positions
yticks = plt.yticks()[0]
# Scale the y-values by the constant and format as integers
yticklabels = [int(ytick * constant) for ytick in yticks]
# Set the scaled y-axis tick positions and labels
plt.yticks(yticks, yticklabels)
# Set the y-axis limits without vertical padding
plt.ylim(yticks[1], yticks[-2])


plt.subplots_adjust(left=0.15, bottom=0.1, right=0.99, top=0.95, wspace=0.2, hspace=0.2)
# https://github.com/jbmouret/matplotlib_for_papers#setting-the-limits-and-the-ticks
# params = {
#    'axes.labelsize': 8,
#    'font.size': 8,
#    'legend.fontsize': 10,
#    'xtick.labelsize': 10,
#    'ytick.labelsize': 10,
#    'text.usetex': False,
# #    'figure.figsize': [4.5, 4.5]
#    }
# plt.rcParams.update(params)

# Save the plot
# plt.savefig(save_dir + title + '.png')
plt.savefig(save_dir + title + '.pdf')