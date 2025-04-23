"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useEvent } from "../contexts/EventContext";
import { ServerEvent, LoggedEvent } from "../types";
import { useStatus } from "../contexts/StatusContext";
import Image from 'next/image';
import { connectionManager } from '@/app/api/realtime-assistant-webRTC/webRTCConnection-webRTC';

// Define the type for connection status explicitly if not imported
type WebRTCConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'failed' | 'error';

// Add interface for Electron API
declare global {
  interface Window {
    electronAPI?: {
      takeScreenshot: () => Promise<{ success: boolean; filePath?: string; error?: string }>;
    };
  }
}

export interface DashboardProps {
  isExpanded: boolean;
  isDashboardEnabled: boolean;
  transcriptItems: any[];
  isMicrophoneMuted: boolean;
  micConnectionStatus: WebRTCConnectionStatus;
  onMuteToggle: () => void;
  // Add new props for speaker status and reconnection capabilities
  speakerConnectionStatus?: WebRTCConnectionStatus;
  onReconnectMic?: () => void;
  onReconnectSpeaker?: () => void;
}

interface TokenUsage {
  resetTimeSeconds: number;
}

interface Cost {
  input: number;
  output: number;
  total: number;
  dailyLimit: number;
}

interface ApiKeyStatus {
  isPresent: boolean;
  statusMessage: string;
}

// Agent status interfaces removed

// Token pricing rates per 1000 tokens in USD
const TOKEN_RATES = {
  input: 0.01,
  output: 0.03,
};

// OpenAI Project ID
const OPENAI_PROJECT_ID = "proj_iwQ4RJz8jIk9GD62jdsDIfZE";

function Dashboard({ 
  isExpanded, 
  isDashboardEnabled, 
  transcriptItems,
  isMicrophoneMuted,
  micConnectionStatus,
  onMuteToggle,
  speakerConnectionStatus = 'disconnected', // Default value if not provided
  onReconnectMic = () => console.log('Mic reconnect handler not provided'),
  onReconnectSpeaker = () => console.log('Speaker reconnect handler not provided')
}: DashboardProps) {
  const { loggedEvents, toggleExpand } = useEvent();
  const {
    userRealtimeStatus,
    speakerRealtimeStatus,
    chatStatus,
    assistantStatus,
    setUserRealtimeStatus,
    setSpeakerRealtimeStatus
  } = useStatus();
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    resetTimeSeconds: 60,
  });

  const [cost, setCost] = useState<Cost>({
    input: 0,
    output: 0,
    total: 0,
    dailyLimit: 5, // $5 daily soft cap
  });

  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>({
    isPresent: false,
    statusMessage: "API Key Not Configured"
  });

  const [sessionStartTime, setSessionStartTime] = useState<Date>(new Date());
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedEventType, setSelectedEventType] = useState<string | null>(null);
  const [developerMode, setDeveloperMode] = useState<boolean>(false);
  const [projectId, setProjectId] = useState<string>(OPENAI_PROJECT_ID);
  const lastProcessedEventCountRef = useRef(0); // Ref to track processed events

  // Add new state for screenshot status
  const [screenshotStatus, setScreenshotStatus] = useState<'idle' | 'taking' | 'success' | 'error'>('idle');
  const [screenshotPath, setScreenshotPath] = useState<string | null>(null);

  // Agent processes state removed

  const { tokenUsage: totalTokens, cost: totalCost } = useMemo(() => {
    let totalTokens = 0;
    let totalCost = 0;

    // Process events in reverse order until we find a token usage event
    for (let i = loggedEvents.length - 1; i >= 0; i--) {
      const event = loggedEvents[i];
      if (event.eventName === "response.done" && event.direction === "server") {
        const usage = event.eventData?.response?.usage;
        if (usage) {
          totalTokens = usage.total_tokens || 0;
          totalCost = usage.total_cost || 0;
          break; // Exit once we find the latest token usage
        }
      }
    }

    return { tokenUsage: totalTokens, cost: totalCost };
  }, [loggedEvents]);

  const eventsByAgent = useMemo(() => {
    const events: Record<string, LoggedEvent[]> = {};
    // Process events in reverse order to get latest agent events first
    for (let i = loggedEvents.length - 1; i >= 0; i--) {
      const event = loggedEvents[i];
      if (event.direction === "server") {
        const agentId = event.eventData?.agent_id;
        if (agentId) {
          if (!events[agentId]) {
            events[agentId] = [];
          }
          events[agentId].push(event);
        }
      }
    }
    return events;
  }, [loggedEvents]);

  const currentApiKeyStatus = useMemo(() => {
    const tokenEvents = loggedEvents.filter(e => e.eventName === "fetch_session_token_response");
    if (tokenEvents.length > 0) {
      const latest = tokenEvents[tokenEvents.length - 1];
      return latest.eventData?.status || "unknown";
    }
    return "unknown";
  }, [loggedEvents]);

  const eventTypes = useMemo(() => {
    const types = new Set<string>();
    loggedEvents.forEach(event => {
      types.add(event.eventName);
    });
    return Array.from(types);
  }, [loggedEvents]);

  // Agent processes update effect removed

  // Timer Effect
  useEffect(() => {
    if (!isDashboardEnabled) return;

    const timer = setInterval(() => {
      setCurrentTime(new Date()); // Keep for duration display
      setTokenUsage(prev => {
        const newReset = Math.max(0, prev.resetTimeSeconds - 1);
        if (newReset === 0) {
          return { ...prev, resetTimeSeconds: 60 };
        }
        // Just countdown the timer
        return { ...prev, resetTimeSeconds: newReset };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isDashboardEnabled]);

  // Calculation Effect (Updates In/Out/Total based on NEW events)
  useEffect(() => {
    if (!isDashboardEnabled) return;

    const currentEventCount = loggedEvents.length;
    // Only process events added since the last run
    const newEvents = loggedEvents.slice(lastProcessedEventCountRef.current);

    // Update ref *before* processing, in case of errors
    lastProcessedEventCountRef.current = currentEventCount;

    // Recalculate cost (always depends on sessionTotal)
    let sessionTotal = 0;
    // Iterate through all events to calculate Session Total
    loggedEvents.forEach(event => {
      if (event.eventName === "response.done" && event.direction === "server" && event.timestampMs) {
          const usage = event.eventData?.response?.usage;
          if (usage) {
              const totalTokens = usage.total_tokens || (usage.input_tokens || 0) + (usage.output_tokens || 0);
              sessionTotal += totalTokens;
          }
      }
    });
    
    const sessionInputCost = (sessionTotal / 1000) * TOKEN_RATES.input;
    const sessionOutputCost = (sessionTotal / 1000) * TOKEN_RATES.output;
    setCost(prevCost => ({
        ...prevCost,
        input: sessionInputCost,
        output: sessionOutputCost,
        total: sessionInputCost + sessionOutputCost
    }));
  }, [loggedEvents, isDashboardEnabled]);

  // Update API key status based on token events
  useEffect(() => {
    if (!isDashboardEnabled) return;

    const tokenEvents = loggedEvents.filter(e => e.eventName === "fetch_session_token_response");
    if (tokenEvents.length > 0) {
      const latest = tokenEvents[tokenEvents.length - 1];
      const hasError = latest.eventData?.error || !latest.eventData?.client_secret?.value;

      setApiKeyStatus({
        isPresent: !hasError,
        statusMessage: hasError ? (latest.eventData?.error || "Invalid API Key") : "API Key Valid"
      });
    }
  }, [loggedEvents, isDashboardEnabled]);

  const sessionDuration = useMemo(() => {
    const diffMs = currentTime.getTime() - sessionStartTime.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const hours = Math.floor(diffSec / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((diffSec % 3600) / 60).toString().padStart(2, '0');
    const seconds = Math.floor(diffSec % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }, [currentTime, sessionStartTime]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <span className="text-green-500">✅</span>;
      case "processing":
        return <span className="text-yellow-500">🟡</span>;
      case "failed":
        return <span className="text-red-500">❌</span>;
      default:
        return <span className="text-gray-300">⬜</span>;
    }
  };

  // Filtered events based on selected filters
  const filteredEvents = useMemo(() => {
    return loggedEvents.filter(event => {
      if (selectedEventType && event.eventName !== selectedEventType) {
        return false;
      }
      return true;
    });
  }, [loggedEvents, selectedEventType]);

  // Tracking state for UI components - State and toggles removed
  // const [logsExpanded, setLogsExpanded] = useState(false); // REMOVED
  // const [breadcrumbsExpanded, setBreadcrumbsExpanded] = useState(false); // REMOVED

  // const toggleLogsExpanded = () => { // REMOVED
  //   setLogsExpanded(!logsExpanded); // REMOVED
  // }; // REMOVED

  // const toggleBreadcrumbsExpanded = () => { // REMOVED
  //   setBreadcrumbsExpanded(!breadcrumbsExpanded); // REMOVED
  // }; // REMOVED

  const isNearingCostLimit = cost.total / cost.dailyLimit > 0.8;
  const showAlert = isNearingCostLimit;

  // Map WebRTC connection status to UI status 
  useEffect(() => {
    // Update user status based on mic connection status
    if (micConnectionStatus === 'connected') {
      setUserRealtimeStatus('done');
    } else if (micConnectionStatus === 'connecting') {
      setUserRealtimeStatus('processing');
    } else if (micConnectionStatus === 'failed' || micConnectionStatus === 'error') {
      setUserRealtimeStatus('error');
    } else {
      setUserRealtimeStatus('idle');
    }

    // Update speaker status based on speaker connection status
    if (speakerConnectionStatus === 'connected') {
      setSpeakerRealtimeStatus('done');
    } else if (speakerConnectionStatus === 'connecting') {
      setSpeakerRealtimeStatus('processing');
    } else if (speakerConnectionStatus === 'failed' || speakerConnectionStatus === 'error') {
      setSpeakerRealtimeStatus('error');
    } else {
      setSpeakerRealtimeStatus('idle');
    }
  }, [micConnectionStatus, speakerConnectionStatus, setUserRealtimeStatus, setSpeakerRealtimeStatus]);

  // Handle button clicks for reconnection
  const handleUserButtonClick = useCallback(() => {
    if (micConnectionStatus === 'disconnected' || micConnectionStatus === 'failed' || micConnectionStatus === 'error') {
      onReconnectMic();
    }
  }, [micConnectionStatus, onReconnectMic]);

  const handleSpeakerButtonClick = useCallback(() => {
    if (speakerConnectionStatus === 'disconnected' || speakerConnectionStatus === 'failed' || speakerConnectionStatus === 'error') {
      onReconnectSpeaker();
    }
  }, [speakerConnectionStatus, onReconnectSpeaker]);

  // Keep existing helper for U/S/Chat/Assistant buttons
  const getStatusColor = (status: "idle" | "processing" | "done" | "error") => {
    if (status === "processing") return "bg-orange-400";
    if (status === "done") return "bg-green-500";
    if (status === "error") return "bg-red-400";
    return "bg-gray-200"; // Assuming this is the intended 'idle'/default color
  };

  // Helper to determine if a button should be clickable
  const isButtonClickable = (connectionStatus: WebRTCConnectionStatus): boolean => {
    return connectionStatus === 'disconnected' || 
           connectionStatus === 'failed' || 
           connectionStatus === 'error';
  };

  // Helper to get button cursor style
  const getButtonCursorStyle = (connectionStatus: WebRTCConnectionStatus): string => {
    return isButtonClickable(connectionStatus) ? "cursor-pointer" : "cursor-default";
  };

  // Helper to get button title text
  const getButtonTitle = (type: 'user' | 'speaker', connectionStatus: WebRTCConnectionStatus): string => {
    const streamName = type === 'user' ? 'User Input' : 'Speaker Output';
    
    if (connectionStatus === 'connected') return `${streamName} Connected`;
    if (connectionStatus === 'connecting') return `${streamName} Connecting...`;
    if (connectionStatus === 'disconnected') return `Click to Connect ${streamName}`;
    if (connectionStatus === 'failed' || connectionStatus === 'error') return `Click to Reconnect ${streamName} (Error)`;
    
    return `${streamName} Status Unknown`;
  };

  // --- Helper Functions for Mute button (adapted from TopControls) ---
  // Keep getMuteButtonStyle and its dependency micConnectionStatus
  const getMuteButtonStyle = (): string => {
    // Style for Mute button - mimics existing round buttons
    if (micConnectionStatus !== "connected") {
      return "bg-gray-100 text-gray-400 cursor-not-allowed";
    } 
    if (isMicrophoneMuted) {
      return "bg-red-100 text-red-700 hover:bg-red-200 cursor-pointer";
    } 
    return "bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer";
  };
  
  // Remove helpers for I/O buttons
  // const getStatusButtonStyle = ...
  // const getStatusButtonTitle = ...

  // Handle screenshot button click
  const handleScreenshot = useCallback(async () => {
    // Only proceed if we're in an Electron environment
    if (!window.electronAPI?.takeScreenshot) {
      console.log('Screenshot functionality is only available in the Electron app');
      return;
    }

    try {
      setScreenshotStatus('taking');
      const result = await window.electronAPI.takeScreenshot();
      
      if (result.success && result.filePath) {
        setScreenshotStatus('success');
        setScreenshotPath(result.filePath);
        // Optional: Show a success notification or preview
        console.log(`Screenshot saved to: ${result.filePath}`);
        
        // Reset status after a delay
        setTimeout(() => {
          setScreenshotStatus('idle');
        }, 2000);
      } else {
        setScreenshotStatus('error');
        console.error('Screenshot failed:', result.error || 'No file path returned');
        
        // Reset status after a delay
        setTimeout(() => {
          setScreenshotStatus('idle');
        }, 2000);
      }
    } catch (error) {
      setScreenshotStatus('error');
      console.error('Error taking screenshot:', error);
      
      // Reset status after a delay
      setTimeout(() => {
        setScreenshotStatus('idle');
      }, 2000);
    }
  }, []);

  // Helper to get screenshot button style based on status
  const getScreenshotButtonStyle = useCallback(() => {
    switch (screenshotStatus) {
      case 'taking':
        return 'bg-yellow-100 text-yellow-600 cursor-wait';
      case 'success':
        return 'bg-green-100 text-green-600';
      case 'error':
        return 'bg-red-100 text-red-600';
      default:
        return 'bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer';
    }
  }, [screenshotStatus]);

  // Early return if dashboard is not enabled and not expanded
  if (!isDashboardEnabled && !isExpanded) {
    return null;
  }

  // Return a disabled state message if expanded but not enabled
  if (!isDashboardEnabled && isExpanded) {
    return (
      <div className="w-full h-full flex flex-col bg-white rounded-xl overflow-hidden">
        <div className="font-semibold text-base px-4 py-2 border-b bg-gray-50">
          Dashboard (Disabled)
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-500">
          Dashboard features are currently disabled
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-xl overflow-hidden border border-gray-300">
      {/* --- Main Vertical Stack --- */}
      <div className="flex flex-col items-center justify-between pt-4 pb-4 h-full"> 
        
        {/* --- Top Group: U, S, Mute --- */}
        <div className="flex flex-col items-center space-y-3"> 
           {/* User Status Button (U) - Now Interactive */}
           <button 
             onClick={handleUserButtonClick}
             disabled={!isButtonClickable(micConnectionStatus)}
             title={getButtonTitle('user', micConnectionStatus)} 
             className={`flex flex-col items-center justify-between h-14 w-8 border border-gray-300 rounded-lg ${getStatusColor(userRealtimeStatus)} p-1 ${getButtonCursorStyle(micConnectionStatus)} transition-colors hover:opacity-90`}> 
               <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                 <path d="M8 3a1 1 0 0 1 1 1v16a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1Zm8 2a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Zm-4 2a1 1 0 0 1 1 1v8a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1ZM4 9a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-4a1 1 0 0 1 1-1Zm16 0a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-4a1 1 0 0 1 1-1Z"></path>
               </svg>
               <span className="font-bold text-xs text-gray-700" style={{ display: "block" }}>U</span>
               {/* Show loading spinner when connecting */}
               {micConnectionStatus === 'connecting' && (
                 <div className="absolute inset-0 flex items-center justify-center">
                   <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                 </div>
               )}
           </button>
           {/* Speaker Status Button (S) - Now Interactive */}
           <button 
             onClick={handleSpeakerButtonClick}
             disabled={!isButtonClickable(speakerConnectionStatus)}
             title={getButtonTitle('speaker', speakerConnectionStatus)}
             className={`flex flex-col items-center justify-between h-14 w-8 border border-gray-300 rounded-lg ${getStatusColor(speakerRealtimeStatus)} p-1 ${getButtonCursorStyle(speakerConnectionStatus)} transition-colors hover:opacity-90`}> 
               <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                 <path d="M8 3a1 1 0 0 1 1 1v16a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1Zm8 2a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Zm-4 2a1 1 0 0 1 1 1v8a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1ZM4 9a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-4a1 1 0 0 1 1-1Zm16 0a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-4a1 1 0 0 1 1-1Z"></path>
               </svg>
               <span className="font-bold text-xs text-gray-700" style={{ display: "block" }}>S</span>
               {/* Show loading spinner when connecting */}
               {speakerConnectionStatus === 'connecting' && (
                 <div className="absolute inset-0 flex items-center justify-center">
                   <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                 </div>
               )}
           </button>
           {/* Mute Button - Round Style */}
           <button
             onClick={onMuteToggle}
             disabled={micConnectionStatus !== "connected"}
             title={isMicrophoneMuted ? "Unmute Microphone" : "Mute Microphone"}
             className={`rounded-full flex items-center justify-center ${getMuteButtonStyle()} transition-colors border border-gray-300 w-9 h-9`}
           >
            {/* Mute Icons (SVGs - Ensure consistent size) */}
             {isMicrophoneMuted ? (
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                 {/* Muted path data */}
                 <path d="M13 8c0 .564-.094 1.107-.266 1.613l-.814-.814A4.02 4.02 0 0 0 12 8V7a.5.5 0 0 1 1 0v1zm-5 4c.818 0 1.578-.245 2.212-.667l.718.719a4.973 4.973 0 0 1-2.43.923V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 1 0v1a4 4 0 0 0 4 4zm3-9v4.879L5.158 2.037A3.001 3.001 0 0 1 11 3z"/>
                 <path d="M9.486 10.607 5 6.12V8a3 3 0 0 0 4.486 2.607zm-7.84-9.253 12 12 .708-.708-12-12-.708.708z"/>
               </svg>
             ) : (
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                 {/* Unmuted path data */}
                 <path d="M5 3a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0V3z"/>
                 <path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5z"/>
               </svg>
             )}
           </button>
        </div>

        {/* --- Middle Group: Chat, Assistant, Screenshot, Voice Rec (All Round) --- */}
        <div className="flex flex-col items-center space-y-3"> 
          {/* chat completion */}
          <div className={`rounded-full flex items-center justify-center w-9 h-9 ${getStatusColor(chatStatus)} border border-gray-300`}>
            {/* Chat Icon SVG (Ensure consistent size) */}
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path d="M12 4.5c-4.473 0-8 3.41-8 7.5 0 1.696.6 3.263 1.62 4.525a1 1 0 0 1 .206.814 14.712 14.712 0 0 1-.37 1.501 15.17 15.17 0 0 0 1.842-.4 1 1 0 0 1 .745.08A8.371 8.371 0 0 0 12 19.5c4.473 0 8-3.41 8-7.5s-3.527-7.5-8-7.5ZM2 12c0-5.3 4.532-9.5 10-9.5S22 6.7 22 12s-4.532 9.5-10 9.5c-1.63 0-3.174-.371-4.539-1.032a17.88 17.88 0 0 1-3.4.53 1 1 0 0 1-.995-1.357c.29-.755.534-1.496.704-2.242A9.137 9.137 0 0 1 2 12Z"></path>
            </svg>
          </div>
          {/* assistant */}
          <div className={`rounded-full flex items-center justify-center w-9 h-9 ${getStatusColor(assistantStatus)} border border-gray-300`}>
            {/* Assistant Icon SVG (Ensure consistent size) */}
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path d="M12 1a1 1 0 0 1 1 1v.5h2.87c.513 0 .955 0 1.32.029.384.03.767.098 1.137.28a3 3 0 0 1 1.364 1.364c.182.37.25.753.28 1.137.029.365.029.807.029 1.32v.078c0 1.054 0 1.903-.055 2.592-.056.709-.175 1.332-.46 1.911a5 5 0 0 1-2.274 2.273c-.579.286-1.202.405-1.911.461-.689.055-1.538.055-2.592.055h-1.416c-1.054 0-1.903 0-2.592-.055-.709-.056-1.332-.175-1.911-.46a5 5 0 0 1-2.273-2.274c-.286-.579-.405-1.202-.461-1.911C4 8.611 4 7.762 4 6.708V6.63c0-.512 0-.954.029-1.319.03-.384.098-.767.28-1.137A3 3 0 0 1 5.673 2.81c.37-.182.753-.25 1.137-.28.365-.029.807-.029 1.32-.029H11V2a1 1 0 0 1 1-1ZM6.969 4.523c-.265.02-.363.056-.411.08a1 1 0 0 0-.455.455c-.024.048-.06.146-.08.41A16.99 16.99 0 0 0 6 6.668c0 1.104 0 1.874.048 2.475.047.588.135.928.261 1.185a3 3 0 0 0 1.364 1.364c.257.127.597.214 1.185.26.6.048 1.37.049 2.475.049h1.334c1.104 0 1.874 0 2.475-.048.588-.047.928-.134 1.185-.261a3 3 0 0 0 1.364-1.364c.127-.257.214-.597.26-1.185.048-.6.049-1.37.049-2.475 0-.56 0-.922-.023-1.198-.02-.265-.056-.363-.08-.411a1 1 0 0 0-.455-.455c-.048-.024-.146-.06-.41-.08a16.993 16.993 0 0 0-1.199-.023H8.167c-.56 0-.922 0-1.198.023ZM6 21c0-.974.551-1.95 1.632-2.722C8.71 17.508 10.252 17 12 17c1.749 0 3.29.508 4.369 1.278C17.449 19.05 18 20.026 18 21a1 1 0 1 0 2 0c0-1.788-1.016-3.311-2.469-4.35-1.455-1.038-3.414-1.65-5.53-1.65-2.118 0-4.077.611-5.532 1.65C5.016 17.69 4 19.214 4 21a1 1 0 1 0 2 0Z"></path>
            </svg>
          </div>
          {/* Screenshot Button - Now with functionality */}
          <button
            onClick={handleScreenshot}
            title={screenshotStatus === 'taking' ? 'Taking screenshot...' : 'Take screenshot'}
            className={`rounded-full flex items-center justify-center font-bold text-xs ${getScreenshotButtonStyle()} transition-colors border border-gray-300 w-9 h-9`}
            disabled={screenshotStatus === 'taking'}
          >
            {screenshotStatus === 'taking' ? (
              // Show spinner when taking screenshot
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            ) : (
              // Camera icon SVG
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M10.5 8.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/>
                <path d="M2 4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1.172a2 2 0 0 1-1.414-.586l-.828-.828A2 2 0 0 0 9.172 2H6.828a2 2 0 0 0-1.414.586l-.828.828A2 2 0 0 1 3.172 4H2zm.5 2a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1zm9 2.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z"/>
              </svg>
            )}
          </button>
           {/* Voice Recognition Button (New) - Round Style */}
           <button
            title="Voice Recognition Toggle"
            className={`rounded-full flex items-center justify-center font-bold text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer transition-colors border border-gray-300 w-9 h-9`}
          >
            {/* Voice Rec Image (Ensure consistent size) */}
            <Image src="/voice-recognition.png" alt="Voice Recognition" width={16} height={16} />
          </button>
        </div>

        {/* --- Bottom Group: Settings/Key Button --- */}
        <div className="flex flex-col items-center space-y-3"> 
          {/* Key/Settings Button - Round Style */}
          <button
            title="Settings"
            className={`rounded-full flex items-center justify-center font-bold text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer transition-colors border border-gray-300 w-9 h-9`}
          >
            {/* Settings Image (Ensure consistent size) */}
            <Image src="/setting.png" alt="Settings" width={16} height={16} />
          </button>
        </div>

      </div>
    </div>
  );
}

export default Dashboard;