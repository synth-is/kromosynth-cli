import os
import json
import shutil
import argparse

# to split up NSynth data set files into instrument folders

def copy_files(metadata_path, source_directory, destination_directory, attribute=None):

    # Read metadata JSON file
    with open(metadata_path, 'r') as metadata_file:
        metadata = json.load(metadata_file)

    for file_name, attributes in metadata.items():
        wav_file_name = f"{file_name}.wav" # Add the .wav suffix
        subfolder_name = attributes[attribute]  # Define the subfolder name

        source_file_path = os.path.join(source_directory, wav_file_name) 
        destination_subfolder_path = os.path.join(destination_directory, subfolder_name)
        destination_file_path = os.path.join(destination_subfolder_path, wav_file_name)
        
        # Create the destination subfolder if it doesn't exist
        os.makedirs(destination_subfolder_path, exist_ok=True)

        # Copy the .wav file to the corresponding subfolder
        try:
            shutil.copy2(source_file_path, destination_file_path)
            print(f"Copied: {source_file_path} to {destination_file_path}")
        except FileNotFoundError:
            print(f"Error: File not found - {source_file_path}")
        except Exception as e:
            print(f"Error: {e}")

def main():
    parser = argparse.ArgumentParser(description='Copy .wav files based on JSON metadata.')
    parser.add_argument('-m', '--metadata', help='Path to the JSON metadata file', required=True)
    parser.add_argument('-s', '--source', help='Path to the source directory', required=True)
    parser.add_argument('-d', '--destination', help='Path to the destination directory', required=True)
    parser.add_argument('-a', '--attribute', help='Attribute to filter the files', required=False)
    args = parser.parse_args()

    copy_files(args.metadata, args.source, args.destination, args.attribute)

if __name__ == "__main__":
    main()
