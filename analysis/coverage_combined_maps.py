import sys
import plotUtil
import numpy as np
import matplotlib.pyplot as plt
from cycler import cycler
from palettable.colorbrewer.qualitative import Set1_3
colors = Set1_3.mpl_colors

json_file_path = sys.argv[1]
x_multiplier = int(sys.argv[2])  # Set this value as the step size in the JSON file name
title = "coverage_" + json_file_path.split('/')[4]
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

legend_lookup = {
    'one_comb-dur_0.5': 'SIE',
    'one_comb-CPPN_only-dur_0.5': 'SIE-CPPN-only',
    'one_comb-singleCellWin-dur_0.5': 'SIE-single-cell-win',
    'one_comb-dur_10.0': 'SIE 10s',
    'one_comb-CPPN_only-dur_10.0': 'SIE-CPPN-only 10s',
    'single-class': "SIE-single-class",
}

params = {
   'axes.labelsize': 8,
   'font.size': 8,
   'legend.fontsize': 4,
   'xtick.labelsize': 8,
   'ytick.labelsize': 8,
   'text.usetex': False,
   'figure.constrained_layout.use': True
}
plt.rcParams.update(params)

cm = 1/2.54  # centimeters in inches
plt.figure(figsize=(4*cm, 3*cm))

maxIterations = 48  # divided by x_multiplier
print("maxIterations:" + str(maxIterations) + " (divided by x_multiplier)")
legend_lines = []
for oneEvorun in data['evoRuns']:
    # add oneEvorun to legend_lookup if not already present
    if oneEvorun['label'] not in legend_lookup:
        parts = oneEvorun['label'].split('_')
        if len(parts) > 4:
            shortened_label = '_'.join(parts[4:7])
        else:
            shortened_label = oneEvorun['label']
        legend_lookup[oneEvorun['label']] = shortened_label

    coverage = oneEvorun['aggregates']['coverage'][terrain]
    coverageMeans = np.array(coverage['means'])[:maxIterations]
    coverageStdDevs = np.array(coverage['stdDevs'])[:maxIterations]

    print(len(coverageMeans))

    x_values = np.arange(len(coverageMeans)) * x_multiplier

    print(len(x_values))

    linestyle_cycler = cycler('color', colors) + cycler('linestyle',['-','--',':'])
    plt.rc('axes', prop_cycle=linestyle_cycler)

    line, = plt.plot(x_values, coverageMeans, linewidth=2)
    fill = plt.fill_between(x_values, coverageMeans - coverageStdDevs, coverageMeans + coverageStdDevs, alpha=0.2)

    legend_lines.append((line, fill))

plt.legend(legend_lines, [legend_lookup[oneEvorun['label']] for oneEvorun in data['evoRuns']])

x_max = maxIterations * x_multiplier
desired_ticks = np.linspace(0, x_max, 3)  # Creates 3 evenly spaced ticks
xticklabels = [f"{int(x/1000)}K" for x in desired_ticks]
plt.xticks(desired_ticks, xticklabels)
# Set limits with some padding
plt.xlim(-x_max*0.05, x_max*1.05)  # Add 5% padding on each side

plt.xlabel('Iteration')
plt.ylabel('Coverage')

plt.savefig(save_dir + title + '_confidenceInterval.pdf')