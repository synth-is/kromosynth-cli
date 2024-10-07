import { OfflineAudioContext } from 'node-web-audio-api';

for( let i=0; i < 10000; i++ ) {
  console.log('+ i:', i);

  let offline = new OfflineAudioContext(1, 10*48000, 48000);
  
  const osc = offline.createOscillator();
  osc.connect(offline.destination);
  osc.frequency.value = 220;
  osc.start(0.);
  osc.stop(10.);
  
  let buffer = await offline.startRendering();
  console.log('+ buffer duration:', buffer.duration);
  const channelData = buffer.getChannelData(0);
  const serializedBuffer = new Uint8Array(channelData.buffer);

  offline = null;
  buffer = null;

  if (global.gc) {
    global.gc();
  }
}

await new Promise(resolve => setTimeout(resolve, 60000));

console.log('done');
