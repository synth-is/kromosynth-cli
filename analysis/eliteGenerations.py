import sys
import plotUtil
import json
import seaborn as sns
import matplotlib.pyplot as plt

json_file_path = sys.argv[1]
x_multiplier = int(sys.argv[2])  # Set this value as the step size in the JSON file name
title = "eliteGenerations_" + json_file_path.split('/')[4]

data = plotUtil.read_data_from_json(json_file_path)


elite_generations_means = data['evoRuns'][0]['aggregates']['eliteGenerations']['means']

sns.violinplot(data=elite_generations_means, inner="box")
plt.title('Elite generations')

# Save the plot
plt.savefig(title + '.png')
plt.savefig(title + '.pdf')