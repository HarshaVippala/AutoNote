import fetch from 'node-fetch';
import WebSocket from 'ws';

/**
 * Creates an OpenAI Realtime session and establishes a WebSocket connection.
 *
 * @param {string} streamId - A unique identifier for the audio stream (e.g., 'mic' or 'remote').
 * @returns {Promise<WebSocket>} A promise that resolves with the WebSocket instance.
 * @throws {Error} If the OPENAI_API_KEY environment variable is not set or session creation fails.
 */
export async function createRealtimeConnection(stream: 'mic' | 'remote'): Promise<WebSocket> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set.');
  }

  console.log(`Creating Realtime session for ${stream}...`);

  // Step 1: Create a session via the sessions endpoint
  const sessionEndpoint = 'https://api.openai.com/v1/realtime/sessions';
  
  try {
    const sessionResponse = await fetch(sessionEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'realtime=v1'
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview',
        modalities: ['audio', 'text'] as Array<'audio' | 'text'>,
        input_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1'
        },
        instructions: 'You are a helpful assistant. Keep your responses brief and conversational.',
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          silence_duration_ms: 300
        }
      })
    });
    
    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text();
      throw new Error(`Failed to create session: ${sessionResponse.status} - ${errorText}`);
    }
    
    const sessionData = await sessionResponse.json() as {
      id: string;
      client_secret: { value: string };
    };
    
    console.log(`[${stream}] Session created successfully. ID: ${sessionData.id}`);
    
    // Step 2: Connect to the WebSocket with the session ID and token
    const websocketUrl = `wss://api.openai.com/v1/realtime/sessions/${sessionData.id}/connect`;
    const wsHeaders = {
      'Authorization': `Bearer ${sessionData.client_secret.value}`,
      'OpenAI-Beta': 'realtime=v1' // Required during Realtime API beta handshake
    };

    console.log(`[${stream}] Attempting WebSocket connection to: ${websocketUrl}`);
    console.debug(`[${stream}] Using Authorization: ${wsHeaders.Authorization.substring(0, 16)}...`);

    // The Realtime API requires the "realtime" sub‑protocol
    const ws = new WebSocket(websocketUrl, {
      headers: wsHeaders // Authorization + OpenAI‑Beta
    });
    
    // Set up event handlers
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`WebSocket connection timeout for ${stream}`));
      }, 10000);
      
      ws.on('open', () => {
        clearTimeout(timeout);
        console.log(`WebSocket connection opened for ${stream}`);
        resolve(ws);
      });
      
      ws.on('error', (error) => {
        clearTimeout(timeout);
        // Log the specific WebSocket error
        console.error(`[${stream}] WebSocket connection error:`, error);
        reject(error); // Reject the promise on WebSocket error
      });
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log(`Received message for ${stream}:`, message.type);
          
          // Handle specific message types
          switch (message.type) {
            case 'session.created':
              console.log(`Session confirmed for ${stream}`);
              break;
            case 'error':
              console.error(`Error for ${stream}:`, message.error);
              break;
            case 'conversation.item.input_audio_transcription.completed':
              console.log(`>>> [${stream.toUpperCase()}] TRANSCRIPTION: ${message.text || 'No text'}`);
              break;
            default:
              // Just log other message types at debug level
              if (message.type && message.type.includes('transcript')) {
                console.log(`>>> [${stream.toUpperCase()}] TRANSCRIPT: ${JSON.stringify(message)}`);
              }
          }
        } catch (error) {
          console.error(`Failed to parse WebSocket message for ${stream}:`, error);
        }
      });
      
      ws.on('close', (code, reason) => {
        const reasonString = reason.toString();
        // Log detailed close information
        console.log(`[${stream}] WebSocket connection closed. Code: ${code}, Reason: ${reasonString || 'No reason provided'}`);
        // Potentially reject or handle closure if it happens during setup unexpectedly
        // if (ws.readyState !== WebSocket.OPEN) { reject(new Error(`WebSocket closed unexpectedly during setup with code ${code}`)) }
      });
    });
  } catch (error: unknown) {
    // Log the error during session creation or connection attempt
    console.error(`[${stream}] Failed during Realtime session creation or WebSocket connection:`, error);
    if (error instanceof Error && error.message.includes('403')) {
      console.error(`[${stream}] 403 Forbidden encountered. Verify Realtime API access for your key and organization at https://platform.openai.com/playground/realtime`);
    }
    throw error;
  }
}