#!/bin/bash

# Compute FAD embeddings from a dataset; uses util from https://github.com/synth-is/kromosynth-frechet-audio-distance

python3 -m util.compute_and_save_embeddings_from_dir --input_dir /Users/bjornpjo/Downloads/nsynth-valid/source-split/acoustic --output_dir /Users/bjornpjo/Downloads/nsynth-valid/embeds/vggish/acoustic --model_name vggish --sample_rate 16000 --verbose
python3 -m util.compute_and_save_embeddings_from_dir --input_dir /Users/bjornpjo/Downloads/nsynth-valid/source-split/electronic --output_dir /Users/bjornpjo/Downloads/nsynth-valid/embeds/vggish/source-split/electronic --model_name vggish --sample_rate 16000 --verbose
python3 -m util.compute_and_save_embeddings_from_dir --input_dir /Users/bjornpjo/Downloads/nsynth-valid/source-split/synthetic --output_dir /Users/bjornpjo/Downloads/nsynth-valid/embeds/vggish/source-split/synthetic --model_name vggish --sample_rate 16000 --verbose

python3 -m util.compute_and_save_embeddings_from_dir --input_dir /Users/bjornpjo/Downloads/nsynth-valid/family-split/bass --output_dir /Users/bjornpjo/Downloads/nsynth-valid/embeds/vggish/family-split/bass --model_name vggish --sample_rate 16000 --verbose 
python3 -m util.compute_and_save_embeddings_from_dir --input_dir /Users/bjornpjo/Downloads/nsynth-valid/family-split/brass --output_dir /Users/bjornpjo/Downloads/nsynth-valid/embeds/vggish/family-split/brass --model_name vggish --sample_rate 16000 --verbose 
python3 -m util.compute_and_save_embeddings_from_dir --input_dir /Users/bjornpjo/Downloads/nsynth-valid/family-split/flute --output_dir /Users/bjornpjo/Downloads/nsynth-valid/embeds/vggish/family-split/flute --model_name vggish --sample_rate 16000 --verbose 
python3 -m util.compute_and_save_embeddings_from_dir --input_dir /Users/bjornpjo/Downloads/nsynth-valid/family-split/guitar --output_dir /Users/bjornpjo/Downloads/nsynth-valid/embeds/vggish/family-split/guitar --model_name vggish --sample_rate 16000 --verbose 
python3 -m util.compute_and_save_embeddings_from_dir --input_dir /Users/bjornpjo/Downloads/nsynth-valid/family-split/keyboard --output_dir /Users/bjornpjo/Downloads/nsynth-valid/embeds/vggish/family-split/keyboard --model_name vggish --sample_rate 16000 --verbose 
python3 -m util.compute_and_save_embeddings_from_dir --input_dir /Users/bjornpjo/Downloads/nsynth-valid/family-split/mallet --output_dir /Users/bjornpjo/Downloads/nsynth-valid/embeds/vggish/family-split/mallet --model_name vggish --sample_rate 16000 --verbose 
python3 -m util.compute_and_save_embeddings_from_dir --input_dir /Users/bjornpjo/Downloads/nsynth-valid/family-split/organ --output_dir /Users/bjornpjo/Downloads/nsynth-valid/embeds/vggish/family-split/organ --model_name vggish --sample_rate 16000 --verbose 
python3 -m util.compute_and_save_embeddings_from_dir --input_dir /Users/bjornpjo/Downloads/nsynth-valid/family-split/reed --output_dir /Users/bjornpjo/Downloads/nsynth-valid/embeds/vggish/family-split/reed --model_name vggish --sample_rate 16000 --verbose 
python3 -m util.compute_and_save_embeddings_from_dir --input_dir /Users/bjornpjo/Downloads/nsynth-valid/family-split/string --output_dir /Users/bjornpjo/Downloads/nsynth-valid/embeds/vggish/family-split/string --model_name vggish --sample_rate 16000 --verbose 
python3 -m util.compute_and_save_embeddings_from_dir --input_dir /Users/bjornpjo/Downloads/nsynth-valid/family-split/vocal --output_dir /Users/bjornpjo/Downloads/nsynth-valid/embeds/vggish/family-split/vocal --model_name vggish --sample_rate 16000 --verbose 