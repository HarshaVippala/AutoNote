import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import WebSocket from 'ws';

const FFMPEG_PATH = '/usr/local/bin/ffmpeg'; // Adjust if your ffmpeg is elsewhere
const AUDIO_DEVICE_INDEX = '0'; // As identified from ffmpeg -list_devices
const TARGET_SAMPLE_RATE = 16000;
const TARGET_FORMAT = 's16le'; // Signed 16-bit Little Endian PCM
const CHUNK_DURATION_MS = 100; // Desired chunk duration
const BYTES_PER_SAMPLE = 2; // For s16le
const CHUNK_SIZE_BYTES = (TARGET_SAMPLE_RATE / (1000 / CHUNK_DURATION_MS)) * BYTES_PER_SAMPLE; // Bytes per 100ms chunk

interface AudioCaptureProcess {
  process: ChildProcessWithoutNullStreams;
  stop: () => void;
}

/**
 * Spawns an ffmpeg process to capture audio from specified channels of an input device,
 * format it, chunk it, and send it over a WebSocket.
 *
 * @param {string} captureId - Identifier for the capture (e.g., 'mic', 'remote').
 * @param {string} channelMap - ffmpeg channel mapping (e.g., '1' for mic, '2+3' for stereo mixdown).
 * @param {WebSocket} websocket - The WebSocket connection to send audio chunks to.
 * @returns {AudioCaptureProcess} Object containing the process and a stop function.
 * @throws {Error} If ffmpeg process cannot be spawned or fails.
 */
const startFFmpegCapture = (
  captureId: string,
  channelMap: string, // e.g., '1' for mic, '2,3' for system audio mixdown
  websocket: WebSocket
): AudioCaptureProcess => {
  console.log(`Starting ffmpeg capture for ${captureId} from Aggregate Device index 0`);

  // Base arguments - Target Aggregate Device (index 0)
  const baseArgs: string[] = [
    '-vn', // Explicitly disable video recording for avfoundation
    '-f', 'avfoundation',
    '-i', '0', // Use index 0 for "Mixed Input" (Aggregate Device)
    // Add other necessary base args here if any
  ];

  // Determine the audio filter based on captureId
  let audioFilter: string;
  if (captureId === 'mic') {
    // Select channels 1 & 2 (0-indexed c0, c1) and mix to mono
    audioFilter = 'pan=mono|c0=c0+c1';
  } else if (captureId === 'remote') {
    // Select channels 3 & 4 (0-indexed c2, c3) and mix to mono
    audioFilter = 'pan=mono|c0=c2+c3';
  } else {
    // Should not happen, but good to handle
    throw new Error(`Invalid captureId for audio filter: ${captureId}`);
  }

  // Output formatting arguments
  const outputArgs: string[] = [
    '-af', audioFilter,               // Apply the channel selection/mixing filter
    '-ac', '1',                      // Output channels (mono) - This might be redundant with pan=mono but safer to keep
    '-ar', `${TARGET_SAMPLE_RATE}`,    // Output sample rate
    '-f', TARGET_FORMAT,            // Output format (s16le PCM)
    '-bufsize', `${CHUNK_SIZE_BYTES * 2}k`, // Buffer size (adjust as needed)
    'pipe:1'                        // Output to stdout
  ];

  // Construct final args - REMOVED channelArgs
  const ffmpegArgs: string[] = [...baseArgs, ...outputArgs];

  console.log(`Using ffmpeg args for ${captureId}:`, ffmpegArgs.join(' '));

  let ffmpegProcess: ChildProcessWithoutNullStreams;
  try {
    ffmpegProcess = spawn(FFMPEG_PATH, ffmpegArgs);
  } catch (error) {
    console.error(`Failed to spawn ffmpeg for ${captureId}:`, error);
    throw new Error(`Failed to spawn ffmpeg for ${captureId}`);
  }

  console.log(`ffmpeg process spawned for ${captureId} with PID: ${ffmpegProcess.pid}`);

  let chunkBuffer = Buffer.alloc(0);

  ffmpegProcess.stdout.on('data', (data: Buffer) => {
    chunkBuffer = Buffer.concat([chunkBuffer, data]);

    while (chunkBuffer.length >= CHUNK_SIZE_BYTES) {
      const chunk = chunkBuffer.slice(0, CHUNK_SIZE_BYTES);
      chunkBuffer = chunkBuffer.slice(CHUNK_SIZE_BYTES);

      if (websocket.readyState === WebSocket.OPEN) {
        const base64Chunk = chunk.toString('base64');
        websocket.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: base64Chunk
        }));
      } else {
        console.warn(`WebSocket not open for ${captureId}, dropping audio chunk.`);
        // Consider buffering or handling differently if needed
      }
    }
  });

  ffmpegProcess.stderr.on('data', (data: Buffer) => {
    // Log ffmpeg errors/warnings, but filter out noisy stats if needed
    console.error(`ffmpeg stderr (${captureId}): ${data.toString()}`);
  });

  ffmpegProcess.on('close', (code) => {
    console.log(`ffmpeg process for ${captureId} exited with code ${code}`);
    // Handle unexpected closure, maybe attempt restart?
  });

  ffmpegProcess.on('error', (err) => {
    console.error(`ffmpeg process error for ${captureId}:`, err);
    // Handle errors, e.g., ffmpeg not found or permission issues
  });

  const stop = () => {
    if (ffmpegProcess && !ffmpegProcess.killed) {
      console.log(`Stopping ffmpeg process for ${captureId}`);
      ffmpegProcess.kill('SIGTERM'); // Send SIGTERM first for graceful shutdown
      // Optionally send SIGKILL after a timeout if it doesn't stop
      setTimeout(() => {
        if (!ffmpegProcess.killed) {
          console.warn(`ffmpeg process ${captureId} did not terminate gracefully, sending SIGKILL.`);
          ffmpegProcess.kill('SIGKILL');
        }
      }, 2000); // 2 second timeout
    }
  };

  return { process: ffmpegProcess, stop };
};

// Example Usage (will be called from the main server/agent logic)
// import { createWebSocketConnection } from './webSocketConnection';
// const micSocket = createWebSocketConnection('mic');
// const remoteSocket = createWebSocketConnection('remote');
// let micCapture: AudioCaptureProcess | null = null;
// let remoteCapture: AudioCaptureProcess | null = null;

// micSocket.on('open', () => {
//   try {
//      micCapture = startFFmpegCapture('mic', '1', micSocket);
//   } catch (error) {
//      console.error("Failed to start mic capture");
//   }
// });

// remoteSocket.on('open', () => {
//   try {
//      remoteCapture = startFFmpegCapture('remote', '2,3', remoteSocket); // Or just '2' if we only want left channel
//   } catch (error) {
//      console.error("Failed to start remote capture");
//   }
// });

// // Make sure to call stop() on cleanup
// process.on('exit', () => {
//   micCapture?.stop();
//   remoteCapture?.stop();
// });

export { startFFmpegCapture };
export type { AudioCaptureProcess }; 