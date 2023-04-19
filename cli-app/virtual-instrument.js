import {
  getOctaveMidiNumberRanges, getBaseNoteFrequencyFromASNEATPatch,
  frequencyToNote, getNoteMarksAndMidiNumbersArray
} from 'kromosynth';

export function renderSfz(
  genomeAndMeta,
  octaveFrom, octaveTo, duration, velocityLayerCount,
  sampleRate, bitDepth,
  writeToFolder,
  useOvertoneInharmonicityFactors
) {
  const renderBaseNote = getBasenote( genomeAndMeta );
  console.log("renderBaseNote",renderBaseNote);
  const noteDeltas = getNoteDeltasForRenderOctaves(octaveFrom, octaveTo, renderBaseNote);
  const velocities = getVelocitiesForSelectedVelocityLayerCount( velocityLayerCount );
  for( const noteDelta of noteDeltas ) {
    for( const velocity of velocities ) {
      console.log("noteDelta",noteDelta,", velocity",velocity);
    }
  }
}

function getBasenote( genomeAndMeta ) {
  const baseNoteFrequency = getBaseNoteFrequencyFromASNEATPatch( genomeAndMeta.genome.asNEATPatch );
  let renderBaseNote;
  if( baseNoteFrequency > 0 ) {
    const renderBaseNoteMark = frequencyToNote(baseNoteFrequency);
    renderBaseNote = getMidiNoteNumberFromNoteMark(renderBaseNoteMark);
  } else {
    renderBaseNote = 69;
  }
  return renderBaseNote;
}


///// from renderedSoundExport.jsx in the synth.is web app project:

function getNoteDeltasForRenderOctaves(
  renderOctaveNumberMin, renderOctaveNumberMax, renderBaseNote
) {
  let noteDeltas;

  let startNoteNr = getOctaveMidiNumberRanges()[renderOctaveNumberMin][0];
  let endNoteNr = getOctaveMidiNumberRanges()[renderOctaveNumberMax][1];
  let noteDelta;
  noteDelta = 0;
  if( renderBaseNote < startNoteNr ) {
    startNoteNr = renderBaseNote;
  }
  if( renderBaseNote > endNoteNr ) {
    endNoteNr = renderBaseNote;
  }
  noteDeltas = [noteDelta];
  let noteDeltaCounter = noteDelta;
  noteDeltaCounter--;
  while( renderBaseNote + noteDeltaCounter >= startNoteNr ) {
    noteDeltas.push(noteDeltaCounter);
    noteDeltaCounter--;
  }
  noteDeltaCounter = noteDelta + 1;
  while( renderBaseNote + noteDeltaCounter <= endNoteNr ) {
    noteDeltas.push(noteDeltaCounter);
    noteDeltaCounter++;
  }
  return noteDeltas;
}


function getVelocitiesForSelectedVelocityLayerCount( velocityLayerCount ) {
  let velocities;
  if( velocityLayerCount === 0 ) {
    velocities = [ 1 ];
  } else {
    velocities = new Array(velocityLayerCount);
    for( let i=0; i < velocityLayerCount; i++ ) {
      const velocityLayerNumber = i+1;
      velocities[i] = 1 / ( velocityLayerCount / velocityLayerNumber );
    }
  }
  return velocities;
}

function getMidiNoteNumberFromNoteMark(noteMark) {
  const noteMarksAndMidiNumbersArray = getNoteMarksAndMidiNumbersArray(0,127);
  let midiNoteNr;
  for( let oneOneNoteMarkAndMidiNumber of noteMarksAndMidiNumbersArray ) {
    if( oneOneNoteMarkAndMidiNumber.noteMark === noteMark ) {
      midiNoteNr = oneOneNoteMarkAndMidiNumber.midiNoteNr;
      break;
    }
  }
  return midiNoteNr;
}
