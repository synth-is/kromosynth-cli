import sys
import plotUtil
import numpy as np
import matplotlib.pyplot as plt

# https://github.com/jbmouret/matplotlib_for_papers#setting-the-limits-and-the-ticks
params = {
   'axes.labelsize': 18,
   'font.size': 8,
   'legend.fontsize': 15,
   'xtick.labelsize': 18,
   'ytick.labelsize': 18,
   'text.usetex': False,
    'figure.constrained_layout.use': True
   }
plt.rcParams.update(params)

cm = 1/2.54  # centimeters in inches

plt.figure(figsize=(40*cm, 30*cm))

json_file_path = sys.argv[1]
title = "scoreMatrix_" + json_file_path.split('/')[4]
# read save directory path from argument 3 if it exists, otherwise use default of './'
if len(sys.argv) > 3:
    save_dir = sys.argv[3]
else:
    save_dir = './'
data = plotUtil.read_data_from_json(json_file_path)

# TODO read the matrix from aggregation
# - for now just from the first iteration

scoreMatrix = data['evoRuns'][0]['iterations'][0]['scoreMatrix']
# if scoreMatrix is an array
if isinstance(scoreMatrix, list):
    scoreMatrix = {'oneMap': scoreMatrix}
for oneMap in scoreMatrix:

  print('Plotting ' + oneMap)

  matrix = np.array( scoreMatrix[oneMap] )

  matrix = [[0 if x is None else x for x in row] for row in matrix]

  plt.imshow(matrix, cmap='coolwarm', interpolation='nearest', aspect='auto')
  plt.gca().invert_yaxis()
  plt.colorbar(label='Score')

  plt.xlabel('Cell index')
  plt.ylabel('Cell index')

  print('Saving figure to ' + save_dir + oneMap + '.ext')

  plt.savefig(save_dir + oneMap + '.png', dpi=300)
  plt.savefig(save_dir + oneMap + '.pdf')

  plt.clf()