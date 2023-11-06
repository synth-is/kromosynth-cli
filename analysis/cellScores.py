import sys
import plotUtil
import json
import matplotlib.pyplot as plt
from matplotlib.colors import LogNorm, Normalize
import matplotlib.ticker as ticker
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

maxIterations = 11 # divided by x_multiplier

# cellScoresMeans = np.array(oneEvorun['aggregates']['cellScores']['means'])
cellScoresMeans = oneEvorun['aggregates']['cellScores']['means'][:maxIterations]
label = oneEvorun['label'][9:]

# https://github.com/jbmouret/matplotlib_for_papers#setting-the-limits-and-the-ticks
params = {
   'axes.labelsize': 8,
   'font.size': 8,
   'legend.fontsize': 5,
   'xtick.labelsize': 8,
   'ytick.labelsize': 8,
   'text.usetex': False,
#    'figure.figsize': [7, 2], # instead of 4.5, 4.5
   'figure.constrained_layout.use': True
   }
plt.rcParams.update(params)

cm = 1/2.54  # centimeters in inches
plt.figure(figsize=(6*cm, 3*cm))
# plt.figure(figsize=(12*cm, 3*cm))

# # Plot a heatmap of the cellScores 2D array with a colorbar, with the y axis inverted
plt.imshow(cellScoresMeans, cmap='coolwarm', interpolation='nearest', aspect='auto',
            # norm=LogNorm(vmin=cellScoresMeans.min(), vmax=cellScoresMeans.max())
            )
plt.gca().invert_yaxis()
plt.colorbar(label='Cell Score') #  / Confidence

# plt.title('Cell scores (' + label + ')' )
plt.xlabel('Cell index')
plt.ylabel('Iteration')

# multiply the yticks by the x_multiplier
# Define the constant by which the y-values need to be multiplied
constant = x_multiplier
# Get the current y-axis tick positions
yticks = plt.yticks()[0]
# Scale the y-values by the constant and format as integers
# yticklabels = [int(ytick * constant) for ytick in yticks]
yticklabels = [str(int(ytick))+"K" for ytick in yticks]
# Set the scaled y-axis tick positions and labels
plt.yticks(yticks, yticklabels)
# Set the y-axis limits without vertical padding
plt.ylim(yticks[1], yticks[-2])

# plt.subplots_adjust(left=0.12, bottom=0.2, right=1, top=0.9, wspace=0.2, hspace=0.2)

# Set y-ticks to a logarithmic base of 10 with a spacing of 1 unit
# plt.yscale('log')
# plt.gca().yaxis.set_major_locator(ticker.LogLocator(base=2, numticks=10))

# Save the plot
# plt.savefig(save_dir + title + '.png')
plt.savefig(save_dir + title + '.pdf')