import { OfflineAudioContext } from 'node-web-audio-api';

process.on('message', async (message) => {
    try {
        const i = message.i;
        console.log(`+ i: ${i}`);

        let offline = new OfflineAudioContext(1, 10 * 48000, 48000);
        const osc = offline.createOscillator();
        osc.connect(offline.destination);
        osc.frequency.value = 220;
        osc.start(0.);
        osc.stop(10.);

        let buffer = await offline.startRendering();

        // Get the channel data
        const audioBuffer = buffer.getChannelData(0);  // Assuming mono-channel

        // Send the Float32Array directly
        process.send({ i, audioBuffer: Array.from(audioBuffer) }, () => {
            // This callback ensures the message is sent before exiting
            process.exit(0);
        });
    } catch (err) {
        console.error(`Worker Error for i=${message.i}:`, err);
        process.exit(1);
    }
});
