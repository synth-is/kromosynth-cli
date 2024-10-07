import itertools
import subprocess
import argparse

# List of features
features = [
    "spectral_centroid",
    "spectral_spread",
    "spectral_skewness",
    "spectral_kurtosis",
    "spectral_rolloff",
    "spectral_decrease",
    "spectral_slope",
    "spectral_flux",
    "spectral_crest_factor",
    "spectral_flatness",
    "tonal_power_ratio",
    "max_autocorrelation",
    "zero_crossing_rate"
]

def parse_arguments():
    parser = argparse.ArgumentParser(description="Generate and execute 2D feature combinations for remap-between-elite-containers.sh")
    parser.add_argument("base_path", help="Base path (e.g., './evoruns')")
    parser.add_argument("evo_run_id", help="Evolution run ID")
    parser.add_argument("terrain_name_from", help="Terrain name from (e.g., 'customRef1')")
    parser.add_argument("quality_evaluation_feature_type", help="Quality evaluation feature type (e.g., 'mfcc')")
    parser.add_argument("projection_endpoint", help="Projection endpoint (e.g., '/raw')")
    return parser.parse_args()

def main():
    args = parse_arguments()

    # Base command
    base_command = [
        "./remap-between-elite-containers.sh",
        args.base_path,
        args.evo_run_id,
        args.terrain_name_from,
        "",  # This will be filled with the feature combination
        args.quality_evaluation_feature_type,
        "",  # This will be filled with the feature extraction endpoint
        args.projection_endpoint
    ]

    # Generate all 2D combinations
    combinations = list(itertools.combinations(features, 2))

    # Execute commands for each combination
    for combo in combinations:
        feature1, feature2 = combo
        
        # Create the feature combination name
        feature_combo_name = f"{feature1}X{feature2}"
        
        # Create the feature extraction endpoint
        feature_extraction_endpoint = f"/manual?features={feature1},{feature2}"
        
        # Update the command with the specific combination
        command = base_command.copy()
        command[4] = feature_combo_name
        command[6] = feature_extraction_endpoint
        
        print(f"Executing command for {feature_combo_name}")
        print(" ".join(command))
        
        # Execute the command
        try:
            subprocess.run(command, check=True)
            print(f"Command for {feature_combo_name} executed successfully")
        except subprocess.CalledProcessError as e:
            print(f"Error executing command for {feature_combo_name}: {e}")
        
        print("\n" + "-"*50 + "\n")

    print("All combinations processed.")

if __name__ == "__main__":
    main()

# Run as:
# python generate_2d_combinations.py "./evoruns" "01J9AFWBC69ZNM2SKPEKHPXH60_evoConf_singleMap_nsynthTopScore_x100_mfcc_pca_retrain__2024-09" "customRef1" "mfcc" "/raw"