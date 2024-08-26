import { fork } from 'child_process';
import { resolve } from 'path';
import async from 'async';

const workerPath = resolve('./test-node-web-audio-api_worker.js');
const concurrencyLimit = 10;
const tasks = Array.from({ length: 5000 }, (_, i) => i);  // Use a smaller number for initial testing

const queue = async.queue((task, done) => {
    const child = fork(workerPath);

    child.send({ i: task });

    child.on('message', (result) => {
        try {
            const { i, audioBuffer } = result;
            console.log(`Received data for i=${i}`);

            // Reconstruct Float32Array from the received array
            const float32Array = new Float32Array(audioBuffer);

            console.log(`Result for i=${i}: buffer size = ${float32Array.length}`);
            done();
        } catch (err) {
            console.error(`Error processing message for i=${task}:`, err);
            done(err);
        }
    });

    // child.on('close', (code) => {
    //     if (code !== 0) {
    //         console.error(`Child process for i=${task} exited with code ${code}`);
    //     }
    // });

    child.on('exit', (code) => {
        if (code !== 0) {
            console.error(`Child process for i=${task} exited with code ${code}`);
            done(new Error(`Child process exited with code ${code}`));
        }
    });

    child.on('error', (err) => {
        console.error(`Error from child process for i=${task}:`, err);
        done(err);
    });
}, concurrencyLimit);

queue.error((err, task) => {
    console.error(`Task ${task} encountered an error:`, err);
});

// Push tasks to the queue
tasks.forEach((task) => queue.push(task));

// Callback for when all tasks are completed
queue.drain(() => {
    console.log('All tasks completed.');
});
