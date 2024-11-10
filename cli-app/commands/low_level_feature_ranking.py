import os
import json
import numpy as np
import pandas as pd
from scipy.stats import pearsonr
import argparse

def load_json_files(directory):
    data = {}
    file_count = 0
    print(f"Loading JSON files from the directory: {directory}")
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith('.json'):
                file_count += 1
                with open(os.path.join(root, file), 'r') as f:
                    file_data = json.load(f)
                    for key, value in file_data.items():
                        if key.startswith("manual-"):  # Only consider keys starting with "manual-"
                            if key not in data:
                                data[key] = []
                            data[key].extend(value)
    print(f"Total files loaded: {file_count}")
    return data

def pad_data(data):
    max_length = max(len(values) for values in data.values())
    padded_data = {key: values + [np.nan] * (max_length - len(values)) for key, values in data.items()}
    return padded_data

def compute_variance(data):
    print("Computing variances for each feature...")
    variances = {key: np.nanvar(values) for key, values in data.items()}
    print("Variances computed.")
    return variances

def compute_cross_correlations(data):
    print("Computing cross-correlations between features...")
    keys = list(data.keys())
    correlations = pd.DataFrame(index=keys, columns=keys)
    for i in range(len(keys)):
        for j in range(len(keys)):
            if i == j:
                correlations.iloc[i, j] = 1.0
            elif pd.isna(correlations.iloc[i, j]):
                valid_idx = (~np.isnan(data[keys[i]])) & (~np.isnan(data[keys[j]]))
                valid_data_i = np.asarray(data[keys[i]])[valid_idx]
                valid_data_j = np.asarray(data[keys[j]])[valid_idx]
                if len(valid_data_i) > 1:
                    corr, _ = pearsonr(valid_data_i, valid_data_j)
                else:
                    corr = 0
                correlations.iloc[i, j] = corr
                correlations.iloc[j, i] = corr
    print("Cross-correlations computed.")
    return correlations

def rank_features(data, variances, correlations):
    print("Ranking features based on variance and cross-correlation...")
    sorted_variances = sorted(variances.items(), key=lambda x: x[1], reverse=True)
    
    selected_features = []
    full_ranking = []
    
    while sorted_variances:
        feature, var = sorted_variances.pop(0)
        if not selected_features:
            selected_features.append((feature, var))
            full_ranking.append((feature, var, 'Selected', 'First selected feature'))
        else:
            max_corr = 0
            redundant = False
            for sel_feature, _ in selected_features:
                corr = abs(correlations.loc[sel_feature, feature])
                if corr > 0.7:
                    redundant = True
                if corr > max_corr:
                    max_corr = corr
            if not redundant or len(selected_features) < 2:
                selected_features.append((feature, var))
                status = 'Selected'
                correlation_info = f'Max correlation with others: {max_corr}'
            else:
                status = 'Redundant'
                correlation_info = f'Max correlation with selected: {max_corr}'
                
            full_ranking.append((feature, var, status, correlation_info))
    
    print("Feature ranking completed.")
    return selected_features, full_ranking

def main(directory):
    data = load_json_files(directory)
    data = pad_data(data)
    
    variances = compute_variance(data)
    
    correlations = compute_cross_correlations(data)
    print("\nCross-Correlation Matrix:")
    print(correlations)
    
    selected_features, full_ranking = rank_features(data, variances, correlations)
    
    print("\nFull Ranking Based on Variance and Cross-Correlation Criteria:")
    for feature, var, status, correlation_info in full_ranking:
        print(f"Feature: {feature}, Variance: {var}, Status: {status}, Correlation Info: {correlation_info}")

    print("\nTop 2 Selected Features:")
    for feature, var in selected_features[:2]:
        print(f"Feature: {feature}, Variance: {var}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process JSON files to rank features based on variance and cross-correlation.")
    parser.add_argument("directory", type=str, help="Path to the directory containing JSON files")
    args = parser.parse_args()

    main(args.directory)
