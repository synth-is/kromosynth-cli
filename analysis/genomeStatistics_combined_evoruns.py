import sys
import plotUtil
import matplotlib.pyplot as plt
import numpy as np
from cycler import cycler
# https://jiffyclub.github.io/palettable/colorbrewer/qualitative/
# from palettable.colorbrewer.qualitative import Set2_6 # Set1_4
# colors = Set2_6.mpl_colors
# from palettable.colorbrewer.qualitative import Paired_4 # _duration-comparison_basic-and-CPPNonly
# colors = Paired_4.mpl_colors
# genome statistics:
from palettable.colorbrewer.qualitative import Set2_3
colors = Set2_3.mpl_colors
# from palettable.colorbrewer.qualitative import Accent_3
# colors = Accent_3.mpl_colors

json_file_path = sys.argv[1]
x_multiplier = int(sys.argv[2])  # Set this value as the step size in the JSON file name
title = "genomeStatistics" # + json_file_path.split('/')[4]
# read save directory path from argument 3 if it exists, otherwise use default of './'
if len(sys.argv) > 3:
    save_dir = sys.argv[3]
else:
    save_dir = './'

data = plotUtil.read_data_from_json(json_file_path)

plt.clf()

maxIterations = 300 # divided by x_multiplier
print("maxIterations:" + str(maxIterations) + " (divided by x_multiplier)")

# lookup dictionary from one evorun keys to legend text
legend_lookup = {
    'one_comb-dur_0.5': 'SIE 0.5s',
    'one_comb-CPPN_only-dur_0.5': 'SIE-CPPN-only 0.5s',
    'one_comb-singleCellWin-dur_0.5': 'SIE-single-cell-win 0.5s',
    'single-class': "SIE-single-class 0.5s",
}
# https://github.com/jbmouret/matplotlib_for_papers#setting-the-limits-and-the-ticks
params = {
   'axes.labelsize': 8,
   'font.size': 8,
   'legend.fontsize': 5,
   'xtick.labelsize': 8,
   'ytick.labelsize': 8,
   'text.usetex': False,
    # 'figure.figsize': [7, 1] # instead of 4.5, 4.5
    # 'figure.figsize': [12.8*cm, 9.6*cm]
    'figure.constrained_layout.use': True
   }
plt.rcParams.update(params)

cm = 1/2.54  # centimeters in inches
plt.figure(figsize=(4*cm, 3*cm))
# plt.figure(figsize=(6*cm, 4.5*cm))

# plt.subplots_adjust(left=0.18, bottom=0.2, right=0.94, top=0.98, wspace=0.2, hspace=0.2)
# plt.tight_layout()

legend_lines = []
for oneEvorun in data['evoRuns']:
    cppnNodeCountsMeans = np.array(oneEvorun['aggregates']['genomeStatistics']['averageCppnNodeCounts']['means'])[:maxIterations]
    cppnNodeCountsStdDevs = np.array(oneEvorun['aggregates']['genomeStatistics']['averageCppnNodeCounts']['stdDevs'])[:maxIterations]

    x_values = np.arange(len(cppnNodeCountsMeans)) * x_multiplier

    # linestyle_cycler = cycler('color', colors[:3]) + cycler('linestyle',['-','--',':']) # ,'-.'
    
    #  _duration-comparison_basic-and-CPPNonly
    # linestyle_cycler = cycler('color', colors) + cycler('linestyle',['-','--',':','-.']) 

    # genome statisitics:
    linestyle_cycler = cycler('color', colors) + cycler('linestyle',['-','--',':']) 

    # for base run vs single class:
    # linestyle_cycler = cycler('color', colors[:2]) + cycler('linestyle',['-','--'])
    plt.rc('axes', prop_cycle=linestyle_cycler)

    # https://stackoverflow.com/a/61369662/169858
    line, = plt.plot(x_values, cppnNodeCountsMeans) # , linewidth=2
    fill = plt.fill_between(x_values, cppnNodeCountsMeans - cppnNodeCountsStdDevs, cppnNodeCountsMeans + cppnNodeCountsStdDevs, alpha=0.2)

    legend_lines.append((line, fill))


plt.legend(legend_lines, [legend_lookup[oneEvorun['label']] for oneEvorun in data['evoRuns']], loc='upper left') # loc='' 
ax = plt.subplot()
ax.set_xlabel('Iteration')
ax.set_ylabel('CPPN Nodes')
# plt.xlabel('Iteration')
# plt.ylabel('CPPN Node Count')
# plt.title('CPPN Node Count')
# Save the plot
# plt.savefig(save_dir + title + '_CPPN_node_count' + '.png')

# have x values in thousands
xticks = plt.xticks()[0]
xticklabels = [str(int(xtick/1000))+"K" for xtick in xticks]
plt.xticks(xticks, xticklabels)
# # have the x-axis start at 0 and end at 50000
plt.xlim(0, 50000)

plt.savefig(save_dir + title + '_CPPN_node_count' + '.pdf')

plt.clf()

legend_lines = []
for oneEvorun in data['evoRuns']:
    cppnConnectionCountsMeans = np.array(oneEvorun['aggregates']['genomeStatistics']['averageCppnConnectionCounts']['means'])[:maxIterations]
    cppnConnectionCountsStdDevs = np.array(oneEvorun['aggregates']['genomeStatistics']['averageCppnConnectionCounts']['stdDevs'])[:maxIterations]

    x_values = np.arange(len(cppnConnectionCountsMeans)) * x_multiplier

    # linestyle_cycler = cycler('color', colors[:3]) + cycler('linestyle',['-','--',':'])
    
    # _duration-comparison_basic-and-CPPNonly
    # linestyle_cycler = cycler('color', colors) + cycler('linestyle',['-','--',':','-.'])

    # genome statisitics:
    linestyle_cycler = cycler('color', colors) + cycler('linestyle',['-','--',':']) 

    # for base run vs single class:
    # linestyle_cycler = cycler('color', colors[:2]) + cycler('linestyle',['-','--'])
    plt.rc('axes', prop_cycle=linestyle_cycler)

    # https://stackoverflow.com/a/61369662/169858
    line, = plt.plot(x_values, cppnConnectionCountsMeans) # , linewidth=2
    fill = plt.fill_between(x_values, cppnConnectionCountsMeans - cppnConnectionCountsStdDevs, cppnConnectionCountsMeans + cppnConnectionCountsStdDevs, alpha=0.2)

    legend_lines.append((line, fill))

plt.legend(legend_lines, [legend_lookup[oneEvorun['label']] for oneEvorun in data['evoRuns']], title='CPPN connection counts', loc='lower right') # loc='upper left'
plt.xlabel('Iteration')
plt.ylabel('CPPN Connection Count')
# plt.title('CPPN Connection Count')
# Save the plot
# plt.savefig(save_dir + title + '_CPPN_connection_count' + '.png')
plt.savefig(save_dir + title + '_CPPN_connection_count' + '.pdf')

plt.clf()

legend_lines = []
for oneEvorun in data['evoRuns']:
    asNEATPatchNodeCountsMeans = np.array(oneEvorun['aggregates']['genomeStatistics']['averageAsNEATPatchNodeCounts']['means'])[:maxIterations]
    asNEATPatchNodeCountsStdDevs = np.array(oneEvorun['aggregates']['genomeStatistics']['averageAsNEATPatchNodeCounts']['stdDevs'])[:maxIterations]

    x_values = np.arange(len(asNEATPatchNodeCountsMeans)) * x_multiplier

    # linestyle_cycler = cycler('color', colors[3:]) + cycler('linestyle',['-','--',':'])

    # _duration-comparison_basic-and-CPPNonly
    # linestyle_cycler = cycler('color', colors) + cycler('linestyle',['-','--',':','-.'])

    # genome statisitics:
    linestyle_cycler = cycler('color', colors) + cycler('linestyle',['-','--',':']) 

    # for base run vs single class:
    # linestyle_cycler = cycler('color', colors[2:]) + cycler('linestyle',['-','--'])
    plt.rc('axes', prop_cycle=linestyle_cycler)

    # https://stackoverflow.com/a/61369662/169858
    line, = plt.plot(x_values, asNEATPatchNodeCountsMeans) #, linewidth=2
    fill = plt.fill_between(x_values, asNEATPatchNodeCountsMeans - asNEATPatchNodeCountsStdDevs, asNEATPatchNodeCountsMeans + asNEATPatchNodeCountsStdDevs, alpha=0.2)

    legend_lines.append((line, fill))

# plt.legend(legend_lines, [oneEvorun['label'][9:] for oneEvorun in data['evoRuns']], title='Audio graph node counts', loc='lower right') # loc='upper left'
plt.legend(legend_lines, [legend_lookup[oneEvorun['label']] for oneEvorun in data['evoRuns']], loc='upper left') # loc='upper left'
plt.xlabel('Iteration')
plt.ylabel('DSP Nodes')
# plt.title('Audio Graph Node Count')

# have x values in thousands
xticks = plt.xticks()[0]
xticklabels = [str(int(xtick/1000))+"K" for xtick in xticks]
plt.xticks(xticks, xticklabels)
# # have the x-axis start at 0 and end at 50000
plt.xlim(0, 50000)

# Save the plot
# plt.savefig(save_dir + title + '_audio_graph_node_count' + '.png')
plt.savefig(save_dir + title + '_audio_graph_node_count' + '.pdf')

plt.clf()

legend_lines = []
for oneEvorun in data['evoRuns']:
    asNEATPatchConnectionCountsMeans = np.array(oneEvorun['aggregates']['genomeStatistics']['averageAsNEATPatchConnectionCounts']['means'])[:maxIterations]
    asNEATPatchConnectionCountsStdDevs = np.array(oneEvorun['aggregates']['genomeStatistics']['averageAsNEATPatchConnectionCounts']['stdDevs'])[:maxIterations]

    x_values = np.arange(len(asNEATPatchConnectionCountsMeans)) * x_multiplier

    # linestyle_cycler = cycler('color', colors[3:]) + cycler('linestyle',['-','--',':'])
    
    # _duration-comparison_basic-and-CPPNonly
    # linestyle_cycler = cycler('color', colors) + cycler('linestyle',['-','--',':','-.']) 

    # genome statisitics:
    linestyle_cycler = cycler('color', colors) + cycler('linestyle',['-','--',':']) 
    
    # for base run vs single class:
    # linestyle_cycler = cycler('color', colors[2:]) + cycler('linestyle',['-','--'])
    plt.rc('axes', prop_cycle=linestyle_cycler)

    # https://stackoverflow.com/a/61369662/169858
    line, = plt.plot(x_values, asNEATPatchConnectionCountsMeans) # , linewidth=2
    fill = plt.fill_between(x_values, asNEATPatchConnectionCountsMeans - asNEATPatchConnectionCountsStdDevs, asNEATPatchConnectionCountsMeans + asNEATPatchConnectionCountsStdDevs, alpha=0.2)

    legend_lines.append((line, fill))



plt.legend(legend_lines, [legend_lookup[oneEvorun['label']] for oneEvorun in data['evoRuns']], title='Audio graph connection counts', loc='lower right') # loc='upper left'
plt.xlabel('Iteration')
plt.ylabel('Audio Graph Connection Count')
plt.title('Audio Graph Connection Count')
# Save the plot
# plt.savefig(save_dir + title + '_audio_graph_connection_count' + '.png')
plt.savefig(save_dir + title + '_audio_graph_connection_count' + '.pdf')

plt.clf()


################ node type counts ################

# see genomeStatistics-nodeCount_combined_evoruns.py