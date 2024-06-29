!#/bin/bash

# start the feature extraction process:
# cd /Users/bjornpjo/Developer/apps/kromosynth-evaluate/evaluation/unsupervised
# /Users/bjornpjo/Developer/apps/kromosynth-evaluate/.venv/bin/python3 features.py --host localhost --port 31051 --models-path /Users/bjornpjo/Developer/apps/kromosynth-evaluate/measurements/models

node extract-audio-features-from-dataset.js /Users/bjornpjo/Downloads/OneBillionWav /Users/bjornpjo/Downloads/OneBillionWav_features 44100 "020.wav,030.wav,040.wav,050.wav,060.wav,070.wav,080.wav,090.wav,100.wav"