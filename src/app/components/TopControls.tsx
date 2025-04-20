"use client";

import React, { useState, useEffect, memo, useCallback, useRef } from 'react';
import Image from 'next/image';
import { ConnectionState as AppConnectionState } from "@/app/types";
import { connectionManager } from '@/app/api/realtime-assistant-webRTC/webRTCConnection-webRTC';
import ErrorDialog from './ErrorDialog';
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
  }, [audioSource, isActive]);
  
  // Generate the meter segments
  const segments = 5;
  const filledSegments = Math.round(level * segments);
  
  return (
    <div className="flex space-x-1 items-center mx-2 h-4">
      {Array.from({ length: segments }).map((_, i) => (
        <div 
          key={i} 
          className={`w-1 h-${1 + i} rounded-full transition-colors duration-100 ${
            i < filledSegments ? 'bg-green-500' : 'bg-gray-300'
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
  instructions: `You are an auxiliary assistant providing immediate, concise information based ONLY on the user's LATEST utterance and the conversation history. The history may include messages labeled 'SYSTEM_AUDIO_TRANSCRIPT' representing what the system/speaker just said.
DO NOT engage in lengthy conversation (no greetings, apologies, or excessive filler).
DO NOT ask clarifying questions.
FOCUS on providing relevant factual snippets or definitions related to the user's topic or the preceding SYSTEM_AUDIO_TRANSCRIPT.
If the user sounds hesitant (umm, hmm, uh), proactively offer a brief, relevant suggestion based on the preceding topic.
Keep responses very short.`,
  temperature: 0.5,
  input_audio_transcription: {
    model: "gpt-4o-transcribe",
    language: "en",
    prompt: "This is a technical discussion about software development, system design, data structures, algorithms, and related technologies. Expect technical jargon. Include filler words like umm, uh, hmm.",
  },
  turn_detection: {
    type: "server_vad",
    silence_duration_ms: 600,
    create_response: true,
    interrupt_response: true
  },
};

const speakerSessionConfig_Transcription = {
  modalities: ["text"],
  instructions: "Transcribe system audio accurately. No response needed.",
  input_audio_transcription: {
    model: "gpt-4o-transcribe",
    language: "en", // Or null for auto-detect
    prompt: "This is system audio output, likely questions or statements in a technical discussion. Transcribe verbatim.",
  },
  turn_detection: null, // Disable VAD
};

// <<< ADD Back the type definition here >>>
type WebRTCConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'failed' | 'error';

interface TopControlsProps {
  appConnectionState: AppConnectionState; // Main state from App, potentially derived from mic status
  isMicrophoneMuted: boolean;
  setIsMicrophoneMuted: (muted: boolean) => void;
  onToggleConnection: () => void;
  isMobileView: boolean | null;
  isEventsPaneExpanded: boolean;
  setIsEventsPaneExpanded: (expanded: boolean) => void;
  handleDashboardToggle: (expanded: boolean) => void;
  setActiveMobilePanel: (panel: number) => void;
  activeMobilePanel: number;
  triggerConnect: number;
  triggerDisconnect: number;
  onMicStatusChange: (status: WebRTCConnectionStatus) => void;
  addTranscriptMessage: (itemId: string, role: 'user' | 'assistant', text: string, hidden?: boolean, agentName?: string) => void;
}

// Add at the appropriate location:
// State to track transcripts for Assistant API
interface TranscriptTurn {
  micTranscript?: string;
  speakerTranscript?: string;
  timestamp: number;
  processed: boolean;
}

const TopControls: React.FC<TopControlsProps> = memo(({
  appConnectionState, // Use renamed prop
  isMicrophoneMuted,
  setIsMicrophoneMuted,
  onToggleConnection,
  isMobileView,
  isEventsPaneExpanded,
  setIsEventsPaneExpanded,
  handleDashboardToggle,
  setActiveMobilePanel,
  activeMobilePanel,
  triggerConnect,
  triggerDisconnect,
  onMicStatusChange,
  addTranscriptMessage,
}) => {
  const [micConnectionStatus, setMicConnectionStatus] = useState<WebRTCConnectionStatus>('disconnected');
  const [speakerConnectionStatus, setSpeakerConnectionStatus] = useState<WebRTCConnectionStatus>('disconnected');

  // Ref to store the actual mic track to toggle its enabled state
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const speakerTrackRef = useRef<MediaStreamTrack | null>(null);
  const rawMicStreamRef = useRef<MediaStream | null>(null); // <<< Add ref for raw mic stream

  // Refs for AudioContext and nodes to manage their lifecycle
  const audioContextRef = useRef<AudioContext | null>(null);
  const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const micDestinationNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const speakerSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const speakerWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const speakerDestinationNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // Add transcript collection state
  const [transcriptTurn, setTranscriptTurn] = useState<TranscriptTurn>({
    timestamp: Date.now(),
    processed: true // Start with processed=true so we don't try to process empty turn
  });
  const [assistantRunInProgress, setAssistantRunInProgress] = useState(false);
  const [currentRunInfo, setCurrentRunInfo] = useState<{threadId?: string, runId?: string}>({});

  // Add a ref to defer the connectMic and connectSpeaker functions
  const connectMicRef = useRef<(() => Promise<void>) | null>(null);
  const connectSpeakerRef = useRef<(() => Promise<void>) | null>(null);
  
  // Add a simple error state without dependencies on connectMic/connectSpeaker
  const [errorState, setErrorState] = useState({
    isOpen: false,
    title: '',
    message: '',
    details: '',
    retryAction: null as (() => void) | null
  });

  // Close the error dialog
  const handleErrorDismiss = useCallback(() => {
    setErrorState(prev => ({ ...prev, isOpen: false }));
  }, []);

  // Define initAudioProcessing without any dependencies
  const initAudioProcessing = useCallback(async (): Promise<AudioContext> => {
    if (audioContextRef.current && audioContextRef.current.state === 'running') {
      try {
        await audioContextRef.current.audioWorklet.addModule('/worklets/resampling-processor.js');
      } catch (e) { console.warn("[Audio Processing] Worklet already added or failed to re-add:", e); }
      return audioContextRef.current;
    }

    console.log(`[Audio Processing] Creating new AudioContext with target rate: ${TARGET_SAMPLE_RATE} Hz`);
    const context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    audioContextRef.current = context;

    try {
      console.log("[Audio Processing] Adding resampling worklet module...");
      await context.audioWorklet.addModule('/worklets/resampling-processor.js');
      console.log("[Audio Processing] Resampling worklet module added.");
    } catch (error) {
      console.error("[Audio Processing] Failed to load resampling worklet module:", error);
      context.close();
      audioContextRef.current = null;
      throw new Error(`Failed to load audio processing module: ${error}`);
    }

    if (context.state === 'suspended') {
      await context.resume();
    }

    return context;
  }, []);

  // Define cleanupAudioNodes without any dependencies
  const cleanupAudioNodes = useCallback((type: 'mic' | 'speaker') => {
    console.log(`[Audio Processing] Cleaning up ${type} audio nodes...`);
    if (type === 'mic') {
      micSourceNodeRef.current?.disconnect();
      micWorkletNodeRef.current?.disconnect();
      micSourceNodeRef.current = null;
      micWorkletNodeRef.current = null;
      micDestinationNodeRef.current = null;
    } else {
      speakerSourceNodeRef.current?.disconnect();
      speakerWorkletNodeRef.current?.disconnect();
      speakerSourceNodeRef.current = null;
      speakerWorkletNodeRef.current = null;
      speakerDestinationNodeRef.current = null;
    }
  }, []);

  // Define message handlers without dependencies to connectMic/connectSpeaker
  const handleMicMessage = useCallback((message: any) => {
    console.log("[TopControls] Received MIC message:", message);
    
    // Handle audio transcripts (user speech)
    if (message.type === 'response.audio_transcript.delta' && message.delta) {
      console.log(`[MIC] Partial transcript: ${message.delta}`);
    } else if (message.type === 'response.audio_transcript.done' && message.transcript) {
      // Process final transcript
      const messageId = message.item_id || `mic-${Date.now()}`;
      const finalTranscript = message.transcript;
      console.log(`[TopControls] Adding FINAL MIC transcript: ID=${messageId}, Text=${finalTranscript}`);
      
      // Add user transcript to the UI
      addTranscriptMessage(messageId, 'user', finalTranscript);
      
      // Queue this transcript for the main Assistant API
      setTranscriptTurn(prev => ({
        ...prev,
        micTranscript: finalTranscript,
        processed: false, // Mark for processing
        timestamp: Date.now()
      }));
    }
    
    // Handle auxiliary assistant text responses
    if (message.type === 'response.text.delta' && message.delta) {
      // Process streamed text response from auxiliary assistant
      console.log(`[MIC] Auxiliary assistant response delta: ${message.delta}`);
      
      // Create a unique ID for the first delta if not already created
      if (!message.item_id) {
        console.warn("[MIC] Missing item_id in response.text.delta message");
      }
      
      // Add or update assistant response in UI with the auxiliary response
      // Use a dedicated agentName to distinguish from main assistant
      addTranscriptMessage(
        message.item_id || `aux-${Date.now()}`, 
        'assistant', 
        message.delta,
        false, // Not hidden
        'Aux' // Shorter tag for auxiliary assistant to make it visually distinct
      );
    } else if (message.type === 'response.text.done') {
      // Optional: Handle completion of auxiliary assistant response
      console.log(`[MIC] Auxiliary assistant response complete: ${message.item_id}`);
    }
  }, [addTranscriptMessage]);

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
    setMicConnectionStatus(newStatus);
    onMicStatusChange(newStatus); // <<< CALL Prop Callback
  }, [onMicStatusChange]);

  const handleMicError = useCallback((error: Error) => {
    console.error("Mic connection error:", error);
    setMicConnectionStatus('error');
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
    // Process speaker transcript if needed
    console.log("[TopControls] Received SPEAKER message:", message);
    if (message.type === 'response.audio_transcript.done' && message.transcript) {
      const messageId = message.item_id || `spk-${Date.now()}`;
      const finalTranscript = message.transcript;
      // Assuming speaker is 'assistant' for now, adjust as needed
      console.log(`[TopControls] Adding FINAL SPEAKER transcript: ID=${messageId}, Text=${finalTranscript}`);
       
      // Inject the speaker transcript into the mic connection's context
      if (finalTranscript.trim() && micConnectionStatus === 'connected') {
        try {
          console.log(`[Context Injection] Injecting speaker transcript into mic connection...`);
          // Create a conversation item with the speaker transcript
          const contextEvent = {
            type: 'conversation.item.create',
            item: {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: `SYSTEM_AUDIO_TRANSCRIPT: ${finalTranscript}`
                }
              ]
            }
          };
           
          // Send the context event to the mic connection
          connectionManager.sendMessage('mic', contextEvent);
          console.log(`[Context Injection] Speaker context injected into mic connection`);
        } catch (error) {
          console.error('[Context Injection] Failed to inject speaker context:', error);
        }
      }
       
      // Queue this transcript for the main Assistant API
      setTranscriptTurn(prev => ({
        ...prev,
        speakerTranscript: finalTranscript,
        processed: false, // Mark for processing
        timestamp: Date.now()
      }));
    }
  }, [micConnectionStatus]);

  const handleSpeakerStateChange = useCallback((state: string) => {
    console.log("Speaker connection state changed:", state);
    switch (state) {
      case 'connecting': setSpeakerConnectionStatus('connecting'); break;
      case 'connected': setSpeakerConnectionStatus('connected'); break;
      case 'disconnected':
      case 'closed':
        setSpeakerConnectionStatus('disconnected');
        speakerTrackRef.current = null;
        break;
      case 'failed':
        setSpeakerConnectionStatus('failed');
        speakerTrackRef.current = null;
        break;
      default:
        setSpeakerConnectionStatus('error');
        speakerTrackRef.current = null;
        break;
    }
  }, []);

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
    setMicConnectionStatus('connecting');
    try {
      const audioContext = await initAudioProcessing();
      if (!audioContext) throw new Error("Failed to initialize AudioContext.");

      console.log('Requesting microphone access for connection...');

      // --- Find Specific Microphone Device ---
      console.log('[Device Selection] Enumerating devices...');
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

      const constraints: MediaStreamConstraints = {
        audio: micDevice ? { deviceId: { exact: micDevice.deviceId } } : true
      };
      console.log('[Device Selection] Using constraints:', constraints);
      // --- End Device Selection ---

      const rawStream = await navigator.mediaDevices.getUserMedia(constraints);
      rawMicStreamRef.current = rawStream; // Store the raw stream
      const rawTrack = rawStream.getAudioTracks()[0];
      if (!rawTrack) {
        // Clean up raw stream if track acquisition failed immediately
        rawMicStreamRef.current?.getTracks().forEach(t => t.stop());
        rawMicStreamRef.current = null;
        throw new Error('No audio track found in microphone stream');
      }

      // --- Resampling Setup ---
      console.log("[Mic Processing] Setting up resampling node chain...");
      const sourceNode = audioContext.createMediaStreamSource(rawStream);
      micSourceNodeRef.current = sourceNode;

      // Pass the original source sample rate to the processor
      const sourceSampleRate = rawTrack.getSettings().sampleRate;
      if (!sourceSampleRate) {
          console.warn("[Mic Processing] Could not get source sample rate from track settings. Using AudioContext's default.");
      }

      const workletNode = new AudioWorkletNode(audioContext, 'resampling-processor', {
         processorOptions: {
           sourceSampleRate: sourceSampleRate || audioContext.sampleRate // Fallback, though context rate is target
         }
      });
      micWorkletNodeRef.current = workletNode;

      const destinationNode = audioContext.createMediaStreamDestination();
      micDestinationNodeRef.current = destinationNode;

      sourceNode.connect(workletNode).connect(destinationNode);
      console.log("[Mic Processing] Resampling node chain connected.");

      const resampledStream = destinationNode.stream;
      const resampledTrack = resampledStream.getAudioTracks()[0];
      // --- End Resampling Setup ---

      if (!resampledTrack) {
        throw new Error('No audio track found after resampling');
      }

      micTrackRef.current = resampledTrack; // Store the RESAMPLED track
      // Apply initial mute state from props to the RESAMPLED track
      resampledTrack.enabled = !isMicrophoneMuted;

      await connectionManager.connect('mic', resampledTrack, resampledStream, {
        onMessage: handleMicMessage,
        onStateChange: handleMicStateChange,
        onError: handleMicError,
      },
      micSessionConfig_AuxAssistant // <<< Pass mic config
      );
      // Note: Actual 'connected' state is set by onStateChange callback
    } catch (error) {
      console.error('Failed to connect mic:', error);
      handleMicError(error instanceof Error ? error : new Error(String(error)));
      // Clean up audio nodes if connection fails mid-setup
      cleanupAudioNodes('mic');
      // Also stop the raw track if we obtained it
      if (rawMicStreamRef.current) {
          console.log('[Mic Cleanup] Stopping raw mic stream tracks...');
          rawMicStreamRef.current.getTracks().forEach(t => t.stop());
          rawMicStreamRef.current = null;
      }
    }
  }, [micConnectionStatus, initAudioProcessing, isMicrophoneMuted, handleMicMessage, handleMicStateChange, handleMicError, cleanupAudioNodes]);

  // Update the ref after connectMic is defined
  useEffect(() => {
    connectMicRef.current = connectMic;
  }, [connectMic]);

  const disconnectMic = useCallback(() => {
    console.log('Disconnecting mic...');
    connectionManager.disconnect('mic');
    // State update handled by onStateChange

    // Stop the resampled track (important for MediaStreamDestinationNode)
    if (micTrackRef.current) {
      micTrackRef.current.stop();
      micTrackRef.current = null;
    }
    // Stop the original raw track
    if (rawMicStreamRef.current) {
        console.log('[Mic Cleanup] Stopping raw mic stream tracks...');
        rawMicStreamRef.current.getTracks().forEach(t => t.stop());
        rawMicStreamRef.current = null;
    }

    // Disconnect and release audio nodes
    cleanupAudioNodes('mic');

  }, [cleanupAudioNodes]);

  const connectSpeaker = useCallback(async () => {
    if (speakerConnectionStatus === 'connecting' || speakerConnectionStatus === 'connected') {
      console.log('Speaker already connecting or connected.');
      return;
    }
    setSpeakerConnectionStatus('connecting');
    try {
        const audioContext = await initAudioProcessing();
        if (!audioContext) throw new Error("Failed to initialize AudioContext.");

      console.log('Requesting display media (screen/tab) with audio for SPEAKER connection...');
      const rawStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const rawAudioTracks = rawStream.getAudioTracks();
      if (!rawAudioTracks || rawAudioTracks.length === 0) {
        rawStream.getTracks().forEach(track => track.stop());
        throw new Error('No audio track found or permission denied for display media audio.');
      }
      const rawTrack = rawAudioTracks[0];

      // Stop the video track immediately
      rawStream.getVideoTracks().forEach(videoTrack => videoTrack.stop());

      // --- Resampling Setup for Speaker ---
       console.log("[Speaker Processing] Setting up resampling node chain...");
      const sourceNode = audioContext.createMediaStreamSource(new MediaStream([rawTrack])); // Create stream with only audio track
      speakerSourceNodeRef.current = sourceNode;

      const sourceSampleRate = rawTrack.getSettings().sampleRate;
        if (!sourceSampleRate) {
            console.warn("[Speaker Processing] Could not get source sample rate from track settings. Using AudioContext's default.");
        }

      const workletNode = new AudioWorkletNode(audioContext, 'resampling-processor', {
        processorOptions: {
           sourceSampleRate: sourceSampleRate || audioContext.sampleRate
         }
      });
      speakerWorkletNodeRef.current = workletNode;

      const destinationNode = audioContext.createMediaStreamDestination();
      speakerDestinationNodeRef.current = destinationNode;

      sourceNode.connect(workletNode).connect(destinationNode);
      console.log("[Speaker Processing] Resampling node chain connected.");

      const resampledStream = destinationNode.stream;
      const resampledTrack = resampledStream.getAudioTracks()[0];
      // --- End Resampling Setup ---

      if (!resampledTrack) {
          throw new Error('No audio track found after resampling speaker audio');
      }

      speakerTrackRef.current = resampledTrack; // Store the RESAMPLED audio track
      // Note: Mute state applies only to the mic connection

      await connectionManager.connect('speaker', resampledTrack, resampledStream, {
        onMessage: handleSpeakerMessage,
        onStateChange: handleSpeakerStateChange,
        onError: handleSpeakerError,
      },
      speakerSessionConfig_Transcription // <<< Pass speaker config
      );
    } catch (error) {
      console.error('Failed to connect speaker (display media):' , error);
      handleSpeakerError(error instanceof Error ? error : new Error(String(error)));
      cleanupAudioNodes('speaker');
      // Stop raw track?
    }
  }, [speakerConnectionStatus, initAudioProcessing, handleSpeakerMessage, handleSpeakerStateChange, handleSpeakerError, cleanupAudioNodes]);

  // Update the ref after connectSpeaker is defined
  useEffect(() => {
    connectSpeakerRef.current = connectSpeaker;
  }, [connectSpeaker]);

  const disconnectSpeaker = useCallback(() => {
    console.log('Disconnecting speaker...');
    connectionManager.disconnect('speaker');

    if (speakerTrackRef.current) {
      speakerTrackRef.current.stop();
      speakerTrackRef.current = null;
    }
    // Stop raw track?

    cleanupAudioNodes('speaker');

  }, [cleanupAudioNodes]);

  // Now that connectMic and connectSpeaker are defined, we can create the error retry handler
  const handleErrorRetry = useCallback(() => {
    setErrorState(prev => ({ ...prev, isOpen: false }));
    
    if (errorState.retryAction) {
      errorState.retryAction();
    }
  }, [errorState.retryAction]);

  // // Handle API and processing errors without retry
  const pollRunStatus = useCallback(async (threadId: string, runId: string) => {
    try {
      const response = await fetch(`/api/assistants-api/check-run?threadId=${threadId}&runId=${runId}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to check run status: ${response.status} - ${errorData.error || 'Unknown error'}`);
      }
      
      const data = await response.json();
      console.log('[Assistant Processing] Run status:', data);
      
      if (data.complete) {
        // Run is complete, show the message
        console.log('[Assistant Processing] Run complete, message:', data.message);
        setAssistantRunInProgress(false);
        
        // Add the assistant's response to the transcript
        if (data.message) {
          addTranscriptMessage(
            `main-${Date.now()}`,
            'assistant',
            data.message,
            false,
            'Assistant' // Tag as coming from the main assistant
          );
        }
        
        // Clear the current run info
        setCurrentRunInfo({});
      } else {
        // Run is still in progress, poll again after a delay
        setTimeout(() => pollRunStatus(threadId, runId), 1000);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[Assistant Processing] Error polling run status:', err);
      setAssistantRunInProgress(false);
      
      // Show error dialog
      setErrorState({
        isOpen: true,
        title: 'Run Status Error',
        message: 'There was an error checking the run status. The system will continue to work but some responses may be missing.',
        details: err.message,
        retryAction: null
      });
    }
  }, [addTranscriptMessage]);

  const processTranscriptTurn = useCallback(async (turn: TranscriptTurn) => {
    if (!turn.micTranscript && !turn.speakerTranscript) {
      console.log('[Assistant Processing] No transcripts to process');
      return;
    }
    
    if (!ASSISTANT_ID) {
      console.error('[Assistant Processing] No assistant ID configured');
      return;
    }
    
    try {
      setAssistantRunInProgress(true);
      console.log('[Assistant Processing] Sending transcripts to API:', turn);
      
      const response = await fetch('/api/assistants-api/process-transcript', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          micTranscript: turn.micTranscript,
          speakerTranscript: turn.speakerTranscript,
          assistantId: ASSISTANT_ID
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to process transcripts: ${response.status} - ${errorData.error || 'Unknown error'}`);
      }
      
      const data = await response.json();
      console.log('[Assistant Processing] Run created:', data);
      
      // Store the run info for polling
      setCurrentRunInfo({
        threadId: data.threadId,
        runId: data.runId
      });
      
      // Start polling for run completion
      pollRunStatus(data.threadId, data.runId);
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[Assistant Processing] Error processing transcripts:', err);
      setAssistantRunInProgress(false);
      
      // Show error dialog
      setErrorState({
        isOpen: true,
        title: 'Processing Error',
        message: 'There was an error processing your conversation. The system will continue to work but some responses may be missing.',
        details: err.message,
        retryAction: null
      });
    }
  }, [pollRunStatus]);

  // Add useEffects
  useEffect(() => {
    if (triggerConnect > 0) {
      console.log("Connect triggered from App");
      connectMic();
      connectSpeaker();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerConnect]);

  useEffect(() => {
    if (triggerDisconnect > 0) {
      console.log("Disconnect triggered from App");
      disconnectMic();
      disconnectSpeaker(); 
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerDisconnect]);

  // Process transcript turn
  useEffect(() => {
    if (transcriptTurn && !transcriptTurn.processed && !assistantRunInProgress) {
      processTranscriptTurn(transcriptTurn)
        .then(() => {
          // Mark the turn as processed
          setTranscriptTurn(prev => ({...prev, processed: true}));
        })
        .catch((error: unknown) => {
          const err = error instanceof Error ? error : new Error(String(error));
          console.error('[Assistant Processing] Error in processTranscriptTurn:', err);
          setTranscriptTurn(prev => ({...prev, processed: true})); // Mark as processed anyway to avoid retry loop
          
          // Show error dialog
          setErrorState({
            isOpen: true,
            title: 'Processing Error',
            message: 'There was an error processing your conversation. The system will continue to work but some responses may be missing.',
            details: err.message,
            retryAction: null
          });
        });
    }
  }, [transcriptTurn, assistantRunInProgress, processTranscriptTurn]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log("TopControls unmounting, disconnecting all...");
      disconnectMic();
      disconnectSpeaker();
      connectionManager.disconnectAll();
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

  // Determine effective mobile view, defaulting to true (mobile-first) if null
  const effectiveIsMobileView = isMobileView === null ? true : isMobileView;

  const { text: connectButtonText, title: connectButtonTitle, disabled: connectButtonDisabled, connecting: isConnecting } = getConnectionButtonProps();
  const { isPresent: isApiKeyPresent, statusMessage: apiKeyStatusMessage } = getApiKeyStatus();

  // Helper functions for button props
  const getStatusButtonStyle = (status: WebRTCConnectionStatus): string => {
    switch (status) {
      case 'connected':
        return 'bg-green-100 text-green-700 hover:bg-green-200';
      case 'connecting':
        return 'bg-yellow-100 text-yellow-700 animate-pulse'; // Added pulse for connecting
      case 'disconnected':
        return 'bg-gray-100 text-gray-600 hover:bg-gray-200';
      case 'failed':
      case 'error':
        return 'bg-red-100 text-red-700 hover:bg-red-200';
      default:
        return 'bg-gray-100 text-gray-400';
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
    if (micConnectionStatus === 'disconnected' || micConnectionStatus === 'failed' || micConnectionStatus === 'error') {
      connectMic();
    } else if (micConnectionStatus === 'connected' || micConnectionStatus === 'connecting') {
      disconnectMic();
    }
  };
  
  // Handle speaker status click
  const handleSpeakerStatusClick = () => {
    if (speakerConnectionStatus === 'disconnected' || speakerConnectionStatus === 'failed' || speakerConnectionStatus === 'error') {
      connectSpeaker();
    } else if (speakerConnectionStatus === 'connected' || speakerConnectionStatus === 'connecting') {
      disconnectSpeaker();
    }
  };
  
  // Handle mic mute toggle
  const handleMuteToggle = () => {
    const newMutedState = !isMicrophoneMuted;
    setIsMicrophoneMuted(newMutedState);
    // Toggle the actual track state if it exists
    if (micTrackRef.current) {
      console.log(`Setting mic track enabled state to: ${!newMutedState}`);
      micTrackRef.current.enabled = !newMutedState;
    }
  };
  
  // Helper function for mic button props
  const getMicButtonProps = () => {
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
  };
  
  // Helper function for speaker button props
  const getSpeakerButtonProps = () => {
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
  };

  return (
    <>
      <div className="border-b border-gray-200 bg-white flex items-center justify-between overflow-hidden" style={{ height: 56 }}>
        <div className="flex items-center h-full">
          <div 
            onClick={() => {
              if (effectiveIsMobileView) {
                setActiveMobilePanel(1); // Switch to AgentAnswers panel (index 1)
              } else {
                window.location.reload(); // Keep reload for desktop
              }
            }}
            style={{ cursor: 'pointer', height: '100%' }}
          >
            <Image
              src="/logo.png"
              alt="Logo"
              width={56}
              height={56}
              className="block sm:hidden"
              style={{ height: '100%', width: 'auto' }}
              priority // Add priority for LCP element
            />
            <Image
              src="/logo.png"
              alt="Logo"
              width={56}
              height={56}
              className="hidden sm:block"
              style={{ height: '100%', width: 'auto' }}
              priority // Add priority for LCP element
            />
          </div>
        </div>

        <div className="flex items-center">
          {assistantRunInProgress && (
            <div className="flex items-center bg-teal-100 text-teal-800 px-2 py-1 rounded-full text-xs mr-2 animate-pulse">
              <div className="w-2 h-2 bg-teal-500 rounded-full mr-1"></div>
              <span>Processing...</span>
            </div>
          )}

          {micConnectionStatus === 'connected' && !isMicrophoneMuted && (
            <AudioLevelMeter 
              audioSource={rawMicStreamRef.current}
              isActive={micConnectionStatus === 'connected' && !isMicrophoneMuted}
            />
          )}
        </div>

        <div className={`flex items-center mr-4 ${effectiveIsMobileView ? 'space-x-1.5' : 'space-x-4'}`}>
          <button
            onClick={onToggleConnection}
            title={connectButtonTitle}
            className={`rounded-full flex items-center justify-center transition-colors ${ 
              effectiveIsMobileView ? 'h-8 w-8' : 'h-9 w-9'} ${
              appConnectionState === "CONNECTED"
                ? "bg-red-600 hover:bg-red-700 text-white"
                : (appConnectionState === "CONNECTING" || appConnectionState === "FETCHING_KEY")
                ? "bg-gray-400 cursor-not-allowed text-white"
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
            disabled={connectButtonDisabled}
          >
            {isConnecting ? (
              <div className="flex items-center justify-center">
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
               <Image 
                 src="/power.png"
                 alt="Connect/Disconnect"
                 width={18}
                 height={18}
                 priority
               />
            )}
          </button>

          <button
            onClick={() => {
              if (micConnectionStatus === 'disconnected' || micConnectionStatus === 'failed' || micConnectionStatus === 'error') {
                connectMic();
              } else if (micConnectionStatus === 'connected' || micConnectionStatus === 'connecting') {
                disconnectMic();
              }
            }}
            title={getStatusButtonTitle('mic', micConnectionStatus)}
            className={`rounded-full flex items-center justify-center font-bold text-sm ${getStatusButtonStyle(micConnectionStatus)} cursor-pointer transition-colors border border-gray-300 ${effectiveIsMobileView ? 'h-8 w-8' : 'h-9 w-9'}`}
            disabled={micConnectionStatus === 'connecting'}
          >
            I
          </button>

          <button
            onClick={() => {
              if (speakerConnectionStatus === 'disconnected' || speakerConnectionStatus === 'failed' || speakerConnectionStatus === 'error') {
                connectSpeaker();
              } else if (speakerConnectionStatus === 'connected' || speakerConnectionStatus === 'connecting') {
                disconnectSpeaker();
              }
            }}
            title={getStatusButtonTitle('speaker', speakerConnectionStatus)}
            className={`rounded-full flex items-center justify-center font-bold text-sm ${getStatusButtonStyle(speakerConnectionStatus)} cursor-pointer transition-colors border border-gray-300 ${effectiveIsMobileView ? 'h-8 w-8' : 'h-9 w-9'}`}
            disabled={speakerConnectionStatus === 'connecting'}
          >
            O
          </button>

          <button
            onClick={handleMuteToggle}
            disabled={micConnectionStatus !== "connected"}
            title={isMicrophoneMuted ? "Unmute Microphone" : "Mute Microphone"}
            className={`flex items-center justify-center rounded-full ${ 
              micConnectionStatus !== "connected"
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : isMicrophoneMuted
                ? "bg-red-100 text-red-700 hover:bg-red-200 cursor-pointer"
                : "bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer"
            } transition-colors border border-gray-300 ${effectiveIsMobileView ? 'h-8 w-8' : 'h-9 w-9'}`}
          >
            {isMicrophoneMuted ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M13 8c0 .564-.094 1.107-.266 1.613l-.814-.814A4.02 4.02 0 0 0 12 8V7a.5.5 0 0 1 1 0v1zm-5 4c.818 0 1.578-.245 2.212-.667l.718.719a4.973 4.973 0 0 1-2.43.923V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 1 0v1a4 4 0 0 0 4 4zm3-9v4.879L5.158 2.037A3.001 3.001 0 0 1 11 3z"/>
                <path d="M9.486 10.607 5 6.12V8a3 3 0 0 0 4.486 2.607zm-7.84-9.253 12 12 .708-.708-12-12-.708.708z"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M5 3a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0V3z"/>
                <path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5z"/>
              </svg>
            )}
          </button>

          <div
            className="relative group"
            title={apiKeyStatusMessage}
          >
            <div className={`flex items-center justify-center rounded-full ${ 
              isApiKeyPresent
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            } border border-gray-300 ${effectiveIsMobileView ? 'h-8 w-8' : 'h-9 w-9'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M0 8a4 4 0 0 1 7.465-2H14a.5.5 0 0 1 .354.146l1.5 1.5a.5.5 0 0 1 0 .708l-1.5 1.5a.5.5 0 0 1-.708 0L13 9.207l-.646.647a.5.5 0 0 1-.708 0L11 9.207l-.646.647a.5.5 0 0 1-.708 0L9 9.207l-.646.647A.5.5 0 0 1 8 10h-.535A4 4 0 0 1 0 8zm4-3a3 3 0 1 0 2.712 4.285A.5.5 0 0 1 7.163 9h.63l.853-.854a.5.5 0 0 1 .708 0l.646.647.646-.647a.5.5 0 0 1 .708 0l.646.647.646-.647a.5.5 0 0 1 .708 0l.646.647.793-.793-1-1h-6.63a.5.5 0 0 1-.451-.285A3 3 0 0 0 4 5z"/>
                <path d="M4 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
              </svg>
            </div>
            <div className="hidden group-hover:block absolute top-full right-0 mt-2 p-2 bg-gray-800 text-white shadow-lg rounded-md text-xs w-48 z-10">
              {apiKeyStatusMessage}
            </div>
          </div>

          {!effectiveIsMobileView && (
            <button
              onClick={() => handleDashboardToggle(!isEventsPaneExpanded)}
              title="Toggle Dashboard"
              className={`flex items-center justify-center h-9 w-9 rounded-full ${ 
                isEventsPaneExpanded
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600"
              } transition-colors border border-gray-300`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M11 2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12h.5a.5.5 0 0 1 0 1H.5a.5.5 0 0 1 0-1H1v-3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3h1V7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7h1V2z"/>
              </svg>
            </button>
          )}

          {effectiveIsMobileView && (
            <div className="flex">
              <button
                onClick={() => {
                  const newState = !isEventsPaneExpanded;
                  setIsEventsPaneExpanded(newState);
                  if (newState) {
                    setActiveMobilePanel(2);
                  } else if (activeMobilePanel === 2) {
                    setActiveMobilePanel(1);
                  }
                }}
                title="Toggle Dashboard"
                className={`flex items-center justify-center h-8 w-8 rounded-full ${ 
                  isEventsPaneExpanded
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-600"
                } transition-colors border border-gray-300`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                   <path d="M11 2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12h.5a.5.5 0 0 1 0 1H.5a.5.5 0 0 1 0-1H1v-3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3h1V7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7h1V2z"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
      
      <ErrorDialog
        isOpen={errorState.isOpen}
        title={errorState.title}
        message={errorState.message}
        details={errorState.details}
        onRetry={errorState.retryAction || undefined}
        onDismiss={handleErrorDismiss}
      />
    </>
  );
});

TopControls.displayName = 'TopControls';

export default TopControls; 