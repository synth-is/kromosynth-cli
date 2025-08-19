#!/usr/bin/env python3

import argparse
import json
import matplotlib.pyplot as plt
import matplotlib as mpl

def read_json_file(filepath, metric_name):
    """Read and extract relevant metrics from a JSON file."""
    with open(filepath, 'r') as f:
        data = json.load(f)
    
    # Extract metrics
    metrics_container = data['evoRuns'][0]['aggregates'][metric_name]
    
    result = {
        'goal_switches': {
            'mean': metrics_container['averageGoalSwitchCounts']['means'],
            'stddev': metrics_container['averageGoalSwitchCounts']['stdDevs'],
            'variance': metrics_container['averageGoalSwitchCounts']['variances']
        }
    }
    
    # Only add champion counts if available
    if 'averageChampionCounts' in metrics_container:
        result['champion_counts'] = {
            'mean': metrics_container['averageChampionCounts']['means'],
            'stddev': metrics_container['averageChampionCounts']['stdDevs'],
            'variance': metrics_container['averageChampionCounts']['variances']
        }
    
    return result

def create_comparison_plot(data_files, labels, output_file, metric_name, xlabel, figsize=(10, 8)):
    """Create a horizontal point plot with error bars."""
    # Set up the plot style
    plt.style.use('seaborn-v0_8-whitegrid')
    mpl.rcParams['pdf.fonttype'] = 42  # Ensure text is editable in PDF
    mpl.rcParams['ps.fonttype'] = 42
    
    # Create figure and axis
    fig, ax = plt.subplots(figsize=figsize)
    
    # Read all data
    data = []
    for filepath in data_files:
        metrics = read_json_file(filepath, metric_name)
        data.append(metrics)
    
    # Number of variants
    n_variants = len(data)
    
    # Create y-positions for each variant
    y_positions = range(n_variants)
    
    # Plot points and error bars for both metrics
    for i, (metrics, label) in enumerate(zip(data, labels)):
        # Plot goal switches with circles
        ax.errorbar(
            x=metrics['goal_switches']['mean'],
            y=i,
            xerr=metrics['goal_switches']['stddev'],
            fmt='o',
            color='black',
            capsize=5,
            capthick=1.5,
            elinewidth=1.5,
            markersize=6,
            label='Goal Switches' if i == 0 else None  # Only add to legend once
        )
        
        # Plot champion counts only if available
        if 'champion_counts' in metrics:
            ax.errorbar(
                x=metrics['champion_counts']['mean'],
                y=i,
                xerr=metrics['champion_counts']['stddev'],
                fmt='s',
                color='red',
                capsize=5,
                capthick=1.5,
                elinewidth=1.5,
                markersize=6,
                label='Elite Counts' if i == 0 else None  # Only add to legend once
            )
    
    # Customize the plot
    ax.set_yticks(y_positions)
    ax.set_yticklabels(labels)
    
    # Add labels and title
    ax.set_xlabel(xlabel)
    
    # Add legend
    ax.legend()
    
    # Adjust layout
    plt.tight_layout()
    
    # Save to PDF
    plt.savefig(output_file, bbox_inches='tight', dpi=300)
    plt.close()

def main():
    parser = argparse.ArgumentParser(description='Generate QD variant comparison plot')
    parser.add_argument(
        '--files-list',
        type=str,
        help='Path to a text file containing JSON file paths (one per line)'
    )
    parser.add_argument(
        '--files',
        nargs='*',
        help='JSON files containing QD analysis results (alternative to --files-list)'
    )
    parser.add_argument(
        '--label',
        action='append',
        help='Label for a variant (specify multiple times for multiple variants)',
        required=True
    )
    parser.add_argument(
        '--output',
        default='qd_comparison.pdf',
        help='Output PDF file path (default: qd_comparison.pdf)'
    )
    parser.add_argument(
        '--metric',
        type=str,
        default='goalSwitches',
        help='Metric name in JSON path (default: goalSwitches)'
    )
    parser.add_argument(
        '--xlabel',
        type=str,
        default='Average Goal Switch Count',
        help='Label for x-axis'
    )
    parser.add_argument(
        '--figsize',
        nargs=2,
        type=float,
        default=[10, 8],
        help='Figure size in inches (width height)'
    )
    
    args = parser.parse_args()  # Parse the arguments first!
    
    # Get list of files either from command line or from file
    if args.files_list:
        with open(args.files_list, 'r') as f:
            files = [line.strip() for line in f if line.strip()]
    elif args.files:
        files = args.files
    else:
        parser.error('Either --files or --files-list must be provided')

    # Verify number of labels matches number of files
    if len(files) != len(args.label):
        parser.error('Number of labels must match number of input files')
    
    create_comparison_plot(
        files,  # Use files instead of args.files
        args.label,
        args.output,
        args.metric,
        args.xlabel,
        figsize=args.figsize
    )

if __name__ == '__main__':
    main()