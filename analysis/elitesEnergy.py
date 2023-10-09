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


# Aggregate, average elites energy. 

energyAverages = data['evoRuns'][0]['aggregates']['elitesEnergy']['averageEnergies']['means']

# Plot the single value from energyAverages

def plot_number_with_label(number, label):
    fig, ax = plt.subplots(figsize=(14, 4))  # Adjust the figure size as per your preference
    ax.text(0.5, 0.5, str(number), fontsize=72, ha='center', va='center')
    ax.text(0.5, 0.2, label, fontsize=18, ha='center', va='center', transform=ax.transAxes)
    ax.axis('off')  # Hide the axis

    # Save the plot
    plt.savefig(save_dir + title + '_overall.png')
    plt.savefig(save_dir + title + '_overall.pdf')

plot_number_with_label(energyAverages, "Average Elite Energy")


plt.clf()
fig, ax = plt.subplots(figsize=(6, 4))


# **For each evorun**: Plot the **aggregate** average elite iteration engergy.

eliteIterationEnergyMeans = data['evoRuns'][0]['aggregates']['elitesEnergy']['eliteIterationEnergies']['means']
eliteIterationEnergyStdDevs = data['evoRuns'][0]['aggregates']['elitesEnergy']['eliteIterationEnergies']['stdDevs']

from scipy.stats import norm

# Plot the qdScore means with a confidence interval of 95%

x_values = np.arange(len(eliteIterationEnergyMeans)) * x_multiplier

# Define the confidence level and alpha
conf_level = 0.95
alpha = 1 - conf_level

# Calculate the half-width of the confidence interval
z_score = norm.ppf(1 - alpha/2)
half_width = z_score * np.array(eliteIterationEnergyStdDevs, dtype=np.float64) / np.sqrt(len(eliteIterationEnergyMeans))

# Calculate the upper and lower bounds of the confidence interval
upper_bound = eliteIterationEnergyMeans + half_width
lower_bound = eliteIterationEnergyMeans - half_width

# Plot the mean values as a line
plt.plot(x_values, eliteIterationEnergyMeans) # plt.plot(x, y_means, '-o')

# Fill the area between the upper and lower bounds of the confidence interval
plt.fill_between(x_values, upper_bound, lower_bound, alpha=0.2)

# Add axes labels and a title
plt.xlabel('Step')
plt.ylabel('Energy (iterations required)')
plt.title('Elites energy means with 95% confidence interval')

# Save the plot
plt.savefig(save_dir + title + '_iterationEnergy.png')
plt.savefig(save_dir + title + '_iterationEnergy.pdf')