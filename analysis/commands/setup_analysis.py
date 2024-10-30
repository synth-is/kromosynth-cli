#!/usr/bin/env python3
import os
import argparse
import glob
import json
import subprocess
import time
from datetime import datetime

def create_directory_structure(base_path, analysis_type):
    """Create the directory structure for an experiment."""
    directories = {
        'config': os.path.join(base_path, 'config'),
        'script': os.path.join(base_path, 'script'),
        'analysis': os.path.join(base_path, 'analysis', analysis_type),
        'plot': os.path.join(base_path, 'plot', analysis_type)
    }
    
    for directory in directories.values():
        os.makedirs(directory, exist_ok=True)
    
    return directories

def create_and_run_analysis_script(script_path, config_path, analysis_path, analysis_operation, step_size=None, terrain_name=None):
    """Create and execute the analysis.sh script, returning the generated files."""
    commands = []
    
    # Base command for kromosynth
    base_cmd = f'kromosynth evo-runs-analysis --analysis-operations {analysis_operation} '
    base_cmd += f'--evolution-runs-config-json-file {config_path} '
    base_cmd += f'--write-to-folder {analysis_path}'
    
    # Add step size if provided
    if step_size:
        base_cmd += f' --step-size {step_size}'
        # commands.append(base_cmd_with_step)
    
    if terrain_name:
        base_cmd += f' --terrain-name {terrain_name}'
        # commands.append(base_cmd_with_terrain)
    
    # Always add the command without step size
    commands.append(base_cmd)
    
    # Write commands to analysis.sh
    with open(script_path, 'w') as f:
        f.write('#!/bin/bash\n\n')
        f.write('\n'.join(commands))
    
    # Make the script executable
    os.chmod(script_path, 0o755)
    
    # Get initial state of analysis directory
    initial_files = set(glob.glob(os.path.join(analysis_path, '*.json')))
    
    # Execute the analysis commands
    print(f"Executing analysis commands...")
    for cmd in commands:
        try:
            subprocess.run(cmd, shell=True, check=True)
        except subprocess.CalledProcessError as e:
            print(f"Error executing command: {cmd}")
            print(f"Error: {e}")
            return []
    
    # Get final state of analysis directory and find new files
    final_files = set(glob.glob(os.path.join(analysis_path, '*.json')))
    new_files = list(final_files - initial_files)
    
    print(f"Generated {len(new_files)} new analysis files")
    return new_files

def create_plot_script(script_path, analysis_files, plot_path, plotting_script_path, transparent_background, color_map, iteration=1):
    """Create the plot.sh script using the actual generated analysis files."""
    commands = []
    
    # Sort files to ensure consistent ordering
    analysis_files = sorted(analysis_files)
    
    # Create plotting commands for each analysis file
    for analysis_file in analysis_files:
        # Ensure plot_path ends with a slash for the plotting script
        plot_path_with_slash = plot_path if plot_path.endswith('/') else f"{plot_path}/"
        plot_cmd = f'python3 {plotting_script_path} {analysis_file} {iteration} {plot_path_with_slash} {"true" if transparent_background else "false"} {color_map}' 
        commands.append(plot_cmd)
    
    # Write commands to plot.sh
    with open(script_path, 'w') as f:
        f.write('#!/bin/bash\n\n')
        if commands:
            f.write('\n'.join(commands))
        else:
            f.write('# No analysis files were generated to plot\n')
    
    # Make the script executable
    os.chmod(script_path, 0o755)
    
    # Execute the plotting commands
    print(f"Executing plotting commands...")
    for cmd in commands:
        try:
            subprocess.run(cmd, shell=True, check=True)
        except subprocess.CalledProcessError as e:
            print(f"Error executing command: {cmd}")
            print(f"Error: {e}")

def setup_experiment_structure(config_file, base_output_path, analysis_operation, plotting_script_path=None, step_size=None, terrain_name=None, transparent_background=False, color_map='viridis'):
    """Set up the complete experiment structure for a single config file."""
    # Extract experiment name from config file
    experiment_name = os.path.splitext(os.path.basename(config_file))[0]
    
    # Create experiment base path
    experiment_path = os.path.join(base_output_path, experiment_name)
    
    # Create directory structure
    directories = create_directory_structure(experiment_path, analysis_operation)
    
    # Copy config file to config directory
    config_dest = os.path.join(directories['config'], os.path.basename(config_file))
    with open(config_file, 'r') as src, open(config_dest, 'w') as dst:
        dst.write(src.read())
    
    # Create and run analysis script, get generated files
    analysis_script_path = os.path.join(directories['script'], 'analyse.sh')
    generated_files = create_and_run_analysis_script(
        analysis_script_path,
        config_dest,
        directories['analysis'],
        analysis_operation,
        step_size,
        terrain_name
    )
    
    # Create and run plot script only if plotting_script_path is provided
    if plotting_script_path:
        plot_script_path = os.path.join(directories['script'], 'plot.sh')
        create_plot_script(
            plot_script_path,
            generated_files,
            directories['plot'],
            plotting_script_path,
            transparent_background,
            color_map
        )

def main():
    parser = argparse.ArgumentParser(description='Setup experiment analysis structure')
    parser.add_argument('config_dir', help='Directory containing experiment config files')
    parser.add_argument('base_output_path', help='Base path for output directories')
    parser.add_argument('analysis_operation', help='Analysis operation to perform (e.g., score-matrix)')
    parser.add_argument('--plotting-script', help='Path to the plotting script (optional)', dest='plotting_script_path')
    parser.add_argument('--step-size', type=int, help='Step size for analysis (optional)')
    parser.add_argument('--terrain-name', help='Name of the terrain to analyze (optional)')
    parser.add_argument('--transparent-background', action='store_true', help='Generate plots with a transparent background (optional)')
    parser.add_argument('--color-map', default='viridis', help='Color map to use for plotting (default: viridis)')
    
    args = parser.parse_args()
    
    # Find all .jsonc files in the config directory
    config_files = glob.glob(os.path.join(args.config_dir, '*.jsonc'))
    
    if not config_files:
        print(f"No .jsonc files found in {args.config_dir}")
        return
    
    # Process each config file
    for config_file in config_files:
        print(f"\nProcessing {config_file}...")
        setup_experiment_structure(
            config_file,
            args.base_output_path,
            args.analysis_operation,
            args.plotting_script_path,
            args.step_size,
            args.terrain_name,
            args.transparent_background,
            args.color_map
        )
        print(f"Completed setup for {config_file}")

if __name__ == '__main__':
    main()