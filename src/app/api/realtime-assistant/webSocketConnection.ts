import fetch from 'node-fetch';

/**
 * Creates an OpenAI Realtime WebRTC session and establishes a connection.
 *
 * @param {string} streamId - A unique identifier for the audio stream (e.g., 'mic' or 'remote').
 * @returns {Promise<{pc: RTCPeerConnection, dc: RTCDataChannel}>} A promise that resolves with the RTCPeerConnection and data channel.
 * @throws {Error} If the OPENAI_API_KEY environment variable is not set or session creation fails.
 */
export async function createWebRTCConnection(stream: 'mic' | 'remote'): Promise<{
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
}> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set.');
  }

  console.log(`Creating Realtime WebRTC connection for ${stream}...`);

  // Step 1: Create RTCPeerConnection
  const pc = new RTCPeerConnection();
  
  // Step 2: Create a data channel for control messages
  const dc = pc.createDataChannel('oai-events');
  
  // Set up data channel event handlers
  dc.onopen = () => {
    console.log(`Data channel opened for ${stream}`);
  };
  
  dc.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log(`Received message for ${stream}:`, message.type);
      
      // Handle specific message types
      switch (message.type) {
        case 'session.created':
          console.log(`Session created for ${stream}`);
          break;
        case 'error':
          console.error(`Error for ${stream}:`, message.error);
          break;
        case 'conversation.item.input_audio_transcription.completed':
          if (message.text) {
            console.log(`>>> [${stream.toUpperCase()}] TRANSCRIPTION: ${message.text}`);
          }
          break;
        default:
          // Just log other message types at debug level
          console.debug(`${stream} received event: ${message.type}`);
      }
    } catch (error) {
      console.error(`Failed to parse data channel message for ${stream}:`, error);
    }
  };
  
  dc.onerror = (error) => {
    console.error(`Data channel error for ${stream}:`, error);
  };
  
  dc.onclose = () => {
    console.log(`Data channel closed for ${stream}`);
  };

  // Step 3: Create an offer and set local description
  await pc.setLocalDescription();
  
  // Wait for ICE gathering to complete
  await new Promise<void>((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
    } else {
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
        }
      });
    }
  });

  // Step 4: Send the offer to OpenAI's Realtime API
  const baseUrl = 'https://api.openai.com/v1/realtime';
  const model = 'gpt-4o-realtime-preview'; // or another suitable model
  
  try {
    const response = await fetch(`${baseUrl}?model=${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/sdp',
      },
      body: pc.localDescription?.sdp,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI Realtime API returned ${response.status}: ${errorText}`);
    }

    // Step 5: Get the answer SDP and set it as remote description
    const sdpAnswer = await response.text();
    const answer = { type: 'answer', sdp: sdpAnswer } as RTCSessionDescriptionInit;
    await pc.setRemoteDescription(answer);

    console.log(`WebRTC connection established for ${stream}`);

    // Step 6: Wait for connection to be fully established
    if (pc.connectionState !== 'connected') {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Connection timeout for ${stream}. Current state: ${pc.connectionState}`));
        }, 10000);
        
        pc.addEventListener('connectionstatechange', () => {
          if (pc.connectionState === 'connected') {
            clearTimeout(timeout);
            resolve();
          } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            clearTimeout(timeout);
            reject(new Error(`Connection failed for ${stream}. State: ${pc.connectionState}`));
          }
        });
      });
    }

    // Return both the peer connection and data channel
    return { pc, dc };
  } catch (error) {
    // Close connection on error
    pc.close();
    console.error(`Error establishing WebRTC connection for ${stream}:`, error);
    throw error;
  }
} 