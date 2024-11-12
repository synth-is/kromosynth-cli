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

def clean_old_analysis_files(analysis_path):
    """Remove older analysis files with the same base name but different timestamps."""
    # Group files by their base name (everything before the timestamp)
    file_groups = {}
    for file in glob.glob(os.path.join(analysis_path, '*.json')):
        # Split filename into base and timestamp
        # e.g., "evolution-run-analysis_qd-scores_step-100_1730545634653.json"
        # becomes "evolution-run-analysis_qd-scores_step-100" and "1730545634653"
        base = '_'.join(os.path.basename(file).split('_')[:-1])
        timestamp = int(os.path.basename(file).split('_')[-1].split('.')[0])
        
        if base not in file_groups:
            file_groups[base] = []
        file_groups[base].append((timestamp, file))
    
    # For each group, keep only the newest file
    for base, files in file_groups.items():
        if len(files) > 1:
            # Sort by timestamp
            sorted_files = sorted(files, key=lambda x: x[0])
            # Remove all but the newest file
            for timestamp, file in sorted_files[:-1]:
                print(f"Removing older analysis file: {file}")
                os.remove(file)


def create_and_run_analysis_script(script_path, config_path, analysis_path, analysis_operation, step_size=None, terrain_name=None):
    """Create and execute the analysis.sh script, returning the generated files."""
    # Base command for kromosynth
    base_cmd = f'kromosynth evo-runs-analysis --analysis-operations {analysis_operation} '
    base_cmd += f'--evolution-runs-config-json-file {config_path} '
    base_cmd += f'--write-to-folder {analysis_path}'
    
    if step_size:
        base_cmd += f' --step-size {step_size}'
    
    if terrain_name:
        base_cmd += f' --terrain-name {terrain_name}'
    
    print(f"Running analysis command: {base_cmd}")

    # Add command to script (for reference)
    append_unique_command(script_path, base_cmd)
    
    # Always execute the command
    print(f"Executing analysis command...")
    try:
        subprocess.run(base_cmd, shell=True, check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error executing command: {base_cmd}")
        print(f"Error: {e}")
        return []
    
    # Now clean old analysis files *after* new one is written
    clean_old_analysis_files(analysis_path)
    
    # Get the newest analysis file
    analysis_files = glob.glob(os.path.join(analysis_path, '*.json'))
    if not analysis_files:
        return []
    
    # Sort by timestamp and return only the newest file
    newest_file = sorted(analysis_files, key=lambda x: int(os.path.basename(x).split('_')[-1].split('.')[0]))[-1]
    return [newest_file]

def create_plot_command(plotting_script_path, analysis_file, plot_path, analysis_operation, terrain_name, step_size=None, **kwargs):
    data_path = kwargs.get('data_path')
    y_label = kwargs.get('ylabel')
    """Create appropriate plotting command based on analysis operation and script."""
    # Ensure plot_path ends with a slash
    plot_path_with_slash = plot_path if plot_path.endswith('/') else f"{plot_path}/"
    
    # Define plotting patterns for different analysis operations
    # Operations can be grouped by using tuples as keys
    plotting_patterns = {
        # Score matrix operations
        ('score-matrix', 'score-matrices'): lambda: f'python3 {plotting_script_path} {analysis_file} 1 {plot_path_with_slash} '
                                                   f'{"true" if kwargs.get("transparent_background") else "false"} '
                                                   f'{kwargs.get("color_map", "viridis")}',
        # QD score operations
        ('qd-scores', 'diversity-measures', 'coverage', 'genome-statistics', 'grid-mean-fitness'): lambda: f'python3 {plotting_script_path} {analysis_file} {step_size} {data_path} {terrain_name if terrain_name else ""} {plot_path_with_slash} "{y_label}"'
    }
    
    # Find matching pattern
    print(f'---- looking for ', analysis_operation, ' in ', plotting_patterns)
    for operations, pattern in plotting_patterns.items():
        if analysis_operation in operations:
            print(f'--- found ', analysis_operation, ' in ', operations)
            return pattern()
    
    # Default pattern if no match found
    return f'python3 {plotting_script_path} {analysis_file} 1 {plot_path_with_slash}'

def append_unique_command(script_path, new_command):
    """Append a command to a script file only if it doesn't already exist."""
    existing_commands = set()
    
    # Read existing commands if file exists
    if os.path.exists(script_path):
        with open(script_path, 'r') as f:
            lines = f.readlines()
            # Skip shebang and empty lines
            existing_commands = set(line.strip() for line in lines if line.strip() and not line.startswith('#!'))
    
    # Only add if command is new
    if new_command not in existing_commands:
        mode = 'a' if os.path.exists(script_path) else 'w'
        with open(script_path, 'w' if mode == 'w' else 'a') as f:
            if mode == 'w':
                f.write('#!/bin/bash\n\n')
            f.write(new_command + '\n')
        
        if mode == 'w':
            os.chmod(script_path, 0o755)
        
        return True
    return False

def get_normalized_plot_command(plot_cmd):
    """
    Normalize plot command by removing timestamp from file path to check for duplicates.
    e.g., "evolution-run-analysis_score-matrix_step-1_1730127221674.json" -> "evolution-run-analysis_score-matrix_step-1"
    """
    parts = plot_cmd.split()
    for i, part in enumerate(parts):
        if '.json' in part:
            # Extract base name without timestamp and extension
            base = '_'.join(os.path.basename(part).split('_')[:-1])
            # Replace full path with base name in the command
            parts[i] = base
    return ' '.join(parts)

def append_unique_plot_command(script_path, new_command):
    """Append a plotting command to script file only if a similar command doesn't exist."""
    existing_commands = []
    normalized_new_command = get_normalized_plot_command(new_command)
    
    # Read existing commands if file exists
    if os.path.exists(script_path):
        with open(script_path, 'r') as f:
            lines = f.readlines()
            # Skip shebang and empty lines
            existing_commands = [line.strip() for line in lines if line.strip() and not line.startswith('#!')]
    
    # Check if normalized version of command exists
    for existing_cmd in existing_commands:
        if get_normalized_plot_command(existing_cmd) == normalized_new_command:
            # Update existing command instead of adding new one
            existing_commands = [new_command if get_normalized_plot_command(cmd) == normalized_new_command else cmd 
                               for cmd in existing_commands]
            with open(script_path, 'w') as f:
                f.write('#!/bin/bash\n\n')
                f.write('\n'.join(existing_commands) + '\n')
            return True
    
    # Command is new, append it
    mode = 'a' if os.path.exists(script_path) else 'w'
    with open(script_path, 'w' if mode == 'w' else 'a') as f:
        if mode == 'w':
            f.write('#!/bin/bash\n\n')
        f.write(new_command + '\n')
    
    if mode == 'w':
        os.chmod(script_path, 0o755)
    
    return True

def create_plot_script(script_path, analysis_files, plot_path, plotting_script_path, analysis_operation, terrain_name, step_size=None, **kwargs):
    """Create the plot.sh script using the actual generated analysis files."""
    # Sort files to ensure consistent ordering
    analysis_files = sorted(analysis_files)
    
    # Create plotting commands for each analysis file
    for analysis_file in analysis_files:
        plot_cmd = create_plot_command(
            plotting_script_path, 
            analysis_file, 
            plot_path, 
            analysis_operation,
            terrain_name,
            step_size,
            **kwargs
        )
        # Add command to script if it's unique (ignoring timestamps)
        append_unique_plot_command(script_path, plot_cmd)
        
        # Execute the plotting command
        print(f"Executing plotting command: {plot_cmd}")
        try:
            subprocess.run(plot_cmd, shell=True, check=True)
        except subprocess.CalledProcessError as e:
            print(f"Error executing command: {plot_cmd}")
            print(f"Error: {e}")

def has_existing_analysis(analysis_path, analysis_operation, step_size=None, terrain_name=None):
    """Check if there's an existing analysis file of the same type."""
    print(f"\nChecking for existing analysis in: {analysis_path}")
    if not os.path.exists(analysis_path):
        print(f"Analysis path does not exist")
        return False

    # Get list of all json files
    json_files = glob.glob(os.path.join(analysis_path, '*.json'))
    print(f"Found {len(json_files)} JSON files in directory")
    
    # Check each file
    for file_path in json_files:
        file_name = os.path.basename(file_path)
        print(f"Checking file: {file_name}")
        
        # Get components without timestamp
        components = file_name.split('_')[:-1]  # Remove timestamp part
        
        # Check required components
        if not (components[0] == "evolution-run-analysis" and
                components[1] == analysis_operation):
            continue
            
        # Check if step size matches
        has_matching_step = any(comp == f"step-{step_size}" for comp in components)
        if step_size and not has_matching_step:
            continue
            
        # Check if terrain matches
        has_matching_terrain = any(
            comp == terrain_name or comp == f"terrain-{terrain_name}" 
            for comp in components
        )
        if terrain_name and not has_matching_terrain:
            continue
            
        print(f"Found matching analysis file: {file_path}")
        return True
            
    print("No matching analysis file found")
    return False

def setup_experiment_structure(config_file, base_output_path, analysis_operation, plotting_script_path=None, 
                             step_size=None, terrain_name=None, skip_analysis=False, skip_if_exists=False, **kwargs):
    """Set up the complete experiment structure for a single config file."""
    # Extract experiment name from config file
    experiment_name = os.path.splitext(os.path.basename(config_file))[0]
    
    # Create experiment base path
    experiment_path = os.path.join(base_output_path, experiment_name)
    
    # Create directory structure
    directories = create_directory_structure(experiment_path, analysis_operation)
    
    # Check if we should skip this config due to existing analysis
    if skip_if_exists and has_existing_analysis(directories['analysis'], analysis_operation, step_size, terrain_name):
        print(f"Skipping {experiment_name} - analysis already exists")
        return
    
    # Copy config file to config directory
    config_dest = os.path.join(directories['config'], os.path.basename(config_file))
    with open(config_file, 'r') as src, open(config_dest, 'w') as dst:
        dst.write(src.read())
    
    generated_files = []
    if not skip_analysis:
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
    else:
        # If skipping analysis, just get the newest existing analysis files
        analysis_path = directories['analysis']
        if os.path.exists(analysis_path):
            analysis_files = glob.glob(os.path.join(analysis_path, '*.json'))
            if analysis_files:
                newest_file = sorted(analysis_files, 
                                   key=lambda x: int(os.path.basename(x).split('_')[-1].split('.')[0]))[-1]
                generated_files = [newest_file]
    
    # Create and run plot script only if plotting_script_path is provided and we have files to plot
    if plotting_script_path and generated_files:
        plot_script_path = os.path.join(directories['script'], 'plot.sh')
        create_plot_script(
            plot_script_path,
            generated_files,
            directories['plot'],
            plotting_script_path,
            analysis_operation,
            terrain_name,
            step_size,
            **kwargs
        )

def main():
    parser = argparse.ArgumentParser(description='Setup experiment analysis structure')
    parser.add_argument('config_dir', help='Directory containing experiment config files')
    parser.add_argument('base_output_path', help='Base path for output directories')
    parser.add_argument('analysis_operation', help='Analysis operation to perform (e.g., score-matrix, score-matrices, qd-scores)')
    parser.add_argument('--data-path', required=True, help='Path to the data directory')
    parser.add_argument('--plotting-script', help='Path to the plotting script (optional)', dest='plotting_script_path')
    parser.add_argument('--step-size', type=int, help='Step size for analysis (optional)')
    parser.add_argument('--terrain-name', help='Name of the terrain to analyze (optional)')
    parser.add_argument('--transparent-background', action='store_true', help='Generate plots with a transparent background (optional)')
    parser.add_argument('--color-map', default='viridis', help='Color map to use for plotting (default: viridis)')
    parser.add_argument('--skip-analysis', action='store_true', help='Skip analysis and only run plotting on existing files')
    parser.add_argument('--ylabel', help='Label for the y-axis in plots (optional)')
    parser.add_argument('--skip-if-exists', action='store_true', 
                       help='Skip analysis and plotting if results already exist for this configuration')
    
    args = parser.parse_args()
    
    # Debug print to see what arguments are actually present
    print("Args:", vars(args))
    
    # Convert args to dict for kwargs passing
    kwargs = vars(args).copy()
    # Remove non-kwargs arguments
    for arg in ['config_dir', 'base_output_path', 'analysis_operation', 'plotting_script_path', 
               'step_size', 'terrain_name', 'skip_analysis', 'skip_if_exists']:
        kwargs.pop(arg, None)
    
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
            args.skip_analysis,
            args.skip_if_exists,
            **kwargs
        )
        print(f"Completed setup for {config_file}")

if __name__ == '__main__':
    main()