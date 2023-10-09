import sys
import plotUtil
import numpy as np
import matplotlib.pyplot as plt
import scipy

json_file_path = sys.argv[1]
x_multiplier = int(sys.argv[2])  # Set this value as the step size in the JSON file name
title = "qdScores_" + json_file_path.split('/')[4]
# read save directory path from argument 3 if it exists, otherwise use default of './'
if len(sys.argv) > 3:
    save_dir = sys.argv[3]
else:
    save_dir = './'

data = plotUtil.read_data_from_json(json_file_path)

qdScoresMeans = data['evoRuns'][0]['aggregates']['qdScores']['means']
qdScoreVariances = data['evoRuns'][0]['aggregates']['qdScores']['variances']
qdScoreStdDevs = data['evoRuns'][0]['aggregates']['qdScores']['stdDevs']

x_values = np.arange(len(qdScoresMeans)) * x_multiplier

# Plot the qdScore means with error bars showing the standard deviation
plt.errorbar(x_values, qdScoresMeans, yerr=qdScoreStdDevs, fmt='o')
plt.title('QD score means with error bars showing the standard deviation')
plt.xlabel('Step')
plt.ylabel('QD score mean')

plt.savefig(save_dir + title + '_errorBars.png')
plt.savefig(save_dir + title + '_errorBars.pdf')


plt.clf()


from scipy.stats import norm

# Plot the qdScore means with a confidence interval of 95%

# Define the confidence level and alpha
conf_level = 0.95
alpha = 1 - conf_level

# Calculate the half-width of the confidence interval
z_score = norm.ppf(1 - alpha/2)
half_width = z_score * np.array(qdScoreStdDevs, dtype=np.float64) / np.sqrt(len(qdScoresMeans))

# Calculate the upper and lower bounds of the confidence interval
upper_bound = qdScoresMeans + half_width
lower_bound = qdScoresMeans - half_width

# Plot the mean values as a line
plt.plot(x_values, qdScoresMeans) # plt.plot(x, y_means, '-o')

# Fill the area between the upper and lower bounds of the confidence interval
plt.fill_between(x_values, upper_bound, lower_bound, alpha=0.2)

# Add axes labels and a title
plt.xlabel('X-axis')
plt.ylabel('Iteration')
plt.title('QD score means with 95% confidence interval')

# Save the plot
plt.savefig(save_dir + title + '_confidenceInterval.png')
plt.savefig(save_dir + title + '_confidenceInterval.pdf')