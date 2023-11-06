import sys
import plotUtil
import json
import seaborn as sns
import matplotlib.pyplot as plt
import pandas as pd

json_file_path = sys.argv[1]
x_multiplier = int(sys.argv[2])  # Set this value as the step size in the JSON file name
title = "eliteGenerations_" + json_file_path.split('/')[4]
# read save directory path from argument 3 if it exists, otherwise use default of './'
if len(sys.argv) > 3:
    save_dir = sys.argv[3]
else:
    save_dir = './'

data = plotUtil.read_data_from_json(json_file_path)

legend_lookup = {
    'one_comb-dur_0.5': 'SIE 0.5s',
    'one_comb-CPPN_only-dur_0.5': 'CPPN-only 0.5s',
    'one_comb-singleCellWin-dur_0.5': 'SIE-single-cell-win 0.5s',
    'one_comb-dur_10.0': 'SIE 10s',
    'one_comb-CPPN_only-dur_10.0': 'SIE-CPPN-only 10s',
}
params = {
   'axes.labelsize': 8,
   'font.size': 8,
   'legend.fontsize': 5,
   'xtick.labelsize': 8,
   'ytick.labelsize': 8,
   'text.usetex': False,
#    'figure.figsize': [7, 4] # instead of 4.5, 4.5
    'figure.constrained_layout.use': True
   }
plt.rcParams.update(params)
plt.rcParams['figure.constrained_layout.use'] = True
cm = 1/2.54  # centimeters in inches
plt.figure(figsize=(6*cm, 4.5*cm))
# plt.figure(figsize=(12*cm, 9*cm))

elite_generations_from_all_runs = []
labels = []
for oneEvorun in data['evoRuns']:
    elite_generations_means = oneEvorun['aggregates']['eliteGenerations']['means']
    elite_generations_from_all_runs.append(elite_generations_means)
    # cut "one_comb-" from the label prefix
    oneEvorun['label'] = legend_lookup[oneEvorun['label']]
    labels.append(oneEvorun['label'])



# fig, axs = plt.subplots(nrows=1, ncols=len(elite_generations_from_all_runs), sharey=True, figsize=(15, 5))

# for i, elite_generations_means in enumerate(elite_generations_from_all_runs):
#     sns.violinplot(data=elite_generations_means, inner="box", ax=axs[i])
#     axs[i].set_title(labels[i])

#     # sns.violinplot(data=elite_generations_means, ax=axs[i], inner=None, color=".8")
#     # sns.boxplot(data=elite_generations_means, ax=axs[i])

#     # axs[i].set_ylim([0, max(elite_generations_means) + 1]) # setting x-axis limits
#     axs[i].set_ylim([0, 350000 + 1]) # setting x-axis limits


# elite_generations_means = data['evoRuns'][0]['aggregates']['eliteGenerations']['means']
# sns.violinplot(data=elite_generations_means, inner="box")

# plt.figure(figsize=(16, 9))
# adjust margins
# plt.subplots_adjust(left=0.1, bottom=0.05, right=0.99, top=0.95, wspace=0.2, hspace=0.2)

# https://stackoverflow.com/a/42404320/169858
# sns.set(font_scale = 2)

sns.violinplot(data=elite_generations_from_all_runs, inner="box")
# plt.xticks(rotation=45)
# xtick labels from labels
plt.xticks(range(len(labels)), labels)
plt.xlabel('Evolution run configurations')
plt.ylabel('Elite iterations')

# plt.title('Elite generations')

# Save the plot
plt.savefig(save_dir + title + '.png')
plt.savefig(save_dir + title + '.pdf')