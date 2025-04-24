"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import Image from "next/image";
import { createParser } from 'eventsource-parser';

// UI components
import Transcript from "./components/Transcript";
import Dashboard from "./components/Dashboard";
import TopControls from "./components/TopControls";
import MobileSwipeContainer from "./components/MobileSwipeContainer";
import CodePane from './components/CodePane';
import AnalysisPane from './components/AnalysisPane';

// Types
import { AgentConfig, ConnectionState, TranscriptItem, TranscriptTurn, TabData } from "@/app/types";

// Context providers & hooks
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { useEvent } from "@/app/contexts/EventContext";
import { useStatus, StatusProvider } from "@/app/contexts/StatusContext";
import { useTheme } from "./contexts/ThemeContext";

// Agent configs
import { allAgentSets, defaultAgentSetKey } from "@/app/agentConfigs";

// This might require exporting it from TopControls.tsx first.
type WebRTCConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'failed' | 'error';

// Define Props interface for the new inner component
interface AppContentProps {
  connectionState: ConnectionState;
  isMicrophoneMuted: boolean;
  setIsMicrophoneMuted: (muted: boolean) => void;
  onToggleConnection: () => void;
  handleMicStatusUpdate: (status: WebRTCConnectionStatus) => void;
  handleSpeakerStatusUpdate: (status: WebRTCConnectionStatus) => void;
  connectTrigger: number;
  disconnectTrigger: number;
  // Add any other props passed down from App
  transcriptItems: TranscriptItem[]; // Still needed for Dashboard
  userText: string;
  setUserText: (text: string) => void;
  isMobileView: boolean | null;
  setActiveMobilePanel: (panel: number) => void;
  activeMobilePanel: number;
  micConnectionStatus: WebRTCConnectionStatus;
  speakerConnectionStatus: WebRTCConnectionStatus;
  onReconnectMic: () => void;
  onReconnectSpeaker: () => void;
  fontSize: number;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
}

// Define types for the structured responses matching the backend
// (These could be moved to @/app/types/index.ts later)
interface AnalysisResponse { 
  planning_steps: string[];
  complexity: {
    time: string;
    space: string;
  };
  explanation: string;
}

interface CodeResponse { 
  language: string;
  code: string;
  explanation: string;
}

// Temporarily extend TabData with structuredAnalysis if not already present
interface LocalTabData extends TabData {
  structuredAnalysis?: AnalysisResponse;
}

// Define the expected API response structure
interface ApiResponse {
  response_id: string;
  analysis?: AnalysisResponse;
  code_data?: CodeResponse; // Matches backend key
}

// --- New Inner Component --- 
function AppContent({ 
  connectionState, 
  isMicrophoneMuted, 
  setIsMicrophoneMuted, 
  onToggleConnection, 
  handleMicStatusUpdate,
  handleSpeakerStatusUpdate,
  connectTrigger,
  disconnectTrigger,
  transcriptItems, // Destructure props
  userText,
  setUserText,
  isMobileView,
  setActiveMobilePanel,
  activeMobilePanel,
  micConnectionStatus,
  speakerConnectionStatus,
  onReconnectMic,
  onReconnectSpeaker,
  fontSize,
  increaseFontSize,
  decreaseFontSize,
}: AppContentProps) {
  // Hooks that need context can be called here
  const { chatStatus, setChatStatus, setPreviousChatSuccess } = useStatus();
  const { addTranscriptMessage, addTranscriptBreadcrumb } = useTranscript();
  const MAX_HISTORY_LENGTH = 10; // Define max history length here - might become redundant but keep for now if other history needs it
  
  // State for the active tab in CodePane/AnalysisPane
  const [activeTabKey, setActiveTabKey] = useState<string | null>(null);
  const [tabData, setTabData] = useState<LocalTabData[]>([]); // Start with empty tabs
  const [tabCounter, setTabCounter] = useState<number>(1); // Counter for unique tab keys/filenames
  const [lastResponseId, setLastResponseId] = useState<string | null>(null);

  // Add theme hook
  const { theme } = useTheme();

  // Move handleProcessTurn here as it uses context hooks
  const handleProcessTurn = useCallback(async (turn: TranscriptTurn) => {
    console.log('[AppContent] Received turn to process:', turn);

    const speakerSaid = turn.speakerTranscript;

    if (!speakerSaid) {
      console.log('[AppContent] No Speaker transcript content to process, skipping API calls');
      return;
    }

    console.log(`[AppContent] Requesting analysis for prompt: "${speakerSaid}"`);

    setChatStatus('processing');
    setPreviousChatSuccess(false);
    const currentTabId = tabCounter; // Capture current counter for this request
    let accumulatedData: any = {}; // To store data across events (like tool args)
    let currentToolName: string | null = null;
    let currentResponseId: string | null = null;
    let currentOutputItemId: string | null = null;
    let currentContentPartText = "";
    let currentFunctionArgs = "";

    try {
      const messages = [
        { role: 'user', content: `Speaker: ${speakerSaid}` }
      ];

      const response = await fetch('/api/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: messages, 
          previous_response_id: lastResponseId
        }),
      });

      if (!response.ok) {
        console.error('[AppContent] API call failed:', response.status);
        const errorText = await response.text();
        throw new Error(`API Error (${response.status}): ${errorText}`);
      }

      if (!response.body) {
        throw new Error("Response body is null");
      }

      // --- Use eventsource-parser with correct callback structure ---
      const parser = createParser({ 
          onEvent: (event: any) => { // Correct callback name
            if (event.type === 'event') { 
                if (event.event === 'error') {
                    console.error("[AppContent] Received error event from stream:", event.data);
                    try {
                        const errorData = JSON.parse(event.data);
                        throw new Error(`Stream Error: ${errorData.message || event.data}`);
                    } catch (e) {
                        throw new Error(`Stream Error: ${event.data}`);
                    }
                }

                if (!event.data) {
                    console.warn("[AppContent] Received empty data event:", event);
                    return; // Skip empty data payloads
                }

                try {
                    const parsedData = JSON.parse(event.data);
                    const eventType = event.event; // The event type from SSE

                    // Update lastResponseId if present in the event
                    if (parsedData.response?.id) {
                        currentResponseId = parsedData.response.id;
                    }
                    if (parsedData.item_id) {
                        currentOutputItemId = parsedData.item_id;
                    }

                    // Handle different event types based on Responses API spec
                    switch (eventType) {
                        case 'response.created':
                            console.log("[AppContent] Stream Event: response.created", parsedData);
                            setLastResponseId(parsedData.response.id);
                            break;
                        case 'response.in_progress':
                            // Potentially update UI to show progress
                            break;
                        case 'response.output_item.added':
                            console.log("[AppContent] Stream Event: response.output_item.added", parsedData);
                            // You might initialize state for this item here
                            break;
                        case 'response.content_part.added':
                            console.log("[AppContent] Stream Event: response.content_part.added", parsedData);
                            // Reset text for new content part
                            currentContentPartText = ""; 
                            break;
                        case 'response.output_text.delta':
                            // console.log("[AppContent] Stream Event: response.output_text.delta", parsedData.delta);
                            currentContentPartText += parsedData.delta;
                            // TODO: Update UI with streaming text incrementally
                            // Example: setTabData(prev => updateTabText(prev, currentTabId, currentContentPartText));
                            break;
                        case 'response.output_text.done':
                            console.log("[AppContent] Stream Event: response.output_text.done", parsedData);
                            currentContentPartText = parsedData.text; // Ensure final text is captured
                            // Store the final text associated with the simple explanation tool
                            accumulatedData = { explanation: currentContentPartText }; 
                            currentToolName = 'format_simple_explanation'; // Assume text output means simple explanation for now
                            break;
                        case 'response.function_call_arguments.delta':
                            // console.log("[AppContent] Stream Event: response.function_call_arguments.delta", parsedData.delta);
                            currentFunctionArgs += parsedData.delta;
                            break;
                        case 'response.function_call_arguments.done':
                            console.log("[AppContent] Stream Event: response.function_call_arguments.done", parsedData);
                            currentFunctionArgs = parsedData.arguments; // Final arguments
                            try {
                                accumulatedData = JSON.parse(currentFunctionArgs);
                                // Need to determine the tool name. This isn't explicitly in this event.
                                // We might need to look at response.output_item.added or assume based on structure.
                                // For now, let's try to infer based on expected schemas.
                                if (accumulatedData.planning_steps && accumulatedData.code) {
                                    currentToolName = 'format_comprehensive_code';
                                } else if (accumulatedData.situation && accumulatedData.action) {
                                    currentToolName = 'format_behavioral_star_answer';
                                } else {
                                    console.warn("[AppContent] Could not determine tool name from function args structure.");
                                    // Fallback? Or rely on a prior event?
                                }
                                console.log(`[AppContent] Parsed function args for tool: ${currentToolName}`, accumulatedData);
                            } catch (jsonError) {
                                console.error('[AppContent] Failed to parse final function arguments JSON:', jsonError);
                                console.error('[AppContent] Accumulated Function Args String was:', currentFunctionArgs);
                                throw new Error("Failed to parse function arguments from stream.");
                            }
                            break;
                        // Add cases for other events as needed (e.g., file_search, web_search, reasoning, etc.)
                        case 'response.completed':
                            console.log("[AppContent] Stream Event: response.completed", parsedData);
                            setChatStatus('done');
                            setPreviousChatSuccess(true);
                            break;
                        case 'response.failed':
                        case 'response.incomplete':
                            console.error(`[AppContent] Stream Event: ${eventType}`, parsedData);
                            setChatStatus('error');
                            setPreviousChatSuccess(false);
                            const errorMsg = parsedData.response?.error?.message || parsedData.response?.incomplete_details?.reason || 'Unknown stream error';
                            addTranscriptMessage(uuidv4(), 'assistant', `Error: ${errorMsg}`);
                            break;
                        default:
                            console.log(`[AppContent] Unhandled Stream Event: ${eventType}`, parsedData);
                    }

                } catch (e) {
                    console.error("[AppContent] Failed to parse event data JSON:", e);
                    console.error("[AppContent] Raw event data was:", event.data);
                    // Decide how to handle parse errors - maybe ignore or show an error
                }
            } else if (event.type === 'reconnect-interval') { // This logic was inside onEvent, moving it out is complex, keeping simple fix for now
                console.log("[AppContent] Received reconnect-interval event, ignoring.", event.value);
            }
        }
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        const chunk = decoder.decode(value, { stream: !done });
        parser.feed(chunk);
      }

      // --- Post-Stream Processing ---
      console.log('[AppContent] Stream finished. Final Accumulated Data:', accumulatedData);
      console.log('[AppContent] Final Tool Name:', currentToolName);
      if (currentResponseId) {
          console.log("[AppContent] Final Response ID:", currentResponseId);
      }

      // Check if we actually got data and a tool determination
      // if (Object.keys(accumulatedData).length === 0 || !currentToolName) {
      //     // Only treat this as an error if the stream *didn't* complete successfully or already errored
      //     if (chatStatus === 'error') {
      //        // Error already happened during stream (e.g., response.failed)
      //        console.error("[AppContent] Stream finished after encountering an error, and no valid tool data was accumulated.");
      //        // Message should have already been added by the error handler in the stream loop
      //     } else if (chatStatus !== 'done') {
      //        // Stream didn't complete successfully but wasn't explicitly 'error' either? Unexpected state.
      //        console.error("[AppContent] Stream finished unexpectedly without completing ('done' status) and no valid tool data.");
      //        addTranscriptMessage(uuidv4(), 'assistant', `Error: Unexpected incomplete response from stream.`);
      //        setChatStatus('error'); // Set error for this unexpected state
      //        setPreviousChatSuccess(false);
      //     } else {
      //        // Stream completed ('done') but no specific tool output was generated.
      //        // This might be okay. Log a warning instead of error.
      //        console.warn("[AppContent] Stream finished successfully, but no specific tool output or text explanation was generated.");
      //        // Ensure status remains 'done' and success state reflects completion
      //        setPreviousChatSuccess(true); 
      //        // Optional: Add a neutral breadcrumb or message if needed
      //        // addTranscriptBreadcrumb("Assistant turn completed.");
      //     }
      //     return; // Stop processing since there's no structured data to render
      // }

      // --- Update State with Final Data ---
      // (Rest of the function proceeds only if accumulatedData and currentToolName are valid)
      const newTabKey = `solution-${currentTabId}`;
      let newTabData: LocalTabData;

      // Adapt TabData creation based on the determined tool
      if (currentToolName === 'format_comprehensive_code') {
        // Validate structure (basic check)
        if (!accumulatedData.planning_steps || !accumulatedData.language || !accumulatedData.code || !accumulatedData.complexity || !accumulatedData.explanation) {
             throw new Error("Final data does not match ComprehensiveCodeSchema structure.");
        }
        newTabData = {
          key: newTabKey,
          filename: `Solution-${currentTabId}.${accumulatedData.language === 'plaintext' ? 'txt' : accumulatedData.language}`,
          language: accumulatedData.language,
          code: accumulatedData.code,
          analysis: accumulatedData.explanation, 
          structuredAnalysis: accumulatedData, 
        };
      } else if (currentToolName === 'format_simple_explanation') {
        if (!accumulatedData.explanation) {
             throw new Error("Final data does not match SimpleExplanationSchema structure.");
        }
        newTabData = {
            key: newTabKey,
            filename: `Explanation-${currentTabId}.txt`,
            language: 'plaintext',
            code: accumulatedData.explanation, 
            analysis: accumulatedData.explanation,
        };
      } else if (currentToolName === 'format_behavioral_star_answer') {
           if (!accumulatedData.situation || !accumulatedData.task || !accumulatedData.action || !accumulatedData.result) {
             throw new Error("Final data does not match BehavioralStarSchema structure.");
           }
           // Decide how to display STAR - maybe analysis pane?
           const formattedAnalysis = `Situation: ${accumulatedData.situation}\nTask: ${accumulatedData.task}\nAction: ${accumulatedData.action}\nResult: ${accumulatedData.result}`;
           newTabData = {
               key: newTabKey,
               filename: `Behavioral-${currentTabId}.md`,
               language: 'markdown',
               code: formattedAnalysis, // Display in code pane as markdown
               analysis: formattedAnalysis,
           };
      } else {
        console.warn("[AppContent] Creating fallback tab data due to unknown final tool name.");
        newTabData = {
          key: newTabKey,
          filename: `Response-${currentTabId}.txt`,
          language: 'plaintext',
          code: JSON.stringify(accumulatedData, null, 2), // Show stringified data as fallback
          analysis: "Unknown response data format.",
        };
      }

      setTabData(prev => [...prev, newTabData]);
      setActiveTabKey(newTabKey);
      setTabCounter(prev => prev + 1);

      // Add breadcrumb
      addTranscriptBreadcrumb(`Generated ${newTabData.filename}`, { 
          analysisSummary: newTabData.analysis?.substring(0, 150) + '...', 
          codePreview: newTabData.code?.substring(0, 100) + '...' 
      });

    } catch (error) {
      console.error('[AppContent] Error during stream processing:', error);
      addTranscriptMessage(uuidv4(), 'assistant', `Error processing stream: ${(error as Error).message}`);
      setChatStatus('error');
      setPreviousChatSuccess(false);
    }
  }, [addTranscriptMessage, addTranscriptBreadcrumb, setChatStatus, setPreviousChatSuccess, lastResponseId, tabCounter, chatStatus]);

  // Return the main layout structure
  return (
      <div className={`text-base flex flex-col h-screen ${theme === 'dark' ? 'bg-gray-800 text-gray-200' : 'bg-gray-100 text-gray-800'} relative rounded-xl`}>
        <TopControls
          appConnectionState={connectionState}
          isMicrophoneMuted={isMicrophoneMuted}
          setIsMicrophoneMuted={setIsMicrophoneMuted}
          onToggleConnection={onToggleConnection}
          isMobileView={isMobileView}
          setActiveMobilePanel={setActiveMobilePanel}
          activeMobilePanel={activeMobilePanel}
          triggerConnect={connectTrigger}
          triggerDisconnect={disconnectTrigger}
          onMicStatusChange={handleMicStatusUpdate}
          onProcessTurn={handleProcessTurn} // Use the locally defined handler
          onSpeakerStatusChange={handleSpeakerStatusUpdate}
          onReconnectMic={onReconnectMic}
          onReconnectSpeaker={onReconnectSpeaker}
        />

        {/* --- Render content based on isMobileView --- */}
        {isMobileView !== null ? (
          <>
            { /* ... mobile indicator ... */ }
             {isMobileView && (
              <div className={`relative w-full h-1 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded-full`}>
                <div
                  className="absolute top-0 left-0 h-full bg-blue-500 rounded-full transition-all duration-300 ease-in-out"
                  style={{
                    width: `${100 / 3}%`,
                    transform: `translateX(${activeMobilePanel * 100}%)`
                  }}
                />
              </div>
            )}

            {isMobileView !== null && (
                !isMobileView ? (
                  // --- Desktop Layout ---
                  <div className="flex flex-1 gap-1 px-2 pb-2 overflow-hidden rounded-xl">
                    {/* Main 3-Pane Area using fixed divs and flexbox */}
                    <div className="flex-1 flex flex-row h-full gap-1">
                        {/* Pane 1: Conversation (Left) - 35% */}
                        <div className="basis-[35%] flex-shrink-0">
                          <div className={`flex flex-col h-full rounded-xl ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'} border p-2 overflow-hidden`}>
                            <div className="flex-1 overflow-y-auto"> {/* Added wrapper for scroll */}
                              <Transcript
                                userText={userText}
                                setUserText={setUserText}
                                onSendMessage={() => { console.warn("Send message not implemented yet."); }}
                                canSend={false}
                                fontSize={fontSize}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Pane 2: Code Implementation (Middle) - 35% */}
                        <div className="basis-[35%] flex-shrink-0">
                          <div className={`flex flex-col h-full rounded-xl ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'} border p-2 overflow-hidden`}>
                            <div className="flex-1 overflow-y-auto"> {/* Added wrapper for scroll */}
                              <CodePane 
                                theme={theme} 
                                activeTabKey={activeTabKey ?? ''}
                                onTabChange={setActiveTabKey} 
                                tabs={tabData as TabData[]}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Pane 3: Algorithm Analysis (Right) - 30% */}
                        <div className="basis-[30%] flex-shrink-0">
                          <div className={`flex flex-col h-full rounded-xl ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'} border p-2 overflow-hidden`}>
                            <div className="flex-1 overflow-y-auto"> {/* Added wrapper for scroll */}
                              <AnalysisPane 
                                theme={theme} 
                                activeTabKey={activeTabKey ?? ''}
                                tabs={tabData as TabData[]}
                              />
                            </div>
                          </div>
                        </div>
                    </div>

                    {/* Separate Dashboard Sidebar (Far Right - Unchanged) */}
                    <div style={{ width: "48px", minWidth: "48px", maxWidth: "48px", alignSelf: "stretch", flexShrink: 0 }} className={`rounded-xl ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'} border`}>
                      <Dashboard
                        isExpanded={true}
                        isDashboardEnabled={true}
                        transcriptItems={transcriptItems}
                        isMicrophoneMuted={isMicrophoneMuted}
                        micConnectionStatus={micConnectionStatus}
                        speakerConnectionStatus={speakerConnectionStatus}
                        onMuteToggle={() => setIsMicrophoneMuted(!isMicrophoneMuted)}
                        onReconnectMic={onReconnectMic}
                        onReconnectSpeaker={onReconnectSpeaker}
                        fontSize={fontSize}
                        increaseFontSize={increaseFontSize}
                        decreaseFontSize={decreaseFontSize}
                      />
                    </div>
                  </div>
                ) : (
                   // --- Mobile Layout --- 
                  <MobileSwipeContainer
                    activeMobilePanel={activeMobilePanel}
                    setActiveMobilePanel={setActiveMobilePanel}
                    isEventsPaneExpanded={true} // Adjust as needed
                  >
                     {/* Panel 1: Transcript Input */}
                    <Transcript
                      userText={userText}
                      setUserText={setUserText}
                      onSendMessage={() => { console.warn("Send message not implemented yet."); }}
                      canSend={false}
                      fontSize={fontSize}
                    />
                     {/* Panel 2: Dashboard */}
                    <div style={{ width: "48px", minWidth: "48px", maxWidth: "48px" }} className={`h-full rounded-xl border ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}>
                      <Dashboard
                        isExpanded={true}
                        isDashboardEnabled={true}
                        transcriptItems={transcriptItems}
                        isMicrophoneMuted={isMicrophoneMuted}
                        micConnectionStatus={micConnectionStatus}
                        speakerConnectionStatus={speakerConnectionStatus}
                        onMuteToggle={() => setIsMicrophoneMuted(!isMicrophoneMuted)}
                        onReconnectMic={onReconnectMic}
                        onReconnectSpeaker={onReconnectSpeaker}
                        fontSize={fontSize}
                        increaseFontSize={increaseFontSize}
                        decreaseFontSize={decreaseFontSize}
                      />
                    </div>
                  </MobileSwipeContainer>
                )
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center"> 
             {/* Optional: Loading indicator */}
          </div>
        )}
      </div>
  );
}


// --- Main App Component --- 
function App() {
  const searchParams = useSearchParams();
  const { transcriptItems, addTranscriptMessage, addTranscriptBreadcrumb } =
    useTranscript();
  const {
    loggedEvents,
    logClientEvent,
    logServerEvent,
  } = useEvent();
  // App manages state NOT provided by StatusContext
  const [selectedAgentName, setSelectedAgentName] = useState<string>("");
  const [selectedAgentConfigSet, setSelectedAgentConfigSet] =
    useState<AgentConfig[] | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("INITIAL");
  const [isMicrophoneMuted, setIsMicrophoneMuted] = useState<boolean>(false);
  const [userText, setUserText] = useState<string>("");
  const [activeMobilePanel, setActiveMobilePanel] = useState<number>(0);
  const [isMobileView, setIsMobileView] = useState<boolean | null>(null);
  const [connectTrigger, setConnectTrigger] = useState(0);
  const [disconnectTrigger, setDisconnectTrigger] = useState(0);
  // Add state for speaker connection status
  const [micConnectionStatus, setMicConnectionStatus] = useState<WebRTCConnectionStatus>('disconnected');
  const [speakerConnectionStatus, setSpeakerConnectionStatus] = useState<WebRTCConnectionStatus>('disconnected');
  // Add font size state
  const [fontSize, setFontSize] = useState<number>(14);

  // Font size adjustment functions
  const increaseFontSize = useCallback(() => {
    setFontSize(prev => Math.min(24, prev + 1));
  }, []);

  const decreaseFontSize = useCallback(() => {
    setFontSize(prev => Math.max(8, prev - 1));
  }, []);

  // --- Callbacks modifying App state --- 
  const handleMicStatusUpdate = useCallback((status: WebRTCConnectionStatus) => {
    console.log(`App received mic status update: ${status}`);
    setMicConnectionStatus(status); // Track mic connection status
    switch (status) {
      case 'connecting': setConnectionState('CONNECTING'); break;
      case 'connected': setConnectionState('CONNECTED'); break;
      case 'disconnected': setConnectionState('DISCONNECTED'); break;
      case 'failed': case 'error': setConnectionState('ERROR'); break;
      default: setConnectionState('INITIAL');
    }
  }, []);

  // Add handler for speaker status updates
  const handleSpeakerStatusUpdate = useCallback((status: WebRTCConnectionStatus) => {
    console.log(`App received speaker status update: ${status}`);
    setSpeakerConnectionStatus(status); // Track speaker connection status
  }, []);

  // Add reconnection functions
  const handleReconnectMic = useCallback(() => {
    console.log("App: Requesting mic reconnection...");
    setConnectTrigger(c => c + 1);
  }, []);

  const handleReconnectSpeaker = useCallback(() => {
    console.log("App: Requesting speaker reconnection...");
    // For specific speaker reconnection, we'll need to create a new trigger
    // or modify the TopControls to accept a stream type parameter
    setConnectTrigger(c => c + 1);
  }, []);

  const onToggleConnection = useCallback(() => {
    if (connectionState === "CONNECTED" || connectionState === "CONNECTING") {
      console.log("App: Requesting disconnect via trigger...");
      setDisconnectTrigger(c => c + 1);
    } else {
      console.log("App: Requesting connect via trigger...");
      setConnectTrigger(c => c + 1);
    }
  }, [connectionState]);

  // Move handleSelectedAgentChange here if it doesn't need StatusContext
  const handleSelectedAgentChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const newAgentName = e.target.value;
    setSelectedAgentName(newAgentName);
    // Maybe add breadcrumb here or pass setSelectedAgentName down if needed elsewhere
     const currentAgent = selectedAgentConfigSet?.find(a => a.name === newAgentName);
     if (currentAgent) {
        addTranscriptBreadcrumb(`Agent Selected: ${newAgentName}`, currentAgent);
     }
  };

  // --- Effects managing App state --- 
   useEffect(() => {
    let finalAgentConfig = searchParams.get("agentConfig");
    if (!finalAgentConfig || !allAgentSets[finalAgentConfig]) {
      finalAgentConfig = defaultAgentSetKey;
      const url = new URL(window.location.toString());
      url.searchParams.set("agentConfig", finalAgentConfig);
      window.location.replace(url.toString());
      return;
    }
    const agents = allAgentSets[finalAgentConfig];
    const agentKeyToUse = agents[0]?.name || "";
    setSelectedAgentName(agentKeyToUse);
    setSelectedAgentConfigSet(agents);
  }, [searchParams]);

  useEffect(() => {
    // Agent selection breadcrumb logic might move or be adjusted
    if (connectionState === "CONNECTED" && selectedAgentConfigSet && selectedAgentName) {
       const currentAgent = selectedAgentConfigSet.find(a => a.name === selectedAgentName);
       addTranscriptBreadcrumb(`Agent Initialized: ${selectedAgentName}`, currentAgent);
    }
  }, [selectedAgentConfigSet, selectedAgentName, connectionState, addTranscriptBreadcrumb]);

  useEffect(() => {
    const storedMicMuted = localStorage.getItem("microphoneMuted");
    if (storedMicMuted) setIsMicrophoneMuted(storedMicMuted === "true");
  }, []);

  useEffect(() => {
    localStorage.setItem("microphoneMuted", isMicrophoneMuted.toString());
  }, [isMicrophoneMuted]);

  useEffect(() => {
    const checkMobileView = () => setIsMobileView(window.innerWidth <= 640);
    checkMobileView();
    window.addEventListener('resize', checkMobileView);
    return () => window.removeEventListener('resize', checkMobileView);
  }, []);

  // Render StatusProvider wrapping AppContent
  return (
    <StatusProvider>
      <AppContent 
        // Pass all necessary state and callbacks down
        connectionState={connectionState}
        isMicrophoneMuted={isMicrophoneMuted}
        setIsMicrophoneMuted={setIsMicrophoneMuted}
        onToggleConnection={onToggleConnection}
        handleMicStatusUpdate={handleMicStatusUpdate}
        handleSpeakerStatusUpdate={handleSpeakerStatusUpdate}
        connectTrigger={connectTrigger}
        disconnectTrigger={disconnectTrigger}
        transcriptItems={transcriptItems}
        userText={userText}
        setUserText={setUserText}
        isMobileView={isMobileView}
        setActiveMobilePanel={setActiveMobilePanel}
        activeMobilePanel={activeMobilePanel}
        micConnectionStatus={micConnectionStatus}
        speakerConnectionStatus={speakerConnectionStatus}
        onReconnectMic={handleReconnectMic}
        onReconnectSpeaker={handleReconnectSpeaker}
        fontSize={fontSize}
        increaseFontSize={increaseFontSize}
        decreaseFontSize={decreaseFontSize}
      />
    </StatusProvider>
  );
}

export default App;
