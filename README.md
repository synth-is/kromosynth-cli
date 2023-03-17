# kromosynth-cli

A command line interface to `kromosynth`.

## Install as a global command

```
npm install -g kromosynth-cli
```

## Examples

Piped command-line combinations for spawning, mutating, rendering, playing and saving genes and their renditions.

### Help

Output description and help text:
```
kromosynth --help
```

### Genesis genes

Create a new genome and print it to standard output:
```
kromosynth new-genome
```

Create a new genome, specify not to print to standard output (otherwise the default) and write it to a file with an auto-generated name:
```
kromosynth new-genome --write-to-output false --write-to-file
```

Create a new genome, print to standard output and write it to a file with the supplied name:
```
kromosynth new-genome --write-to-file kromosynth_gene_initial_1.json
```

### Gene mutations

Create a new genome, perform 35 mutations on it and print the result to standard output:
```
kromosynth new-genome | kromosynth --read-from-input --mutation-count 35 mutate-genome
```

Create a new genome, perform 42 mutations on it and write to a file with the supplied name:
```
kromosynth new-genome | kromosynth --read-from-input --mutation-count 42 --write-to-output false --write-to-file kromosynth_gene_mutation_42.json mutate-genome
```

### Playback and rendering

Create a new genome, perform 35 mutations on it, render a two second audio from it and play on the default audio device:
```
kromosynth new-genome | kromosynth --read-from-input --mutation-count 35 mutate-genome | kromosynth --read-from-input --duration 2 --velocity 0.75 --note-delta 0 render-audio
```

Create a new genome, perform 250 mutations on it, mostly on its audio buffer source pattern producing network (CPPN) part, render a two second audio from the result and play on the default audio device:
```
kromosynth new-genome | kromosynth --read-from-input --mutation-count 250 --probability-mutating-wave-network 0.9 --probability-mutating-patch 0.1 mutate-genome | kromosynth --read-from-input --duration 2 --velocity 0.75 --note-delta 0 render-audio
```

Render and play a gene from a file, using values from the gene's metadata, if present, for duration, note delta and velocity, by passing in the flag `--gene-metadata-override true`.
```
kromosynth --read-from-file ~/iCloud/Documents/synth.is/favoriteGenomes/2022-07/fg_01FHTCZZKRMXS2242ZXN36XWYR.json --write-to-file render/ --play-on-default-audio-device true --gene-metadata-override true render-audio
```

### File persistence

- Create a new genome, perform 35 mutations on it, write the gene to a file, with an auto-generated file name in the specified `genes/` folder
- Render a two second audio from the gene and write it to a WAV file with an auto-generated file name in the specified `render/` folder (without playing it on the default audio device):
```
kromosynth new-genome | kromosynth --read-from-input --write-to-file genes/ --mutation-count 35 mutate-genome | kromosynth --read-from-input --write-to-file render/ --play-on-default-audio-device false --duration 2 --velocity 0.75 --note-delta 0 render-audio
```

Read a gene from file, render a five second sound, one octave down from it's base note, with half velocity, write the result to a WAV file with auto-generated file name in the `render` folder and also play it on the default audio device (could also explicitly declare `--play-on-default-audio-device true`, or `--play-on-default-audio-device false` to not play the sound):
```
kromosynth --read-from-file genes/kromosynth_gene_01GNEV157BWBNZK89RSJF082HY.json --write-to-file render/ --play-on-default-audio-device false --duration 5 --velocity 0.5 --note-delta -12 render-audio
```

Read a gene from a file, mutate it a few times, save the mutated result to a gene file (in `genes/` with an auto-generated file name), play back the result and save it to a WAV file with an auto-generated file name in the `render/` directory:
```
cat genes/kromosynth_gene_01GNEV157BWBNZK89RSJF082HY.json | kromosynth --read-from-input --write-to-file genes/ --mutation-count 8 mutate-genome | kromosynth --read-from-input --write-to-file render/ --duration 2 --velocity 1 --note-delta 0 --play-on-default-audio-device true render-audio
```

### Evolution (hyper)parameters

In addition to controlling the likelihood of mutating the wave network and audio graph patch parts of a genome, with the command line flags `--probability-mutating-wave-network` and `--probability-mutating-patch`, respectively, further evolution (hyper)parameteres can be supplied from a JSON(-C) file, with the flag `--evo-params-json-file`, or an inline JSON string, with the `--evo-params-json-string` flag.

New genome with evolution parameters read from a file in `conf/evolutionary-hyperparameters.jsonc`:
```
kromosynth --evo-params-json-file conf/evolutionary-hyperparameters.jsonc new-genome
```

New genome with evolution parameters supplied by an inline JSON string; the genome is then mutated with evolution parameters from a file in `conf/evolutionary-hyperparameters.jsonc`:
```
kromosynth \
  --evo-params-json-string '{"waveNetwork":{"neatParameters":{"pMutateAddConnection":0.13,"pMutateAddNode":0.13,"pMutateDeleteSimpleNeuron":0,"pMutateDeleteConnection":0,"pMutateConnectionWeights":0.72,"pMutateChangeActivations":0.02,"pNodeMutateActivationRate":0.2,"connectionWeightRange":3,"disallowRecurrence":true},"iecOptions":{"initialMutationCount":5,"postMutationCount":5},"activationFunctionProbabilities":{"triangle":0.25,"sawtooth":0.25,"StepFunction":0.25,"Sine":0.25,"Sine2":0.25,"cos":0,"arctan":0,"spike":0,"BipolarSigmoid":0,"PlainSigmoid":0,"Gaussian":0,"Linear":0,"NullFn":0}},"audioGraph":{"mutationParams":{"mutationDistance":0.5,"splitMutationChance":0.2,"addOscillatorChance":0.1,"addAudioBufferSourceChance":0.1,"addConnectionChance":0.2,"mutateConnectionWeightsChance":0.2,"mutateNodeParametersChance":0.2},"defaultParameters":{"connectionMutationRate":[0.05,0.8],"nodeMutationRate":[0.05,0.8],"addOscillatorFMMutationRate":0.5,"addConnectionFMMutationRate":0.1}}}' \
  new-genome | \
  kromosynth --read-from-input --mutation-count 1 --evo-params-json-file conf/evolutionary-hyperparameters.jsonc mutate-genome
```


### Biasing towards specific audio graph nodes with parameter configuration

Following are examples of biasing evolution of the audio graph part of the gene, by mutations, towards specific node types, such as:

- wavetables:

25 mutations, writing the genes to a file within the sub-folder `genes/` and rendering a five second sound at full velocity:
```
kromosynth new-genome --evo-params-json-file conf/evolutionary-hyperparameters-wavetable-bias.jsonc | kromosynth --read-from-input --write-to-file genes/ --mutation-count 25 --evo-params-json-file conf/evolutionary-hyperparameters-wavetable-bias.jsonc mutate-genome | kromosynth --read-from-input --duration 5 --velocity 1 --note-delta 0 render-audio
```

Biasing mutations towards the pattern producing networks, with 20% chance of mutating the audio graph (patch):
```
kromosynth new-genome --evo-params-json-file conf/evolutionary-hyperparameters-wavetable-bias.jsonc | kromosynth --read-from-input --write-to-file genes/ --mutation-count 100 --evo-params-json-file conf/evolutionary-hyperparameters-wavetable-bias.jsonc --probability-mutating-wave-network 0.8 --probability-mutating-patch 0.2 mutate-genome | kromosynth --read-from-input --duration 5 --velocity 1 --note-delta 0 render-audio
```

- additive synthesis nodes:

```
kromosynth new-genome --evo-params-json-file conf/evolutionary-hyperparameters-additive-bias.jsonc | kromosynth --read-from-input --mutation-count 155 --evo-params-json-file conf/evolutionary-hyperparameters-additive-bias.jsonc mutate-genome
```

440 mutations, mostly on the wave-pattern-producing network:
```
kromosynth new-genome --evo-params-json-file conf/evolutionary-hyperparameters-additive-bias.jsonc | kromosynth --read-from-input --write-to-file genes/ --mutation-count 440 --evo-params-json-file conf/evolutionary-hyperparameters-additive-bias.jsonc --probability-mutating-wave-network 0.99 --probability-mutating-patch 0.01 mutate-genome | kromosynth --read-from-input --duration 60 --velocity 1 --note-delta -24 render-audio
```

```
kromosynth new-genome --evo-params-json-file conf/evolutionary-hyperparameters-additive-bias.jsonc | kromosynth --read-from-input --write-to-file genes/ --mutation-count 70 --evo-params-json-file conf/evolutionary-hyperparameters-additive-bias.jsonc --probability-mutating-wave-network 0.9 --probability-mutating-patch 0.1 mutate-genome | kromosynth --read-from-input --duration 35 --velocity 1 --note-delta -24 render-audio
```

### Sound classification

Obtain class predictions for one sound genome, using the default (YAMNet) classifier:

```
cat genes/kromosynth_gene_01GPVVQV1Y0FQ2J6RJ4AC5DTEE.json | kromosynth --read-from-input classify-genome
```

## Quality Diversity search

Within `gRPC`:

Starting a QD search controller, without pm2:
```
kromosynth quality-diversity-search --evo-params-json-file conf/evolutionary-hyperparameters.jsonc --evolution-run-config-json-file conf/evolution-run-config.jsonc --evolution-run-id 01GRM1W26X4H704V9RSP97YN6H
```

Starting a controller, managed by pm2:
```
pm2 start kromosynth.js -- quality-diversity-search --evo-params-json-file conf/evolutionary-hyperparameters.jsonc --evolution-run-config-json-file conf/evolution-run-config.jsonc --evolution-run-id 01GRM1W26X4H704V9RSP97YN6
```

Starting a service cluster, managed by pm2:
```
pm2 delete all && pm2 start ecosystem.config.cjs
```

### Evo run data history

Save a list of all git commit IDs:
```
git rev-list master --first-parent > commits.txt
```

Obtain the elite map at one specific iteration / revsiont / git commit:
```
git -C evoruns/01GT9HMJNTVB6ZD4K6CAN1H6ZX show 50a581e44b5f07d61ca1660b002f4c31698a4bee:elites_01GT9HMJNTVB6ZD4K6CAN1H6ZX.json
```
