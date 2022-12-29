# kromosynth-cli

A command line interface to `kromosynth`.

## Examples

Piped command-line combinations for spawning, mutating, rendering, playing and saving genes and their renditions.

### Help

Output description and help text:
```
./kromosynth.js --help
```

### Genesis genes

Create a new genome and print it to standard output:
```
./kromosynth.js new-genome
```

Create a new genome, specify not to print to standard output (otherwise the default) and write it to a file with an auto-generated name:
```
./kromosynth.js new-genome --write-to-output false --write-to-file
```

Create a new genome, print to standard output and write it to a file with the supplied name:
```
./kromosynth.js new-genome --write-to-file kromosynth_gene_initial_1.json
```

### Gene mutations

Create a new genome, perform 35 mutations on it and print the result to standard output:
```
./kromosynth.js new-genome | ./kromosynth.js --read-from-input --mutation-count 35 mutate-genome
```

Create a new genome, perform 42 mutations on it and write to a file with the supplied name:
```
./kromosynth.js new-genome | ./kromosynth.js --read-from-input --mutation-count 42 --write-to-output false --write-to-file kromosynth_gene_mutation_42.json mutate-genome
```

### Playback and rendering

Create a new genome, perform 35 mutations on it, render a two second audio from it and play on the default audio device:
```
./kromosynth.js new-genome | ./kromosynth.js --read-from-input --mutation-count 35 mutate-genome | ./kromosynth.js --read-from-input --duration 2 --velocity 0.75 --note-delta 0 render-audio
```

- Create a new genome, perform 35 mutations on it, write the gene to a file
- Render a two second audio from the gene and write it to a WAV file with an auto-generated file name (without playing it on the default audio device):
```
./kromosynth.js new-genome | ./kromosynth.js --read-from-input --write-to-file --mutation-count 35 mutate-genome | ./kromosynth.js --read-from-input --write-to-file --play-on-default-audio-device false --duration 2 --velocity 0.75 --note-delta 0 render-audio
```