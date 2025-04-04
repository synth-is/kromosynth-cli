import sys
import plotUtil
import numpy as np
import matplotlib.pyplot as plt
from cycler import cycler
import importlib

def get_color_cycle(colormap_name='Set1_3'):
    """Get color cycle from either Palettable or matplotlib colormap"""
    if colormap_name.startswith('palettable_'):
        # Extract the actual colormap name (e.g., 'Set1_3' from 'palettable_Set1_3')
        palette_name = colormap_name.split('palettable_')[1]
        try:
            # Import the palette dynamically from palettable
            module = importlib.import_module('palettable.colorbrewer.qualitative')
            palette = getattr(module, palette_name)
            # Debug output
            print(f"Using Palettable palette: {palette_name}")
            print(f"Colors: {palette.mpl_colors}")
            return palette.mpl_colors
        except (ImportError, AttributeError) as e:
            print(f"Warning: Could not load Palettable palette {palette_name}. Error: {e}")
            print("Falling back to viridis colormap")
            return get_color_cycle('viridis')
    else:
        # Use matplotlib colormap
        cm = plt.get_cmap(colormap_name)
        return [cm(i) for i in np.linspace(0, 1, 3)]

import textwrap

# concrete example: python3 generic_plotter.py /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-test/evoConf_single-map_x100_noOsc_spectralCentroidAndFlatness__2024-09/analysis/coverage/evolution-run-analysis_coverage_step-100_1730552000155.json /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-test/evoConf_singleMap_refSingleEmbeddings_x100_mfcc-sans0_pca_retrainIncr50withAllDiscoveredFeatures/analysis/coverage/evolution-run-analysis_coverage_step-100_1730551989151.json /Users/bjornpjo/QD/analysis/unsupervised/singleMapBDs-test/evoConf_singleMap_refSingleEmbeddings_x100_mfcc_pca_surpriseSelectorWithAE__2024-10/analysis/coverage/evolution-run-analysis_coverage_step-100_1730552012949.json 'Manual' 'retr. w. all' 'surprise sel.' -- 100 coverage customRef1 ./ 'Coverage' Iteration Combined_Results inside -0.05 -0.2 palettable_Set2_3

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
        print("Usage: script.py <json_files...> [labels...] -- <x_multiplier> <data_path> [terrain] [save_dir] [ylabel] [xlabel] [title] [legend_placement] [legend_x] [legend_y] [colormap]")
        print("Example: script.py file1.json file2.json 'Label 1' 'Label 2' -- 100 qdScores customRef1 ./output 'QD Score' Iteration Combined_QD_Scores inside 0.1 0.1 viridis")
        print("Labels are optional and must match the number of JSON files if provided")
        print("Use -- to separate JSON files and labels from other arguments")
        print("For nested paths without terrain, use 'none' for terrain parameter")
        print("Legend placement can be 'inside' (default) or 'outside'")
        print("Legend x,y are optional coordinates (0-1) for precise legend positioning")
        print("Colormap can be any matplotlib colormap (e.g., viridis, plasma) or palettable_Set1_3")
        sys.exit(1)

    # Find the separator between input files/labels and other arguments
    try:
        separator_index = sys.argv.index('--')
    except ValueError:
        print("Error: Please use -- to separate input files and labels from other arguments")
        sys.exit(1)

    # Get all arguments before the separator
    pre_separator_args = sys.argv[1:separator_index]
    remaining_args = sys.argv[separator_index + 1:]

    # Determine if labels are provided by checking if we have more arguments than JSON files
    json_files = [arg for arg in pre_separator_args if arg.endswith('.json')]
    custom_labels = pre_separator_args[len(json_files):] if len(pre_separator_args) > len(json_files) else []

    # Verify if labels match the number of JSON files when provided
    if custom_labels and len(custom_labels) != len(json_files):
        print("Error: Number of labels must match number of JSON files")
        sys.exit(1)

    if len(json_files) < 1 or len(remaining_args) < 2:
        print("Error: Insufficient arguments")
        sys.exit(1)

    x_multiplier = int(remaining_args[0])
    data_path = remaining_args[1].split('.')

    # Handle optional arguments
    terrain = remaining_args[2] if len(remaining_args) > 2 else "customRef1"
    if terrain.lower() == 'none':
        terrain = None

    save_dir = remaining_args[3] if len(remaining_args) > 3 else './'
    ylabel = remaining_args[4] if len(remaining_args) > 4 else (data_path[-1].replace('_', ' '))
    xlabel = remaining_args[5] if len(remaining_args) > 5 else 'Iteration'
    title = remaining_args[6] if len(remaining_args) > 6 else f"{data_path[-1]}_{terrain if terrain else ''}"
    legend_placement = remaining_args[7].lower() if len(remaining_args) > 7 else 'inside'
    legend_x = float(remaining_args[8]) if len(remaining_args) > 8 else None
    legend_y = float(remaining_args[9]) if len(remaining_args) > 9 else None

    # Add colormap parameter and make it correctly affect the colors
    colormap = remaining_args[10] if len(remaining_args) > 10 else 'viridis'
    print(f"####### Using colormap: {colormap}")
    colors = get_color_cycle(colormap)
    print(f"####### Generated colors: {colors}")

    print(f"####### Processing {len(json_files)} JSON files")
    print(f"####### title: {title}")
    print(f"####### ylabel: {ylabel}")
    print(f"####### xlabel: {xlabel}")
    print(f"####### legend_placement: {legend_placement}")
    print(f"####### legend_position: ({legend_x}, {legend_y})")

    # Set up the plot
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
    fig = plt.figure(figsize=(5*cm, 3*cm))
    
    left_margin = 0.25
    bottom_margin = 0.25
    right_margin = 0.95 if legend_placement != 'outside' else 0.75
    top_margin = 0.9

    ax = fig.add_axes([left_margin, bottom_margin, right_margin - left_margin, top_margin - bottom_margin])

    maxIterations = int(4800 / x_multiplier)
    legend_lines = []
    legend_lookup = {}  # Initialize empty dictionary for legend lookup

    # Count total number of lines to plot
    total_lines = sum(len(plotUtil.read_data_from_json(json_file)['evoRuns']) for json_file in json_files)
    
    # Create line styles list that matches the number of lines
    line_styles = ['-', '--', ':', '-.']
    line_styles = line_styles[:total_lines] if total_lines <= len(line_styles) else line_styles * ((total_lines + len(line_styles) - 1) // len(line_styles))
    
    # Adjust colors list to match number of lines if needed
    colors = colors[:total_lines] if total_lines <= len(colors) else colors * ((total_lines + len(colors) - 1) // len(colors))

    linestyle_cycler = cycler('color', colors) + cycler('linestyle', line_styles)
    
    ax.set_prop_cycle(linestyle_cycler)

    # Process each JSON file
    for i, json_file_path in enumerate(json_files):
        data = plotUtil.read_data_from_json(json_file_path)
        
        for oneEvorun in data['evoRuns']:
            # Get the nested data using the provided path and optional terrain
            nested_data = get_nested_value(oneEvorun, ['aggregates'] + data_path, terrain)
            
            means = np.array(nested_data['means'])[:maxIterations]
            stdDevs = np.array(nested_data['stdDevs'])[:maxIterations]

            x_values = np.arange(len(means)) * x_multiplier

            # Use custom label if provided, otherwise create shortened label
            if custom_labels:
                file_label = f"{custom_labels[i]}-{oneEvorun['label']}"
            else:
                file_label = f"{json_file_path.split('/')[-1].split('.')[0]}-{oneEvorun['label']}"
            
            line, = ax.plot(x_values, means, linewidth=2)
            fill = ax.fill_between(x_values, means - stdDevs, means + stdDevs, alpha=0.2)

            legend_lines.append((line, fill))
            legend_lookup[file_label] = custom_labels[i] if custom_labels else create_shortened_label(file_label)

    # Configure legend with optional position
    if legend_placement == 'outside':
        ax.legend(legend_lines, 
                 [legend_lookup[f"{custom_labels[i] if custom_labels else path.split('/')[-1].split('.')[0]}-{run['label']}"] 
                  for i, path in enumerate(json_files) 
                  for run in plotUtil.read_data_from_json(path)['evoRuns']],
                 bbox_to_anchor=(1.02, 1),
                 loc='upper left',
                 borderaxespad=0,
                 handlelength=1)
    else:
        if legend_x is not None and legend_y is not None:
            # Use custom position
            ax.legend(legend_lines,
                     [legend_lookup[f"{custom_labels[i] if custom_labels else path.split('/')[-1].split('.')[0]}-{run['label']}"]
                      for i, path in enumerate(json_files)
                      for run in plotUtil.read_data_from_json(path)['evoRuns']],
                     bbox_to_anchor=(legend_x, legend_y),
                     loc='center',
                     frameon=True,
                     borderaxespad=0,
                     handlelength=1)
        else:
            # Use automatic positioning
            ax.legend(legend_lines,
                     [legend_lookup[f"{custom_labels[i] if custom_labels else path.split('/')[-1].split('.')[0]}-{run['label']}"]
                      for i, path in enumerate(json_files)
                      for run in plotUtil.read_data_from_json(path)['evoRuns']],
                     loc='best',
                     frameon=True,
                     borderaxespad=0,
                     handlelength=1)

    # Set up the axes
    x_max = maxIterations * x_multiplier
    desired_ticks = np.linspace(0, x_max, 3)
    xticklabels = [f"{int(x/1000)}K" for x in desired_ticks]
    ax.set_xticks(desired_ticks)
    ax.set_xticklabels(xticklabels)
    ax.set_xlim(-x_max*0.05, x_max*1.05)

    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)

    plt.savefig(f"{save_dir}{title}_plot.pdf", bbox_inches='tight', pad_inches=0.05)

if __name__ == "__main__":
    main()