import sys
import plotUtil
import numpy as np
import matplotlib.pyplot as plt

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

legend_lines = []
for oneEvorun in data['evoRuns']:
    qdScoresMeans = np.array(oneEvorun['aggregates']['qdScores']['means'])
    qdSqoreStdDevs = np.array(oneEvorun['aggregates']['qdScores']['stdDevs'])

    x_values = np.arange(len(qdScoresMeans)) * x_multiplier

    # # Plotting the mean line
    # ax.plot(x_values, qdScoresMeans, label=oneEvorun['label'])  # marker='o'

    # # Adding the confidence intervals
    # ax.fill_between(x_values, qdScoresMeans - z_score*qdSqoreStdDevs, qdScoresMeans + z_score*qdSqoreStdDevs, alpha=0.2)

    line, = plt.plot(x_values, qdScoresMeans)
    fill = plt.fill_between(x_values, qdScoresMeans - qdSqoreStdDevs, qdScoresMeans + qdSqoreStdDevs, alpha=0.2)

    legend_lines.append((line, fill))

plt.legend(legend_lines, [oneEvorun['label'] for oneEvorun in data['evoRuns']], title='QD scores') # loc='upper left'


# ax.legend(loc='lower right')
# ax.legend()

plt.xlabel('Iteration')
plt.ylabel('QD score')

plt.savefig(save_dir + title + '_confidenceInterval.png')
plt.savefig(save_dir + title + '_confidenceInterval.pdf')