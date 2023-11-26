import sys
import plotUtil
import json
import numpy as np
import matplotlib.pyplot as plt

json_file_path = sys.argv[1]
x_multiplier = int(sys.argv[2])  # Set this value as the step size in the JSON file name
title = "coverage_" + json_file_path.split('/')[4]
# read save directory path from argument 3 if it exists, otherwise use default of './'
if len(sys.argv) > 3:
    save_dir = sys.argv[3]
else:
    save_dir = './'

# Read data from JSON file
data = plotUtil.read_data_from_json(json_file_path)


coverageMeans = np.array(data['evoRuns'][2]['aggregates']['coverage']['means'])
coverageStdDevs = np.array(data['evoRuns'][2]['aggregates']['coverage']['stdDevs'])

x_values = np.arange(len(coverageMeans)) * x_multiplier

from scipy.stats import norm

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

# Plot the qdScore means with a confidence interval of 95%

# # Define the confidence level and alpha
# conf_level = 0.95
# alpha = 1 - conf_level

# # Calculate the half-width of the confidence interval
# z_score = norm.ppf(1 - alpha/2)
# half_width = z_score * np.array(coverageStdDevs, dtype=np.float64) / np.sqrt(len(coverageMeans))

# # Calculate the upper and lower bounds of the confidence interval
# upper_bound = coverageMeans + half_width
# lower_bound = coverageMeans - half_width

# # Plot the mean values as a line
# plt.plot(x_values, coverageMeans) # plt.plot(x, y_means, '-o')

# # Fill the area between the upper and lower bounds of the confidence interval
# plt.fill_between(x_values, upper_bound, lower_bound, alpha=0.2)

# Simpler confidence interval calculation
plt.plot(x_values, coverageMeans)
plt.fill_between(x_values, coverageMeans - coverageStdDevs, coverageMeans + coverageStdDevs, alpha=0.2)

# Add axes labels and a title
plt.xlabel('Iteration')
plt.ylabel('Coverage')
# plt.title('Coverage means with 95% confidence interval')



plt.subplots_adjust(left=0.08, bottom=0.1, right=0.99, top=0.95, wspace=0.2, hspace=0.2)

# Save the plot
# plt.savefig(save_dir + title + '.png')
plt.savefig(save_dir + title + '.pdf')