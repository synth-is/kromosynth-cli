import sys
import plotUtil
import json
import matplotlib.pyplot as plt
import numpy as np

json_file_path = sys.argv[1]
x_multiplier = int(sys.argv[2])  # Set this value as the step size in the JSON file name
title = "elitesEnergy_" + json_file_path.split('/')[4]
# read save directory path from argument 3 if it exists, otherwise use default of './'
if len(sys.argv) > 3:
    save_dir = sys.argv[3]
else:
    save_dir = './'

data = plotUtil.read_data_from_json(json_file_path)


# **For each evorun**: Plot the **aggregate** average elite iteration engergy.

legend_lines = []
for oneEvorun in data['evoRuns']:
    eliteIterationEnergyMeans = np.array(oneEvorun['aggregates']['elitesEnergy']['eliteIterationEnergies']['means'])
    eliteIterationEnergyStdDevs = np.array(oneEvorun['aggregates']['elitesEnergy']['eliteIterationEnergies']['stdDevs'])

    x_values = np.arange(len(eliteIterationEnergyMeans)) * x_multiplier

    line, = plt.plot(x_values, eliteIterationEnergyMeans)
    fill = plt.fill_between(x_values, eliteIterationEnergyMeans - eliteIterationEnergyStdDevs, eliteIterationEnergyMeans + eliteIterationEnergyStdDevs, alpha=0.2)

    legend_lines.append((line, fill))

plt.legend(legend_lines, [oneEvorun['label'] for oneEvorun in data['evoRuns']], title='Elite iteration energy') # loc='upper left'

# Add axes labels and a title
plt.xlabel('Step')
plt.ylabel('Energy (iterations required)')

# Save the plot
plt.savefig(save_dir + title + '_iterationEnergy.png')
plt.savefig(save_dir + title + '_iterationEnergy.pdf')

plt.clf()


# Aggregate, average elites energy. 

energyAverages = data['evoRuns'][0]['aggregates']['elitesEnergy']['averageEnergies']['means']

# Plot the single value from energyAverages

def plot_number_with_label(number, label):
    fig, ax = plt.subplots(figsize=(14, 4))  # Adjust the figure size as per your preference
    ax.text(0.5, 0.5, str(number), fontsize=72, ha='center', va='center')
    ax.text(0.5, 0.2, label, fontsize=18, ha='center', va='center', transform=ax.transAxes)
    ax.axis('off')  # Hide the axis

    # Save the plot
    plt.savefig(save_dir + title + label + '_overall.png')
    plt.savefig(save_dir + title + label + '_overall.pdf')


for oneEvorun in data['evoRuns']:
    energyAverages = oneEvorun['aggregates']['elitesEnergy']['averageEnergies']['means']
    plot_number_with_label(energyAverages, oneEvorun['label'])
    plt.clf()
