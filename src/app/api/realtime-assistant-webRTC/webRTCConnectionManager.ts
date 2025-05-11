import { logger } from '../../../lib/logger';

const REALTIME_TOKEN_ENDPOINT = '/api/realtime-token';
const REALTIME_CONNECTION_URL = 'https://api.openai.com/v1/realtime';

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
  sessionConfig?: Record<string, any>
): Promise<string> {
  try {
    const response = await fetch(REALTIME_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
  reconnectAttempts: new Map<string, number>(),
  maxReconnectAttempts: 3,
  reconnectDelay: 2000,

  _updateState(id: string, newState: string) {
    const conn = this.connections.get(id);
    if (conn && conn.state !== newState) {
      conn.state = newState;
      conn.callbacks.onStateChange(newState);
      if (newState === 'closed' || newState === 'failed') {
        if (newState === 'failed' && this._shouldReconnect(id)) {
          this._scheduleReconnect(id, conn.track, conn.stream, conn.callbacks, conn.sessionConfig);
        } else {
          this._cleanupConnection(id);
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
    
    this._cleanupConnection(id);
    
    setTimeout(() => {
      this.connect(id, track, stream, callbacks, sessionConfig).catch(error => {
        logger.error(`Reconnection attempt ${attempts + 1} for [${id}] failed:`, error);
      });
    }, this.reconnectDelay);
  },

  _handleError(id: string, error: Error, context: string) {
    logger.error(`Error in connection [${id}] during ${context}:`, error);
    const conn = this.connections.get(id);
    if (conn) {
      conn.callbacks.onError(error);
      if (conn.state !== 'failed' && conn.state !== 'closed') {
          conn.state = 'failed';
          conn.callbacks.onStateChange('failed');
      }
    } else {
        logger.warn(`_handleError called for non-existent connection [${id}]`);
    }
  },

  _cleanupConnection(id: string) {
    const conn = this.connections.get(id);
    if (!conn) return;


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
    stream: MediaStream,
    callbacks: ConnectionCallbacks,
    sessionConfig?: Record<string, any>
  ): Promise<void> {
    if (this.connections.has(id)) {
      logger.warn(`Connection with id [${id}] already exists or is connecting.`);
      callbacks.onError(new Error(`Connection with id [${id}] already exists.`));
      return;
    }

    const managedConn: ManagedConnection = {
      pc: null as any,
      dc: null as any,
      track,
      stream,
      state: 'new',
      callbacks,
      sessionConfig
    };
    this.connections.set(id, managedConn);
    this._updateState(id, 'connecting');

    let pc: RTCPeerConnection | null = null;
    let dc: RTCDataChannel | null = null;

    try {
      const ephemeralToken = await fetchEphemeralToken(id as 'mic' | 'speaker', sessionConfig);

      pc = new RTCPeerConnection();
      managedConn.pc = pc;

      pc.onconnectionstatechange = () => {
        if (!this.connections.has(id)) return;
        switch (pc?.connectionState) {
          case 'connected':
            this._updateState(id, 'connected');
            this.reconnectAttempts.set(id, 0);
            break;
          case 'disconnected':
            this._updateState(id, 'disconnected');
            break;
          case 'failed':
            this._handleError(id, new Error('PeerConnection state failed.'), 'onconnectionstatechange');
            break;
          case 'closed':
            this._updateState(id, 'closed');
            break;
          default:
            this._updateState(id, pc?.connectionState ?? 'unknown');
            break;
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (!this.connections.has(id)) return;
        if (pc?.iceConnectionState === 'failed') {
          this._handleError(id, new Error('ICE connection failed.'), 'oniceconnectionstatechange');
        } else if (pc?.iceConnectionState === 'closed') {
          this._updateState(id, 'closed');
        }
      };

      pc.ontrack = (event: RTCTrackEvent) => {
        if (event.track.kind !== 'audio') {
          logger.warn(`[${id}] Received unexpected remote track:`, event.track.kind);
        }
      };

      pc.addTrack(track, stream);

      dc = pc.createDataChannel(`oai-events`);
      managedConn.dc = dc;

      dc.onopen = () => {
        if (!this.connections.has(id)) return;
      };
      dc.onclose = () => {
        if (!this.connections.has(id)) return;
      };
      dc.onerror = (event) => {
        if (!this.connections.has(id)) return;
        const errorEvent = event as RTCErrorEvent;
        this._handleError(id, new Error(`Data channel error: ${errorEvent.error?.message || 'Unknown DC error'}`), 'dc.onerror');
      };
      dc.onmessage = (event) => {
        if (!this.connections.has(id)) return;
        try {
          const parsedData = JSON.parse(event.data);

          if (parsedData && parsedData.type) {
            switch (parsedData.type) {
              case 'conversation.item.input_audio_transcription.completed':
                if (typeof parsedData.transcript === 'string') {
                  callbacks.onMessage({
                    type: parsedData.type,
                    transcript: parsedData.transcript,
                  });
                } else {
                  logger.warn(`[${id}] Received ${parsedData.type} message without a string transcript:`, parsedData);
                  callbacks.onMessage(parsedData);
                }
                break;
              
              case 'conversation.item.input_audio_transcription.delta':
                if (parsedData.delta && typeof parsedData.delta === 'string') {
                     callbacks.onMessage({
                        type: parsedData.type,
                        delta: parsedData.delta,
                     });
                } else {
                    logger.warn(`[${id}] Received ${parsedData.type} message without a string delta:`, parsedData);
                    callbacks.onMessage(parsedData);
                }
                break;

              case 'transcription_session.created':
              case 'input_audio_buffer.speech_started':
              case 'input_audio_buffer.speech_stopped':
              case 'input_audio_buffer.committed':
              case 'conversation.item.created':
                callbacks.onMessage(parsedData);
                break;

              default:
                logger.warn(`[${id}] Received message with unhandled type '${parsedData.type}':`, parsedData);
                callbacks.onMessage(parsedData);
                break;
            }
          } else {
            logger.warn(`[${id}] Received JSON message without 'type' key or invalid structure:`, parsedData);
            callbacks.onMessage(parsedData);
          }
        } catch (e) {
          logger.warn(`[${id}] Received non-JSON message or JSON parsing failed. Passing raw data. Error: ${e instanceof Error ? e.message : String(e)}`, event.data);
          callbacks.onMessage(event.data);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      try {
        let url: string; // Declare url in the outer try block scope
        try {
          url = REALTIME_CONNECTION_URL; // Assign value here
          const transcriptionModels = ['whisper-1', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe'];
          const isTranscriptionSession =
            sessionConfig?.input_audio_transcription &&
            transcriptionModels.includes(sessionConfig.input_audio_transcription.model);

          if (!isTranscriptionSession) {
            const model = sessionConfig?.model;
            if (model) {
              url = `${url}?model=${encodeURIComponent(model)}`;
            } else {
              const defaultModel = "gpt-4o-realtime-preview-2024-12-17";
              url = `${url}?model=${defaultModel}`;
              logger.warn(`[${id}] Model not found in sessionConfig, using default: ${defaultModel}`);
            }
          }
        } catch (urlError) {
          throw urlError;
        }
          
          const sdpResponse = await fetch(url, {
            method: 'POST',
            body: offer.sdp,
            headers: {
              Authorization: `Bearer ${ephemeralToken}`,
              'Content-Type': 'application/sdp',
            },
          });

          if (!sdpResponse.ok) {
            const errorText = await sdpResponse.text();
            logger.error(`[${id}] SDP exchange failed with status ${sdpResponse.status}:`, errorText);
            logger.error(`[${id}] Response headers:`, JSON.stringify(Object.fromEntries([...sdpResponse.headers.entries()])));
            throw new Error(`SDP exchange failed: ${sdpResponse.status} ${sdpResponse.statusText} - ${errorText}`);
          }
const answerSdp = await sdpResponse.text();

const answer: RTCSessionDescriptionInit = {
  type: 'answer',
  sdp: answerSdp,
};

await pc.setRemoteDescription(answer);

} catch (error) {
logger.error(`[${id}] Failed to establish WebRTC connection:`, error);
const err = error instanceof Error ? error : new Error(String(error));
this._handleError(id, err, 'connect setup');
} // This closes the inner catch block
}
catch (error) { // This is the main catch for the connect method
  logger.error(`[${id}] Failed to establish WebRTC connection (outer catch):`, error);
  const err = error instanceof Error ? error : new Error(String(error));
  this._handleError(id, err, 'connect setup (outer catch)');
} // Closes the main catch block of the connect method
}, // Closes the connect method and adds a comma

disconnect(id: string): void {
    this.reconnectAttempts.delete(id);
    
    const conn = this.connections.get(id);
    if (conn) {
      this._updateState(id, 'closed');
    } else {
      logger.warn(`Attempted to disconnect non-existent connection [${id}]`);
    }
  },

  disconnectAll(): void {
    this.reconnectAttempts.clear();
    
    const ids = Array.from(this.connections.keys());
    ids.forEach(id => this.disconnect(id));
  },

  sendMessage(id: string, messagePayload: object): void {
    const conn = this.connections.get(id);
    if (conn && conn.dc && conn.dc.readyState === 'open') {
      try {
        const message = JSON.stringify(messagePayload);
        conn.dc.send(message);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(`[${id}] Failed to stringify or send message:`, err);
        this._handleError(id, err, 'sendMessage');
      }
    } else {
      logger.warn(`[${id}] Data channel not open or connection not found, cannot send message.`);
    }
  }
};
