import sys
import plotUtil
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap

# https://github.com/jbmouret/matplotlib_for_papers#setting-the-limits-and-the-ticks
params = {
    'axes.labelsize': 18,
    'font.size': 15,
    'legend.fontsize': 15,
    'xtick.labelsize': 18,
    'ytick.labelsize': 18,
    'text.usetex': False,
    'figure.constrained_layout.use': True
}
plt.rcParams.update(params)

# Define some custom colormaps
def create_custom_blue_yellow():
    # From dark blue to yellow
    colors = [(0, 0, 0.5),      # Dark blue
              (0.1, 0.1, 1),    # Blue
              (1, 1, 1),        # White
              (1, 1, 0)]        # Yellow
    return LinearSegmentedColormap.from_list('custom_blue_yellow', colors)

def create_custom_purple_green():
    # From purple to green
    colors = [(0.5, 0, 0.5),    # Purple
              (1, 1, 1),        # White
              (0, 0.8, 0)]      # Green
    return LinearSegmentedColormap.from_list('custom_purple_green', colors)

# Dictionary of available colormaps
AVAILABLE_COLORMAPS = {
    'blue-yellow': create_custom_blue_yellow(),
    'purple-green': create_custom_purple_green(),
    'viridis': 'viridis',
    'plasma': 'plasma',
    'coolwarm': 'coolwarm',
    'RdYlBu': 'RdYlBu'
}

cm = 1/2.54  # centimeters in inches

plt.figure(figsize=(40*cm, 30*cm))

json_file_path = sys.argv[1]
title = "scoreMatrix_" + json_file_path.split('/')[4]

if len(sys.argv) > 3:
     save_dir = sys.argv[3]
else:
     save_dir = './'

hide_zeros = True
constant_color = None
colormap_name = 'blue-yellow'  # default colormap

# Parse arguments
if len(sys.argv) > 4:
    arg = sys.argv[4].lower()
    if arg == 'true' or arg == 'false':
        hide_zeros = (arg == 'true')
    elif arg in AVAILABLE_COLORMAPS:
        colormap_name = arg
    else:
        constant_color = sys.argv[4]

if len(sys.argv) > 5:
    arg = sys.argv[5].lower()
    if arg in AVAILABLE_COLORMAPS:
        colormap_name = arg

print(f'Hide zeros: {hide_zeros}')
print(f'Constant color: {constant_color}')
print(f'Using colormap: {colormap_name}')

data = plotUtil.read_data_from_json(json_file_path)

for iteration in data['evoRuns'][0]['iterations']:
    scoreMatrix = iteration['scoreMatrix']
    iteration_id = iteration['id']
    
    if isinstance(scoreMatrix, list):
        scoreMatrix = {'oneMap': scoreMatrix}
    for oneMap in scoreMatrix:
        print('Plotting ' + oneMap + ' for iteration ' + str(iteration_id))

        matrix = np.array(scoreMatrix[oneMap])
        matrix = np.array([[0 if x is None else x for x in row] for row in matrix], dtype=float)

        if constant_color:
            plt.imshow(np.ones_like(matrix), cmap='gray', interpolation='nearest', aspect='auto')
            plt.gca().invert_yaxis()
            for (i, j), val in np.ndenumerate(matrix):
                if val != 0:
                    plt.scatter(j, i, color=constant_color, s=10)
        else:
            cmap = AVAILABLE_COLORMAPS[colormap_name]
            if hide_zeros:
                masked_matrix = np.ma.masked_where(matrix == 0, matrix)
                plt.imshow(np.zeros_like(matrix), cmap='gray', alpha=0)
                im = plt.imshow(masked_matrix, cmap=cmap, interpolation='nearest', 
                              aspect='auto', vmin=0, vmax=1)
            else:
                im = plt.imshow(matrix, cmap=cmap, interpolation='nearest', 
                              aspect='auto', vmin=0, vmax=1)
            
            plt.gca().invert_yaxis()
            plt.colorbar(im, label='Score')

        # if 'X' in oneMap:
        #     labels = oneMap.split('X')
        #     plt.xlabel(labels[0])
        #     plt.ylabel(labels[1])
        # else:
        #     plt.xlabel('Cell index')
        #     plt.ylabel('Cell index')
        plt.xlabel('spectral slope')
        plt.ylabel('spectral rolloff')

        if 'coveragePercentage' in iteration and oneMap in iteration['coveragePercentage']:
            coverage = iteration['coveragePercentage'][oneMap]
            # Modify the oneMap string for the title
            title_oneMap = oneMap.replace("refSingleEmb_mfcc-sans0-statistics_", "").replace("_retrainIncr50_zScoreNSynthTrain", "")
            plt.title(f"{title_oneMap}\nCoverage: {coverage}%")

        filename = f"{save_dir}{oneMap}_iteration_{iteration_id}"
        print('Saving figure to ' + filename + '.ext')

        if hide_zeros:
            plt.savefig(filename + '.pdf', transparent=True, bbox_inches='tight')
        else:
            plt.savefig(filename + '.pdf')

        plt.clf()