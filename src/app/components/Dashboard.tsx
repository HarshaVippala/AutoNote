"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useEvent } from "@/app/contexts/EventContext";
import { ServerEvent } from "@/app/types";

export interface DashboardProps {
  isExpanded: boolean;
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

interface AgentStep {
  name: string;
  status: "not_started" | "processing" | "completed" | "failed";
  timestamp?: string;
}

interface AgentProcess {
  name: string;
  icon: string;
  steps: AgentStep[];
}

// Token pricing rates per 1000 tokens in USD
const TOKEN_RATES = {
  input: 0.01,
  output: 0.03,
};

// Default TPM limit - using gpt-3.5-turbo as default (2M TPM)
const DEFAULT_TPM_LIMIT = 90000;

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
  "default": { tpm: 90000, rpm: 3500 }
};

// OpenAI Project ID
const OPENAI_PROJECT_ID = "proj_iwQ4RJz8jIk9GD62jdsDIfZE";

function Dashboard({ isExpanded }: DashboardProps) {
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

  // Sample agent processes for visualization - this would be dynamically generated from API data
  const [agentProcesses, setAgentProcesses] = useState<AgentProcess[]>([
    {
      name: "conversationAgent",
      icon: "🧠",
      steps: [
        { name: "audio.buffered", status: "completed", timestamp: "1:54:01 PM" },
        { name: "transcript.created", status: "completed", timestamp: "1:54:01 PM" },
        { name: "context.storing", status: "processing", timestamp: "1:54:01 PM" },
        { name: "transfer.triggered", status: "not_started" }
      ]
    },
    {
      name: "responseAgent",
      icon: "🤖",
      steps: [
        { name: "request.received", status: "not_started" },
        { name: "completion.requested", status: "not_started" },
        { name: "tokens.generated", status: "not_started" }
      ]
    }
  ]);

  // Group events by agent name
  const eventsByAgent = useMemo(() => {
    const groupedEvents: Record<string, Record<string, any>[]> = {};
    
    loggedEvents.forEach(event => {
      if (event.direction === "server") {
        const agentName = event.eventData?.item?.name || "unknown";
        if (!groupedEvents[agentName]) {
          groupedEvents[agentName] = [];
        }
        groupedEvents[agentName].push(event.eventData);
      }
    });
    
    return groupedEvents;
  }, [loggedEvents]);
  
  // Extract unique event types for filtering
  const eventTypes = useMemo(() => {
    const types = new Set<string>();
    loggedEvents.forEach(event => {
      types.add(event.eventName);
    });
    return Array.from(types);
  }, [loggedEvents]);
  
  // Update agent processes based on logged events
  useEffect(() => {
    // Map of agent steps configurations
    const agentStepConfigs: Record<string, { icon: string, stepPatterns: string[] }> = {
      "conversationAgent": { 
        icon: "🧠", 
        stepPatterns: ["audio.buffered", "transcript.created", "context.storing", "transfer.triggered"] 
      },
      "responseAgent": { 
        icon: "🤖", 
        stepPatterns: ["request.received", "completion.requested", "tokens.generated"] 
      }
    };
    
    // Initialize agents with default steps (not_started status)
    const initialAgentProcesses: AgentProcess[] = Object.entries(agentStepConfigs).map(([name, config]) => ({
      name,
      icon: config.icon,
      steps: config.stepPatterns.map(pattern => ({ 
        name: pattern, 
        status: "not_started" 
      }))
    }));
    
    // Process events to update step statuses
    loggedEvents.forEach(event => {
      if (event.direction === "server") {
        // Extract event details
        const eventType = event.eventName;
        const agentName = event.eventData?.item?.name || "unknown";
        const timestamp = event.timestamp;
        const isError = eventType.toLowerCase().includes("error") || eventType.toLowerCase().includes("failed");
        
        // Find matching agents and update their step statuses
        initialAgentProcesses.forEach(agent => {
          if (agent.name === agentName) {
            agent.steps.forEach(step => {
              // Match event type to step name patterns
              if (eventType.includes(step.name) || step.name.includes(eventType)) {
                // Update step status
                if (isError) {
                  step.status = "failed";
                } else {
                  // For simplicity, assume all matched events are completed
                  step.status = "completed";
                }
                step.timestamp = timestamp;
              }
            });
          }
        });
      }
    });
    
    // Find the latest active step for each agent and set it to "processing"
    initialAgentProcesses.forEach(agent => {
      // Find the first "not_started" step after any "completed" steps
      const completedSteps = agent.steps.filter(step => step.status === "completed");
      if (completedSteps.length > 0 && completedSteps.length < agent.steps.length) {
        const nextStepIndex = completedSteps.length;
        if (nextStepIndex < agent.steps.length && agent.steps[nextStepIndex].status === "not_started") {
          agent.steps[nextStepIndex].status = "processing";
        }
      }
    });
    
    // Only update state if there are real changes
    if (initialAgentProcesses.length > 0) {
      setAgentProcesses(initialAgentProcesses);
    }
  }, [loggedEvents]);
  
  // Simple function to check for API key status
  const checkApiKeyStatus = (events: any[]) => {
    // Look for the specific fetch_session_token_response event
    const tokenEvents = events.filter(e => e.eventName === "fetch_session_token_response");
    
    if (tokenEvents.length > 0) {
      // Get the latest event
      const latest = tokenEvents[tokenEvents.length - 1];
      const hasError = latest.eventData?.error !== undefined;
      const hasToken = latest.eventData?.client_secret?.value !== undefined;
      
      return {
        isPresent: !hasError && hasToken,
        statusMessage: !hasError && hasToken 
          ? "API Key Configured" 
          : hasError
            ? "API Key Error: " + (latest.eventData?.message || "Authentication failed")
            : "API Key Not Configured"
      };
    }
    
    // Default state when no token events found
    return {
      isPresent: false,
      statusMessage: "API Key Not Configured"
    };
  };
  
  // Update API key status whenever logged events change
  useEffect(() => {
    // Filter for fetch_session_token_response events
    const tokenEvents = loggedEvents.filter(e => e.eventName === "fetch_session_token_response");
    
    if (tokenEvents.length > 0) {
      // Get the latest event and check its status
      const latest = tokenEvents[tokenEvents.length - 1];
      const hasError = latest.eventData?.error !== undefined;
      const hasToken = latest.eventData?.client_secret?.value !== undefined;
      
      setApiKeyStatus({
        isPresent: !hasError && hasToken,
        statusMessage: !hasError && hasToken 
          ? "API Key Configured" 
          : hasError
            ? "API Key Error: " + (latest.eventData?.message || "Authentication failed")
            : "API Key Not Configured"
      });
      
      // Dispatch a custom event that event listeners can use
      const event = new CustomEvent("session_token_response", { 
        detail: { 
          eventName: "fetch_session_token_response",
          eventData: latest.eventData
        } 
      });
      window.dispatchEvent(event);
    }
  }, [loggedEvents]);
  
  // Monitor for real-time session token events to update API key status immediately
  useEffect(() => {
    const handleSessionTokenEvent = (event: CustomEvent) => {
      const eventData = event.detail?.eventData || {};
      const hasError = eventData.error !== undefined;
      const hasToken = eventData.client_secret?.value !== undefined;
      
      setApiKeyStatus({
        isPresent: !hasError && hasToken,
        statusMessage: !hasError && hasToken 
          ? "API Key Configured" 
          : hasError 
            ? "API Key Error: " + (eventData.message || "Authentication failed")
            : "API Key Not Configured"
      });
    };
    
    // Add event listener for session token responses
    window.addEventListener("session_token_response", handleSessionTokenEvent as EventListener);
    
    return () => {
      window.removeEventListener("session_token_response", handleSessionTokenEvent as EventListener);
    };
  }, []);
  
  // Update time every second for session duration
  useEffect(() => {
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
  }, [tokenUsage.resetTimeSeconds]);

  // Extract token usage from events
  useEffect(() => {
    let inputTokens = 0;
    let outputTokens = 0;
    let currentModel = "default";
    
    loggedEvents.forEach(event => {
      // Check for model information
      if (event.direction === "server" && event.eventData?.model) {
        currentModel = event.eventData.model;
        setActiveModel(currentModel);
      }
      
      // Check for direct token usage information from OpenAI API
      if (event.direction === "server" && event.eventData?.usage) {
        inputTokens += event.eventData.usage.prompt_tokens || 0;
        outputTokens += event.eventData.usage.completion_tokens || 0;
      }
      // Check for project_id in request
      if (event.direction === "server" && event.eventData?.project_id === projectId) {
        // Track specific project usage
        if (event.eventData?.usage) {
          inputTokens += event.eventData.usage.prompt_tokens || 0;
          outputTokens += event.eventData.usage.completion_tokens || 0;
        }
      }
      // Alternative check for token usage in standard format
      else if (event.direction === "server" && event.eventData?.type === "tokens.usage") {
        inputTokens += event.eventData.input_tokens || 0;
        outputTokens += event.eventData.output_tokens || 0;
      }
      
      // Simulating token usage for demonstration
      if (event.direction === "server" && event.eventData?.type === "response.done") {
        // Estimate tokens based on content length if available
        const content = event.eventData?.item?.content?.[0]?.text || "";
        if (content) {
          // Rough estimate: 4 characters ~= 1 token
          outputTokens += Math.ceil(content.length / 4);
        }
      }
      
      if (event.direction === "client" && event.eventData?.type === "conversation.item.create") {
        const content = event.eventData?.item?.content?.[0]?.text || "";
        if (content) {
          // Rough estimate: 4 characters ~= 1 token
          inputTokens += Math.ceil(content.length / 4);
        }
      }
    });
    
    // Get the rate limit for the current model or use default
    const modelLimits = MODEL_RATE_LIMITS[currentModel] || MODEL_RATE_LIMITS.default;
    const tpmLimit = modelLimits.tpm;
    
    // Update token usage
    const total = inputTokens + outputTokens;
    const tpm = Math.min(total, tpmLimit); // Simulated TPM based on session tokens
    
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
  }, [loggedEvents, projectId, tokenUsage.resetTimeSeconds]);

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
    return loggedEvents.filter(event => {
      if (selectedAgent && event.eventData?.item?.name !== selectedAgent) {
        return false;
      }
      if (selectedEventType && event.eventName !== selectedEventType) {
        return false;
      }
      return true;
    });
  }, [loggedEvents, selectedAgent, selectedEventType]);

  const isNearingTpmLimit = tokenUsage.tpm / tokenUsage.tpmLimit > 0.8;
  const isNearingCostLimit = cost.total / cost.dailyLimit > 0.8;
  const showAlert = isNearingTpmLimit || isNearingCostLimit;

  if (!isExpanded) {
    return null;
  }

  return (
    <div className="w-full h-full flex flex-col bg-white rounded-xl overflow-hidden">
      <div className="font-semibold text-base px-4 py-2 border-b bg-gray-50">
        Dashboard
      </div>
      
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* TPM Usage Section with Progress Bar */}
        <div className="px-4 py-2 border-b bg-gray-50">
          <div className="flex justify-between items-center mb-1">
            <div className="font-semibold text-sm">TPM Usage:</div>
            <div className="font-mono text-sm">
              {tokenUsage.tpm.toLocaleString()} / {tokenUsage.tpmLimit.toLocaleString()} | <span className="inline-block ml-2">⏱️ Resets in: {tokenUsage.resetTimeSeconds}s</span>
            </div>
          </div>
          <div className="h-2 bg-gray-200 rounded-full mb-2">
            <div 
              className="h-2 rounded-full"
              style={{ 
                width: `${Math.min(100, (tokenUsage.tpm / tokenUsage.tpmLimit) * 100)}%`,
                backgroundImage: tokenUsage.tpm / tokenUsage.tpmLimit > 0.8 
                  ? 'linear-gradient(to right, #ef4444, #f59e0b)' 
                  : 'linear-gradient(to right, #3b82f6, #10b981)' 
              }}
            ></div>
          </div>
          <div className="flex justify-between text-xs font-mono">
            <div>Input: <span className="font-semibold">{tokenUsage.input.toLocaleString()}</span></div>
            <div>Output: <span className="font-semibold">{tokenUsage.output.toLocaleString()}</span></div>
            <div>Total: <span className="font-semibold">{tokenUsage.total.toLocaleString()}</span></div>
            <div>Model: <span className="font-semibold">{activeModel}</span></div>
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
          
          <div className="text-xs mt-2 text-gray-500">
            {apiKeyStatus.statusMessage}
          </div>
        </div>
        
        {/* Cost Explorer */}
        <div className="px-4 py-3 border-b">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-semibold text-sm">Cost Explorer</h2>
            <div className="text-xs text-gray-500 font-mono">
              Project: {projectId.substring(0, 8)}...
            </div>
          </div>
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1">Session Cost:</td>
                <td className="py-1 text-right font-mono">$0.0000</td>
              </tr>
              <tr className="text-xs text-gray-600">
                <td className="py-1">Input cost:</td>
                <td className="py-1 text-right font-mono">$0.0000</td>
              </tr>
              <tr className="text-xs text-gray-600">
                <td className="py-1">Output cost:</td>
                <td className="py-1 text-right font-mono">$0.0000</td>
              </tr>
              <tr>
                <td className="py-1 text-xs">Daily Limit:</td>
                <td className="py-1 text-right font-mono text-xs">$5.00</td>
              </tr>
            </tbody>
          </table>
          <div className="w-full h-1.5 bg-gray-200 rounded-full mt-1">
            <div 
              className="h-1.5 rounded-full bg-green-500"
              style={{ width: `${Math.min(100, (cost.total / cost.dailyLimit) * 100)}%` }}
            ></div>
          </div>
        </div>
        
        {/* Agent Process Timeline */}
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold text-sm mb-2">Agent Process Timeline</h2>
          
          <div className="mb-2 text-xs flex space-x-3 bg-gray-50 p-2 rounded">
            <div className="flex items-center">
              <span className="inline-block w-4 h-4 bg-gray-200 rounded mr-1"></span> Not started
            </div>
            <div className="flex items-center">
              <span className="inline-block w-4 h-4 bg-yellow-400 rounded-full mr-1"></span> Processing
            </div>
            <div className="flex items-center">
              <span className="inline-block w-4 h-4 bg-green-500 rounded mr-1 flex items-center justify-center text-white text-xs">✓</span> Completed
            </div>
            <div className="flex items-center">
              <span className="inline-block w-4 h-4 bg-red-500 rounded mr-1 flex items-center justify-center text-white text-xs">✕</span> Failed
            </div>
          </div>
          
          <div className="space-y-4 max-h-64 overflow-auto pr-1">
            {agentProcesses.map((agent, idx) => (
              <div key={idx} className="border rounded-lg overflow-hidden">
                <div className="flex items-center text-sm font-medium p-2 bg-gray-50 border-b">
                  <span className="mr-2">{agent.icon}</span>
                  {agent.name}
                </div>
                <div className="p-4">
                  <div className="flex items-center">
                    {agent.steps.map((step, stepIdx) => {
                      // Determine styling based on status
                      let statusElement;
                      let lineColor = "bg-blue-400";
                      
                      if (step.status === "completed") {
                        statusElement = (
                          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white">
                            ✓
                          </div>
                        );
                      } else if (step.status === "processing") {
                        statusElement = (
                          <div className="w-8 h-8 rounded-full border-2 border-yellow-400 bg-white flex items-center justify-center text-yellow-400">
                            ●
                          </div>
                        );
                        lineColor = "bg-yellow-400";
                      } else if (step.status === "failed") {
                        statusElement = (
                          <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white">
                            ✕
                          </div>
                        );
                        lineColor = "bg-gray-200";
                      } else {
                        statusElement = (
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
                            {stepIdx + 1}
                          </div>
                        );
                        lineColor = "bg-gray-200";
                      }
                      
                      return (
                        <React.Fragment key={stepIdx}>
                          <div className="flex flex-col items-center">
                            {statusElement}
                            <div className="text-xs mt-2 max-w-[120px] text-center truncate" title={step.name}>
                              {step.name}
                            </div>
                          </div>
                          
                          {/* Line between steps */}
                          {stepIdx < agent.steps.length - 1 && (
                            <div className={`h-0.5 flex-1 ${lineColor} mx-1`}></div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="text-xs text-gray-500 mt-2 italic">
            Each row represents an agent process flow. Circles show step status.
          </div>
        </div>
        
        {/* Logs Explorer */}
        <div className="flex flex-col flex-1 overflow-hidden border-t">
          <div className="flex justify-between items-center px-4 py-2 bg-gray-50 border-b">
            <span className="font-semibold text-sm">Logs Explorer</span>
            <label className="flex items-center text-xs">
              <input
                type="checkbox"
                checked={developerMode}
                onChange={() => setDeveloperMode(!developerMode)}
                className="mr-1 h-3 w-3"
              />
              Developer Mode
            </label>
          </div>
          
          <div className="px-3 py-2 border-b flex gap-2 items-center">
            <select 
              className="border rounded px-2 py-1 text-xs"
              value={selectedAgent || ""}
              onChange={(e) => setSelectedAgent(e.target.value || null)}
            >
              <option value="">All Agents</option>
              {Object.keys(eventsByAgent).map(agent => (
                <option key={agent} value={agent}>{agent}</option>
              ))}
            </select>
            
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
          
          <div className="overflow-auto flex-1">
            <div className="divide-y">
              {filteredEvents.map((log) => {
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
                        <pre className="text-[10px] overflow-auto max-h-32 whitespace-pre-wrap text-gray-700 bg-gray-50 p-2 rounded">
                          {JSON.stringify(log.eventData, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
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