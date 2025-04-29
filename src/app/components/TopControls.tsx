"use client";

import React, { useState, useEffect, memo, useCallback, useRef } from 'react';
import Image from 'next/image';
import { ConnectionState as AppConnectionState, TranscriptTurn, ComprehensiveCodeSchema } from "@/app/types"; // Import ComprehensiveCodeSchema
import { connectionManager } from '@/app/api/realtime-assistant-webRTC/webRTCConnection-webRTC';
import ErrorDialog from './ErrorDialog';
import SettingsModal from './SettingsModal'; // Import SettingsModal
import { useTheme } from "@/app/contexts/ThemeContext";
import { useStatus } from "@/app/contexts/StatusContext"; // Import useStatus

// Define the target sample rate directly
const TARGET_SAMPLE_RATE = 24000;

// Constants
const ASSISTANT_ID = process.env.NEXT_PUBLIC_OPENAI_ASSISTANT_ID || '';

// For audio level meter
interface AudioLevelMeterProps {
  audioSource: MediaStream | null;
  isActive: boolean;
}

// Simple audio level meter component
const AudioLevelMeter: React.FC<AudioLevelMeterProps> = ({ audioSource, isActive }) => {
  const [level, setLevel] = useState<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!isActive || !audioSource) {
      // Reset level when inactive
      setLevel(0);

      // Cleanup any existing analyzer
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (audioContextRef.current) {
        audioContextRef.current.close().catch(console.error);
        audioContextRef.current = null;
        analyserRef.current = null;
      }

      return;
    }

    // Create audio context and analyzer if needed
    if (!audioContextRef.current) {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      // Connect the audio source to the analyzer
      const source = audioContext.createMediaStreamSource(audioSource);
      source.connect(analyser);
    }

    // Function to analyze audio levels
    const analyzeLevel = () => {
      if (!analyserRef.current || !isActive) return;

      const analyser = analyserRef.current;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      // Get time domain data (waveform)
      analyser.getByteTimeDomainData(dataArray);

      // Calculate RMS value
      let sumSquares = 0;
      for (const amplitude of dataArray) {
        // Normalize to [-1, 1]
        const normalizedAmplitude = (amplitude - 128) / 128;
        sumSquares += normalizedAmplitude * normalizedAmplitude;
      }

      const rms = Math.sqrt(sumSquares / dataArray.length);

      // Apply some smoothing to the level
      setLevel(prev => 0.2 * rms + 0.8 * prev);

      // Continue the animation loop
      animationFrameRef.current = requestAnimationFrame(analyzeLevel);
    };

    // Start the animation loop
    animationFrameRef.current = requestAnimationFrame(analyzeLevel);

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [audioSource, isActive, theme]); // Added theme dependency

  // Generate the meter segments
  const segments = 5;
  const filledSegments = Math.round(level * segments);

  return (
    <div className="flex space-x-1 items-center mx-2 h-4">
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className={`w-1 h-${1 + i} rounded-full transition-colors duration-100 ${
            i < filledSegments
              ? theme === 'dark' ? 'bg-green-600' : 'bg-green-500'
              : theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'
          }`}
        />
      ))}
    </div>
  );
};

// <<< Session Configurations (Plan A) >>>
const micSessionConfig_AuxAssistant = {
  model: "gpt-4o-mini-realtime-preview-2024-12-17",
  modalities: ["text"],
  instructions: `You are an auxiliary assistant providing immediate, concise information based ONLY on the user's conversation history . The history may include messages labeled 'SYSTEM_AUDIO_TRANSCRIPT' representing what the system/speaker just said.\nDO NOT engage in lengthy conversation (no greetings, apologies, or excessive filler).DO NOT ask clarifying questions.\nFOCUS on providing relevant factual snippets or definitions related to the user's topic or the preceding SYSTEM_AUDIO_TRANSCRIPT.\nIf the user sounds hesitant (umm, hmm, uh), proactively offer a brief, relevant suggestion based on the preceding topic.\nKeep responses very short.`,
  temperature: 0.7,
  input_audio_transcription: {
    model: "whisper-1",
    language: "en",
  },
  input_audio_noise_reduction: {
    type: "near_field"
  },
  turn_detection: {
    type: "server_vad",
    silence_duration_ms: 600,
    create_response: true,
    interrupt_response: false
  },
  input_audio_format: "pcm16",
};

const speakerSessionConfig_Transcription = {
  model: "gpt-4o-mini-realtime-preview-2024-12-17", // Match mic's model for consistency
  modalities: ["text"],
  instructions: "Transcribe system audio with high accuracy and completeness. Capture all spoken content fully.",
  temperature: 0.7,
  input_audio_transcription: {
    model: "whisper-1",
    language: "en",
  },
  turn_detection: {
    type: "server_vad",
    silence_duration_ms: 700, // increased to avoid splitting quick utterances
    create_response: false,
    interrupt_response: false
  }, // Enable VAD to detect audio for transcription
  input_audio_format: "pcm16",
};

// <<< ADD Back the type definition here >>>
type WebRTCConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'failed' | 'error';
type ChatStatus = "idle" | "processing" | "done" | "error"; // Add ChatStatus type

// Use central types - REVERTED FOR NOW
// import { TranscriptTurn, ErrorState } from "@/app/types";

interface TopControlsProps {
  appConnectionState: AppConnectionState;
  isMicrophoneMuted: boolean;
  setIsMicrophoneMuted: (muted: boolean) => void;
  onToggleConnection: () => void;
  // Removed mobile view props: isMobileView, setActiveMobilePanel, activeMobilePanel
  triggerConnect: number;
  triggerDisconnect: number;
  onMicStatusChange: (status: WebRTCConnectionStatus) => void;
  onProcessTurn: (turn: TranscriptTurn) => void;
  onSpeakerStatusChange: (status: WebRTCConnectionStatus) => void;
  onReconnectMic?: () => void;
  onReconnectSpeaker?: () => void;
  micConnectionStatus: WebRTCConnectionStatus; // Add micConnectionStatus prop
  onCycleViewRequest: () => void; // Add prop to request view cycle
}

// <<< REMOVED: Local definition - now imported >>>

interface ErrorState {
    isOpen: boolean;
    title: string;
    message: string;
    details: string;
    retryAction: (() => void) | null;
}

// add constant for debounce delay
const DEBOUNCE_DELAY_MS = 700;  // increased debounce to 4s to batch transcripts across longer pauses

const TopControls: React.FC<TopControlsProps> = memo(({
  appConnectionState, // Use renamed prop
  isMicrophoneMuted,
  setIsMicrophoneMuted,
  onToggleConnection,
  // Removed mobile view props from destructuring
  triggerConnect,
  triggerDisconnect,
  onMicStatusChange,
  onProcessTurn,
  onSpeakerStatusChange,
  onReconnectMic,
  onReconnectSpeaker,
  micConnectionStatus, // Destructure micConnectionStatus
  onCycleViewRequest, // Destructure onCycleViewRequest
}) => {
  // Local state for speaker connection status (mic status comes from prop now)
  const [speakerConnectionStatus, setSpeakerConnectionStatus] = useState<WebRTCConnectionStatus>('disconnected');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false); // State for settings modal
  const { theme } = useTheme(); // Add theme hook
  const { chatStatus } = useStatus(); // Get chatStatus from context

  // Ref to store the actual mic track to toggle its enabled state
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const speakerTrackRef = useRef<MediaStreamTrack | null>(null);
  const rawMicStreamRef = useRef<MediaStream | null>(null); // <<< Add ref for raw mic stream
  const rawSpeakerStreamRef = useRef<MediaStream | null>(null); // <<< Add ref for raw speaker stream

  // Transcript collection state (remains, uses local type)
  const [transcriptTurn, setTranscriptTurn] = useState<TranscriptTurn>({
    timestamp: Date.now(),
    processed: true // Start with processed=true so we don't try to process empty turn
  });
  // Comment out state related to legacy assistant processing
  // const [assistantRunInProgress, setAssistantRunInProgress] = useState(false);
  // const [currentRunInfo, setCurrentRunInfo] = useState<{threadId?: string, runId?: string}>({});

  // Add a ref to defer the connectMic and connectSpeaker functions
  const connectMicRef = useRef<(() => Promise<void>) | null>(null);
  const connectSpeakerRef = useRef<(() => Promise<void>) | null>(null);

  // Update error state to use local type
  const [errorState, setErrorState] = useState<ErrorState>({
    isOpen: false,
    title: '',
    message: '',
    details: '',
    retryAction: null
  });

  // Close the error dialog
  const handleErrorDismiss = useCallback(() => {
    setErrorState((prev: ErrorState) => ({ ...prev, isOpen: false })); // Add explicit type
  }, []);

  const [isCapturing, setIsCapturing] = useState(false); // State for capture in progress

  // Function to handle screen capture and API call
  const handleScreenCapture = useCallback(async () => {
    if (isCapturing) return; // Prevent multiple captures
    setIsCapturing(true);
    console.log("Initiating screen capture...");

    try {
      // 1. Request screen capture permission
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" } as MediaTrackConstraints, // Cast to bypass type issue if needed
        audio: false,
      });

      const track = stream.getVideoTracks()[0];
      console.log("Screen capture stream obtained.");

      // 2. Capture a single frame
      // @ts-ignore ImageCapture is experimental but widely supported
      const imageCapture = new ImageCapture(track);
      const bitmap = await imageCapture.grabFrame();
      track.stop(); // Stop the stream track as we only need one frame
      console.log("Frame captured.");

      // 3. Draw frame to canvas
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not get canvas context");
      ctx.drawImage(bitmap, 0, 0);
      console.log("Frame drawn to canvas.");

      // 4. Convert canvas to base64 data URL (PNG)
      const imageDataUrl = canvas.toDataURL('image/png');
      console.log("Image converted to data URL (first 100 chars):", imageDataUrl.substring(0, 100));

      // 5. Prepare the payload (using placeholder schema)
      const payload: ComprehensiveCodeSchema = {
        question: "Explain the code in this screenshot.", // Default question
        image: imageDataUrl,
      };

      // 6. Send to API endpoint
      console.log("Sending payload to API endpoint /api/code-question...");
      const response = await fetch('/api/code-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})); // Try to parse error details
        throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorData.details || 'No details'}`);
      }

      const result = await response.json();
      console.log("API Response:", result);
      // Display the response (e.g., in an alert or a dedicated component)
      alert(`Assistant Response:\n${result.response}`);

    } catch (err) {
      console.error("Screen capture failed:", err);
      // Handle specific errors like permission denied
      if (err instanceof Error && err.name === 'NotAllowedError') {
        alert("Screen capture permission was denied. Please allow screen sharing in your browser settings.");
      } else {
        alert(`Screen capture failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      setIsCapturing(false); // Reset capturing state
    }
  }, [isCapturing]);

  // Define message handlers without dependencies to connectMic/connectSpeaker
  const handleMicMessage = useCallback((message: any) => {
    // Handle FINAL audio transcripts (user speech)
    if (message.type === 'response.audio_transcript.done' || message.type === 'conversation.item.input_audio_transcription.completed') {
      // Determine the transcript text based on the event type
      const finalTranscript = message.transcript || message.item?.content?.[0]?.text; // Adjust based on actual structure

      // Check if we actually got a transcript
      if (finalTranscript) {
        const messageId = message.item_id || message.item?.id || `mic-${Date.now()}`;
        // Keep this log for the final transcript -- Simplified Log
        console.log(`Mic Transcript: ${finalTranscript}`);

        // Queue this transcript for the main Assistant API
        setTranscriptTurn((prev: TranscriptTurn) => ({
          ...prev,
          micTranscript: finalTranscript,
          processed: false, // Mark for processing
          timestamp: Date.now()
        }));
      } else {
         console.warn(`[TopControls:Mic] Received ${message.type} but no transcript found:`, message);
      }
    }

    // Keep DONE handling in case it's useful later
    else if (message.type === 'response.text.done') {
       // Add specific log if needed
       console.log(`[TopControls:Mic] Auxiliary assistant response complete event: ${message.item_id}`);
    }
    // Add logs for other specific message types if desired
    // else if (message.type === 'input_audio_buffer.speech_started') {
    //    console.log('[TopControls:Mic] Speech started event received.');
    // }
     else {
       // Optionally log unexpected/unhandled message types
       // console.log("[TopControls:Mic] Received unhandled message type:", message.type, message);
     }
  }, []);

  const handleMicStateChange = useCallback((state: string) => {
    console.log("Mic connection state changed:", state);
    let newStatus: WebRTCConnectionStatus;
    // Map manager state strings to our local component state enum
    switch (state) {
      case 'connecting':
        newStatus = 'connecting'; break;
      case 'connected':
        newStatus = 'connected'; break;
      case 'disconnected':
      case 'closed':
        newStatus = 'disconnected';
        micTrackRef.current = null; // Clear track ref on close
        break;
      case 'failed':
        newStatus = 'failed';
        micTrackRef.current = null; // Clear track ref on failure
        break;
      default:
        newStatus = 'error'; // Catch-all for unexpected states
        micTrackRef.current = null;
        break;
    }
    // Don't set local state, rely on prop
    // setMicConnectionStatus(newStatus);
    onMicStatusChange(newStatus); // <<< CALL Prop Callback
  }, [onMicStatusChange]);

  const handleMicError = useCallback((error: Error) => {
    console.error("Mic connection error:", error);
    // Don't set local state, rely on prop
    // setMicConnectionStatus('error');
    onMicStatusChange('error'); // <<< CALL Prop Callback
    micTrackRef.current = null;

    // Show error dialog for mic connection errors
    setErrorState({
      isOpen: true,
      title: 'Microphone Connection Error',
      message: 'Failed to connect to the microphone. Please check your permissions and try again.',
      details: error.message || 'Unknown error',
      // Use the ref here, which will be set later once connectMic is defined
      retryAction: () => {
        if (connectMicRef.current) {
          connectMicRef.current().catch(err => {
            console.error('Failed to reconnect mic after error:', err);
          });
        }
      }
    });
  }, [onMicStatusChange]);

  const handleSpeakerMessage = useCallback((message: any) => {
    // Handle FINAL speaker transcripts
    if (message.type === 'response.audio_transcript.done' || message.type === 'conversation.item.input_audio_transcription.completed') {
      const finalTranscript = message.transcript || message.item?.content?.[0]?.text; // Adjust based on actual structure

      if (finalTranscript) {
        const messageId = message.item_id || message.item?.id || `spk-${Date.now()}`;
        // Keep this log for the final transcript -- Simplified Log
        console.log(`Speaker Transcript: ${finalTranscript}`);

        // Inject the speaker transcript into the mic connection's context (Keep this logic)
        if (finalTranscript.trim() && micConnectionStatus === 'connected') {
          try {
            console.log(`[Context Injection] Injecting speaker transcript into mic connection...`);
            const contextEvent = {
              type: 'conversation.item.create',
              item: {
                role: 'assistant', // Or maybe 'system'? Check API nuances if needed
                content: [
                  {
                    type: 'text',
                    text: `SYSTEM_AUDIO_TRANSCRIPT: ${finalTranscript}`
                  }
                ]
              }
            };
            connectionManager.sendMessage('mic', contextEvent);
            console.log(`[Context Injection] Speaker context injected into mic connection`);
          } catch (error) {
            console.error('[Context Injection] Failed to inject speaker context:', error);
          }
        }

        // Queue this transcript for the main Assistant API (Keep this logic)
        setTranscriptTurn((prev: TranscriptTurn) => ({
          ...prev,
          speakerTranscript: (prev.speakerTranscript ? prev.speakerTranscript.trim() + ' ' : '') + finalTranscript,
          processed: false, // Mark for processing
          timestamp: Date.now()
        }));
      } else {
        console.warn(`[TopControls:Speaker] Received ${message.type} but no transcript found:`, message);
      }
    }
    // Add logs for other specific message types if desired
    else {
      // Optionally log unexpected/unhandled message types
      // console.log("[TopControls:Speaker] Received unhandled message type:", message.type, message);
    }
  }, [micConnectionStatus]);

  const handleSpeakerStateChange = useCallback((status: string) => {
    console.log(`Speaker connection state changed: ${status}`);
    let newStatus: WebRTCConnectionStatus;

    switch (status) {
      case 'connected':
        newStatus = 'connected';
        break;
      case 'connecting':
        newStatus = 'connecting';
        break;
      case 'disconnected':
      case 'closed':
        newStatus = 'disconnected';
        // Reset the speaker track
        speakerTrackRef.current = null;
        break;
      case 'failed':
      case 'error':
        newStatus = 'failed';
        // Reset the speaker track
        speakerTrackRef.current = null;
        break;
      default:
        newStatus = 'disconnected';
        // Reset the speaker track
        speakerTrackRef.current = null;
    }

    setSpeakerConnectionStatus(newStatus);
    // Call the new callback
    onSpeakerStatusChange(newStatus);
  }, [onSpeakerStatusChange]);

  const handleSpeakerError = useCallback((error: Error) => {
    console.error("Speaker connection error:", error);
    setSpeakerConnectionStatus('error');
    speakerTrackRef.current = null;

    // Show error dialog for speaker connection errors
    setErrorState({
      isOpen: true,
      title: 'Speaker Connection Error',
      message: 'Failed to connect the system audio. Please check your permissions and try again.',
      details: error.message || 'Unknown error',
      // Use the ref here, which will be set later once connectSpeaker is defined
      retryAction: () => {
        if (connectSpeakerRef.current) {
          connectSpeakerRef.current().catch(err => {
            console.error('Failed to reconnect speaker after error:', err);
          });
        }
      }
    });
  }, []);

  // Define connectMic after all its dependencies are defined
  const connectMic = useCallback(async () => {
    if (micConnectionStatus === 'connecting' || micConnectionStatus === 'connected') {
      console.log('Mic already connecting or connected.');
      return;
    }
    // Don't set local state, rely on prop
    // setMicConnectionStatus('connecting');
    onMicStatusChange('connecting'); // Notify parent
    try {
      console.log('Requesting microphone access for connection...');

      // --- Find Specific Microphone Device ---
      console.log('[Device Selection] Enumerating devices...');
console.log('[Debug] Checking navigator:', typeof navigator);
      if (navigator) {
        console.log('[Debug] Checking navigator.mediaDevices:', typeof navigator.mediaDevices);
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const micDevice = devices.find(device =>
        device.kind === 'audioinput' &&
        // Adjust this label if needed based on your system's exact name
        (device.label.includes('MacBook Pro Microphone') || device.label.includes('Built-in Microphone'))
      );

      if (micDevice) {
        console.log(`[Device Selection] Found specific mic: ${micDevice.label} (ID: ${micDevice.deviceId})`);
      } else {
        console.warn('[Device Selection] Specific MacBook Pro Microphone not found, using default input.');
        // Fallback to default if specific device isn't found
      }

      const micConstraints: MediaStreamConstraints = {
        audio: micDevice ? { deviceId: { exact: micDevice.deviceId } } : true
      };
      console.log('[Device Selection] Using constraints:', { audio: micConstraints.audio });
      console.log('[Audio Routing Check] Mic source selected:', micDevice ? `${micDevice.label} (ID: ${micDevice.deviceId})` : 'Default audio input');

      // Get the raw microphone stream
      const rawMicStream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints.audio });
      rawMicStreamRef.current = rawMicStream; // Store raw stream for level meter

      // Get the raw audio track
      const rawMicTrack = rawMicStream.getAudioTracks()[0];
      if (!rawMicTrack) {
        throw new Error("No audio track found in the microphone stream.");
      }
      micTrackRef.current = rawMicTrack; // Store raw track ref

      // Debug log for mic track initial state
      console.log(`[Mute Debug] Mic track initial state - enabled: ${rawMicTrack.enabled}, muted: ${rawMicTrack.muted}, readyState: ${rawMicTrack.readyState}`);

      console.log('Attempting to connect mic with raw track...');

      // Pass the raw track and stream directly to the connection manager
      await connectionManager.connect(
        'mic',
        rawMicTrack, // Pass the raw track
        rawMicStream, // Pass the raw stream
        {
          onMessage: handleMicMessage,
          onStateChange: handleMicStateChange,
          onError: handleMicError,
        },
        micSessionConfig_AuxAssistant // Pass the mic config
      );

      // Enable the track if it wasn't muted before connection
      if (!isMicrophoneMuted) {
        console.log('[Mute Debug] Setting initial mic track enabled=true because isMicrophoneMuted is false');
        rawMicTrack.enabled = true;
      } else {
        console.log('[Mute Debug] Setting initial mic track enabled=false because isMicrophoneMuted is true');
        rawMicTrack.enabled = false; // Ensure it respects the muted state
      }

      // Verify track state after connection
      console.log(`[Mute Debug] Mic track state after connection - enabled: ${rawMicTrack.enabled}, muted: ${rawMicTrack.muted}, readyState: ${rawMicTrack.readyState}`);

    } catch (error) {
      console.error("Failed to connect microphone:", error);
      const err = error instanceof Error ? error : new Error(String(error));
      handleMicError(err); // Use the existing error handler
    }
  }, [micConnectionStatus, handleMicMessage, handleMicStateChange, handleMicError, isMicrophoneMuted, onMicStatusChange]);

  // Update the ref after connectMic is defined
  useEffect(() => {
    connectMicRef.current = connectMic;
  }, [connectMic]);

  const disconnectMic = useCallback(() => {
    if (micConnectionStatus !== 'disconnected') {
      console.log('Disconnecting microphone...');
      connectionManager.disconnect('mic');
      // Don't set local state, rely on prop
      // setMicConnectionStatus('disconnected');
      onMicStatusChange('disconnected'); // Propagate state
      micTrackRef.current?.stop(); // Stop the raw track
      micTrackRef.current = null;
      rawMicStreamRef.current = null; // Clear raw stream ref
    }
  }, [micConnectionStatus, onMicStatusChange]);

  const connectSpeaker = useCallback(async () => {
    if (speakerConnectionStatus === 'connecting' || speakerConnectionStatus === 'connected') {
      console.log('Speaker already connecting or connected.');
      return;
    }
    setSpeakerConnectionStatus('connecting');
    onSpeakerStatusChange('connecting'); // Notify parent
    try {
      console.log('[Device Selection] Enumerating devices for SPEAKER connection...');
      const devices = await navigator.mediaDevices.enumerateDevices()
      console.log('[Device Selection] Devices:', devices);

      // Log all audio devices for debugging
      console.log('[Device Selection] Available audio devices:');
      devices.forEach((device, index) => {
        console.log(`Device ${index}: kind=${device.kind}, label="${device.label}", id=${device.deviceId}`);
      });

      // Look specifically for BlackHole 2ch as audioinput
      const blackholeDevice = devices.find(device =>
        device.kind === 'audioinput' &&
        device.label.includes('BlackHole 2ch') &&
        device.label.includes('Virtual')
      );

      if (blackholeDevice) {
        console.log(`[Device Selection] Found BlackHole virtual device: ${blackholeDevice.label}`);
        console.log(`[Device Selection] Device ID: ${blackholeDevice.deviceId}`);
        console.log(`[Device Selection] Group ID: ${blackholeDevice.groupId}`);
      } else {
        console.warn('[Device Selection] BlackHole 2ch (Virtual) device not found. Available audioinput devices:');
        devices
          .filter(device => device.kind === 'audioinput')
          .forEach(device => console.warn(`- ${device.label} (ID: ${device.deviceId})`));

        throw new Error('Required audio device "BlackHole 2ch (Virtual)" not found. Please ensure it is properly installed and configured.');
      }

      const speakerConstraints: MediaStreamConstraints = {
        // Use the specific BlackHole device ID
        audio: {
          deviceId: { exact: blackholeDevice.deviceId },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      };
      console.log('[Device Selection] Using constraints for speaker:', { audio: speakerConstraints.audio });

      // Get the raw speaker stream
      console.log('speakerConstraints', speakerConstraints);
      const rawSpeakerStream = await navigator.mediaDevices.getUserMedia(speakerConstraints);
      rawSpeakerStreamRef.current = rawSpeakerStream; // Store raw stream

      console.log('[Device Selection] Raw speaker stream:', rawSpeakerStream);
      // Get the raw audio track
      const rawSpeakerTrack = rawSpeakerStream.getAudioTracks()[0];
      console.log('[Device Selection] Raw speaker track:', rawSpeakerTrack);
      if (!rawSpeakerTrack) {
        throw new Error("No audio track found in the speaker stream.");
      }

      // Debug log for speaker track initial state
      console.log(`[Audio Debug] Speaker track initial state - enabled: ${rawSpeakerTrack.enabled}, muted: ${rawSpeakerTrack.muted}, readyState: ${rawSpeakerTrack.readyState}`);

      speakerTrackRef.current = rawSpeakerTrack; // Store raw track ref

      console.log('Attempting to connect speaker with raw track...');

      // Pass the raw track and stream directly to the connection manager
      await connectionManager.connect(
        'speaker',
        rawSpeakerTrack, // Pass the raw track
        rawSpeakerStream, // Pass the raw stream
        {
          onMessage: handleSpeakerMessage,
          onStateChange: handleSpeakerStateChange,
          onError: handleSpeakerError,
        },
        speakerSessionConfig_Transcription // Pass the speaker config
      );

      // Verify track state after connection
      console.log(`[Audio Debug] Speaker track state after connection - enabled: ${rawSpeakerTrack.enabled}, muted: ${rawSpeakerTrack.muted}, readyState: ${rawSpeakerTrack.readyState}`);

    } catch (error) {
      console.error("Failed to connect speaker:", error);
      const err = error instanceof Error ? error : new Error(String(error));
      handleSpeakerError(err); // Use the existing error handler
    }
  }, [speakerConnectionStatus, handleSpeakerMessage, handleSpeakerStateChange, handleSpeakerError, onSpeakerStatusChange]);

  // Update the ref after connectSpeaker is defined
  useEffect(() => {
    connectSpeakerRef.current = connectSpeaker;
  }, [connectSpeaker]);

  const disconnectSpeaker = useCallback(() => {
    if (speakerConnectionStatus !== 'disconnected') {
      console.log('Disconnecting speaker...');
      connectionManager.disconnect('speaker');
      setSpeakerConnectionStatus('disconnected');
      onSpeakerStatusChange('disconnected'); // Notify parent
      speakerTrackRef.current?.stop(); // Stop the raw track
      speakerTrackRef.current = null;
      rawSpeakerStreamRef.current = null; // Clear raw stream ref
    }
  }, [speakerConnectionStatus, onSpeakerStatusChange]);

  // Now that connectMic and connectSpeaker are defined, we can create the error retry handler
  const handleErrorRetry = useCallback(() => {
    setErrorState(prev => ({ ...prev, isOpen: false }));

    if (errorState.retryAction) {
      errorState.retryAction();
    }
  }, [errorState.retryAction]);

  // Add useEffect to handle changes to isMicrophoneMuted prop
  useEffect(() => {
    // Only modify the track if it exists
    if (micTrackRef.current) {
      console.log(`[Mute Debug] Prop isMicrophoneMuted changed to ${isMicrophoneMuted}`);
      console.log(`[Mute Debug] Setting mic track enabled = ${!isMicrophoneMuted}`);

      // Log the track state before changing
      console.log(`[Mute Debug] Before change: micTrack.enabled = ${micTrackRef.current.enabled}, muted = ${micTrackRef.current.muted}`);

      // Update the track's enabled state
      micTrackRef.current.enabled = !isMicrophoneMuted;

      // Log the track state after changing
      setTimeout(() => {
        if (micTrackRef.current) {
          console.log(`[Mute Debug] After change: micTrack.enabled = ${micTrackRef.current.enabled}, muted = ${micTrackRef.current.muted}`);
        }

        if (speakerTrackRef.current) {
          console.log(`[Mute Debug] Speaker track state unchanged: enabled=${speakerTrackRef.current.enabled}, muted=${speakerTrackRef.current.muted}, readyState=${speakerTrackRef.current.readyState}`);
        }
      }, 100);
    } else {
      console.log(`[Mute Debug] Mute state changed to ${isMicrophoneMuted}, but no mic track available`);
    }
  }, [isMicrophoneMuted]);

  // Handle connection state reporting more robustly
  useEffect(() => {
    // Whenever mic status changes, ensure the UI reflects the actual state
    console.log(`[Connection Debug] Mic connection status: ${micConnectionStatus}`);

    // If the connection fails, provide a way to retry
    if (micConnectionStatus === 'failed' || micConnectionStatus === 'error') {
      console.log('[Connection Debug] Mic connection in failed/error state - retry available');

      // Call the optional onReconnectMic callback if provided
      if (onReconnectMic) {
        console.log('[Connection Debug] Notifying parent component about mic error');
        onReconnectMic();
      }
    }
  }, [micConnectionStatus, onReconnectMic]);

  // Similar monitoring for speaker connection
  useEffect(() => {
    console.log(`[Connection Debug] Speaker connection status: ${speakerConnectionStatus}`);

    // If the connection fails, provide a way to retry
    if (speakerConnectionStatus === 'failed' || speakerConnectionStatus === 'error') {
      console.log('[Connection Debug] Speaker connection in failed/error state - retry available');

      // Call the optional onReconnectSpeaker callback if provided
      if (onReconnectSpeaker) {
        console.log('[Connection Debug] Notifying parent component about speaker error');
        onReconnectSpeaker();
      }
    }
  }, [speakerConnectionStatus, onReconnectSpeaker]);

  // Add useEffects
  useEffect(() => {
    if (triggerConnect > 0) {
      console.log("Connect triggered from App");

      // Add safety check - don't attempt reconnection if already connected
      if (micConnectionStatus !== 'connected' && micConnectionStatus !== 'connecting') {
        connectMic();
      } else {
        console.log('[Connection Debug] Skipping mic connection - already connected or connecting');
      }

      if (speakerConnectionStatus !== 'connected' && speakerConnectionStatus !== 'connecting') {
        connectSpeaker();
      } else {
        console.log('[Connection Debug] Skipping speaker connection - already connected or connecting');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerConnect]);

  useEffect(() => {
    if (triggerDisconnect > 0) {
      console.log("Disconnect triggered from App");

      // Safety check for disconnection
      if (micConnectionStatus !== 'disconnected') {
        disconnectMic();
      } else {
        console.log('[Connection Debug] Skipping mic disconnection - already disconnected');
      }

      if (speakerConnectionStatus !== 'disconnected') {
        disconnectSpeaker();
      } else {
        console.log('[Connection Debug] Skipping speaker disconnection - already disconnected');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerDisconnect]);

  // add ref for debounce timer to batch rapid transcript updates
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Trigger when a turn has new data (mic OR speaker) and hasn't been processed
    if (
      transcriptTurn &&
      !transcriptTurn.processed &&
      (transcriptTurn.micTranscript || transcriptTurn.speakerTranscript) // Process if either exists
    ) {
      console.log('[Turn Processing] Received unprocessed turn:', transcriptTurn);

      // Mark the current turn as processed to prevent duplicate processing
      setTranscriptTurn(prev => ({...prev, processed: true}));

      // clear any existing debounce
      if (debounceRef.current) {
        console.log('[Turn Processing] Clearing existing debounce timeout');
        clearTimeout(debounceRef.current);
      }
      console.log(`[Turn Processing] Setting debounce timeout (${DEBOUNCE_DELAY_MS}ms)`);
      // schedule processing of the latest transcriptTurn
      debounceRef.current = setTimeout(() => {
        console.log('[Turn Processing] Debounce complete, triggering onProcessTurn with:', transcriptTurn);
        try {
          onProcessTurn(transcriptTurn);

          // Reset the transcript turn after processing to avoid combining with next prompt
          setTranscriptTurn(prev => ({
            ...prev,
            speakerTranscript: '', // Clear the speaker transcript
            micTranscript: '',     // Clear the mic transcript too
            processed: true,       // Keep it marked as processed
            timestamp: Date.now()  // Update timestamp
          }));

        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          console.error('[Turn Processing] Error calling onProcessTurn handler:', err);
          setErrorState({
            isOpen: true,
            title: 'Processing Error',
            message: 'Could not initiate processing for the latest conversation turn.',
            details: err.message,
            retryAction: null
          });
        }
      }, DEBOUNCE_DELAY_MS);
    }
  }, [transcriptTurn, onProcessTurn]);

  // clear debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log("TopControls unmounting, skipping disconnection to preserve connections...");
      // Avoid disconnecting on unmount to prevent premature disconnection during hot reload or navigation.
      // Only disconnect if explicitly triggered via triggerDisconnect prop.
    };
  }, [disconnectMic, disconnectSpeaker]);

  // UI helpers
  const getConnectionButtonProps = () => {
    switch (appConnectionState) {
      case "CONNECTED":
        return { text: "Disconnect", title: "Disconnect Assistant", disabled: false, connecting: false };
      case "CONNECTING":
      case "FETCHING_KEY":
        return { text: "Connecting...", title: "Connecting Assistant", disabled: true, connecting: true };
      case "INITIAL":
      case "DISCONNECTED":
      case "KEY_INVALID":
      case "ERROR":
      default:
        return { text: "Connect", title: "Connect Assistant", disabled: false, connecting: false };
    }
  };

  const getApiKeyStatus = () => {
    switch (appConnectionState) {
      case "CONNECTED":
      case "CONNECTING": // Assume key is valid if connecting
        return { isPresent: true, statusMessage: "API Key Valid" };
      case "KEY_INVALID":
        return { isPresent: false, statusMessage: "Invalid API Key" };
      case "FETCHING_KEY":
        return { isPresent: false, statusMessage: "Checking API Key..." };
      case "INITIAL":
      case "DISCONNECTED":
      case "ERROR":
      default:
        return { isPresent: false, statusMessage: "API Key Not Configured" };
    }
  };

  // Determine effective mobile view - Removed as mobile view logic is gone
  // const effectiveIsMobileView = isMobileView === null ? true : isMobileView;

  const { text: connectButtonText, title: connectButtonTitle, disabled: connectButtonDisabled, connecting: isConnecting } = getConnectionButtonProps();
  const { isPresent: isApiKeyPresent, statusMessage: apiKeyStatusMessage } = getApiKeyStatus();

  // Helper functions for button props
  const getStatusButtonStyle = (status: WebRTCConnectionStatus): string => {
    if (theme === 'dark') {
      switch (status) {
        case 'connected':
          return 'bg-green-700 text-green-100 hover:bg-green-600 border-green-600';
        case 'connecting':
          return 'bg-yellow-700 text-yellow-100 animate-pulse border-yellow-600';
        case 'disconnected':
          return 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-600';
        case 'failed':
        case 'error':
          return 'bg-red-700 text-red-100 hover:bg-red-600 border-red-600';
        default:
          return 'bg-gray-700 text-gray-400 border-gray-600';
      }
    } else {
      switch (status) {
        case 'connected':
          return 'bg-green-100 text-green-700 hover:bg-green-200 border-green-300';
        case 'connecting':
          return 'bg-yellow-100 text-yellow-700 animate-pulse border-yellow-300';
        case 'disconnected':
          return 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-300';
        case 'failed':
        case 'error':
          return 'bg-red-100 text-red-700 hover:bg-red-200 border-red-300';
        default:
          return 'bg-gray-100 text-gray-400 border-gray-300';
      }
    }
  };

  const getStatusButtonTitle = (type: 'mic' | 'speaker', status: WebRTCConnectionStatus): string => {
    const streamName = type === 'mic' ? 'Input' : 'Output';
    switch (status) {
      case 'connected': return `${streamName} Stream Connected`;
      case 'connecting': return `Connecting ${streamName} Stream...`;
      case 'disconnected': return `Connect ${streamName} Stream`;
      case 'failed':
      case 'error': return `Reconnect ${streamName} Stream (Error)`;
      default: return `${streamName} Stream Status Unknown`;
    }
  };

  // Handle mic status click
  const handleMicStatusClick = () => {
    console.log(`[Connection Debug] Mic status button clicked. Current status: ${micConnectionStatus}`);

    if (micConnectionStatus === 'disconnected' || micConnectionStatus === 'failed' || micConnectionStatus === 'error') {
      console.log('[Connection Debug] Attempting to connect mic...');
      connectMic();
    } else if (micConnectionStatus === 'connected' || micConnectionStatus === 'connecting') {
      console.log('[Connection Debug] Attempting to disconnect mic...');
      disconnectMic();
    }
  };

  // Handle speaker status click
  const handleSpeakerStatusClick = () => {
    console.log(`[Connection Debug] Speaker status button clicked. Current status: ${speakerConnectionStatus}`);

    if (speakerConnectionStatus === 'disconnected' || speakerConnectionStatus === 'failed' || speakerConnectionStatus === 'error') {
      console.log('[Connection Debug] Attempting to connect speaker...');
      connectSpeaker();
    } else if (speakerConnectionStatus === 'connected' || speakerConnectionStatus === 'connecting') {
      console.log('[Connection Debug] Attempting to disconnect speaker...');
      disconnectSpeaker();
    }
  };

  // Handle mic mute toggle
  const handleMuteToggle = () => {
    const newMutedState = !isMicrophoneMuted;
    console.log(`[Mute Debug] Toggling mute state from ${isMicrophoneMuted} to ${newMutedState}`);

    // Log current state of both mic and speaker tracks for comparison
    if (micTrackRef.current) {
      console.log(`[Mute Debug] BEFORE TOGGLE - Mic track: enabled=${micTrackRef.current.enabled}, muted=${micTrackRef.current.muted}, readyState=${micTrackRef.current.readyState}`);
    } else {
      console.log(`[Mute Debug] No mic track available to mute!`);
    }

    if (speakerTrackRef.current) {
      console.log(`[Mute Debug] Speaker track state: enabled=${speakerTrackRef.current.enabled}, muted=${speakerTrackRef.current.muted}, readyState=${speakerTrackRef.current.readyState}`);
    }

    setIsMicrophoneMuted(newMutedState);

    // Toggle the actual track state if it exists
    if (micTrackRef.current) {
      console.log(`[Mute Debug] Setting mic track enabled state to: ${!newMutedState}`);
      micTrackRef.current.enabled = !newMutedState;

      // Log the state after changing
      setTimeout(() => {
        if (micTrackRef.current) {
          console.log(`[Mute Debug] AFTER TOGGLE - Mic track: enabled=${micTrackRef.current.enabled}, muted=${micTrackRef.current.muted}, readyState=${micTrackRef.current.readyState}`);
        }

        if (speakerTrackRef.current) {
          console.log(`[Mute Debug] Speaker track state unchanged: enabled=${speakerTrackRef.current.enabled}, muted=${speakerTrackRef.current.muted}, readyState=${speakerTrackRef.current.readyState}`);
        }
      }, 100);
    }
  };

  // Helper function for mic button props
  const getMicButtonProps = () => {
    if (theme === 'dark') {
      switch (micConnectionStatus) {
        case 'connected':
          return { className: 'border-green-600 bg-green-700 text-green-100 hover:bg-green-600', disabled: false };
        case 'connecting':
          return { className: 'border-yellow-600 bg-yellow-700 text-yellow-100 cursor-wait', disabled: true };
        case 'disconnected':
          return { className: 'border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600', disabled: false };
        case 'failed':
        case 'error':
          return { className: 'border-red-600 bg-red-700 text-red-100 hover:bg-red-600', disabled: false };
        default:
          return { className: 'border-gray-600 bg-gray-700 text-gray-300', disabled: true };
      }
    } else {
      switch (micConnectionStatus) {
        case 'connected':
          return { className: 'border-green-300 bg-green-100 text-green-700 hover:bg-green-200', disabled: false };
        case 'connecting':
          return { className: 'border-yellow-300 bg-yellow-100 text-yellow-700 cursor-wait', disabled: true };
        case 'disconnected':
          return { className: 'border-gray-300 bg-gray-100 text-gray-600 hover:bg-gray-200', disabled: false };
        case 'failed':
        case 'error':
          return { className: 'border-red-300 bg-red-100 text-red-700 hover:bg-red-200', disabled: false };
        default:
          return { className: 'border-gray-300 bg-gray-100 text-gray-600', disabled: true };
      }
    }
  };

  // Helper function for speaker button props
  const getSpeakerButtonProps = () => {
    if (theme === 'dark') {
      switch (speakerConnectionStatus) {
        case 'connected':
          return { className: 'border-green-600 bg-green-700 text-green-100 hover:bg-green-600', disabled: false };
        case 'connecting':
          return { className: 'border-yellow-600 bg-yellow-700 text-yellow-100 cursor-wait', disabled: true };
        case 'disconnected':
          return { className: 'border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600', disabled: false };
        case 'failed':
        case 'error':
          return { className: 'border-red-600 bg-red-700 text-red-100 hover:bg-red-600', disabled: false };
        default:
          return { className: 'border-gray-600 bg-gray-700 text-gray-300', disabled: true };
      }
    } else {
      switch (speakerConnectionStatus) {
        case 'connected':
          return { className: 'border-green-300 bg-green-100 text-green-700 hover:bg-green-200', disabled: false };
        case 'connecting':
          return { className: 'border-yellow-300 bg-yellow-100 text-yellow-700 cursor-wait', disabled: true };
        case 'disconnected':
          return { className: 'border-gray-300 bg-gray-100 text-gray-600 hover:bg-gray-200', disabled: false };
        case 'failed':
        case 'error':
          return { className: 'border-red-300 bg-red-100 text-red-700 hover:bg-red-200', disabled: false };
        default:
          return { className: 'border-gray-300 bg-gray-100 text-gray-600', disabled: true };
      }
    }
  };

  // --- Helper Functions for Mute button ---
  const getMuteButtonStyle = () => {
    if (micConnectionStatus !== "connected") {
      return theme === 'dark' ? 'bg-gray-700 text-gray-400 border-gray-600' : 'bg-gray-100 text-gray-400 border-gray-300';
    }
    return isMicrophoneMuted
      ? (theme === 'dark' ? 'bg-red-700 text-red-100 border-red-600 hover:bg-red-600' : 'bg-red-100 text-red-600 border-red-300 hover:bg-red-200')
      : (theme === 'dark' ? 'bg-green-700 text-green-100 border-green-600 hover:bg-green-600' : 'bg-green-100 text-green-600 border-green-300 hover:bg-green-200');
  };

  const getMuteIconPath = () => {
    return isMicrophoneMuted
      ? "M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
      : "M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.531V19.94a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.506-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.395C2.806 8.756 3.63 8.25 4.51 8.25H6.75z";
  };

  // --- Helper function for Chat Bubble ---
  const getStatusColor = (status: ChatStatus) => {
    if (theme === 'dark') {
      if (status === "processing") return "bg-orange-600";
      if (status === "done") return "bg-green-600";
      if (status === "error") return "bg-red-600";
      return "bg-gray-700"; // Dark mode idle color
    } else {
      if (status === "processing") return "bg-orange-400";
      if (status === "done") return "bg-green-500";
      if (status === "error") return "bg-red-400";
      return "bg-gray-200"; // Light mode idle color
    }
  };


  return (
    <>
      {/* Container with theme-aware styling */}
      <div className={`border-b ${theme === 'dark' ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'} flex items-center justify-between overflow-hidden`} style={{ height: 48 }}>
        {/* Logo/Title section */}
        <div className="flex items-center h-full">
          <div
            className="flex items-center h-full pl-2 cursor-pointer" // Added cursor-pointer
            onClick={onToggleConnection} // Use onToggleConnection for click
            title={connectButtonTitle} // Add title for connect/disconnect
          >
            <Image
              src="/logo.png"
              alt="Logo"
              width={56}
              height={56}
              className={`block sm:hidden ${appConnectionState === 'CONNECTED' ? 'animate-spin-slow' : ''}`} // Add conditional animation class
              style={{ height: '100%', width: 'auto' }}
              priority
            />
            <Image
              src="/logo.png"
              alt="Logo"
              width={56}
              height={56}
              className={`hidden sm:block ${appConnectionState === 'CONNECTED' ? 'animate-spin-slow' : ''}`} // Add conditional animation class
              style={{ height: '100%', width: 'auto' }}
              priority
            />
            <span className={`ml-2 font-extrabold text-2xl tracking-wide ${appConnectionState === 'CONNECTED' ? 'text-green-500' : (theme === 'dark' ? 'text-gray-100' : 'text-gray-700')}`} style={{ letterSpacing: 2 }}>JARVIS</span>
          </div>
        </div>

        {/* Button container */}
        <div className={`flex items-center mr-4 ml-auto space-x-4`}> {/* Removed mobile spacing logic */}
          {/* Chat Status Indicator */}
          <div
            title={`Chat Status: ${chatStatus}`}
            className={`rounded-full flex items-center justify-center h-9 w-9 ${getStatusColor(chatStatus)} border ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}
          >
            <svg width={16} height={16} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
               <path d="M12 4.5c-4.473 0-8 3.41-8 7.5 0 1.696.6 3.263 1.62 4.525a1 1 0 0 1 .206.814 14.712 14.712 0 0 1-.37 1.501 15.17 15.17 0 0 0 1.842-.4 1 1 0 0 1 .745.08A8.371 8.371 0 0 0 12 19.5c4.473 0 8-3.41 8-7.5s-3.527-7.5-8-7.5ZM2 12c0-5.3 4.532-9.5 10-9.5S22 6.7 22 12s-4.532 9.5-10 9.5c-1.63 0-3.174-.371-4.539-1.032a17.88 17.88 0 0 1-3.4.53 1 1 0 0 1-.995-1.357c.29-.755.534-1.496.704-2.242A9.137 9.137 0 0 1 2 12Z"></path>
            </svg>
          </div>

          {/* Mute Button */}
          <button
            onClick={handleMuteToggle}
            disabled={micConnectionStatus !== "connected"}
            title={isMicrophoneMuted ? "Unmute Microphone" : "Mute Microphone"}
            className={`rounded-full flex items-center justify-center transition-colors border h-9 w-9 ${getMuteButtonStyle()}`}
          >
            <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
               <path d={getMuteIconPath()}></path>
            </svg>
          </button>

          {/* Camera Button */}
          <button
            onClick={handleScreenCapture}
            title="Capture Screen for Code Question"
            className={`rounded-full flex items-center justify-center transition-colors h-9 w-9 ${
              isCapturing
                ? theme === 'dark' ? 'bg-yellow-600 cursor-wait text-white' : 'bg-yellow-400 cursor-wait text-gray-800'
                : theme === 'dark' ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
            disabled={isCapturing}
          >
            {isCapturing ? (
              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </button>

          {/* Cycle View Button */}
          <button
            onClick={onCycleViewRequest} // Call the passed-in handler
            title="Cycle View (Alt+Space)"
            className={`rounded-full flex items-center justify-center transition-colors h-9 w-9 border ${
              theme === 'dark'
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-600'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-300'
            }`}
          >
            {/* Cycle Icon SVG */}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          {/* Settings Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            title="Settings"
            className={`rounded-full flex items-center justify-center transition-colors h-9 w-9 border ${
              theme === 'dark'
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-600'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-300'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Placeholder for Settings Modal - Render conditionally */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`p-6 rounded-lg shadow-xl ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-black'}`}>
            <h2 className="text-xl font-semibold mb-4">Settings</h2>
            {/* Modal content will go here */}
            <p>Settings content placeholder...</p>
            <button
              onClick={() => setIsSettingsOpen(false)}
              className={`mt-4 px-4 py-2 rounded ${theme === 'dark' ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-200 hover:bg-gray-300'}`}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Error Dialog */}
      <ErrorDialog
        isOpen={errorState.isOpen}
        title={errorState.title}
        message={errorState.message}
        details={errorState.details}
        retryAction={errorState.retryAction}
        onDismiss={handleErrorDismiss}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        micConnectionStatus={micConnectionStatus}
        speakerConnectionStatus={speakerConnectionStatus}
        onReconnectMic={onReconnectMic}
        onReconnectSpeaker={onReconnectSpeaker}
      />
    </>
  );
});

TopControls.displayName = 'TopControls';

export default TopControls;