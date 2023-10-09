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

cellScoresMeans = data['evoRuns'][0]['aggregates']['cellScores']['means']

# # Plot a heatmap of the cellScores 2D array with a colorbar, with the y axis inverted
plt.imshow(cellScoresMeans, cmap='hot', interpolation='nearest', aspect='auto')
plt.gca().invert_yaxis()
plt.colorbar()

# Save the plot
plt.savefig(save_dir + title + '.png')
plt.savefig(save_dir + title + '.pdf')