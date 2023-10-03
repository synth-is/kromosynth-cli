import sys
import plotUtil
import json
import matplotlib.pyplot as plt
import numpy as np
from scipy.stats import norm

json_file_path = sys.argv[1]
x_multiplier = int(sys.argv[2])  # Set this value as the step size in the JSON file name
title = "genomeStatistics_" + json_file_path.split('/')[4]

data = plotUtil.read_data_from_json(json_file_path)

# Plot the **aggregate* of the average numbers of nodes and connections in the CPPN and DSP networks in the sound genomes, aggregated from multiple evoruns.

# Get the array of objects from the attribute genomeStatistics in the JSON file at evoRuns[0].iterations[0].genomeStatistics
genome_statistics = data['evoRuns'][0]['iterations'][0]['genomeStatistics']
x = np.arange(len(genome_statistics))  # x-coordinates for each line

cppnNodeCountsMeans = data['evoRuns'][0]['aggregates']['genomeStatistics']['averageCppnNodeCounts']['means']
cppnNodeCountsStdDevs = np.array(data['evoRuns'][0]['aggregates']['genomeStatistics']['averageCppnNodeCounts']['stdDevs'], dtype=np.float64)
cppnConnectionCountsMeans = data['evoRuns'][0]['aggregates']['genomeStatistics']['averageCppnConnectionCounts']['means']
cppnConnectionCountsStdDevs = np.array(data['evoRuns'][0]['aggregates']['genomeStatistics']['averageCppnConnectionCounts']['stdDevs'], dtype=np.float64)
asNEATPatchNodeCountsMeans = data['evoRuns'][0]['aggregates']['genomeStatistics']['averageAsNEATPatchNodeCounts']['means']
asNEATPatchNodeCountsStdDevs = np.array(data['evoRuns'][0]['aggregates']['genomeStatistics']['averageAsNEATPatchNodeCounts']['stdDevs'], dtype=np.float64)
asNEATPatchConnectionCountsMeans = data['evoRuns'][0]['aggregates']['genomeStatistics']['averageAsNEATPatchConnectionCounts']['means']
asNEATPatchConnectionCountsStdDevs = np.array(data['evoRuns'][0]['aggregates']['genomeStatistics']['averageAsNEATPatchConnectionCounts']['stdDevs'], dtype=np.float64)

# # Compute Z-score for a 95% confidence interval
# z_score = norm.ppf(0.975)

# # Compute Z-score for an 80% confidence interval
# significance_level = 0.80
# z_score = norm.ppf((1 + significance_level) / 2)

significance_level = 0.05
z_score = norm.ppf((1 + significance_level) / 2)

# Plotting lines with confidence intervals
plt.plot(x, cppnNodeCountsMeans, label="Average CPPN Node Count")
plt.fill_between(x, np.subtract(cppnNodeCountsMeans, z_score * cppnNodeCountsStdDevs),
                 np.add(cppnNodeCountsMeans, z_score * cppnNodeCountsStdDevs), alpha=0.3)
plt.plot(x, cppnConnectionCountsMeans, label="Average CPPN Connection Count")
plt.fill_between(x, np.subtract(cppnConnectionCountsMeans, z_score * cppnConnectionCountsStdDevs),
                 np.add(cppnConnectionCountsMeans, z_score * cppnConnectionCountsStdDevs), alpha=0.3)
plt.plot(x, asNEATPatchNodeCountsMeans, label="Average AsNEAT Patch Node Count")
plt.fill_between(x, np.subtract(asNEATPatchNodeCountsMeans, z_score * asNEATPatchNodeCountsStdDevs),
                 np.add(asNEATPatchNodeCountsMeans, z_score * asNEATPatchNodeCountsStdDevs), alpha=0.3)
plt.plot(x, asNEATPatchConnectionCountsMeans, label="Average AsNEAT Patch Connection Count")
plt.fill_between(x, np.subtract(asNEATPatchConnectionCountsMeans, z_score * asNEATPatchConnectionCountsStdDevs),
                 np.add(asNEATPatchConnectionCountsMeans, z_score * asNEATPatchConnectionCountsStdDevs), alpha=0.3)

# Customize the plot
plt.xlabel("Data Points")
plt.ylabel("Values")
plt.title("Line Plot with 5% Significance Level")
plt.legend()

# Save the plot
plt.savefig(title + '.png')
plt.savefig(title + '.pdf')