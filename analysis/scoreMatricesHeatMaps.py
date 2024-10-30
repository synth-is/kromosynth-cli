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
title = "scoreMatrices_" + json_file_path.split('/')[4]
# read save directory path from argument 3 if it exists, otherwise use default of './'
if len(sys.argv) > 3:
    save_dir = sys.argv[3]
else:
    save_dir = './'
data = plotUtil.read_data_from_json(json_file_path)

# Iterate over all iterations
for iteration in data['evoRuns'][0]['iterations']:
    scoreMatrices = iteration['scoreMatrices']
    iteration_id = iteration['id']

    # if scoreMatrix is an array
    if isinstance(scoreMatrices, list):
        scoreMatrices = {'oneMap': scoreMatrices}
    for oneMap in scoreMatrices:
    
      # Iterate over each matrix in scoreMatrices
      for idx, matrix in enumerate(scoreMatrices[oneMap]):

          print(f'Plotting matrix {idx} for iteration {iteration_id}')

          matrix = np.array(matrix)

          matrix = [[0 if x is None else x for x in row] for row in matrix]

          plt.imshow(matrix, cmap='coolwarm', interpolation='nearest', aspect='auto')
          plt.gca().invert_yaxis()
          plt.colorbar(label='Score')

          plt.xlabel('Cell index')
          plt.ylabel('Cell index')

          filename = f"{save_dir}{oneMap}_{idx}_iteration_{iteration_id}"
          print(f'Saving figure to {filename}.ext')

          # plt.savefig(filename + '.png', dpi=300)
          plt.savefig(filename + '.pdf')

          plt.clf()