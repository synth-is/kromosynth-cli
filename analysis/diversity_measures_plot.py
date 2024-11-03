import sys
import json
import numpy as np
import matplotlib.pyplot as plt
from cycler import cycler
from palettable.colorbrewer.qualitative import Set1_3

def read_data_from_json(file_path):
    with open(file_path, 'r') as f:
        return json.load(f)

def create_shortened_label(label):
    """Create a shortened version of the label, focusing on the most distinctive parts."""
    parts = label.split('_')
    
    # If the label starts with common prefixes like 'evoConf', remove them
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
    # Command line arguments
    json_file_path = sys.argv[1]
    x_multiplier = int(sys.argv[2])
    save_dir = sys.argv[3] if len(sys.argv) > 3 else './'
    terrain = sys.argv[4] if len(sys.argv) > 4 else "customRef1"
    legend_placement = sys.argv[5] if len(sys.argv) > 5 else 'inside'

    # Read data
    data = read_data_from_json(json_file_path)
    
    # Plot settings
    colors = Set1_3.mpl_colors
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

    # Figure size in centimeters
    cm = 1/2.54
    fig = plt.figure(figsize=(4*cm, 3*cm))
    
    # Create axes with specific position - adjusted to leave room for legend
    ax = fig.add_axes([0.15, 0.15, 0.75, 0.75])  # [left, bottom, width, height]

    # Setup line styles
    linestyle_cycler = cycler('color', colors) + cycler('linestyle',['-','--',':'])
    plt.rc('axes', prop_cycle=linestyle_cycler)
    
    legend_lines = []
    legend_labels = []

    for evorun in data['evoRuns']:
        # Extract diversity measures for each iteration
        diversity_values = []
        for iteration in evorun['iterations']:
            if terrain in iteration['diversityMeasures']:
                diversity_values.extend(iteration['diversityMeasures'][terrain])

        diversity_values = np.array(diversity_values)
        x_values = np.arange(len(diversity_values)) * x_multiplier

        # Plot mean line
        line, = ax.plot(x_values, diversity_values, linewidth=2)
        
        # Create shortened label
        shortened_label = create_shortened_label(evorun['label'])
            
        legend_lines.append(line)
        legend_labels.append(shortened_label)

    # Configure legend based on placement
    if legend_placement.lower() == 'outside':
        ax.legend(legend_lines, legend_labels,
                 bbox_to_anchor=(1.05, 1),
                 loc='upper left',
                 borderaxespad=0)
    else:
        ax.legend(legend_lines, legend_labels, 
                 loc='lower right',
                 bbox_to_anchor=(0.98, 0.02),
                 frameon=True,
                 borderaxespad=0)

    # Set axis labels
    ax.set_xlabel('Iteration')
    ax.set_ylabel('Diversity Measure')

    # Set x-axis ticks in thousands
    x_max = len(x_values) * x_multiplier
    desired_ticks = np.linspace(0, x_max, 3)
    xticklabels = [f"{int(x/1000)}K" for x in desired_ticks]
    ax.set_xticks(desired_ticks)
    ax.set_xticklabels(xticklabels)
    ax.set_xlim(-x_max*0.05, x_max*1.05)

    # Save the plot with bbox_inches='tight' to prevent legend cutoff
    title = "diversityMeasures_" + json_file_path.split('/')[-1].split('.')[0]
    plt.savefig(save_dir + title + '.pdf', bbox_inches='tight', pad_inches=0.1)
    plt.close()

if __name__ == "__main__":
    main()