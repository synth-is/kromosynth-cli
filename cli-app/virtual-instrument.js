export function renderSfz( 
  genomeAndMeta, 
  octaveFrom, octaveTo, duration, velocityLayerCount, 
  sampleRate, bitDepth,
  writeToFolder,
  useOvertoneInharmonicityFactors
) {
  const genomeAndMetaParsed = JSON.parse(genomeAndMeta);
  const renderBaseNote = getBasenote( genomeAndMetaParsed );
  const noteDeltas = this.getNoteDeltasForRenderOctaves(octaveFrom, octaveTo, renderBaseNote);
  const velocities = this.getVelocitiesForSelectedVelocityLayerCount( velocityLayerCount );
}

function getBasenote( genomeAndMeta ) {
  const baseNote = getBaseNoteFrequencyFromASNEATPatch( genomeAndMeta.asNEATPatch );
  return baseNote;
}

// TODO
// form renderedSoundExport.jsx in synth.is project
function getNoteDeltasForRenderOctaves(
  renderOctaveNumberMin, renderOctaveNumberMax, renderBaseNote
) {
const _renderOctaveNumberMin = renderOctaveNumberMin || this.state.renderOctaveNumberMin;
const _renderOctaveNumberMax = renderOctaveNumberMax || this.state.renderOctaveNumberMax;
const _renderBaseNote = renderBaseNote || this.state.renderBaseNote;
let noteDeltas;

  let startNoteNr = getOctaveMidiNumberRanges()[_renderOctaveNumberMin][0];
  let endNoteNr = getOctaveMidiNumberRanges()[_renderOctaveNumberMax][1];
  let noteDelta;
  // if( startNoteNr > this.state.renderBaseNote || endNoteNr < this.state.renderBaseNote ) {
  //   noteDelta = startNoteNr - this.state.renderBaseNote;
  // } else {
  //   noteDelta = 0;
  // }
  noteDelta = 0;
  if( _renderBaseNote < startNoteNr ) {
    startNoteNr = _renderBaseNote;
  }
  if( _renderBaseNote > endNoteNr ) {
    endNoteNr = _renderBaseNote;
  }
  noteDeltas = [noteDelta];
  let noteDeltaCounter = noteDelta;
  noteDeltaCounter--;
  while( _renderBaseNote + noteDeltaCounter >= startNoteNr ) {
    noteDeltas.push(noteDeltaCounter);
    noteDeltaCounter--;
  }
  noteDeltaCounter = noteDelta + 1;
  while( _renderBaseNote + noteDeltaCounter <= endNoteNr ) {
    noteDeltas.push(noteDeltaCounter);
    noteDeltaCounter++;
  }

return noteDeltas;
}