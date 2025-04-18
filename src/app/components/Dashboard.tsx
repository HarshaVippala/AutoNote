"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useEvent } from "../contexts/EventContext";
import { ServerEvent, LoggedEvent } from "../types";

export interface DashboardProps {
  isExpanded: boolean;
  isDashboardEnabled: boolean;
  transcriptItems: any[]; // Added transcriptItems prop
}

interface TokenUsage {
  input: number;
  output: number;
  total: number;
  tpm: number;
  tpmLimit: number;
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

// Default TPM limit - using gpt-3.5-turbo as default (2M TPM)
const DEFAULT_TPM_LIMIT = 200000;

// OpenAI Rate Limits by model
const MODEL_RATE_LIMITS: Record<string, { tpm: number; rpm: number }> = {
  "gpt-3.5-turbo": { tpm: 2000000, rpm: 5000 },
  "gpt-3.5-turbo-0125": { tpm: 2000000, rpm: 5000 },
  "gpt-3.5-turbo-1106": { tpm: 2000000, rpm: 5000 },
  "gpt-3.5-turbo-16k": { tpm: 2000000, rpm: 5000 },
  "gpt-3.5-turbo-instruct": { tpm: 90000, rpm: 3500 },
  "gpt-3.5-turbo-instruct-0914": { tpm: 90000, rpm: 3500 },
  "gpt-4": { tpm: 40000, rpm: 5000 },
  "gpt-4-0613": { tpm: 40000, rpm: 5000 },
  "gpt-4-turbo": { tpm: 450000, rpm: 500 },
  "gpt-4.1": { tpm: 450000, rpm: 5000 },
  "gpt-4o": { tpm: 450000, rpm: 5000 },
  "gpt-4o-mini": { tpm: 2000000, rpm: 5000 },
  "gpt-4o-mini-realtime-preview": { tpm: 200000, rpm: 400 },
  "gpt-4o-mini-realtime-preview-2024-12-17": { tpm: 200000, rpm: 400 },
  "gpt-4o-realtime-preview": { tpm: 200000, rpm: 400 },
  "gpt-4o-realtime-preview-2024-12-17": { tpm: 200000, rpm: 400 },
  "gpt-4o-realtime-preview-2024-10-01": { tpm: 200000, rpm: 400 },
  "claude-3-opus": { tpm: 450000, rpm: 5000 },  // example for Claude models
  "claude-3-sonnet": { tpm: 450000, rpm: 5000 },
  "claude-3-haiku": { tpm: 2000000, rpm: 5000 },
  "gemini-1.0-pro": { tpm: 450000, rpm: 5000 }, // example for Gemini models
  "default": { tpm: 200000, rpm: 400 }
};

// OpenAI Project ID
const OPENAI_PROJECT_ID = "proj_iwQ4RJz8jIk9GD62jdsDIfZE";

function Dashboard({ isExpanded, isDashboardEnabled, transcriptItems }: DashboardProps) {
  const { loggedEvents, toggleExpand } = useEvent();
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    input: 0,
    output: 0,
    total: 0,
    tpm: 0,
    tpmLimit: DEFAULT_TPM_LIMIT,
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
  const [activeModel, setActiveModel] = useState<string>("default");

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

  // Update time every second for session duration
  useEffect(() => {
    if (!isDashboardEnabled) return;

    const timer = setInterval(() => {
      setCurrentTime(new Date());

      // Decrement reset timer
      setTokenUsage(prev => ({
        ...prev,
        resetTimeSeconds: Math.max(0, prev.resetTimeSeconds - 1)
      }));

      // Reset TPM counter when timer reaches 0
      if (tokenUsage.resetTimeSeconds === 0) {
        setTokenUsage(prev => ({
          ...prev,
          tpm: 0,
          resetTimeSeconds: 60
        }));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [tokenUsage.resetTimeSeconds, isDashboardEnabled]);

  // Extract token usage from events
  useEffect(() => {
    if (!isDashboardEnabled) return;

    let inputTokens = 0;
    let outputTokens = 0;
    let currentModel = "default";

    loggedEvents.forEach(event => {
      // Check for model information
      if (event.direction === "server" && event.eventData?.model) {
        currentModel = event.eventData.model;
        setActiveModel(currentModel);
      }

      // Track token metrics from response.done events
      if (event.eventName === "response.done" && event.direction === "server") {
        const usage = event.eventData?.response?.usage;
        if (usage) {
          // Get total tokens
          const totalTokens = usage.total_tokens || 0;

          // Get input tokens
          const inputDetails = usage.input_token_details;
          if (inputDetails) {
            inputTokens = Math.max(inputTokens, 
              (inputDetails.text_tokens || 0) + 
              (inputDetails.audio_tokens || 0) + 
              (inputDetails.cached_tokens || 0)
            );
          }

          // Get output tokens
          const outputDetails = usage.output_token_details;
          if (outputDetails) {
            outputTokens = Math.max(outputTokens,
              (outputDetails.text_tokens || 0) + 
              (outputDetails.audio_tokens || 0)
            );
          }

          // If no details available, use the direct counts
          if (!inputDetails && !outputDetails) {
            inputTokens = Math.max(inputTokens, usage.input_tokens || 0);
            outputTokens = Math.max(outputTokens, usage.output_tokens || 0);
          }
        }
      }
    });

    // Get the rate limit for the current model or use default
    const modelLimits = MODEL_RATE_LIMITS[currentModel] || MODEL_RATE_LIMITS.default;
    const tpmLimit = modelLimits.tpm;

    // Update token usage
    const total = inputTokens + outputTokens;
    const tpm = Math.min(total, tpmLimit);

    setTokenUsage({
      input: inputTokens,
      output: outputTokens,
      total,
      tpm,
      tpmLimit: tpmLimit,
      resetTimeSeconds: tokenUsage.resetTimeSeconds
    });

    // Calculate cost
    const inputCost = (inputTokens / 1000) * TOKEN_RATES.input;
    const outputCost = (outputTokens / 1000) * TOKEN_RATES.output;
    const totalCost = inputCost + outputCost;

    setCost({
      input: inputCost,
      output: outputCost,
      total: totalCost,
      dailyLimit: 5
    });
  }, [loggedEvents, projectId, tokenUsage.resetTimeSeconds, isDashboardEnabled]);

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

  const filteredEvents = useMemo(() => {
    return loggedEvents
      .filter(event => {
        if (selectedEventType && event.eventName !== selectedEventType) {
          return false;
        }
        return true;
      })
      .reverse();
  }, [loggedEvents, selectedEventType]);

  const [logsExpanded, setLogsExpanded] = useState<boolean>(false);

  const toggleLogsExpanded = () => {
    setLogsExpanded(!logsExpanded);
  };

  const isNearingTpmLimit = tokenUsage.tpm / tokenUsage.tpmLimit > 0.8;
  const isNearingCostLimit = cost.total / cost.dailyLimit > 0.8;
  const showAlert = isNearingTpmLimit || isNearingCostLimit;

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
    <div className="w-full h-full flex flex-col bg-white rounded-xl overflow-hidden">
      <div className="font-semibold text-base px-4 py-2 border-b bg-gray-50">
        Dashboard
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {/* TPM Usage Section with Enhanced UI */}
        <div className="px-4 py-3 border-b bg-white">
          <div className="flex flex-col gap-2">
            {/* Header with reset timer */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="font-bold text-gray-800 text-base">TPM Usage</div>
                <div className={`text-xs px-2 py-0.5 rounded-full ${
                  tokenUsage.tpm / tokenUsage.tpmLimit > 0.8
                    ? 'bg-red-100 text-red-700'
                    : tokenUsage.tpm / tokenUsage.tpmLimit > 0.5
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-green-100 text-green-700'
                }`}>
                  {Math.round((tokenUsage.tpm / tokenUsage.tpmLimit) * 100)}%
                </div>
              </div>
              <div className="flex items-center gap-1 text-sm text-gray-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                <span>Resets in: <span className="font-mono font-semibold">{tokenUsage.resetTimeSeconds}s</span></span>
              </div>
            </div>
            
            {/* Main usage display */}
            <div className="flex items-center gap-2">
              <div className="font-mono text-xl font-bold text-gray-800">
                {tokenUsage.tpm.toLocaleString()}
              </div>
              <div className="text-gray-500 font-mono">
                / {tokenUsage.tpmLimit.toLocaleString()}
              </div>
            </div>
            
            {/* Progress bar with improved styling */}
            <div className="h-2.5 bg-gray-200 rounded-full relative overflow-hidden">
              <div 
                className="h-full rounded-full absolute top-0 left-0 transition-all duration-500"
                style={{ 
                  width: `${Math.min(100, (tokenUsage.tpm / tokenUsage.tpmLimit) * 100)}%`,
                  backgroundImage: tokenUsage.tpm / tokenUsage.tpmLimit > 0.8 
                    ? 'linear-gradient(to right, #ef4444, #f59e0b)' 
                    : tokenUsage.tpm / tokenUsage.tpmLimit > 0.5
                      ? 'linear-gradient(to right, #eab308, #3b82f6)'
                      : 'linear-gradient(to right, #3b82f6, #10b981)' 
                }}
              ></div>
            </div>
            
            {/* Detailed metrics */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:gap-6 text-sm mt-1">
              <div className="flex items-center gap-1.5 p-1">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className="text-gray-600">In:</span>
                <span className="font-mono font-semibold">{tokenUsage.input.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1.5 p-1">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-gray-600">Out:</span>
                <span className="font-mono font-semibold">{tokenUsage.output.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1.5 p-1">
                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                <span className="text-gray-600">Total:</span>
                <span className="font-mono font-semibold">{tokenUsage.total.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1.5 p-1 max-w-full">
                <div className="w-2 h-2 rounded-full bg-gray-500"></div>
                <span className="text-gray-600">Model:</span>
                <span className="font-mono font-semibold truncate" title={activeModel}>
                  {activeModel.length > 15 ? activeModel.substring(0, 15) + '...' : activeModel}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* API Key Status */}
        <div className="px-4 py-3 border-b">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold text-sm">API Key Status</h2>
            <div className={`text-xs px-2 py-0.5 rounded-full ${apiKeyStatus.isPresent ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {apiKeyStatus.isPresent ? 'Present' : 'Missing'}
            </div>
          </div>

          
        </div>

        {/* Agent Status section removed */}

        {/* Breadcrumbs Section (moved from Transcript) */}
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold text-sm mb-2">Agent Breadcrumbs</h2>
          <div className="max-h-64 overflow-auto">
            {transcriptItems
              .filter(item => item.type === "BREADCRUMB" && !item.isHidden)
              .map(item => (
                <div key={item.itemId} className="mb-3 border-b pb-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium">{item.title}</div>
                    <div className="text-xs text-gray-500">{item.timestamp}</div>
                  </div>
                  {item.data && (
                    <div className="mt-1">
                      <details className="text-xs">
                        <summary className="cursor-pointer text-blue-600">View Details</summary>
                        <pre className="mt-1 text-[10px] bg-gray-50 p-2 rounded overflow-auto max-h-32">
                          {JSON.stringify(item.data, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>
              ))}
            {transcriptItems.filter(item => item.type === "BREADCRUMB" && !item.isHidden).length === 0 && (
              <div className="text-gray-500 text-xs italic text-center py-4">
                No breadcrumbs available
              </div>
            )}
          </div>
        </div>

        {/* Logs Explorer - Moved to the bottom */}
        <div className="flex flex-col overflow-hidden border-t mt-auto">
          <div 
            className="flex justify-between items-center px-4 py-2 bg-gray-50 border-b cursor-pointer"
            onClick={toggleLogsExpanded}
          >
            <span className="font-semibold text-sm">Logs Explorer</span>
            <button>
              {logsExpanded ? '▼' : '▶'}
            </button>
          </div>

          {logsExpanded && (
            <>
              <div className="px-3 py-2 border-b flex gap-2 items-center">
                <select 
                  className="border rounded px-2 py-1 text-xs"
                  value={selectedEventType || ""}
                  onChange={(e) => setSelectedEventType(e.target.value || null)}
                >
                  <option value="">All Events</option>
                  {eventTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div className="overflow-auto flex-1 max-h-96">
                <div className="divide-y">
                  {[...filteredEvents].map((log) => {
                    const isError = log.eventName.toLowerCase().includes("error");
                    const directionIcon = log.direction === "client" ? "▲" : "▼";
                    const directionColor = log.direction === "client" ? "text-purple-600" : "text-green-600";
                    const isProjectEvent = log.eventData?.project_id === projectId;

                    return (
                      <div
                        key={log.id}
                        className={`py-1 px-4 text-xs hover:bg-gray-50 cursor-pointer ${isProjectEvent ? 'bg-blue-50' : ''}`}
                        onClick={() => toggleExpand(log.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <span className={`mr-2 ${directionColor}`}>
                              {directionIcon}
                            </span>
                            <span className={isError ? "text-red-600" : ""}>
                              {log.eventName}
                            </span>
                            {isProjectEvent && (
                              <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-1 rounded">
                                project
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            {log.timestamp}
                          </div>
                        </div>

                        {log.expanded && (
                          <div className="mt-1 border-t pt-1">
                            <pre className="text-[10px] overflow-auto whitespace-pre-wrap text-gray-700 bg-gray-50 p-2 rounded">
                              {JSON.stringify(log.eventData, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Alert Banner */}
      {showAlert && (
        <div className={`px-4 py-2 text-white ${isNearingTpmLimit ? 'bg-red-500' : 'bg-orange-500'}`}>
          <div className="flex items-center">
            <span className="mr-2">⚠️</span>
            {isNearingTpmLimit && <span>Warning: Approaching TPM limit ({Math.round(tokenUsage.tpm / tokenUsage.tpmLimit * 100)}%)</span>}
            {!isNearingTpmLimit && isNearingCostLimit && <span>Warning: Approaching daily cost limit (${cost.total.toFixed(2)} / ${cost.dailyLimit.toFixed(2)})</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;