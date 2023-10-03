import sys
import plotUtil
import json
import numpy as np
import matplotlib.pyplot as plt

json_file_path = sys.argv[1]
x_multiplier = int(sys.argv[2])  # Set this value as the step size in the JSON file name
title = "coverage_" + json_file_path.split('/')[4]

# Read data from JSON file
data = plotUtil.read_data_from_json(json_file_path)


coverageMeans = data['evoRuns'][0]['aggregates']['coverage']['means']
coverageStdDevs = data['evoRuns'][0]['aggregates']['coverage']['stdDevs']

x_values = np.arange(len(coverageMeans)) * x_multiplier

from scipy.stats import norm

# Plot the qdScore means with a confidence interval of 95%

# Define the confidence level and alpha
conf_level = 0.95
alpha = 1 - conf_level

# Calculate the half-width of the confidence interval
z_score = norm.ppf(1 - alpha/2)
half_width = z_score * np.array(coverageStdDevs, dtype=np.float64) / np.sqrt(len(coverageMeans))

# Calculate the upper and lower bounds of the confidence interval
upper_bound = coverageMeans + half_width
lower_bound = coverageMeans - half_width

# Plot the mean values as a line
plt.plot(x_values, coverageMeans) # plt.plot(x, y_means, '-o')

# Fill the area between the upper and lower bounds of the confidence interval
plt.fill_between(x_values, upper_bound, lower_bound, alpha=0.2)

# Add axes labels and a title
plt.xlabel('X-axis')
plt.ylabel('Iteration')
plt.title('Coverage means with 95% confidence interval')

# Save the plot
plt.savefig(title + '.png')
plt.savefig(title + '.pdf')