import { RefObject } from "react";

// Define log levels
type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'NONE';

// Simple logging utility
export const logger = {
  level: 'ERROR' as LogLevel, // Set default to ERROR to suppress most logs
  
  setLevel(level: LogLevel) {
    this.level = level;
  },
  
  debug(message: string, ...args: any[]) {
    if (['DEBUG'].includes(this.level)) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },
  
  info(message: string, ...args: any[]) {
    if (['DEBUG', 'INFO'].includes(this.level)) {
      console.log(message, ...args);
    }
  },
  
  warn(message: string, ...args: any[]) {
    if (['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(this.level)) {
      console.warn(message, ...args);
    }
  },
  
  error(message: string, ...args: any[]) {
    if (['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(this.level)) {
      console.error(message, ...args);
    }
  }
};

const REALTIME_TOKEN_ENDPOINT = '/api/realtime-token';
const REALTIME_CONNECTION_URL = 'https://api.openai.com/v1/realtime'; // Base URL for SDP exchange

// Define the structure for connection-specific state
interface ManagedConnection {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  track: MediaStreamTrack;
  stream: MediaStream;
  state: string; // e.g., 'new', 'connecting', 'connected', 'disconnected', 'failed', 'closed'
  callbacks: ConnectionCallbacks;
  sessionConfig?: Record<string, any>;
}

interface ConnectionCallbacks {
  onMessage: (message: any) => void;
  onStateChange: (state: string) => void;
  onError: (error: Error) => void;
}

/**
 * Fetches an ephemeral token from the backend API route.
 * @returns {Promise<string>} The ephemeral token.
 * @throws {Error} If fetching the token fails.
 */
async function fetchEphemeralToken(
  sessionType: 'mic' | 'speaker',
  sessionConfig?: Record<string, any> // Add optional sessionConfig param
): Promise<string> {
  try {
    const response = await fetch(REALTIME_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Send both sessionType and sessionConfig
      body: JSON.stringify({ sessionType, sessionConfig }), 
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to fetch token: ${response.status} ${response.statusText} - ${errorData.error || 'Unknown error'}`);
    }

    const data = await response.json();
    if (!data.token?.value) {
      throw new Error('Token value not found in response from backend.');
    }
    return data.token.value;
  } catch (error) {
    logger.error("Error fetching ephemeral token:", error);
    // Ensure error is an Error object
    if (error instanceof Error) {
        throw error;
    } else {
        throw new Error(String(error));
    }
  }
}

// The main manager object
export const connectionManager = {
  connections: new Map<string, ManagedConnection>(),
  // Track reconnection attempts
  reconnectAttempts: new Map<string, number>(),
  maxReconnectAttempts: 3,
  reconnectDelay: 2000, // 2 seconds

  _updateState(id: string, newState: string) {
    const conn = this.connections.get(id);
    if (conn && conn.state !== newState) {
      conn.state = newState;
      conn.callbacks.onStateChange(newState);
      if (newState === 'closed' || newState === 'failed') {
        // Check if we should attempt to reconnect
        if (newState === 'failed' && this._shouldReconnect(id)) {
          this._scheduleReconnect(id, conn.track, conn.stream, conn.callbacks, conn.sessionConfig);
        } else {
          this._cleanupConnection(id); // Ensure cleanup on final states
        }
      }
    }
  },

  _shouldReconnect(id: string): boolean {
    const attempts = this.reconnectAttempts.get(id) || 0;
    return attempts < this.maxReconnectAttempts;
  },

  _scheduleReconnect(
    id: string, 
    track: MediaStreamTrack, 
    stream: MediaStream,
    callbacks: ConnectionCallbacks,
    sessionConfig?: Record<string, any>
  ): void {
    const attempts = this.reconnectAttempts.get(id) || 0;
    this.reconnectAttempts.set(id, attempts + 1);
    
    // Clean up the old connection before attempting to reconnect
    this._cleanupConnection(id);
    
    // Schedule reconnection
    setTimeout(() => {
      // Attempt to reconnect with original parameters
      this.connect(id, track, stream, callbacks, sessionConfig).catch(error => {
        logger.error(`Reconnection attempt ${attempts + 1} for [${id}] failed:`, error);
      });
    }, this.reconnectDelay);
  },

  _handleError(id: string, error: Error, context: string) {
    logger.error(`Error in connection [${id}] during ${context}:`, error);
    const conn = this.connections.get(id);
    if (conn) {
      // Report the error via callback
      conn.callbacks.onError(error);
      // Update the state to 'failed', but don't trigger cleanup directly from here
      // Let the state change handler or component logic decide on disconnect/cleanup
      if (conn.state !== 'failed' && conn.state !== 'closed') { // Avoid redundant state updates
          conn.state = 'failed';
          conn.callbacks.onStateChange('failed');
      }
    } else {
        logger.warn(`_handleError called for non-existent connection [${id}]`);
    }
    // REMOVED: this._updateState(id, 'failed'); // Decouple immediate cleanup trigger
  },

  _cleanupConnection(id: string) {
    const conn = this.connections.get(id);
    if (!conn) return;

    // Stop the track only if it was provided (managed externally might be better long term)
    // conn.track?.stop(); // Let caller manage track lifetime usually

    if (conn.dc) {
      conn.dc.onopen = null;
      conn.dc.onclose = null;
      conn.dc.onerror = null;
      conn.dc.onmessage = null;
      if (conn.dc.readyState === 'open' || conn.dc.readyState === 'connecting') {
        conn.dc.close();
      }
    }
    if (conn.pc) {
      conn.pc.ontrack = null;
      conn.pc.onicecandidate = null;
      conn.pc.oniceconnectionstatechange = null;
      conn.pc.onconnectionstatechange = null;
      if (conn.pc.connectionState !== 'closed') {
        conn.pc.close();
      }
    }
    this.connections.delete(id);
  },

  async connect(
    id: string,
    track: MediaStreamTrack,
    stream: MediaStream, // We need the stream for addTrack
    callbacks: ConnectionCallbacks,
    sessionConfig?: Record<string, any>
  ): Promise<void> {
    if (this.connections.has(id)) {
      logger.warn(`Connection with id [${id}] already exists or is connecting.`);
      callbacks.onError(new Error(`Connection with id [${id}] already exists.`));
      return;
    }

    // Create the connection object structure FIRST, including callbacks
    const managedConn: ManagedConnection = {
      pc: null as any, // Will be created shortly
      dc: null as any, // Will be created shortly
      track,
      stream,
      state: 'new', // Initial state
      callbacks, // Store callbacks immediately
      sessionConfig // Store session config for reconnection purposes
    };
    this.connections.set(id, managedConn); // Store the full structure (with callbacks)
    this._updateState(id, 'connecting'); // Now safe to update state

    // Keep pc and dc as local variables for setup ease
    let pc: RTCPeerConnection | null = null;
    let dc: RTCDataChannel | null = null;

    try {
      // Pass the id (as sessionType) and the sessionConfig
      const ephemeralToken = await fetchEphemeralToken(id as 'mic' | 'speaker', sessionConfig);

      // 1. Create PeerConnection
      pc = new RTCPeerConnection();
      managedConn.pc = pc; // Assign pc to the stored connection object

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        if (!this.connections.has(id)) return; // Connection might have been cleaned up
        switch (pc?.connectionState) {
          case 'connected':
            this._updateState(id, 'connected');
            // Reset reconnect attempts on successful connection
            this.reconnectAttempts.set(id, 0);
            break;
          case 'disconnected':
            this._updateState(id, 'disconnected');
            // Could attempt reconnection here or rely on ICE state
            break;
          case 'failed':
            this._handleError(id, new Error('PeerConnection state failed.'), 'onconnectionstatechange');
            break;
          case 'closed':
            this._updateState(id, 'closed');
            break;
          default:
            // 'new', 'connecting' are handled initially or via other events
            this._updateState(id, pc?.connectionState ?? 'unknown');
            break;
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (!this.connections.has(id)) return;
        // You might use ICE state for more granular connection status
        // e.g., 'checking', 'completed', 'failed'
        if (pc?.iceConnectionState === 'failed') {
          this._handleError(id, new Error('ICE connection failed.'), 'oniceconnectionstatechange');
        } else if (pc?.iceConnectionState === 'closed') {
          this._updateState(id, 'closed');
        }
      };

      // 2. Handle incoming tracks (Log warning, as we don't expect playback)
      pc.ontrack = (event: RTCTrackEvent) => {
        if (event.track.kind !== 'audio') {
          logger.warn(`[${id}] Received unexpected remote track:`, event.track.kind);
        }
      };

      // 3. Add the provided local audio track
      pc.addTrack(track, stream);

      // 4. Set up the data channel for events
      dc = pc.createDataChannel(`oai-events`);
      managedConn.dc = dc; // Update managedConn with the created dc

      dc.onopen = () => {
        if (!this.connections.has(id)) return;
        // Consider moving 'connected' state update here or after ICE connects
      };
      dc.onclose = () => {
        if (!this.connections.has(id)) return;
        // If DC closes unexpectedly, might indicate an issue
        // Don't necessarily mark entire connection as closed here
      };
      dc.onerror = (event) => {
        if (!this.connections.has(id)) return;
        const errorEvent = event as RTCErrorEvent;
        this._handleError(id, new Error(`Data channel error: ${errorEvent.error?.message || 'Unknown DC error'}`), 'dc.onerror');
      };
      dc.onmessage = (event) => {
        if (!this.connections.has(id)) return;
        try {
          // Attempt to parse the incoming data as JSON
          const parsedData = JSON.parse(event.data);

          // Check if the parsed data has the expected structure
          if (parsedData && typeof parsedData.transcript === 'string' && typeof parsedData.question_type === 'string') {
            // Pass the structured object to the callback
            callbacks.onMessage({
              transcript: parsedData.transcript,
              question_type: parsedData.question_type
            });
/* --- Frontend Integration Logic Placeholder --- */
            // This block demonstrates how the frontend might use the received data
            // It should be implemented within the component where 'callbacks.onMessage' is defined.

            // Destructure the received data (assuming it's passed directly)
            // const { transcript, question_type } = parsedData; // Or however the callback passes it

            // Model Selection Logic:
            let model;
            switch(parsedData.question_type) { // Use parsedData directly for placeholder clarity
              case "CODE_QUESTION":
              case "BEHAVIORAL_QUESTION":
                model = "o4-mini-2025-04-16"; // More capable model
                break;
              case "GENERAL_QUESTION":
              default:
                model = "gpt-4.1-mini-2025-04-14"; // Cost-effective model
                break;
            }

            // API Call Structure:
            // Assume currentConversationId is available in the frontend scope where this logic runs
            const currentConversationId = "placeholder-conversation-id"; // Example ID

            /*
            // Example fetch call (commented out as this runs in the backend context)
            try {
              const response = await fetch('/api/responses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  transcript: parsedData.transcript,
                  questionType: parsedData.question_type,
                  model: model,
                  conversationId: currentConversationId
                })
              });
              const result = await response.json();
              // Handle the result from the responses API...
            } catch (e) {
              logger.error(`[${id}] Frontend Placeholder: Error calling responses API:`, e);
              // Handle error
            }
            */
           /* --- End Frontend Integration Logic Placeholder --- */
          } else {
            // Parsed successfully, but missing expected keys
            logger.warn(`[${id}] Received JSON message without expected 'transcript' and 'question_type' keys:`, parsedData);
            // Fallback: Pass the parsed data as is
            callbacks.onMessage(parsedData);
          }
        } catch (e) {
          // JSON parsing failed, assume it's plain text or other format
          logger.warn(`[${id}] Received non-JSON message or JSON parsing failed. Passing raw data. Error: ${e instanceof Error ? e.message : String(e)}`, event.data);
          // Fallback: Pass the raw data to the callback
          callbacks.onMessage(event.data);
        }
      };

      // 5. Create SDP Offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 6. Send Offer to OpenAI and get Answer
      try {
        // --- Construct URL with model from sessionConfig ---
        let url = REALTIME_CONNECTION_URL;
        const model = sessionConfig?.model; // Assuming model is in sessionConfig
        if (model) {
          // Use the specific model from the config
          url = `${url}?model=${encodeURIComponent(model)}`;
        } else {
          // Fallback to a default model if not provided in config (adjust as needed)
          const defaultModel = "gpt-4o-realtime-preview-2024-12-17"; // Default model from example
          url = `${url}?model=${defaultModel}`;
          logger.warn(`[${id}] Model not found in sessionConfig, using default: ${defaultModel}`);
        }
        
        // Send the SDP offer directly, not as JSON
        const sdpResponse = await fetch(url, { // Use the constructed URL with model
          method: 'POST',
          body: offer.sdp, // Send SDP directly
          headers: {
            Authorization: `Bearer ${ephemeralToken}`,
            'Content-Type': 'application/sdp', // Use correct content type
          },
        });

        if (!sdpResponse.ok) {
          const errorText = await sdpResponse.text();
          logger.error(`[${id}] SDP exchange failed with status ${sdpResponse.status}:`, errorText);
          logger.error(`[${id}] Response headers:`, JSON.stringify(Object.fromEntries([...sdpResponse.headers.entries()])));
          throw new Error(`SDP exchange failed: ${sdpResponse.status} ${sdpResponse.statusText} - ${errorText}`);
        }

        const answerSdp = await sdpResponse.text(); // Get answer SDP directly

        const answer: RTCSessionDescriptionInit = {
          type: 'answer',
          sdp: answerSdp,
        };

        // 7. Set Remote Description
        await pc.setRemoteDescription(answer);

      } catch (error) {
        logger.error(`[${id}] Failed to establish WebRTC connection:`, error);
        const err = error instanceof Error ? error : new Error(String(error));
        this._handleError(id, err, 'connect setup');
        // Cleanup is handled by _handleError -> _updateState -> _cleanupConnection
      }

    } catch (error) {
      logger.error(`[${id}] Failed to establish WebRTC connection:`, error);
      const err = error instanceof Error ? error : new Error(String(error));
      this._handleError(id, err, 'connect setup');
      // Cleanup is handled by _handleError -> _updateState -> _cleanupConnection
    }
  },

  disconnect(id: string): void {
    // Clear any reconnection attempts for this connection
    this.reconnectAttempts.delete(id);
    
    const conn = this.connections.get(id);
    if (conn) {
      this._updateState(id, 'closed'); // This will trigger cleanup via the state update logic
    } else {
      logger.warn(`Attempted to disconnect non-existent connection [${id}]`);
    }
  },

  disconnectAll(): void {
    // Clear all reconnection attempts
    this.reconnectAttempts.clear();
    
    // Create a copy of keys to avoid issues while iterating and deleting
    const ids = Array.from(this.connections.keys());
    ids.forEach(id => this.disconnect(id));
  },

  sendMessage(id: string, messagePayload: object): void {
    const conn = this.connections.get(id);
    if (conn && conn.dc && conn.dc.readyState === 'open') {
      try {
        const message = JSON.stringify(messagePayload);
        // logger.info(`[${id}] Sending message:`, messagePayload); // Verbose
        conn.dc.send(message);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(`[${id}] Failed to stringify or send message:`, err);
        this._handleError(id, err, 'sendMessage');
      }
    } else {
      logger.warn(`[${id}] Data channel not open or connection not found, cannot send message.`);
      // Optionally trigger error callback
      // const err = new Error(`Data channel not open or connection not found for id [${id}]`);
      // conn?.callbacks.onError(err);
    }
  }
};

// Optional: Add cleanup listener for page unload
// if (typeof window !== 'undefined') {
//   window.addEventListener('beforeunload', () => {
//     logger.info("Page unloading, disconnecting all connections...");
//     connectionManager.disconnectAll();
//   });
// } 