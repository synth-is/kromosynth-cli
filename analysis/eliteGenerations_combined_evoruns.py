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


elite_generations_from_all_runs = []
labels = []
for oneEvorun in data['evoRuns']:
    elite_generations_means = oneEvorun['aggregates']['eliteGenerations']['means']
    elite_generations_from_all_runs.append(elite_generations_means)
    # cut "one_comb-" from the label prefix
    oneEvorun['label'] = oneEvorun['label'][9:]
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

plt.figure(figsize=(16, 9))
# adjust margins
plt.subplots_adjust(left=0.1, bottom=0.05, right=0.99, top=0.95, wspace=0.2, hspace=0.2)

# https://stackoverflow.com/a/42404320/169858
sns.set(font_scale = 2)

sns.violinplot(data=elite_generations_from_all_runs, inner="box")
# plt.xticks(rotation=45)
# xtick labels from labels
plt.xticks(range(len(labels)), labels)
plt.xlabel('Evolution run configurations')
plt.ylabel('Elite generations')

plt.title('Elite generations')

# Save the plot
plt.savefig(save_dir + title + '.png')
plt.savefig(save_dir + title + '.pdf')