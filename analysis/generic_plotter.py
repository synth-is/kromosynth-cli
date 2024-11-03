import sys
import plotUtil
import numpy as np
import matplotlib.pyplot as plt
from cycler import cycler
from palettable.colorbrewer.qualitative import Set1_3
colors = Set1_3.mpl_colors
import textwrap

def get_nested_value(data, path, terrain=None):
    """Traverse nested dictionary using a list of keys, with optional terrain key"""
    for key in path:
        data = data[key]
    if terrain is not None:
        data = data[terrain]
    return data

def create_shortened_label(label):
    """Create a shortened version of the label, focusing on the most distinctive parts."""
    parts = label.split('_')
    
    # If the label starts with common prefixes, remove them
    if parts[0] in ['evoConf', 'one', 'single']:
        parts = parts[1:]
    
    # Focus on the most distinctive parts
    distinctive_parts = [p for p in parts if any(key in p.lower() for key in ['mfcc', 'pca', 'retrain'])]
    if distinctive_parts:
        return ' '.join(distinctive_parts[:2])
    
    # Fallback to middle parts if no distinctive parts found
    if len(parts) > 2:
        return ' '.join(parts[1:3])
    
    return ' '.join(parts)

def main():
    if len(sys.argv) < 4:
        print("Usage: script.py <json_file> <x_multiplier> <data_path> [terrain] [save_dir] [ylabel] [xlabel] [title] [legend_placement]")
        print("Example: script.py data.json 100 qdScores customRef1 ./output 'QD Score' Iteration QD_Scores inside")
        print("For nested paths without terrain, use 'none' for terrain parameter")
        print("Legend placement can be 'inside' (default) or 'outside'")
        print("For nested paths with terrain: qdScores -> uses terrain")
        print("For deeply nested paths without terrain: genomeStatistics.averageAsNEATPatchConnectionCounts -> doesn't use terrain")
        sys.exit(1)

    json_file_path = sys.argv[1]
    x_multiplier = int(sys.argv[2])
    data_path = sys.argv[3].split('.')  # Convert dot notation to list of keys
    
    # Handle terrain parameter
    terrain = sys.argv[4] if len(sys.argv) > 4 else "customRef1"
    if terrain.lower() == 'none':
        terrain = None

    save_dir = sys.argv[5] if len(sys.argv) > 5 else './'
    ylabel = sys.argv[6] if len(sys.argv) > 6 else (data_path[-1].replace('_', ' '))
    xlabel = sys.argv[7] if len(sys.argv) > 7 else 'Iteration'
    title = sys.argv[8] if len(sys.argv) > 8 else f"{data_path[-1]}_{terrain if terrain else ''}"
    legend_placement = sys.argv[9].lower() if len(sys.argv) > 9 else 'inside'

    print(f"####### title: {title}")
    print(f"####### ylabel: {ylabel}")
    print(f"####### xlabel: {xlabel}")
    print(f"####### legend_placement: {legend_placement}")

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
        'legend.fontsize': 6,
        'xtick.labelsize': 8,
        'ytick.labelsize': 8,
        'text.usetex': False,
        'figure.constrained_layout.use': False
    }
    plt.rcParams.update(params)

    cm = 1/2.54
    fig = plt.figure(figsize=(4*cm, 3*cm))
    
    # Adjusted margins to ensure labels are within bounds
    left_margin = 0.25    # Increased for y-label
    bottom_margin = 0.25  # Increased for x-label
    right_margin = 0.95
    top_margin = 0.9

    if legend_placement == 'outside':
        right_margin = 0.75  # Make room for outside legend

    ax = fig.add_axes([left_margin, bottom_margin, right_margin - left_margin, top_margin - bottom_margin])

    maxIterations = int(4800 / x_multiplier)  # divided by x_multiplier
    print("maxIterations:" + str(maxIterations) + " (divided by x_multiplier)")
    legend_lines = []

    linestyle_cycler = cycler('color', colors) + cycler('linestyle',['-','--',':'])
    ax.set_prop_cycle(linestyle_cycler)

    for oneEvorun in data['evoRuns']:
        # add oneEvorun to legend_lookup if not already present
        if oneEvorun['label'] not in legend_lookup:
            parts = oneEvorun['label'].split('_')
            if len(parts) > 4:
                shortened_label = '_'.join(parts[4:7])
            else:
                shortened_label = oneEvorun['label']
            legend_lookup[oneEvorun['label']] = shortened_label

        # Get the nested data using the provided path and optional terrain
        nested_data = get_nested_value(oneEvorun, ['aggregates'] + data_path, terrain)
        
        means = np.array(nested_data['means'])[:maxIterations]
        stdDevs = np.array(nested_data['stdDevs'])[:maxIterations]

        print(f"Length of means array: {len(means)}")

        x_values = np.arange(len(means)) * x_multiplier

        print(f"Length of x_values array: {len(x_values)}")

        line, = ax.plot(x_values, means, linewidth=2)
        fill = ax.fill_between(x_values, means - stdDevs, means + stdDevs, alpha=0.2)

        legend_lines.append((line, fill))

    # Configure legend based on placement
    if legend_placement == 'outside':
        ax.legend(legend_lines, 
                 [create_shortened_label(oneEvorun['label']) for oneEvorun in data['evoRuns']],
                 bbox_to_anchor=(1.02, 1),
                 loc='upper left',
                 borderaxespad=0,
                 handlelength=1)
    else:
        ax.legend(legend_lines, 
                 [create_shortened_label(oneEvorun['label']) for oneEvorun in data['evoRuns']],
                 loc='best',
                 frameon=True,
                 borderaxespad=0,
                 handlelength=1)

    x_max = maxIterations * x_multiplier
    desired_ticks = np.linspace(0, x_max, 3)
    xticklabels = [f"{int(x/1000)}K" for x in desired_ticks]
    ax.set_xticks(desired_ticks)
    ax.set_xticklabels(xticklabels)
    ax.set_xlim(-x_max*0.05, x_max*1.05)

    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)

    # Use smaller padding to keep things tight but visible
    plt.savefig(f"{save_dir}{title}_plot.pdf", bbox_inches='tight', pad_inches=0.05)

if __name__ == "__main__":
    main()