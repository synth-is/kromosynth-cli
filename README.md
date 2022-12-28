# kromosynth-cli

A command line interface to `kromosynth`.

## Examples

Output description and help text:
```
./kromosynth.js --help
```

Create a new genome and print it to standard output:
```
./kromosynth.js new-genome
```

Create a new genome, perform 35 mutations on it and print the result to standard output:
```
./kromosynth.js new-genome | ./kromosynth.js --read-from-input --mutation-count 35 mutate-genome
```

Create a new genome, perform 35 mutations on it, render a two second audio from it and play on the default audio device:
```
./kromosynth.js new-genome | ./kromosynth.js --read-from-input --mutation-count 35 mutate-genome | ./kromosynth.js --read-from-input --duration 2 --velocity 0.75 --note-delta 0 render-audio
```