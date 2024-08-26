import sys
import json
import matplotlib.pyplot as plt
import numpy as np
from cycler import cycler
from palettable.colorbrewer.qualitative import Set1_3 # _duration-comparison-singleCellWin
colors = Set1_3.mpl_colors

def plot_genome_count_statistics(data_file_path, plot_file_path):
    # Read the JSON file
    with open(data_file_path, 'r') as file:
        data = json.load(file)

    # Extract the relevant data
    stats = data['evoRuns'][0]['aggregates']['genomeSetsThroughRenderingVariations']['genomeCount']
    means = stats['means'][1:]  # Skip the first data point
    stddevs = stats['stdDevs'][1:]  # Skip the first data point

    # Extract intersection2 and intersection3 data
    x = np.array(range(1, len(means) + 1))
    intersection2_means = np.array([d['intersection2'] for d in means])
    intersection3_means = np.array([d['intersection3'] for d in means])
    intersection2_stddevs = np.array([d['intersection2'] for d in stddevs])
    intersection3_stddevs = np.array([d['intersection3'] for d in stddevs])

    # Calculate confidence intervals (95% CI)
    confidence_interval = 1.96  # for 95% CI
    intersection2_error = confidence_interval * intersection2_stddevs
    intersection3_error = confidence_interval * intersection3_stddevs

    # https://github.com/jbmouret/matplotlib_for_papers#setting-the-limits-and-the-ticks
    params = {
      'axes.labelsize': 6,
      'font.size': 8,
      'legend.fontsize': 5,
      'xtick.labelsize': 6,
      'ytick.labelsize': 6,
      'text.usetex': False,
    #    'figure.figsize': [7, 4] # instead of 4.5, 4.5
        'figure.constrained_layout.use': True
      }
    plt.rcParams.update(params)

    # # Create the plot
    # plt.figure(figsize=(12, 6))

    cm = 1/2.54  # centimeters in inches
    plt.figure(figsize=(10*cm, 4*cm))

    linestyle_cycler = cycler('color', colors) + cycler('linestyle',['-','--',':'])
    plt.rc('axes', prop_cycle=linestyle_cycler)
    
    # Plot intersection2
    plt.plot(
        x, intersection2_means, 
        # 'b-', linestyle='solid', 
        label='2 dur. intersect.'
        )
    plt.fill_between(x, intersection2_means - intersection2_error, 
                     intersection2_means + intersection2_error, 
                     alpha=0.2,
                    #  color='blue'
                     )

    # Plot intersection3
    plt.plot(
        x, intersection3_means, 
        # 'r-', linestyle='dashed', 
        label='3 dur. intersect.'
        )
    plt.fill_between(x, intersection3_means - intersection3_error, 
                     intersection3_means + intersection3_error, 
                     alpha=0.2, 
                    #  color='red'
                     )

    plt.xlabel('Generation')
    plt.ylabel('Intersections')
    # plt.title('Intersection2 and Intersection3 Means with 95% Confidence Intervals')
    plt.legend()

    # Format x-axis to show 'K' for thousands
    plt.gca().xaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'{int(x)}K'))

    title = "genomeIntersectionsThroughRenderingVariations" + data_file_path.split('/')[4]

    # Save the plot
    plt.savefig(plot_file_path + title + ".pdf")
    plt.close()  # Close the figure to free up memory

# Main execution
if __name__ == "__main__":
    json_file_path = sys.argv[1]
    if len(sys.argv) > 2:
        save_dir = sys.argv[2]
    else:
        save_dir = './'

    plot_genome_count_statistics(json_file_path, save_dir)