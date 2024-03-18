import sys
import plotUtil
import numpy as np
import matplotlib.pyplot as plt
from cycler import cycler
# from palettable.colorbrewer.qualitative import Set1_4
# colors = Set1_4.mpl_colors
# from palettable.colorbrewer.qualitative import Paired_4 # _duration-comparison_basic-and-CPPNonly
# colors = Paired_4.mpl_colors
# from palettable.colorbrewer.qualitative import Accent_3 # _duration-comparison-singleCellWin
# colors = Accent_3.mpl_colors
from palettable.colorbrewer.qualitative import Set1_3 # _duration-comparison-singleCellWin
colors = Set1_3.mpl_colors

# print possible line styles
# from matplotlib import lines
# print(lines.lineStyles.keys())

json_file_path = sys.argv[1]
x_multiplier = int(sys.argv[2])  # Set this value as the step size in the JSON file name
title = "eliteCountAtGenerations_" + json_file_path.split('/')[4]
# read save directory path from argument 3 if it exists, otherwise use default of './'
if len(sys.argv) > 3:
    save_dir = sys.argv[3]
else:
    save_dir = './'

data = plotUtil.read_data_from_json(json_file_path)

legend_lookup = {
    'one_comb-dur_0.5': 'SIE',
    'one_comb-CPPN_only-dur_0.5': 'SIE-CPPN-only',
    'one_comb-singleCellWin-dur_0.5': 'SIE-single-cell-win',
    'one_comb-dur_10.0': 'SIE 10s',
    'one_comb-CPPN_only-dur_10.0': 'SIE-CPPN-only 10s',
    'single-class': "SIE-single-class",
}
# https://github.com/jbmouret/matplotlib_for_papers#setting-the-limits-and-the-ticks
params = {
   'axes.labelsize': 18,
   'font.size': 18,
   'legend.fontsize': 15,
   'xtick.labelsize': 18,
   'ytick.labelsize': 18,
   'text.usetex': False,
#    'figure.figsize': [7, 4] # instead of 4.5, 4.5
    'figure.constrained_layout.use': True
   }
plt.rcParams.update(params)

cm = 1/2.54  # centimeters in inches

# plt.figure(figsize=(4*cm, 3*cm))
plt.figure(figsize=(40*cm, 30*cm))

# plt.figure(figsize=(6*cm, 4.5*cm))
# plt.figure(figsize=(12*cm, 9*cm))

legend_lines = []

newEliteCount = data['evoRuns'][0]['aggregates']['newEliteCount']
for oneMap in newEliteCount:
    print(oneMap)
    newEliteCountMeans = np.array(newEliteCount[oneMap]['means'])
    newEliteCountStdDevs = np.array(newEliteCount[oneMap]['stdDevs'])

    print(len(newEliteCountMeans))

    x_values = np.arange(len(newEliteCountMeans)) * x_multiplier
    # linestyle_cycler = cycler('color', colors) + cycler('linestyle',['-','--',':','-.'])
    linestyle_cycler = cycler('color', colors) + cycler('linestyle',['-','--',':'])
    #  _duration-comparison_basic-and-CPPNonly
    # linestyle_cycler = cycler('color', colors) + cycler('linestyle',['-', '--', '-.', ':'])
    # linestyle_cycler = cycler('color', colors[:2]) + cycler('linestyle',['-','--']) # _duration-comparison-singleCellWin
    plt.rc('axes', prop_cycle=linestyle_cycler)


    line, = plt.plot(x_values, newEliteCountMeans, linewidth=2)
    fill = plt.fill_between(x_values, newEliteCountMeans - newEliteCountStdDevs, newEliteCountMeans + newEliteCountStdDevs, alpha=0.2)

    legend_lines.append((line, fill))

plt.legend(legend_lines, [oneMap for oneMap in data['evoRuns'][0]['aggregates']['qdScores']]) # loc='upper left' 3 title='QD scores'

plt.xlabel('Generation')
plt.ylabel('Elite Count at Generations')

# plt.savefig(save_dir + title + '_confidenceInterval.png')
plt.savefig(save_dir + title + '_confidenceInterval.pdf')