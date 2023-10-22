import sys
import plotUtil
import numpy as np
import matplotlib.pyplot as plt
from cycler import cycler
from palettable.colorbrewer.qualitative import Set1_4
colors = Set1_4.mpl_colors

json_file_path = sys.argv[1]
x_multiplier = int(sys.argv[2])  # Set this value as the step size in the JSON file name
title = "qdScores_" + json_file_path.split('/')[4]
# read save directory path from argument 3 if it exists, otherwise use default of './'
if len(sys.argv) > 3:
    save_dir = sys.argv[3]
else:
    save_dir = './'

data = plotUtil.read_data_from_json(json_file_path)

# # 90% confidence interval
# # z_score = 1.645

# # 95% confidence interval
# z_score = 1.96

# # 99% confidence interval
# # z_score = 2.58

# figure, ax = plt.subplots()

# https://github.com/jbmouret/matplotlib_for_papers#setting-the-limits-and-the-ticks
params = {
   'axes.labelsize': 10,
   'font.size': 8,
   'legend.fontsize': 10,
   'xtick.labelsize': 10,
   'ytick.labelsize': 10,
   'text.usetex': False,
   'figure.figsize': [7, 4] # instead of 4.5, 4.5
   }
plt.rcParams.update(params)

maxIterations = 50 # divided by x_multiplier

legend_lines = []
for oneEvorun in data['evoRuns']:
    qdScoresMeans = np.array(oneEvorun['aggregates']['qdScores']['means'])[:maxIterations]
    qdSqoreStdDevs = np.array(oneEvorun['aggregates']['qdScores']['stdDevs'])[:maxIterations]

    print(len(qdScoresMeans))

    x_values = np.arange(len(qdScoresMeans)) * x_multiplier

    linestyle_cycler = cycler('color', colors) + cycler('linestyle',['-','--',':','-.'])
    plt.rc('axes', prop_cycle=linestyle_cycler)

    # # Plotting the mean line
    # ax.plot(x_values, qdScoresMeans, label=oneEvorun['label'])  # marker='o'

    # # Adding the confidence intervals
    # ax.fill_between(x_values, qdScoresMeans - z_score*qdSqoreStdDevs, qdScoresMeans + z_score*qdSqoreStdDevs, alpha=0.2)

    line, = plt.plot(x_values, qdScoresMeans, linewidth=2)
    fill = plt.fill_between(x_values, qdScoresMeans - qdSqoreStdDevs, qdScoresMeans + qdSqoreStdDevs, alpha=0.2)

    legend_lines.append((line, fill))

plt.legend(legend_lines, [oneEvorun['label'][9:] for oneEvorun in data['evoRuns']], title='QD scores') # loc='upper left'

plt.subplots_adjust(left=0.08, bottom=0.1, right=0.99, top=0.95, wspace=0.2, hspace=0.2)



# ax.legend(loc='lower right')
# ax.legend()

plt.xlabel('Iteration')
plt.ylabel('QD score')

# plt.savefig(save_dir + title + '_confidenceInterval.png')
plt.savefig(save_dir + title + '_confidenceInterval.pdf')