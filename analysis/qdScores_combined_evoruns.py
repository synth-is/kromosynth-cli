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
title = "qdScores_" + json_file_path.split('/')[4]
# read save directory path from argument 3 if it exists, otherwise use default of './'
if len(sys.argv) > 3:
    save_dir = sys.argv[3]
else:
    save_dir = './'

if len(sys.argv) > 4:
    terrain = sys.argv[4]
else:
    terrain = "customRef1"

data = plotUtil.read_data_from_json(json_file_path)

# # 90% confidence interval
# # z_score = 1.645

# # 95% confidence interval
# z_score = 1.96

# # 99% confidence interval
# # z_score = 2.58

# figure, ax = plt.subplots()

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
   'axes.labelsize': 8,
   'font.size': 8,
   'legend.fontsize': 4,
   'xtick.labelsize': 8,
   'ytick.labelsize': 8,
   'text.usetex': False,
#    'figure.figsize': [7, 4] # instead of 4.5, 4.5
    'figure.constrained_layout.use': True
   }
plt.rcParams.update(params)

cm = 1/2.54  # centimeters in inches
plt.figure(figsize=(4*cm, 3*cm))
# plt.figure(figsize=(6*cm, 4.5*cm))
# plt.figure(figsize=(12*cm, 9*cm))

# Set axes position BEFORE plotting
# plt.axes([0.2, 0.2, 0.75, 0.75])


# Your plotting loop
maxIterations = 48 # divided by x_multiplier
print("maxIterations:" + str(maxIterations) + " (divided by x_multiplier)")
legend_lines = []
for oneEvorun in data['evoRuns']:
    # add oneEvorun to legend_lookup if not already present, with a shortened name as the value in the dictionary
    if oneEvorun['label'] not in legend_lookup:
        parts = oneEvorun['label'].split('_')
        if len(parts) > 4:
            shortened_label = '_'.join(parts[4:7])
        else:
            shortened_label = oneEvorun['label']
        legend_lookup[oneEvorun['label']] = shortened_label


    qdScoresMeans = np.array(oneEvorun['aggregates']['qdScores'][terrain]['means'])[:maxIterations]

    print(qdScoresMeans)

    qdSqoreStdDevs = np.array(oneEvorun['aggregates']['qdScores'][terrain]['stdDevs'])[:maxIterations]

    print(len(qdScoresMeans))

    x_values = np.arange(len(qdScoresMeans)) * x_multiplier

    print(len(x_values))

    # linestyle_cycler = cycler('color', colors) + cycler('linestyle',['-','--',':','-.'])
    linestyle_cycler = cycler('color', colors) + cycler('linestyle',['-','--',':'])
    #  _duration-comparison_basic-and-CPPNonly
    # linestyle_cycler = cycler('color', colors) + cycler('linestyle',['-', '--', '-.', ':'])
    # linestyle_cycler = cycler('color', colors[:2]) + cycler('linestyle',['-','--']) # _duration-comparison-singleCellWin
    plt.rc('axes', prop_cycle=linestyle_cycler)

    # # Plotting the mean line
    # ax.plot(x_values, qdScoresMeans, label=oneEvorun['label'])  # marker='o'

    # # Adding the confidence intervals
    # ax.fill_between(x_values, qdScoresMeans - z_score*qdSqoreStdDevs, qdScoresMeans + z_score*qdSqoreStdDevs, alpha=0.2)

    line, = plt.plot(x_values, qdScoresMeans, linewidth=2)
    fill = plt.fill_between(x_values, qdScoresMeans - qdSqoreStdDevs, qdScoresMeans + qdSqoreStdDevs, alpha=0.2)

    legend_lines.append((line, fill))

plt.legend(legend_lines, [legend_lookup[oneEvorun['label']] for oneEvorun in data['evoRuns']]) # loc='upper left' 3 title='QD scores'

# plt.subplots_adjust(left=0.2, bottom=0.2, right=0.94, top=0.98, wspace=0.2, hspace=0.2)

# ax.legend(loc='lower right')
# ax.legend()

# xticks = plt.xticks()[0]
# xticklabels = [str(int(xtick/1000))+"K" for xtick in xticks]
# plt.xticks(xticks, xticklabels)
# # have the x-axis start at 0 and end at 50000
# plt.xlim(0, 5000)

# have x values in thousands
# xticks = plt.xticks()[0]
# xticklabels = [str(int(xtick/1000))+"K" for xtick in xticks]
# plt.xticks(xticks, xticklabels)
# # # have the x-axis start at 0 and end at 50000
# plt.xlim(0, 5000)

# this:
# xticks = plt.xticks()[0]
# xticklabels = [str(int(xtick/1000))+"K" for xtick in xticks]
# plt.xticks(xticks, xticklabels)
# plt.xlim(0, maxIterations * x_multiplier)

# or that:

x_max = maxIterations * x_multiplier
desired_ticks = np.linspace(0, x_max, 3)  # Creates 3 evenly spaced ticks: 0, 2000, 4000
xticklabels = [f"{int(x/1000)}K" for x in desired_ticks]
plt.xticks(desired_ticks, xticklabels)
# Set limits with some padding
plt.xlim(-x_max*0.05, x_max*1.05)  # Add 5% padding on each side


plt.xlabel('Iteration')
plt.ylabel('QD score')

# plt.savefig(save_dir + title + '_confidenceInterval.png')
plt.savefig(save_dir + title + '_confidenceInterval.pdf')