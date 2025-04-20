import { createRealtimeConnection } from './realtimeConnection';
import { startFFmpegCapture, AudioCaptureProcess } from './audioCapture';
import WebSocket from 'ws';
import { ChildProcessWithoutNullStreams } from 'child_process';

console.log('Starting Realtime Assistant...');

let micSocket: WebSocket | null = null;
let remoteSocket: WebSocket | null = null;
let micCaptureProcess: AudioCaptureProcess | null = null;
let remoteCaptureProcess: AudioCaptureProcess | null = null;

const cleanup = () => {
  console.log('\nShutting down Realtime Assistant...');
  
  // Stop audio capture processes
  micCaptureProcess?.stop();
  remoteCaptureProcess?.stop();

  // Close WebSockets if they're still open
  if (micSocket && micSocket.readyState === WebSocket.OPEN) {
    micSocket.close();
  }
  
  if (remoteSocket && remoteSocket.readyState === WebSocket.OPEN) {
    remoteSocket.close();
  }

  // Allow time for cleanup before exiting
  setTimeout(() => process.exit(0), 500);
};

// Graceful shutdown handlers
process.on('SIGINT', cleanup); // Ctrl+C
process.on('SIGTERM', cleanup); // Termination signal

// Wrap initialization in an async IIFE to use await
(async () => {
  try {
    console.log('Initializing Realtime connections...');
    
    // Create Realtime WebSocket connections for both streams
    const connections = await Promise.all([
      createRealtimeConnection('mic'),
      createRealtimeConnection('remote'),
    ]);
    
    micSocket = connections[0];
    remoteSocket = connections[1];
    
    console.log('Realtime connections established.');

    // Start the audio capture processes for mic and remote
    if (micSocket && remoteSocket) {
      // Use '1' as channelMap for mic (channels 1 & 2 mixed to mono)
      micCaptureProcess = startFFmpegCapture('mic', '1', micSocket);
      
      // Use '2,3' as channelMap for remote (channels 3 & 4 mixed to mono)
      remoteCaptureProcess = startFFmpegCapture('remote', '2,3', remoteSocket);
      
      console.log('Audio capture processes started.');

      // Send a greeting message to trigger an initial response from the assistant
      if (micSocket.readyState === WebSocket.OPEN) {
        sendGreeting(micSocket);
      } else {
        micSocket.on('open', () => {
          if (micSocket) {
            sendGreeting(micSocket);
          }
        });
      }
    }

    console.log('Realtime Assistant initialized and running...');
  } catch (error) {
    console.error('Failed to initialize Realtime Assistant:', error);
    // Ensure cleanup runs even on initialization failure
    cleanup();
    process.exit(1);
  }
})();

// Helper function to send a greeting message
function sendGreeting(websocket: WebSocket) {
  // Send a response.create message to generate an initial greeting
  const greeting = {
    type: 'response.create',
    response: {
      modalities: ['text', 'audio'],
      instructions: 'Introduce yourself briefly and ask how you can help today.',
      max_output_tokens: 50
    }
  };
  
  websocket.send(JSON.stringify(greeting));
  console.log('Sent greeting message');
}

// Keep the process running until explicitly stopped
// The process will keep running due to the active WebSocket connections and audio processes