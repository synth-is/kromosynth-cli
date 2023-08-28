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
def extract_data_arrays(data, attribute):
    arrays = []
    for evo_run in data['evoRuns']:
        iterations = evo_run['iterations']
        if iterations and len(iterations) > 0:
            for iteration in iterations:
                if attribute in iteration:
                    iteration["label"] = evo_run["label"]
                    arrays.append({
                        "dataArray": iteration[attribute],
                        "label": evo_run["label"]   
                    })
    return arrays

# Render graph for each array
def render_graphs(arrays, x_multiplier, plotFunc):
    num_arrays = len(arrays)
    num_cols = 2  # Number of columns in the grid (you can adjust this)
    num_rows = (num_arrays + num_cols - 1) // num_cols
    fig, axs = plt.subplots(num_rows, num_cols, figsize=(12, 65))
    fig.tight_layout(pad=3.0)

    for i, arrayContainer in enumerate(arrays):
        array = arrayContainer["dataArray"]
        arrayLabel = arrayContainer["label"]
        x_values = np.arange(len(array)) * x_multiplier
        row = i // num_cols
        col = i % num_cols
        ax = axs[row, col] if num_rows > 1 else axs[col]

        plotFunc(ax, x_values, array, arrayLabel)

        # if all(isinstance(element, (int, float)) for element in array):
        #     # Array contains numbers
        #     ax.plot(x_values, array)
        # elif all(isinstance(element, dict) for element in array):
        #     # Array contains objects
        #     attributes = array[0].keys()  # Assuming all objects have the same attributes
        #     for attribute in attributes:
        #         values = [obj[attribute] for obj in array]
        #         ax.plot(x_values, values, label=attribute)
        #     ax.legend()

        # ax.set_title(arrayLabel, fontsize=10, pad=10)
        # plt.xlabel('Iteration')
        # plt.ylabel(y_label)

    # Remove empty subplots
    for i in range(num_arrays, num_rows * num_cols):
        row = i // num_cols
        col = i % num_cols
        axs[row, col].axis('off')

    plt.show()

