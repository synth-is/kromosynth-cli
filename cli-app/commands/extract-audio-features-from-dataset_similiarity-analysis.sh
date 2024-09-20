#!/bin/zsh

#### combined features:
# in analysis/similarity-analysis:
# python3 extract_traditional_and_learned_features_from_samples_tree.py /Users/bjornpjo/Downloads/nsynth-test/audio /Users/bjornpjo/Downloads/audio-features/nsynth-test_trad_and_learned_combined
# python3 extract_traditional_and_learned_features_from_samples_tree.py /Users/bjornpjo/Downloads/OneBillionWav /Users/bjornpjo/Downloads/audio-features/OneBillionWav_trad_and_learned_combined
# python3 extract_traditional_and_learned_features_from_samples_tree.py /Users/bjornpjo/Downloads/nsynth-train/audio /Users/bjornpjo/Downloads/audio-features/nsynth-train_trad_and_learned_combined
# python3 extract_traditional_and_learned_features_from_samples_tree.py /Users/bjornpjo/Downloads/_OrchideaSOL2020_release/OrchideaSOL2020 /Users/bjornpjo/Downloads/audio-features/OrchideaSOL2020_trad_and_learned_combined

python3 extract_traditional_and_learned_features_from_samples_tree.py /Users/bjornpjo/Downloads/OneBillionWav /Users/bjornpjo/Downloads/audio-features/OneBillionWav_trad_and_learned_combined__filtered --filter "020.wav,030.wav,040.wav,050.wav,060.wav,070.wav,080.wav,090.wav,100.wav"
python3 extract_traditional_and_learned_features_from_samples_tree.py /Users/bjornpjo/Downloads/nsynth-train/audio /Users/bjornpjo/Downloads/audio-features/nsynth-train_trad_and_learned_combined__filtered --filter "030-127.wav,040-127.wav,050-127.wav,060-127.wav,070-127.wav,080-127.wav,090-127.wav,030-127.wav"
python3 extract_traditional_and_learned_features_from_samples_tree.py /Users/bjornpjo/Downloads/nsynth-valid/audio /Users/bjornpjo/Downloads/audio-features/nsynth-valid_trad_and_learned_combined__filtered --filter "030-127.wav,040-127.wav,050-127.wav,060-127.wav,070-127.wav,080-127.wav,090-127.wav,030-127.wav"