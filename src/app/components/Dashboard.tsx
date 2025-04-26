"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useEvent } from "../contexts/EventContext";
import { ServerEvent, LoggedEvent } from "../types";
import { useStatus } from "../contexts/StatusContext";
import Image from 'next/image';
import { connectionManager } from '@/app/api/realtime-assistant-webRTC/webRTCConnection-webRTC';
import { useTheme } from "../contexts/ThemeContext";

// Define the type for connection status explicitly if not imported
type WebRTCConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'failed' | 'error';

// Add interface for Electron API
declare global {
  interface Window {
    electronAPI?: {
      takeScreenshot: () => Promise<{ success: boolean; path?: string; error?: string }>;
      getScreenshots: () => Promise<string[]>;
      getImagePreview: (filepath: string) => Promise<string>;
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
  onReconnectSpeaker = () => console.log('Speaker reconnect handler not provided'),
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
  const { theme, toggleTheme } = useTheme();
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
  const getMuteButtonStyle = () => {
    if (micConnectionStatus !== "connected") {
      return theme === 'dark' ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-400';
    }
    return isMicrophoneMuted
      ? (theme === 'dark' ? 'bg-red-700 text-red-100' : 'bg-red-100 text-red-600')
      : (theme === 'dark' ? 'bg-green-700 text-green-100' : 'bg-green-100 text-green-600');
  };

  const getMuteIconPath = () => {
    return isMicrophoneMuted 
      ? "M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
      : "M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.531V19.94a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.506-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.395C2.806 8.756 3.63 8.25 4.51 8.25H6.75z";
  };

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
      
      if (result.success && result.path) {
        setScreenshotStatus('success');
        setScreenshotPath(result.path);
        // Optional: Show a success notification or preview
        console.log(`Screenshot saved to: ${result.path}`);
        
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
    if (theme === 'dark') {
      switch (screenshotStatus) {
        case 'taking':
          return 'bg-yellow-800 text-yellow-100 cursor-wait border-yellow-600';
        case 'success':
          return 'bg-green-700 text-green-100 border-green-600';
        case 'error':
          return 'bg-red-700 text-red-100 border-red-600';
        default:
          return 'bg-gray-700 text-gray-100 hover:bg-gray-600 cursor-pointer border-gray-500';
      }
    } else {
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
    }
  }, [screenshotStatus, theme]);

  // Early return if dashboard is not enabled and not expanded
  if (!isDashboardEnabled && !isExpanded) {
    return null;
  }

  // Return a disabled state message if expanded but not enabled
  if (!isDashboardEnabled && isExpanded) {
    return (
      <div className={`w-full h-full flex flex-col ${theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-800'} rounded-xl overflow-hidden`}>
        <div className={`font-semibold text-base px-4 py-2 border-b ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
          Dashboard (Disabled)
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-500">
          Dashboard features are currently disabled
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col ${theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-800'} rounded-xl overflow-hidden border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-300'}`}>
      {/* --- Main Vertical Stack --- */}
      <div className="flex flex-col items-center justify-between pt-4 pb-4 h-full"> 
        
        {/* --- Top Group: U, S, Mute --- */}
        <div className="flex flex-col items-center space-y-3"> 
           {/* User Status Button (U) - Now Interactive */}
           <button 
             onClick={handleUserButtonClick}
             disabled={!isButtonClickable(micConnectionStatus)}
             title={getButtonTitle('user', micConnectionStatus)} 
             className={`flex flex-col items-center justify-between h-14 w-8 border ${theme === 'dark' ? 'border-gray-500' : 'border-gray-300'} rounded-lg ${getStatusColor(userRealtimeStatus)} p-1 ${getButtonCursorStyle(micConnectionStatus)} transition-colors hover:opacity-90`}> 
               <svg width="20" height="20" fill="none" stroke={theme === 'dark' ? '#f9fafb' : 'currentColor'} strokeWidth="1.5" viewBox="0 0 24 24">
                 <path d="M8 3a1 1 0 0 1 1 1v16a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1Zm8 2a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Zm-4 2a1 1 0 0 1 1 1v8a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1ZM4 9a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-4a1 1 0 0 1 1-1Zm16 0a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-4a1 1 0 0 1 1-1Z"></path>
               </svg>
               <span className={`font-bold text-xs ${theme === 'dark' ? 'text-gray-100' : 'text-gray-700'}`} style={{ display: "block" }}>U</span>
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
             className={`flex flex-col items-center justify-between h-14 w-8 border ${theme === 'dark' ? 'border-gray-500' : 'border-gray-300'} rounded-lg ${getStatusColor(speakerRealtimeStatus)} p-1 ${getButtonCursorStyle(speakerConnectionStatus)} transition-colors hover:opacity-90`}> 
               <svg width="20" height="20" fill="none" stroke={theme === 'dark' ? '#f9fafb' : 'currentColor'} strokeWidth="1.5" viewBox="0 0 24 24">
                 <path d="M8 3a1 1 0 0 1 1 1v16a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1Zm8 2a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Zm-4 2a1 1 0 0 1 1 1v8a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1ZM4 9a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-4a1 1 0 0 1 1-1Zm16 0a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-4a1 1 0 0 1 1-1Z"></path>
               </svg>
               <span className={`font-bold text-xs ${theme === 'dark' ? 'text-gray-100' : 'text-gray-700'}`} style={{ display: "block" }}>S</span>
               {/* Show loading spinner when connecting */}
               {speakerConnectionStatus === 'connecting' && (
                 <div className="absolute inset-0 flex items-center justify-center">
                   <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                 </div>
               )}
           </button>
           {/* Mute Button */}
           <button 
             onClick={onMuteToggle}
             disabled={micConnectionStatus !== "connected"}
             title={isMicrophoneMuted ? "Unmute Microphone" : "Mute Microphone"}
             className={`flex flex-col items-center justify-between h-14 w-8 border ${theme === 'dark' ? 'border-gray-500' : 'border-gray-300'} rounded-lg ${getMuteButtonStyle()} p-1 transition-colors hover:opacity-90`}> 
               <svg width="20" height="20" fill="none" stroke={theme === 'dark' ? '#f9fafb' : 'currentColor'} strokeWidth="1.5" viewBox="0 0 24 24">
                 <path d={getMuteIconPath()}></path>
               </svg>
               <span className={`font-bold text-xs ${theme === 'dark' ? 'text-gray-100' : 'text-gray-700'}`} style={{ display: "block" }}>
                 {isMicrophoneMuted ? 'UN' : 'M'}
               </span>
               {micConnectionStatus === 'connecting' && (
                 <div className="absolute inset-0 flex items-center justify-center">
                   <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                 </div>
               )}
           </button>
        </div>

        {/* --- Middle Group: Chat, Assistant, Screenshot --- */}
        <div className="flex flex-col items-center space-y-4"> 
          {/* chat completion */}
          <div className={`rounded-full flex items-center justify-center w-8 h-8 ${getStatusColor(chatStatus)} border ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}>
            {/* Chat Icon SVG (Ensure consistent size) */}
            <svg width="16" height="16" fill="none" stroke={theme === 'dark' ? '#ffffff' : 'currentColor'} strokeWidth="1.5" viewBox="0 0 24 24">
              <path d="M12 4.5c-4.473 0-8 3.41-8 7.5 0 1.696.6 3.263 1.62 4.525a1 1 0 0 1 .206.814 14.712 14.712 0 0 1-.37 1.501 15.17 15.17 0 0 0 1.842-.4 1 1 0 0 1 .745.08A8.371 8.371 0 0 0 12 19.5c4.473 0 8-3.41 8-7.5s-3.527-7.5-8-7.5ZM2 12c0-5.3 4.532-9.5 10-9.5S22 6.7 22 12s-4.532 9.5-10 9.5c-1.63 0-3.174-.371-4.539-1.032a17.88 17.88 0 0 1-3.4.53 1 1 0 0 1-.995-1.357c.29-.755.534-1.496.704-2.242A9.137 9.137 0 0 1 2 12Z"></path>
            </svg>
          </div>
          {/* Screenshot Button - Now with functionality */}
          <button
            onClick={handleScreenshot}
            title={screenshotStatus === 'taking' ? 'Taking screenshot...' : 'Take screenshot'}
            className={`rounded-full flex items-center justify-center font-bold text-xs ${getScreenshotButtonStyle()} transition-colors w-8 h-8`}
            disabled={screenshotStatus === 'taking'}
          >
            {screenshotStatus === 'taking' ? (
              // Show spinner when taking screenshot
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            ) : (
              // Camera icon SVG
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill={theme === 'dark' ? '#ffffff' : 'currentColor'} viewBox="0 0 16 16">
                <path d="M10.5 8.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/>
                <path d="M2 4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1.172a2 2 0 0 1-1.414-.586l-.828-.828A2 2 0 0 0 9.172 2H6.828a2 2 0 0 0-1.414.586l-.828.828A2 2 0 0 1 3.172 4H2zm.5 2a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1zm9 2.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z"/>
              </svg>
            )}
          </button>
        </div>

        {/* --- Bottom Group: Empty (removed theme toggle) --- */}
        <div className="flex flex-col items-center space-y-3">
          {/* No buttons here now */}
        </div>

      </div>
    </div>
  );
}

export default Dashboard;