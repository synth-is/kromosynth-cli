#!/bin/zsh

# start the feature extraction process:
# cd /Users/bjornpjo/Developer/apps/kromosynth-evaluate/evaluation/unsupervised
# /Users/bjornpjo/Developer/apps/kromosynth-evaluate/.venv/bin/python3 features.py --host localhost --port 31051 --models-path /Users/bjornpjo/Developer/apps/kromosynth-evaluate/measurements/models

# node extract-audio-features-from-dataset.js /Users/bjornpjo/Downloads/OneBillionWav /Users/bjornpjo/Downloads/OneBillionWav_features 44100 /Users/bjornpjo/.cache/torch/hub/checkpoints 'ws://localhost:31051' "020.wav,030.wav,040.wav,050.wav,060.wav,070.wav,080.wav,090.wav,100.wav"

kromosynth extract-features --dataset-folder /Users/bjornpjo/Downloads/evorenders --write-to-folder /Users/bjornpjo/Downloads/evofeatures --sample-rate 44100 --ckpt-dir /Users/bjornpjo/.cache/torch/hub/checkpoints --feature-extraction-server-host 'ws://localhost:31051' # --suffixes-filter "020.wav,030.wav,040.wav,050.wav,060.wav,070.wav,080.wav,090.wav,100.wav" --feature-types-filter "mfcc,mfcc-statistics"

# kromosynth extract-features --dataset-folder /Users/bjornpjo/Downloads/nsynth-valid/audio --write-to-folder /Users/bjornpjo/Downloads/audio-features/nsynth-valid-features_filtered --sample-rate 16000 --ckpt-dir /Users/bjornpjo/.cache/torch/hub/checkpoints --feature-extraction-server-host 'ws://localhost:31052' --feature-types-filter "mfcc,mfcc-statistics" --suffixes-filter "030-127.wav,040-127.wav,050-127.wav,060-127.wav,070-127.wav,080-127.wav,090-127.wav,030-127.wav" && kromosynth extract-features --dataset-folder /Users/bjornpjo/Downloads/nsynth-train/audio --write-to-folder /Users/bjornpjo/Downloads/audio-features/nsynth-train-features_filtered --sample-rate 16000 --ckpt-dir /Users/bjornpjo/.cache/torch/hub/checkpoints --feature-extraction-server-host 'ws://localhost:31052' --feature-types-filter "mfcc,mfcc-statistics" --suffixes-filter "030-127.wav,040-127.wav,050-127.wav,060-127.wav,070-127.wav,080-127.wav,090-127.wav,030-127.wav"
