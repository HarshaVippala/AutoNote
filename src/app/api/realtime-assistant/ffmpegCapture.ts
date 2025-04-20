import { spawn, ChildProcess } from 'child_process';
import WebSocket from 'ws';

/**
 * Starts an ffmpeg process to capture audio from a specified device and stream it.
 * @param audioDeviceIndex The index of the audio device to capture from.
 * @param ws The WebSocket connection to send the audio data to.
 * @param stream The identifier for the stream ('mic' or 'remote').
 * @returns The spawned ffmpeg process.
 */
export function startFFmpegCapture(
  audioDeviceIndex: number,
  ws: WebSocket,
  stream: 'mic' | 'remote'
): ChildProcess {
  console.log(`Starting ffmpeg capture for ${stream} on device ${audioDeviceIndex}`);

  // Define base ffmpeg arguments
  const baseArgs = [
    '-f', 'avfoundation', // Use macOS AVFoundation framework
    '-i', `${audioDeviceIndex}:none`, // Input from specified audio device, ignore video
    '-ac', '1', // Output mono audio
    '-ar', '16000', // Output sample rate 16kHz
    '-f', 's16le', // Output format: signed 16-bit little-endian PCM
    '-bufsize', '6400k', // Buffer size
  ];

  let channelMapArgs: string[] = [];

  // Configure channel mapping based on stream type
  if (stream === 'mic') {
    // For mic, assume input is on channel 0 (left channel of stereo mic usually)
    // Use audio filter to select channel 0 and make it mono
    channelMapArgs = [
      '-af', 'pan=mono:c0=c0'
    ];
    console.log('channels mapped for mic');
  } else if (stream === 'remote') {
    // For remote (system audio via BlackHole), assume stereo on channels 1 & 2
    // Use audio filter to mix channels 1 and 2 into mono
    channelMapArgs = [
      '-af', 'pan=mono:c0=c1:c1=c2'
    ];
    console.log('channels mapped for remote');
  }

  // Combine base args, channel mapping, and output pipe
  const ffmpegArgs = [...baseArgs, ...channelMapArgs, 'pipe:1'];

  console.log(`Using ffmpeg args for ${stream}:`, ffmpegArgs.join(' '));

  // Spawn the ffmpeg process
  const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
    stdio: ['ignore', 'pipe', 'pipe'] // Ignore stdin, pipe stdout, pipe stderr
  });

  // Handle ffmpeg stdout (audio data)
  ffmpegProcess.stdout.on('data', (data: Buffer) => {
    // Forward audio data to WebSocket if connection is open
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  // Handle ffmpeg stderr (logs/errors)
  ffmpegProcess.stderr.on('data', (data: Buffer) => {
    console.error(`ffmpeg stderr (${stream}): ${data.toString()}`);
  });

  // Handle ffmpeg process exit
  ffmpegProcess.on('close', (code) => {
    console.log(`ffmpeg process for ${stream} exited with code ${code}`);
    // Optionally attempt to restart ffmpeg or handle the closure
  });

  ffmpegProcess.on('error', (err) => {
    console.error(`Failed to start ffmpeg process for ${stream}:`, err);
  });

  return ffmpegProcess;
} 