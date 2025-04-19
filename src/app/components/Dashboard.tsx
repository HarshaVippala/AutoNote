"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useEvent } from "../contexts/EventContext";
import { ServerEvent, LoggedEvent } from "../types";

export interface DashboardProps {
  isExpanded: boolean;
  isDashboardEnabled: boolean;
  transcriptItems: any[];
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

function Dashboard({ isExpanded, isDashboardEnabled, transcriptItems }: DashboardProps) {
  const { loggedEvents, toggleExpand } = useEvent();
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
    console.log(`[Calc Effect] Run. Prev count: ${lastProcessedEventCountRef.current}, Current count: ${currentEventCount}, New events: ${newEvents.length}`); // Debug log

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

  // Tracking state for UI components
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [breadcrumbsExpanded, setBreadcrumbsExpanded] = useState(true);

  const toggleLogsExpanded = () => {
    setLogsExpanded(!logsExpanded);
  };

  const toggleBreadcrumbsExpanded = () => {
    setBreadcrumbsExpanded(!breadcrumbsExpanded);
  };

  const isNearingCostLimit = cost.total / cost.dailyLimit > 0.8;
  const showAlert = isNearingCostLimit;

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
      <div className="relative w-full" style={{ minHeight: 36 }}>
        {/* DASHBOARD label, top left, fits inside the border area */}
        <div className="absolute left-4 top-0 flex items-center h-8 z-20">
          <span className="font-bold text-lg tracking-wide text-gray-700" style={{ letterSpacing: 2, fontSize: '1.05rem', marginTop: 0 }}>DASHBOARD</span>
        </div>
        {/* Invisible border for scroll buffer */}
        <div style={{ height: 36, width: '100%', pointerEvents: 'none', borderBottom: '2px solid transparent' }}></div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Empty space or other content could go here */}
        <div className="flex-1">
            {/* This div will grow to fill available space if needed */}
        </div>

        {/* Breadcrumbs Section (moved and made collapsible) */}
        <div className="flex flex-col overflow-hidden border-t">
             <div
                className="flex justify-between items-center px-4 py-2 bg-gray-50 border-b cursor-pointer"
                onClick={toggleBreadcrumbsExpanded}
             >
                <span className="font-semibold text-sm">Agent Breadcrumbs</span>
                <button>
                    {breadcrumbsExpanded ? '▼' : '▶'}
                </button>
             </div>

             {breadcrumbsExpanded && (
                <div className="px-4 py-3">
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
             )}
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
                            {/* Use the original formatted timestamp string for display */}
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
        <div className="px-4 py-2 text-white bg-orange-500">
          <div className="flex items-center">
            <span className="mr-2">⚠️</span>
            <span>Warning: Approaching daily cost limit (${cost.total.toFixed(2)} / ${cost.dailyLimit.toFixed(2)})</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;