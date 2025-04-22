import { RefObject } from "react";

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
  console.log(`Fetching ephemeral token for session type '${sessionType}' from ${REALTIME_TOKEN_ENDPOINT}...`);
  if (sessionConfig) {
    console.log('With session config:', sessionConfig);
  }
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
    console.log('Successfully fetched ephemeral token.');
    console.log('Token value:', data.token.value);
    return data.token.value;
  } catch (error) {
    console.error("Error fetching ephemeral token:", error);
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
      console.log(`Connection [${id}] state changing from ${conn.state} to ${newState}`);
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
    
    console.log(`Scheduling reconnection for [${id}], attempt ${attempts + 1}/${this.maxReconnectAttempts}...`);
    
    // Clean up the old connection before attempting to reconnect
    this._cleanupConnection(id);
    
    // Schedule reconnection
    setTimeout(() => {
      console.log(`Attempting reconnection for [${id}], attempt ${attempts + 1}/${this.maxReconnectAttempts}...`);
      // Attempt to reconnect with original parameters
      this.connect(id, track, stream, callbacks, sessionConfig).catch(error => {
        console.error(`Reconnection attempt ${attempts + 1} for [${id}] failed:`, error);
      });
    }, this.reconnectDelay);
  },

  _handleError(id: string, error: Error, context: string) {
    console.error(`Error in connection [${id}] during ${context}:`, error);
    const conn = this.connections.get(id);
    if (conn) {
      // Report the error via callback
      conn.callbacks.onError(error);
      // Update the state to 'failed', but don't trigger cleanup directly from here
      // Let the state change handler or component logic decide on disconnect/cleanup
      if (conn.state !== 'failed' && conn.state !== 'closed') { // Avoid redundant state updates
          console.log(`Connection [${id}] state changing from ${conn.state} to failed due to error.`);
          conn.state = 'failed';
          conn.callbacks.onStateChange('failed');
      }
    } else {
        console.warn(`_handleError called for non-existent connection [${id}]`);
    }
    // REMOVED: this._updateState(id, 'failed'); // Decouple immediate cleanup trigger
  },

  _cleanupConnection(id: string) {
    const conn = this.connections.get(id);
    if (!conn) return;

    console.log(`Cleaning up connection [${id}]...`);

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
    console.log(`Connection [${id}] removed.`);
  },

  async connect(
    id: string,
    track: MediaStreamTrack,
    stream: MediaStream, // We need the stream for addTrack
    callbacks: ConnectionCallbacks,
    sessionConfig?: Record<string, any>
  ): Promise<void> {
    if (this.connections.has(id)) {
      console.warn(`Connection with id [${id}] already exists or is connecting.`);
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
      console.log(`Connecting [${id}]...`);
      // Pass the id (as sessionType) and the sessionConfig
      const ephemeralToken = await fetchEphemeralToken(id as 'mic' | 'speaker', sessionConfig);

      // 1. Create PeerConnection
      console.log(`[${id}] Creating RTCPeerConnection...`);
      pc = new RTCPeerConnection();
      managedConn.pc = pc; // Assign pc to the stored connection object

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        if (!this.connections.has(id)) return; // Connection might have been cleaned up
        console.log(`[${id}] Connection state change: ${pc?.connectionState}`);
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
          console.log(`[${id}] ICE Connection state change: ${pc?.iceConnectionState}`);
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
        console.warn(`[${id}] Received unexpected remote track:`, event.track.kind);
        // If we *did* need playback, logic would go here, passing event to a callback
      };

      // 3. Add the provided local audio track
      console.log(`[${id}] Adding local audio track.`);
      pc.addTrack(track, stream);


      // 4. Set up the data channel for events
      console.log(`[${id}] Creating data channel "oai-events"...`);
      // Ensure the creation happens before SDP offer
       dc = pc.createDataChannel(`oai-events`);
       managedConn.dc = dc; // Update managedConn with the created dc

      dc.onopen = () => {
        if (!this.connections.has(id)) return;
        console.log(`[${id}] Data channel opened.`);
         // Consider moving 'connected' state update here or after ICE connects
      };
      dc.onclose = () => {
        if (!this.connections.has(id)) return;
        console.log(`[${id}] Data channel closed.`);
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
          const message = JSON.parse(event.data);
          callbacks.onMessage(message);
        } catch (e) {
           if (e instanceof Error) {
             console.error(`[${id}] Failed to parse data channel message:`, event.data, e);
             this._handleError(id, new Error(`Failed to parse DC message: ${e.message}`), 'dc.onmessage');
           }
        }
      };

      // 5. Create SDP Offer
      console.log(`[${id}] Creating SDP offer...`);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log(`[${id}] Local description set.`);

      // 6. Send Offer to OpenAI and get Answer
      console.log(`[${id}] Sending offer to ${REALTIME_CONNECTION_URL}...`);
      
      // REMOVED: Complex attemptSdpExchange function with fallback logic.
      // Simplify to directly send SDP offer with model in query param.

      try {
        // --- NEW: Construct URL with model from sessionConfig ---
        let url = REALTIME_CONNECTION_URL;
        const model = sessionConfig?.model; // Assuming model is in sessionConfig
        if (model) {
          // Use the specific model from the config
          url = `${url}?model=${encodeURIComponent(model)}`;
          console.log(`[${id}] Using model from sessionConfig: ${model}`);
        } else {
          // Fallback to a default model if not provided in config (adjust as needed)
          const defaultModel = "gpt-4o-realtime-preview-2024-12-17"; // Default model from example
          url = `${url}?model=${defaultModel}`;
          console.warn(`[${id}] Model not found in sessionConfig, using default: ${defaultModel}`);
        }
        // --- END NEW ---

        console.log(`[${id}] Sending offer with Content-Type: application/sdp to ${url}`);
        console.log(`[${id}] SDP offer (first 100 chars):`, offer.sdp?.substring(0, 100) + "...");
        
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
          console.error(`[${id}] SDP exchange failed with status ${sdpResponse.status}:`, errorText);
          console.error(`[${id}] Response headers:`, JSON.stringify(Object.fromEntries([...sdpResponse.headers.entries()])));
          throw new Error(`SDP exchange failed: ${sdpResponse.status} ${sdpResponse.statusText} - ${errorText}`);
        }

        const answerSdp = await sdpResponse.text(); // Get answer SDP directly
        console.log(`[${id}] SDP answer received (first 100 chars):`, answerSdp.substring(0, 100) + "...");
        // --- END SIMPLIFIED SDP EXCHANGE ---

        const answer: RTCSessionDescriptionInit = {
          type: 'answer',
          sdp: answerSdp,
        };

        // 7. Set Remote Description
        console.log(`[${id}] Setting remote description...`);
        await pc.setRemoteDescription(answer);
        console.log(`[${id}] Remote description set. WebRTC connection established (pending ICE completion).`);
        // State will transition to 'connected' via onconnectionstatechange listener

      } catch (error) {
        console.error(`[${id}] Failed to establish WebRTC connection:`, error);
        const err = error instanceof Error ? error : new Error(String(error));
        this._handleError(id, err, 'connect setup');
        // Cleanup is handled by _handleError -> _updateState -> _cleanupConnection
      }

    } catch (error) {
      console.error(`[${id}] Failed to establish WebRTC connection:`, error);
      const err = error instanceof Error ? error : new Error(String(error));
      this._handleError(id, err, 'connect setup');
      // Cleanup is handled by _handleError -> _updateState -> _cleanupConnection
    }
  },

  disconnect(id: string): void {
    console.log(`Disconnecting connection [${id}]...`);
    // Clear any reconnection attempts for this connection
    this.reconnectAttempts.delete(id);
    
    const conn = this.connections.get(id);
    if (conn) {
      this._updateState(id, 'closed'); // This will trigger cleanup via the state update logic
    } else {
      console.warn(`Attempted to disconnect non-existent connection [${id}]`);
    }
  },

  disconnectAll(): void {
    console.log("Disconnecting all connections...");
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
        // console.log(`[${id}] Sending message:`, messagePayload); // Verbose
        conn.dc.send(message);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`[${id}] Failed to stringify or send message:`, err);
        this._handleError(id, err, 'sendMessage');
      }
    } else {
      console.warn(`[${id}] Data channel not open or connection not found, cannot send message.`);
      // Optionally trigger error callback
      // const err = new Error(`Data channel not open or connection not found for id [${id}]`);
      // conn?.callbacks.onError(err);
    }
  }
};

// Optional: Add cleanup listener for page unload
// if (typeof window !== 'undefined') {
//   window.addEventListener('beforeunload', () => {
//     console.log("Page unloading, disconnecting all connections...");
//     connectionManager.disconnectAll();
//   });
// } 