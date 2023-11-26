import sys
import plotUtil
import matplotlib.pyplot as plt
import numpy as np
from cycler import cycler

from palettable.colorbrewer.qualitative import Set2_3
colors = Set2_3.mpl_colors

# duration comparison:
# from palettable.colorbrewer.qualitative import Paired_4 # _duration-comparison_basic-and-CPPNonly
# colors = Paired_4.mpl_colors

json_file_path = sys.argv[1]
x_multiplier = int(sys.argv[2])  # Set this value as the step size in the JSON file name
title = "genomeSets_" + json_file_path.split('/')[4]
# read save directory path from argument 3 if it exists, otherwise use default of './'
if len(sys.argv) > 3:
    save_dir = sys.argv[3]
else:
    save_dir = './'

data = plotUtil.read_data_from_json(json_file_path)

legend_lookup = {
    'one_comb-dur_0.5': 'SIE 0.5s',
    'one_comb-CPPN_only-dur_0.5': 'SIE-CPPN-only 0.5s',
    'one_comb-singleCellWin-dur_0.5': 'SIE-single-cell-win 0.5s',
    'one_comb-dur_10.0': 'SIE 10s',
    'one_comb-CPPN_only-dur_10.0': 'SIE-CPPN-only 10s',
}
# https://github.com/jbmouret/matplotlib_for_papers#setting-the-limits-and-the-ticks
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

cm = 1/2.54  # centimeters in inches
plt.figure(figsize=(6*cm, 4.5*cm))

legend_lines = []
for oneEvorun in data['evoRuns']:
    genomeCountsMeans = np.array(oneEvorun['aggregates']['genomeSets']['genomeCounts']['means'])
    genomeCountsStdDevs = np.array(oneEvorun['aggregates']['genomeSets']['genomeCounts']['stdDevs'])

    x_values = np.arange(len(genomeCountsMeans)) * x_multiplier

    # linestyle_cycler = cycler('color', colors) + cycler('linestyle',['-','--',':','-.'])

    linestyle_cycler = cycler('color', colors) + cycler('linestyle',['-','--',':'])

    plt.rc('axes', prop_cycle=linestyle_cycler)

    # https://stackoverflow.com/a/61369662/169858
    line, = plt.plot(x_values, genomeCountsMeans) # , linewidth=2
    fill = plt.fill_between(x_values, genomeCountsMeans - genomeCountsStdDevs, genomeCountsMeans + genomeCountsStdDevs, alpha=0.2)

    legend_lines.append((line, fill))

plt.legend(legend_lines, [legend_lookup[oneEvorun['label']] for oneEvorun in data['evoRuns']], title='Genome sets') # loc='upper left'
# plt.subplots_adjust(left=0.08, bottom=0.1, right=0.99, top=0.95, wspace=0.2, hspace=0.2)

plt.xlabel('Iteration')
plt.ylabel('Genome count')

# plt.title('Genome sets')
# plt.legend()

# Save the plot
# plt.savefig(save_dir + title + '.png')
plt.savefig(save_dir + title + '.pdf')


plt.clf()


# coarse sets, based on actual difference in genome- and connnection counts, rather than just ID differences:

legend_lines = []
for oneEvorun in data['evoRuns']:
    nodeAndConnectionCountMeans = np.array(oneEvorun['aggregates']['genomeSets']['nodeAndConnectionCountSetCounts']['means'])
    nodeAndConnectionCountStdDevs = np.array(oneEvorun['aggregates']['genomeSets']['nodeAndConnectionCountSetCounts']['stdDevs'])

    x_values = np.arange(len(nodeAndConnectionCountMeans)) * x_multiplier

    linestyle_cycler = cycler('color', colors) + cycler('linestyle',['-','--',':'])

    # https://stackoverflow.com/a/61369662/169858
    line, = plt.plot(x_values, nodeAndConnectionCountMeans)
    fill = plt.fill_between(x_values, nodeAndConnectionCountMeans - nodeAndConnectionCountStdDevs, nodeAndConnectionCountMeans + nodeAndConnectionCountStdDevs, alpha=0.2)

    legend_lines.append((line, fill))

plt.legend(legend_lines, [legend_lookup[oneEvorun['label']] for oneEvorun in data['evoRuns']]) # loc='upper left' # , title='Node and connection count sets'

plt.xlabel('Iteration')
plt.ylabel('Unique genomes')

# Save the plot
# plt.savefig(save_dir + title + '_node_and_connection_count_sets' + '.png')
plt.savefig(save_dir + title + '_node_and_connection_count_sets' + '.pdf')
