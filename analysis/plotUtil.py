import json
import matplotlib.pyplot as plt
import numpy as np

def add_numbers(x, y):
    return x + y

# Read data from JSON file
def read_data_from_json(file_path):
    with open(file_path, 'r') as f:
        data = json.load(f)
    return data

# Extract data arrays from JSON
def extract_data_arrays(data, attribute, forceFloat=False):
    arrays = []
    for evo_run in data['evoRuns']:
        iterations = evo_run['iterations']
        if iterations and len(iterations) > 0:
            for iteration in iterations:
                if attribute in iteration:
                    iteration["label"] = evo_run["label"]
                    array = iteration[attribute]
                    # if all(isinstance(element, (int, float)) for element in array):
                    if forceFloat:
                        arrays.append({
                            "dataArray": np.array(array).astype(np.float), # https://www.geeksforgeeks.org/using-numpy-to-convert-array-elements-to-float-type/
                            "label": evo_run["label"]   
                        })
                    # elif all(isinstance(element, dict) for element in array):
                    else:
                        arrays.append({
                            "dataArray": array,
                            "label": evo_run["label"]   
                        })

    return arrays

def get_plotter():
    return plt

# Render graph for each array
def render_graphs(arrays, x_multiplier, plotFunc, subPlotWidth, subPlotHeight, title, resolution=None):

    if resolution:
        plt.rcParams["figure.dpi"] = resolution
        plt.rcParams["savefig.dpi"] = resolution

    num_arrays = len(arrays)
    num_cols = 2  # Number of columns in the grid (you can adjust this)
    num_rows = (num_arrays + num_cols - 1) // num_cols
    fig, axs = plt.subplots(num_rows, num_cols, figsize=(subPlotWidth, subPlotHeight), constrained_layout=True) # constrained_layout: https://stackoverflow.com/a/55775739/169858
    fig.tight_layout(pad=3.0)

    for i, arrayContainer in enumerate(arrays):
        array = arrayContainer["dataArray"]
        arrayLabel = arrayContainer["label"]
        x_values = np.arange(len(array)) * x_multiplier
        row = i // num_cols
        col = i % num_cols
        ax = axs[row, col] if num_rows > 1 else axs[col]

        plotFunc(plt, ax, x_values, array, arrayLabel)

    # Remove empty subplots
    for i in range(num_arrays, num_rows * num_cols):
        row = i // num_cols
        col = i % num_cols
        axs[row, col].axis('off')

    # Add title
    plt.suptitle(title, fontsize=16, y=1.0)
    plt.show()
