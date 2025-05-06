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

// Add interface for Electron API - Keep for potential future use
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
  // Mute related props removed
  // Add new props for speaker status and reconnection capabilities
  speakerConnectionStatus?: WebRTCConnectionStatus;
  onReconnectMic?: () => void; // Keep reconnect props for now, might be used elsewhere
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
  speakerConnectionStatus = 'disconnected', // Default value if not provided
  onReconnectMic = () => console.log('Mic reconnect handler not provided'),
  onReconnectSpeaker = () => console.log('Speaker reconnect handler not provided'),
}: DashboardProps) {
  const { loggedEvents, toggleExpand } = useEvent();
  const {
    userRealtimeStatus, // Still needed for mapping micConnectionStatus if passed differently later
    speakerRealtimeStatus,
    // chatStatus removed from destructuring
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

  const isNearingCostLimit = cost.total / cost.dailyLimit > 0.8;
  const showAlert = isNearingCostLimit;

  // Map WebRTC connection status to UI status
  useEffect(() => {
    // Update user status based on mic connection status (if micConnectionStatus were still passed)
    // ... (code removed as micConnectionStatus is no longer a prop)

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
  }, [speakerConnectionStatus, setUserRealtimeStatus, setSpeakerRealtimeStatus]); // Adjusted dependencies

  // Handle button clicks for reconnection - REMOVED handleUserButtonClick and handleSpeakerButtonClick

  // getStatusColor helper function removed

  // Helper to determine if a button should be clickable - Keep for potential future use
  const isButtonClickable = (connectionStatus: WebRTCConnectionStatus): boolean => {
    return connectionStatus === 'disconnected' ||
           connectionStatus === 'failed' ||
           connectionStatus === 'error';
  };

  // Helper to get button cursor style - Keep for potential future use
  const getButtonCursorStyle = (connectionStatus: WebRTCConnectionStatus): string => {
    return isButtonClickable(connectionStatus) ? "cursor-pointer" : "cursor-default";
  };

  // Helper to get button title text - Keep for potential future use
  const getButtonTitle = (type: 'user' | 'speaker', connectionStatus: WebRTCConnectionStatus): string => {
    const streamName = type === 'user' ? 'User Input' : 'Speaker Output';

    if (connectionStatus === 'connected') return `${streamName} Connected`;
    if (connectionStatus === 'connecting') return `${streamName} Connecting...`;
    if (connectionStatus === 'disconnected') return `Click to Connect ${streamName}`;
    if (connectionStatus === 'failed' || connectionStatus === 'error') return `Click to Reconnect ${streamName} (Error)`;

    return `${streamName} Status Unknown`;
  };

  // Early return if dashboard is not enabled and not expanded
  if (!isDashboardEnabled && !isExpanded) {
    return null;
  }

  // Return a disabled state message if expanded but not enabled
  if (!isDashboardEnabled && isExpanded) {
    return (
      <div className={`w-full h-full flex flex-col ${theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-800'} overflow-hidden`}>
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
    <div className={`h-full flex flex-col ${theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-800'}`}
         style={{ border: 'none', borderRadius: 0 }}>
      {/* --- Main Vertical Stack --- */}
      <div className="flex flex-col items-center justify-between h-full"
           style={{ paddingTop: '10px', paddingBottom: '10px' }}>

        {/* --- Top Group: Empty --- */}
        <div className="flex flex-col items-center space-y-3">
           {/* User Status Button (U) - REMOVED */}
           {/* Speaker Status Button (S) - REMOVED */}
           {/* Mute Button - REMOVED */}
        </div>

        {/* --- Middle Group: Empty --- */}
        <div className="flex flex-col items-center space-y-4">
          {/* chat completion - REMOVED */}
          {/* Screenshot Button - REMOVED */}
        </div>

        {/* --- Bottom Group: Empty --- */}
        <div className="flex flex-col items-center space-y-3">
          {/* No buttons here now */}
        </div>

      </div>
    </div>
  );
}

export default Dashboard;