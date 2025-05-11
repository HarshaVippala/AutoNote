"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import Image from "next/image";
import { createParser } from 'eventsource-parser';
import { logger } from '@/lib/logger';

// Set logger level at the beginning
logger.setLevel('INFO'); // Changed from ERROR to INFO to see diagnostic logs

// UI components
// UI components
import Transcript from "../components/Transcript";
import TopControls from "../components/TopControls";
import DraggablePanelLayout from '../components/DraggablePanelLayout';

// Types
import { AgentConfig, AppConnectionState as ConnectionState, TranscriptItem, TranscriptTurn, TabData } from "@/types";

// Define StarData alias locally for clarity
type StarData = Record<string, any>;

// Context providers & hooks
import { useTranscript } from "@/contexts/TranscriptContext";
import { useEvent } from "@/contexts/EventContext";
import { useStatus } from "@/contexts/StatusContext"; // Removed StatusProvider import
import { useTheme } from "../contexts/ThemeContext";
// Define WebRTC status type locally
type WebRTCConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'failed' | 'error';

// Extend TabData locally for state management including followUps
interface LocalTabData extends TabData {
  followUps?: StarData[];
  responseId?: string | null;
  functionCall?: {
    id: string;
    call_id: string;
    name: string;
    arguments: string;
  };
}

// Define Props interface for the inner component
interface AppContentProps {
  connectionState: ConnectionState;
  isMicrophoneMuted: boolean;
  setIsMicrophoneMuted: (muted: boolean) => void;
  onToggleConnection: () => void;
  handleMicStatusUpdate: (status: WebRTCConnectionStatus) => void;
  handleSpeakerStatusUpdate: (status: WebRTCConnectionStatus) => void;
  handleProcessTurn: (event: any) => void; // Prop for processing raw events
  connectTrigger: number;
  disconnectTrigger: number;
  transcriptItems: TranscriptItem[];
  userText: string;
  setUserText: (text: string) => void;
  micConnectionStatus: WebRTCConnectionStatus;
  speakerConnectionStatus: WebRTCConnectionStatus;
  onReconnectMic: () => void;
  onReconnectSpeaker: () => void;
  onCycleViewRequest: () => void;
  cycleViewTrigger: number;
  // Props passed down from App
  activeTabKey: string | null;
  setActiveTabKey: (key: string | null) => void;
  tabData: LocalTabData[];
}

// --- Inner Component: AppContent ---
// Renders the UI layout, receiving state and handlers from App
function AppContent({
  connectionState,
  isMicrophoneMuted,
  setIsMicrophoneMuted,
  onToggleConnection,
  handleMicStatusUpdate,
  handleSpeakerStatusUpdate,
  handleProcessTurn, // Receive the raw event handler prop
  connectTrigger,
  disconnectTrigger,
  transcriptItems,
  userText,
  setUserText,
  micConnectionStatus,
  speakerConnectionStatus,
  onReconnectMic,
  onReconnectSpeaker,
  onCycleViewRequest,
  cycleViewTrigger,
  // Receive state props from App
  activeTabKey,
  setActiveTabKey,
  tabData,
}: AppContentProps) {
  const { theme } = useTheme();

  return (
      <div className={`text-base flex flex-col h-screen w-screen ${theme === 'dark' ? 'bg-slate-900 text-slate-200' : 'bg-slate-100 text-slate-800'} relative`}>
        <TopControls
          appConnectionState={connectionState}
          isMicrophoneMuted={isMicrophoneMuted}
          setIsMicrophoneMuted={setIsMicrophoneMuted}
          onToggleConnection={onToggleConnection}
          triggerConnect={connectTrigger}
          triggerDisconnect={disconnectTrigger}
          onMicStatusChange={handleMicStatusUpdate}
          onProcessTurn={handleProcessTurn} // Pass the raw event handler received from App
          onSpeakerStatusChange={handleSpeakerStatusUpdate}
          onReconnectMic={onReconnectMic}
          onReconnectSpeaker={onReconnectSpeaker}
          micConnectionStatus={micConnectionStatus}
          onCycleViewRequest={onCycleViewRequest}
        />
        <div className="flex flex-col flex-1 gap-1 overflow-hidden">
          <div className={`flex-1 ${theme === 'dark' ? 'bg-slate-900' : 'bg-slate-100'} overflow-hidden flex flex-col`}>
            <DraggablePanelLayout
              theme={theme}
              activeTabKey={activeTabKey ?? ''} // Use prop
              onTabChange={setActiveTabKey} // Use prop
              tabs={tabData as TabData[]} // Use prop
              userText={userText}
              setUserText={setUserText}
              onSendMessage={() => { console.warn("Send message not implemented yet."); }}
              canSend={false}
              transcriptItems={transcriptItems}
              isMicrophoneMuted={isMicrophoneMuted}
              micConnectionStatus={micConnectionStatus}
              speakerConnectionStatus={speakerConnectionStatus}
              onMuteToggle={() => setIsMicrophoneMuted(!isMicrophoneMuted)}
              onReconnectMic={onReconnectMic}
              onReconnectSpeaker={onReconnectSpeaker}
              cycleViewTrigger={cycleViewTrigger}
            />
          </div>
        </div>
      </div>
  );
}

// --- Main App Component (Wrapper) ---
// Manages core application state and logic
function App() {
  // Context Hooks
  const { transcriptItems, addTranscriptMessage, addTranscriptBreadcrumb } = useTranscript();
  const { setChatStatus, setPreviousChatSuccess } = useStatus(); // Get setters from StatusContext

  // App State
  const [connectionState, setConnectionState] = useState<ConnectionState>("INITIAL");
  const [isMicrophoneMuted, setIsMicrophoneMuted] = useState<boolean>(true);
  const [userText, setUserText] = useState<string>("");
  const [connectTrigger, setConnectTrigger] = useState(0);
  const [disconnectTrigger, setDisconnectTrigger] = useState(0);
  const [micConnectionStatus, setMicConnectionStatus] = useState<WebRTCConnectionStatus>('disconnected');
  const [speakerConnectionStatus, setSpeakerConnectionStatus] = useState<WebRTCConnectionStatus>('disconnected');
  const [cycleViewTrigger, setCycleViewTrigger] = useState(0);

  // State lifted from AppContent
  const [activeTabKey, setActiveTabKey] = useState<string | null>(null);
  const [tabData, setTabData] = useState<LocalTabData[]>([]);
  const [tabCounter, setTabCounter] = useState<number>(1);
  const [lastResponseId, setLastResponseId] = useState<string | null>(null);
  const [currentFunctionName, setCurrentFunctionName] = useState<string | null>(null);
  const [lastBehavioralTabData, setLastBehavioralTabData] = useState<LocalTabData | null>(null);
  const [lastCodeTabData, setLastCodeTabData] = useState<LocalTabData | null>(null);
  const [conversationId, setConversationId] = useState<string>(() => uuidv4());
  const [currentTranscript, setCurrentTranscript] = useState<string>(""); // State for accumulating transcript deltas
  const [lastMicTranscript, setLastMicTranscript] = useState<string>(""); // State for the last completed mic transcript
  const lastResponseIdRef = useRef(lastResponseId);
  const lastProcessedFunctionCallDetailsRef = useRef<LocalTabData['functionCall'] | null>(null);
 
  // --- Callbacks modifying App state ---
  const handleMicStatusUpdate = useCallback((status: WebRTCConnectionStatus) => {
    setMicConnectionStatus(status);
    switch (status) {
      case 'connecting': setConnectionState('CONNECTING'); break;
      case 'connected': setConnectionState('CONNECTED'); break;
      case 'disconnected': setConnectionState('DISCONNECTED'); break;
      case 'failed': case 'error': setConnectionState('ERROR'); break;
      default: setConnectionState('INITIAL');
    }
  }, []);

  const handleSpeakerStatusUpdate = useCallback((status: WebRTCConnectionStatus) => {
    setSpeakerConnectionStatus(status);
  }, []);

  const handleReconnectMic = useCallback(() => {
    setConnectTrigger(c => c + 1);
  }, []);

  const handleReconnectSpeaker = useCallback(() => {
    setConnectTrigger(c => c + 1); // Use same trigger for now
  }, []);

  const onToggleConnection = useCallback(() => {
    if (connectionState === "CONNECTED" || connectionState === "CONNECTING") {
      setDisconnectTrigger(c => c + 1);
    } else {
      setConnectTrigger(c => c + 1);
    }
  }, [connectionState]);

  // Handler to trigger view cycle
  const handleCycleViewRequest = useCallback(() => {
    setCycleViewTrigger(c => c + 1);
  }, []);

  useEffect(() => {
    lastResponseIdRef.current = lastResponseId;
  }, [lastResponseId]);
 
  // --- Main Processing Logic (Handles Realtime Events) ---
  const handleProcessTurn = useCallback(async (event: any) => {
    if (!event || !event.type) {
        logger.warn(`[App] Received invalid event data (Stream: ${event?.streamType || 'unknown'}):`, event);
        return;
    }

    switch (event.type) {
      case 'conversation.item.input_audio_transcription.delta': {
        const delta = event.item?.text_delta?.value;
        if (delta) {
          setCurrentTranscript(prev => prev + delta);
        }
        break;
      }
      case 'conversation.item.input_audio_transcription.completed': {
        // Assuming event object has a 'streamType' property ('mic' or 'speaker')
        const streamType = event.streamType || 'unknown'; // Default to unknown if missing
        const finalTranscript = event.transcript; // Corrected: transcript is directly on the event object
        const accumulatedBeforeClear = currentTranscript; // Capture for logging if needed
        setCurrentTranscript(''); // Clear accumulator immediately

        if (streamType === 'mic') {
          setLastMicTranscript(finalTranscript || accumulatedBeforeClear); // Store the final mic transcript
          return; // Do not proceed to API call for mic events
        }

        // Only proceed for SPEAKER stream with a valid transcript
        if (streamType !== 'speaker') {
            return;
        }
        const speakerTranscript = finalTranscript || accumulatedBeforeClear; // Final transcript from speaker
        if (!speakerTranscript || speakerTranscript.trim() === '') {
          return;
        }

        // --- Trigger API call ONLY for SPEAKER events --- 
        setChatStatus('processing');
        setPreviousChatSuccess(false);
        const currentResponseId = uuidv4(); // Generate unique ID for this potential response

        // --- Prepare NEW Payload ---
        logger.info(`[App] Preparing payload. Current lastResponseId from ref: ${lastResponseIdRef.current}`);

        let toolOutputsArray = undefined;
        logger.info(`[App] Payload Prep: lastResponseIdRef.current = ${lastResponseIdRef.current}`);
        logger.info(`[App] Payload Prep: lastProcessedFunctionCallDetailsRef.current = ${JSON.stringify(lastProcessedFunctionCallDetailsRef.current)}`);
        if (lastResponseIdRef.current && lastProcessedFunctionCallDetailsRef.current) {
          logger.info(`[App] Using lastProcessedFunctionCallDetailsRef for tool_outputs. call_id: ${lastProcessedFunctionCallDetailsRef.current.call_id}, item_id (fc_id): ${lastProcessedFunctionCallDetailsRef.current.id}`);
          toolOutputsArray = [{
            id: lastProcessedFunctionCallDetailsRef.current.call_id, // Use 'id' as key, with 'call_id' as value
            output: lastProcessedFunctionCallDetailsRef.current.arguments
          }];
        } else {
          if (lastResponseIdRef.current) {
            logger.warn(`[App] previousResponseId exists (${lastResponseIdRef.current}), but no lastProcessedFunctionCallDetailsRef.current. Not sending tool_outputs.`);
          }
        }

        const payload: any = {
          // Speaker's transcript is the main trigger
          transcript: speakerTranscript,
          // Include last user (mic) transcript for context
          lastUserTranscript: lastMicTranscript,
          conversationId,
        };

        if (lastResponseIdRef.current) {
          payload.previousResponseId = lastResponseIdRef.current;
        }

        if (toolOutputsArray) {
          payload.tool_outputs = toolOutputsArray;
          logger.info('[App] tool_outputs field explicitly added to payload.');
        } else if (lastResponseIdRef.current && lastProcessedFunctionCallDetailsRef.current) {
            logger.warn('[App] toolOutputsArray was NOT constructed for payload, despite lastResponseId and lastProcessedFunctionCallDetailsRef being present. This is unexpected.');
        }
        // questionType and model can be omitted if relying on backend classification
        logger.info('[App] API Request Payload:', JSON.stringify(payload, null, 2));

        let finalResponseDataFromStream: any = null; // Will hold data from 'completed' event
        let responseDataToProcess: any = null; // Declare here to be accessible in both stream/non-stream paths
        let backendContextTypeFromEvent: string | null = null; // Declare here for wider scope

        // --- Initiate the API call to the backend ---
        try {
          // --- API Call ---
          const response = await fetch('/api/responses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload), // Use new payload
          });

          if (!response.ok) {
            let errorDetails = `HTTP error ${response.status}`;
            try {
              // Try to get more details from the response body
              errorDetails = await response.text();
            } catch (parseError) {
              logger.error("Failed to parse error response body:", parseError);
              // Keep the original status code error if parsing fails
            }
            throw new Error(`HTTP error! status: ${response.status}, details: ${errorDetails}`);
          }

      const contentType = response.headers.get('Content-Type');
      let accumulatedFunctionArgs: { [key: number]: string } = {};
      let currentFunctionCalls: { [key: number]: any } = {};
      let streamCreatedTabKey: string | null = null;
      let backendContextTypeFromEvent: string | null = null; // Declare here

      // --- Stream Processing ---
      if (contentType && contentType.includes('application/jsonl') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim() === '') continue;
            try {
              const event = JSON.parse(line);
              switch (event.type) {
                case 'function_call_start': {
                  const funcIndexStart = event.index ?? 0; // Use event.index from backend
                  currentFunctionCalls[funcIndexStart] = {
                    type: 'function_call', // Add type here for fallback construction
                    status: 'streaming', // Initial status
                    name: event.name,
                    id: event.id,
                    call_id: event.call_id,
                    arguments: '',
                    tabKey: null,
                    isFollowUp: false,
                    targetTabKey: null
                  };
                  accumulatedFunctionArgs[funcIndexStart] = '';

                  // Check the name directly
                  if (event.name === 'format_comprehensive_code' || event.name === 'format_behavioral_star_answer') {
                    // Increment the counter for filename numbering but use UUID for key uniqueness
                    const nextTabCount = tabCounter + 1;
                    const newTabKey = `response-${uuidv4()}`; // Use UUID for guaranteed uniqueness
                    const isBehavioral = event.name === 'format_behavioral_star_answer';
                    const isFollowUp = isBehavioral && lastBehavioralTabData !== null;

                    if (isFollowUp) {
                      currentFunctionCalls[funcIndexStart].isFollowUp = true;
                      currentFunctionCalls[funcIndexStart].targetTabKey = lastBehavioralTabData.key;
                      streamCreatedTabKey = null; // Don't create a new tab yet
                    } else {
                      streamCreatedTabKey = newTabKey;
                      currentFunctionCalls[funcIndexStart].tabKey = newTabKey;
                      const initialLang = isBehavioral ? 'markdown' : 'plaintext';
                      
                      // Extract a meaningful tab name from the original speaker transcript
                      let meaningfulName = "";
                      try {
                        if (typeof speakerTranscript === 'string' && speakerTranscript.length > 0) {
                          // Common patterns in coding problems
                          const patterns = [
                            /merge\s+(\w+)/i, 
                            /(\w+)\s+array/i,
                            /implement\s+(\w+)/i,
                            /create\s+(\w+)/i,
                            /write\s+(\w+)/i
                          ];
                          
                          // Try to match each pattern
                          for (const pattern of patterns) {
                            const match = speakerTranscript.match(pattern);
                            if (match && match[1]) {
                              meaningfulName = match[1].toLowerCase();
                              break;
                            }
                          }
                          
                          // If no pattern matches, use first few words
                          if (!meaningfulName) {
                            const words = speakerTranscript.split(/\s+/).slice(0, 3).join("_").toLowerCase();
                            meaningfulName = words.replace(/[^a-z0-9_]/g, "");
                          }
                        }
                      } catch (e) {
                        logger.error("Error extracting tab name from transcript:", e);
                      }
                      
                      const initialFilename = isBehavioral 
                        ? `Behavioral-${meaningfulName || nextTabCount}` 
                        : `${meaningfulName || 'Code'}-${nextTabCount}`;

                      const newTab: LocalTabData = {
                        key: newTabKey, 
                        filename: initialFilename, 
                        language: initialLang, 
                        code: "Streaming...", 
                        analysis: JSON.stringify({ status: "streaming" }, null, 2),
                        structuredAnalysis: { status: "streaming" }, 
                        responseId: currentResponseId,
                        previous_response_id: lastResponseId === null ? undefined : lastResponseId, // Handle null
                        // Keep this structure for storing data, but use correct accessors
                        functionCall: { id: event.id, call_id: event.call_id, name: event.name, arguments: '' },
                        followUps: []
                      };
                      setTabData(prev => [...prev, newTab]);
                      setActiveTabKey(newTabKey);
                      setTabCounter(nextTabCount); // Set the counter to the already-used value
                      if (isBehavioral) { setLastBehavioralTabData(newTab); setLastCodeTabData(null); }
                      else { setLastCodeTabData(newTab); setLastBehavioralTabData(null); }
                    }
                  }
                  break;
                }
                case 'function_call_delta': {
                  const funcIndexDelta = event.index ?? 0;
                  if (currentFunctionCalls[funcIndexDelta] && event.delta) {
                    accumulatedFunctionArgs[funcIndexDelta] += event.delta;
                    currentFunctionCalls[funcIndexDelta].arguments = accumulatedFunctionArgs[funcIndexDelta];
                    const updateKey = currentFunctionCalls[funcIndexDelta].isFollowUp
                      ? currentFunctionCalls[funcIndexDelta].targetTabKey
                      : currentFunctionCalls[funcIndexDelta].tabKey;

                    if (updateKey) {
                      try {
                        const partialArgs = JSON.parse(accumulatedFunctionArgs[funcIndexDelta]);
                        setTabData(prevTabData => {
                          const updatedPrevTabData = prevTabData.map(tab => {
                            if (tab.key === updateKey) {
                              let updatedCode = tab.code; let updatedAnalysis = tab.analysis; let updatedFilename = tab.filename; let updatedLang = tab.language; let updatedFollowUps = tab.followUps || [];

                              if (currentFunctionCalls[funcIndexDelta].name === 'format_comprehensive_code') {
                                updatedCode = partialArgs.cd || tab.code; updatedLang = partialArgs.lang || tab.language;
                                if (updatedLang !== tab.language && tab.filename.startsWith('Code-')) { updatedFilename = `Code: ${updatedLang}`; }
                                updatedAnalysis = JSON.stringify(partialArgs, null, 2);
                                return { ...tab, code: updatedCode === "Streaming..." && partialArgs.cd ? partialArgs.cd : updatedCode, analysis: updatedAnalysis, structuredAnalysis: partialArgs, filename: updatedFilename, language: updatedLang, functionCall: { ...tab.functionCall!, arguments: accumulatedFunctionArgs[funcIndexDelta] } };
                              } else if (currentFunctionCalls[funcIndexDelta].name === 'format_behavioral_star_answer') {
                                if (currentFunctionCalls[funcIndexDelta].isFollowUp) {
                                  const currentFollowUpIndex = updatedFollowUps.length - 1;
                                  if (currentFollowUpIndex >= 0) {
                                    updatedFollowUps[currentFollowUpIndex] = { ...updatedFollowUps[currentFollowUpIndex], ...partialArgs };
                                  } else {
                                    updatedFollowUps = [partialArgs];
                                  }
                                  updatedAnalysis = JSON.stringify(partialArgs, null, 2);
                                  return { ...tab, analysis: updatedAnalysis, structuredAnalysis: partialArgs, followUps: updatedFollowUps };
                                } else {
                                  updatedCode = `Situation: ${partialArgs.situation?.substring(0, 50) || ''}...`;
                                  updatedAnalysis = JSON.stringify(partialArgs, null, 2);
                                  if (partialArgs.situation && tab.filename.startsWith('Behavioral-')) { updatedFilename = `STAR: ${partialArgs.situation.substring(0, 15)}...`; }
                                  return { ...tab, code: updatedCode, analysis: updatedAnalysis, structuredAnalysis: partialArgs, filename: updatedFilename, language: 'markdown', functionCall: { ...tab.functionCall!, arguments: accumulatedFunctionArgs[funcIndexDelta] }, followUps: updatedFollowUps };
                                }
                              }
                            }
                            return tab;
                          });
                          
                          // Update last reference tabs directly here instead of in a separate state update
                          if (!currentFunctionCalls[funcIndexDelta].isFollowUp) {
                            const updatedTab = updatedPrevTabData.find(t => t.key === updateKey);
                            if (updatedTab) {
                              if (currentFunctionCalls[funcIndexDelta].name === 'format_behavioral_star_answer') { 
                                setLastBehavioralTabData(updatedTab); 
                              } else if (currentFunctionCalls[funcIndexDelta].name === 'format_comprehensive_code') { 
                                setLastCodeTabData(updatedTab); 
                              }
                            }
                          }
                          
                          return updatedPrevTabData;
                        });
                      } catch (e) { /* Incomplete JSON */ }
                    }
                  }
                  break;
                }
                case 'function_call_done': {
                  const funcIndexDone = event.index ?? 0;
                  if (currentFunctionCalls[funcIndexDone] && event.item?.arguments) {
                    // Update status for the specific function call
                    currentFunctionCalls[funcIndexDone].status = event.item.status || 'completed';
                    currentFunctionCalls[funcIndexDone].arguments = event.item.arguments; // Ensure final arguments are stored

                    const finalArgsString = event.item.arguments;
                    const updateKey = currentFunctionCalls[funcIndexDone].isFollowUp
                      ? currentFunctionCalls[funcIndexDone].targetTabKey
                      : currentFunctionCalls[funcIndexDone].tabKey;
                    try {
                      const finalParsedArgs = JSON.parse(finalArgsString);
                      setTabData(prevTabData => {
                        const updatedPrevTabData = prevTabData.map(tab => {
                          if (tab.key === updateKey) {
                            logger.info(`[Stream] Applying final parsed args to tab ${updateKey}:`, finalParsedArgs);
                            let updatedCode = tab.code;
                            let updatedLang = tab.language;
                            let updatedFilename = tab.filename;
                            let updatedAnalysis = JSON.stringify(finalParsedArgs, null, 2);
                            let updatedStructuredAnalysis = finalParsedArgs;

                            if (currentFunctionCalls[funcIndexDone].name === 'format_comprehensive_code') {
                              updatedCode = finalParsedArgs.cd || ''; // Use cd instead of code
                              updatedLang = finalParsedArgs.lang || 'plaintext'; // Use lang instead of language
                              if (updatedLang !== tab.language && tab.filename.startsWith('Code-')) {
                                updatedFilename = `Code: ${updatedLang}`;
                              }
                            } else if (currentFunctionCalls[funcIndexDone].name === 'format_behavioral_star_answer') {
                               // Update STAR fields if necessary based on final args
                               updatedCode = `Situation: ${finalParsedArgs.situation || ''}...`; // Update based on final
                               updatedLang = 'markdown';
                               if (finalParsedArgs.situation && tab.filename.startsWith('Behavioral-')) {
                                  updatedFilename = `STAR: ${finalParsedArgs.situation.substring(0, 15)}...`;
                               }
                            }

                            return {
                              ...tab,
                              code: updatedCode,
                              language: updatedLang,
                              filename: updatedFilename,
                              analysis: updatedAnalysis,
                              structuredAnalysis: updatedStructuredAnalysis,
                              // Ensure functionCall details are final
                              functionCall: { ...tab.functionCall!, arguments: finalArgsString, name: event.item.name } // Use name from done event if available
                            };
                          }
                          return tab;
                        });

                        // Update last tab refs directly within this update instead of in a separate state update
                        const finalTab = updatedPrevTabData.find(t => t.key === updateKey);
                        if (finalTab) {
                          if (currentFunctionCalls[funcIndexDone].name === 'format_behavioral_star_answer') { 
                            setLastBehavioralTabData(finalTab); 
                          }
                          else if (currentFunctionCalls[funcIndexDone].name === 'format_comprehensive_code') { 
                            setLastCodeTabData(finalTab); 
                          }
                        }

                        return updatedPrevTabData;
                      });

                    } catch (parseError) {
                      logger.error(`[Stream] Failed to parse final arguments for tab ${updateKey}:`, parseError, finalArgsString);
                      // Optionally update tab state to show an error
                    }
                  } else {
                     logger.warn(`[Stream] Received function_call_done but missing data for index ${funcIndexDone}`);
                  }
                  break;
                }

                case 'text_delta': { // Start of text_delta case
                  // Handle general text streamed alongside function calls if needed
                  // if (event.delta) { addTranscriptMessage(uuidv4(), 'assistant', event.delta, true); }
                  break;
                }
                case 'completed': {
                  logger.info('[Stream] Completed event received.');
                  finalResponseDataFromStream = event.response; // Capture the definitive final response
                  // Extract questionTypeForContext from the completed event
                  backendContextTypeFromEvent = event.questionTypeForContext; // Assign here
                  logger.info(`[App Stream] Received questionTypeForContext from backend: ${backendContextTypeFromEvent}`);

                  Object.entries(currentFunctionCalls).forEach(([indexStr, call]) => {
                     const funcIndex = parseInt(indexStr, 10);
                     if (call.isFollowUp && call.targetTabKey) {
                        try {
                           const finalArgs = JSON.parse(accumulatedFunctionArgs[funcIndex]);
                           setTabData(prevTabData => prevTabData.map(tab => {
                              if (tab.key === call.targetTabKey) {
                                 let updatedFollowUps = tab.followUps || [];
                                 const currentFollowUpIndex = updatedFollowUps.length - 1;
                                 if (currentFollowUpIndex >= 0) { updatedFollowUps[currentFollowUpIndex] = finalArgs; }
                                 else { updatedFollowUps = [finalArgs]; }
                                 logger.info(`[Stream Completed] Finalizing follow-up for tab ${call.targetTabKey}`, finalArgs);
                                 return { ...tab, followUps: updatedFollowUps };
                              }
                              return tab;
                           }));
                        } catch (e) { logger.error("Error parsing final follow-up args:", e); }
                     }
                  });
                  break;
                }
                case 'error': {
                  logger.error('[Stream] Error event:', event.error);
                  throw new Error(event.error?.message || 'Unknown stream error');
                }
                default: break;
              }
            } catch (parseError) { logger.error('[Stream] Error parsing JSON line:', line, parseError); }
          }
        } // End of while (true) loop at line 572

        // This logic is now *inside* the 'if (contentType && ...)' block from line 291, after the while loop
        if (finalResponseDataFromStream) {
            logger.info("[Stream] Using response data from 'completed' event for responseDataToProcess.");
            responseDataToProcess = finalResponseDataFromStream;
        } else {
            logger.info("[Stream] 'completed' event not received or data missing. Constructing fallback response for responseDataToProcess.");
            const fallbackOutput = Object.values(currentFunctionCalls).map((call: any) => ({
                ...call,
                type: 'function_call',
                status: call.status || 'completed'
            }));
            responseDataToProcess = { id: currentResponseId, output: fallbackOutput };
        }
        logger.info('[App] Final data to process (from stream):', responseDataToProcess);

      } else { // This 'else' pairs with 'if (contentType && ...)' at line 291, for non-streamed responses
        logger.info('[App] Processing non-streamed response for responseDataToProcess...');
        responseDataToProcess = await response.json();
        logger.info('[App] Received complete response data (non-streamed) for responseDataToProcess:', responseDataToProcess);
      } // This closes the else for non-streamed, and also the 'if (contentType && ...)' block from line 291
    
          // --- Common Logic after getting responseDataToProcess ---
          // This section (from line 619 in the file) should be OUTSIDE the if/else for stream/non-stream, but INSIDE the main try
          if (!responseDataToProcess) { throw new Error("Failed to get response data."); }
    
          setChatStatus('done');
          setPreviousChatSuccess(true);
          const finalResponseId = responseDataToProcess.id || currentResponseId;
          
          // Update responseId on the specific last tab states if they correspond to the current response cycle
          if (lastCodeTabData && lastCodeTabData.responseId === currentResponseId) {
            setLastCodeTabData(prev => prev ? { ...prev, responseId: finalResponseId } : null);
            logger.info(`[App] Updated lastCodeTabData (key: ${lastCodeTabData.key}) responseId to finalResponseId: ${finalResponseId}`);
          }
          if (lastBehavioralTabData && lastBehavioralTabData.responseId === currentResponseId) {
            setLastBehavioralTabData(prev => prev ? { ...prev, responseId: finalResponseId } : null);
            logger.info(`[App] Updated lastBehavioralTabData (key: ${lastBehavioralTabData.key}) responseId to finalResponseId: ${finalResponseId}`);
          }

          // Also update the responseId in the main tabData array for the tab created by this stream, if any.
          // This ensures consistency if the tab is neither the lastCode nor lastBehavioral tab but was just created.
          if (streamCreatedTabKey) {
            setTabData(prevTabData =>
              prevTabData.map(tab =>
                tab.key === streamCreatedTabKey && tab.responseId !== finalResponseId
                  ? { ...tab, responseId: finalResponseId }
                  : tab
              )
            );
            logger.info(`[App] Updated tabData for streamCreatedTabKey (key: ${streamCreatedTabKey}) responseId to finalResponseId: ${finalResponseId}`);
          }

          setLastResponseId(finalResponseId);
 
          // --- Final Tab Processing & Breadcrumb Logic ---
          let isCodeResponse = false; let isBehavioralResponse = false; let isGeneralResponse = true;
          let isFollowUpResponse = false;
          let tabLabel = ''; let tabLanguage = 'plaintext'; let tabCode = ''; let tabAnalysis = '';
          let tabStructuredAnalysis: any = undefined; let tabFilename = ''; let functionCallData = null;
          let breadcrumbSummary = 'Response processed.'; let breadcrumbPreview = '';
          let tentativeFilename = `Response-${tabCounter}`;
    
          // Check if responseDataToProcess.output exists and is an array before processing
          if (responseDataToProcess.output && Array.isArray(responseDataToProcess.output) && responseDataToProcess.output.length > 0) {
              const functionCallItem = responseDataToProcess.output.find((item: any) => item.type === 'function_call');
              const messageItem = responseDataToProcess.output.find((item: any) => item.type === 'message' && item.role === 'assistant');
              let responseText = messageItem?.content?.[0]?.type === 'text' ? (messageItem.content[0].text.value || '') : '';
    
              if (functionCallItem) {
                setCurrentFunctionName(functionCallItem.name);
                try {
                  logger.info('[App] Processing functionCallItem:', JSON.stringify(functionCallItem, null, 2));
                  const finalArgs = JSON.parse(functionCallItem.arguments);
                  logger.info('[App] Parsed finalArgs for function call:', JSON.stringify(finalArgs, null, 2));
                  tabStructuredAnalysis = finalArgs;
                  functionCallData = { id: functionCallItem.id, call_id: functionCallItem.call_id, name: functionCallItem.name, arguments: functionCallItem.arguments };
                  lastProcessedFunctionCallDetailsRef.current = functionCallData; // Store details of this successful function call
                  logger.info(`[App] Stored lastProcessedFunctionCallDetailsRef: call_id=${functionCallData.call_id}`);
 
                  // Check if this is a follow-up based on headers or metadata from backend
                  // Use backendContextType for determining follow-up logic if available
                  const contextTypeForFollowUp = backendContextTypeFromEvent || responseDataToProcess.lastQuestionType;
                  logger.info(`[App] Using contextTypeForFollowUp: ${contextTypeForFollowUp}`);

                  const possibleFollowUp = responseDataToProcess.meta?.isFollowUp ||
                                         (contextTypeForFollowUp === "BEHAVIORAL_QUESTION" &&
                                          functionCallItem.name === 'format_behavioral_star_answer');
                  
                  logger.info(`[App] Response metadata:`, responseDataToProcess.meta);
                  logger.info(`[App] Last question type (from responseDataToProcess):`, responseDataToProcess.lastQuestionType);
                  logger.info(`[App] Backend context type from event:`, backendContextTypeFromEvent);
    
                  if (functionCallItem.name === 'format_comprehensive_code') {
                    isCodeResponse = true; isGeneralResponse = false; setLastBehavioralTabData(null);
                    tabLanguage = finalArgs.lang || 'plaintext'; tabCode = finalArgs.cd || ''; tabAnalysis = JSON.stringify(finalArgs, null, 2);
                    tabLabel = `${tabLanguage} Snippet`; tentativeFilename = `Code: ${tabLanguage}`;
                    breadcrumbSummary = `Code: ${tabLanguage}`; breadcrumbPreview = tabCode.substring(0, 100) + '...';
                  } else if (functionCallItem.name === 'format_behavioral_star_answer') {
                    isBehavioralResponse = true; isGeneralResponse = false; setLastCodeTabData(null);
                    // Simplified: The backend now determines if it's a follow-up STAR or new.
                    // Client just processes it as a behavioral response, potentially creating a new tab
                    // or updating an existing one if streaming logic handles that.
                    // The 'isFollowUpResponse' logic here for behavioral might need re-evaluation
                    // if the backend doesn't explicitly signal "this STAR is a follow-up to tab X".
                    // For now, assume any 'format_behavioral_star_answer' might create a new tab
                    // or be handled by streaming updates to an existing one.
                    // The key is that it's NOT a 'format_simple_explanation'.
                    
                    // Example: if it's a true follow-up that appends to an existing behavioral tab (handled by streaming/tab update logic)
                    // then isFollowUpResponse might still be relevant for the final tab state update section.
                    // However, for routing to general window, this path is for STAR answers, not simple text.
                    if (lastBehavioralTabData !== null && (possibleFollowUp || contextTypeForFollowUp === "BEHAVIORAL_QUESTION")) {
                         isFollowUpResponse = true; // This might still be useful for final tab updates if it's an append.
                         logger.info(`[App] Identified potential behavioral follow-up context for tab: ${lastBehavioralTabData.key}`);
                    }
                    // The actual STAR content (situation, task, etc.) will be in finalArgs
                    // and used to populate a behavioral tab.
                    tabLanguage = 'markdown';
                    tabCode = `Situation: ${finalArgs.situation?.substring(0,80) || ''}...`; // Placeholder for tab list
                    tabAnalysis = JSON.stringify(finalArgs, null, 2);
                    tabLabel = `STAR Answer`;
                    tentativeFilename = `Behavioral: STAR`;
                    breadcrumbSummary = `Behavioral: ${finalArgs.situation?.substring(0,50) || 'STAR Answer'}...`;
                    breadcrumbPreview = `Situation: ${finalArgs.situation?.substring(0,100) || ''}...`;

                  } else if (functionCallItem.name === 'format_simple_explanation' && finalArgs.explanation) {
                       isGeneralResponse = true; // This is key for showing in general transcript
                       isCodeResponse = false; isBehavioralResponse = false; // Not a code or behavioral tab response
                       const explanationText = finalArgs.explanation;
                       
                       // Clear specific tab contexts if this explanation is general / not tied to them.
                       // Based on new directive, model decides context, so client might not need to be as aggressive here.
                       // However, if an explanation is truly general, clearing these makes sense.
                       // Let's assume for now that 'format_simple_explanation' means it's for the general transcript.
                       setLastCodeTabData(null);
                       setLastBehavioralTabData(null);
                       
                       addTranscriptMessage(uuidv4(), 'assistant', explanationText);
                       tentativeFilename = `Explanation: ${explanationText.substring(0, 20)}...`;
                       breadcrumbSummary = explanationText.substring(0, 150) + '...'; breadcrumbPreview = explanationText.substring(0, 100) + '...';
                       setActiveTabKey(null); // Crucial: Switch to main transcript view

                  } else { // Unknown function call name
                      isGeneralResponse = true; setLastBehavioralTabData(null); setLastCodeTabData(null); setActiveTabKey(null);
                      const unknownFuncErrorMessage = `Processed unknown function call: ${functionCallItem.name}`;
                      addTranscriptMessage(uuidv4(), 'assistant', unknownFuncErrorMessage); tentativeFilename = `Error-UnknownFunction`;
                      breadcrumbSummary = unknownFuncErrorMessage; breadcrumbPreview = unknownFuncErrorMessage.substring(0, 100) + '...';
                  } // Closes the 'else' for unknown function
                } // Closes the 'try' block from line 684
                  catch (parseError) { // Error parsing final arguments
                    isGeneralResponse = true; setLastBehavioralTabData(null); setLastCodeTabData(null); setActiveTabKey(null);
                    lastProcessedFunctionCallDetailsRef.current = null; // Clear on error
                    logger.info(`[App] Cleared lastProcessedFunctionCallDetailsRef (parseError for finalArgs).`);
                    const errorMessage = `Error parsing final tool arguments for ${functionCallItem?.name || 'unknown function'}: ${(parseError as Error).message}`;
                    addTranscriptMessage(uuidv4(), 'assistant', errorMessage); tentativeFilename = `Error-Parsing`;
                    breadcrumbSummary = errorMessage; breadcrumbPreview = errorMessage.substring(0, 100) + '...';
                    isCodeResponse = false; isBehavioralResponse = false; functionCallData = null; tabStructuredAnalysis = undefined;
                  } // Closes 'catch'
                } // Closes 'if (functionCallItem)' from line 682
                else if (responseText) { // General text response, if no functionCallItem
                   isGeneralResponse = true; setLastBehavioralTabData(null); setLastCodeTabData(null); setActiveTabKey(null);
                   lastProcessedFunctionCallDetailsRef.current = null; // Clear if it's a text response
                   logger.info(`[App] Cleared lastProcessedFunctionCallDetailsRef (responseText).`);
           addTranscriptMessage(uuidv4(), 'assistant', responseText);
           tentativeFilename = `Response: ${responseText.substring(0, 20)}...`;
           breadcrumbSummary = responseText.substring(0, 150) + '...'; breadcrumbPreview = responseText.substring(0, 100) + '...';
        } else { // Neither function call nor text
          isGeneralResponse = true; setLastBehavioralTabData(null); setLastCodeTabData(null); setActiveTabKey(null);
          lastProcessedFunctionCallDetailsRef.current = null; // Clear if no actionable output
          logger.info(`[App] Cleared lastProcessedFunctionCallDetailsRef (no actionable output).`);
          const errorMessage = `Received response with no actionable output.`;
          addTranscriptMessage(uuidv4(), 'assistant', errorMessage); tentativeFilename = `Error-NoOutput`;
          breadcrumbSummary = errorMessage; breadcrumbPreview = errorMessage.substring(0, 100) + '...';
        }
    } else if (responseDataToProcess.text && typeof responseDataToProcess.text === 'string') { // Fallback simple text
      isGeneralResponse = true; setLastBehavioralTabData(null); setLastCodeTabData(null); setActiveTabKey(null);
      lastProcessedFunctionCallDetailsRef.current = null; // Clear for fallback simple text
      logger.info(`[App] Cleared lastProcessedFunctionCallDetailsRef (fallback simple text).`);
      const responseText = responseDataToProcess.text; addTranscriptMessage(uuidv4(), 'assistant', responseText);
      tentativeFilename = `Response: ${responseText.substring(0, 20)}...`;
      breadcrumbSummary = responseText.substring(0, 150) + '...'; breadcrumbPreview = responseText.substring(0, 100) + '...';
    } else { // No recognizable output
      isGeneralResponse = true; setLastBehavioralTabData(null); setLastCodeTabData(null); setActiveTabKey(null);
      lastProcessedFunctionCallDetailsRef.current = null; // Clear for no recognizable output
      logger.info(`[App] Cleared lastProcessedFunctionCallDetailsRef (no recognizable output).`);
      const errorMessage = `Received response with no recognizable output.`;
      addTranscriptMessage(uuidv4(), 'assistant', errorMessage); tentativeFilename = `Error-NoRecognizableOutput`;
      breadcrumbSummary = errorMessage; breadcrumbPreview = errorMessage.substring(0, 100) + '...';
    }

    tabFilename = tentativeFilename;

    // --- Final Tab State Update & Creation ---
    let breadcrumbAdded = false;
    if (isFollowUpResponse && lastBehavioralTabData && tabStructuredAnalysis) {
       setTabData(prevTabData => prevTabData.map(tab => {
          if (tab.key === lastBehavioralTabData.key) {
             logger.info(`[App] Appending follow-up to tab ${tab.key}`);
             const newFollowUps = [...(tab.followUps || []), tabStructuredAnalysis as StarData];
             return { ...tab, followUps: newFollowUps, responseId: finalResponseId };
          }
          return tab;
       }));
       setActiveTabKey(lastBehavioralTabData.key); // Keep behavioral tab active for its follow-up
       addTranscriptBreadcrumb(`Appended follow-up to ${lastBehavioralTabData.filename}`, { analysisSummary: breadcrumbSummary, codePreview: breadcrumbPreview });
       breadcrumbAdded = true;

    } else if (streamCreatedTabKey) {
       logger.info("[App] Post-stream finalization block for streamCreatedTabKey skipped state update, tab state should be final from deltas.", streamCreatedTabKey);

       // We don't need to update the tab data again here, just update references
       const finalTab = tabData.find(t => t.key === streamCreatedTabKey);
       if (finalTab) {
          if (isBehavioralResponse) { setLastBehavioralTabData(finalTab); }
          else if (isCodeResponse) { setLastCodeTabData(finalTab); }
       }
       // setActiveTabKey(streamCreatedTabKey) is already called when tab is created
       addTranscriptBreadcrumb(`Generated ${tabFilename}`, { analysisSummary: breadcrumbSummary, codePreview: breadcrumbPreview });
       breadcrumbAdded = true;

    } else if ((isCodeResponse || isBehavioralResponse) && !isFollowUpResponse) {
       // Increment the counter FIRST for unique keys
       const nextTabCount = tabCounter + 1;
       const newTabKey = `response-${uuidv4()}`; // Use UUID for guaranteed uniqueness
       const newTab: LocalTabData = { key: newTabKey, filename: tabFilename, language: tabLanguage, code: tabCode, analysis: tabAnalysis, structuredAnalysis: tabStructuredAnalysis, responseId: finalResponseId, previous_response_id: lastResponseId === null ? undefined : lastResponseId, functionCall: functionCallData ?? undefined, followUps: [] };
       logger.info(`[App] Creating new tab:`, newTab);
       setTabData(prev => [...prev, newTab]);
       setActiveTabKey(newTabKey);
       setTabCounter(nextTabCount); // Use the same incremented value
       if (isBehavioralResponse) { setLastBehavioralTabData(newTab); setLastCodeTabData(null); }
       else if (isCodeResponse) { setLastCodeTabData(newTab); setLastBehavioralTabData(null); }
       addTranscriptBreadcrumb(`Generated ${tabFilename}`, { analysisSummary: breadcrumbSummary, codePreview: breadcrumbPreview });
       breadcrumbAdded = true;

    } else if (isGeneralResponse) {
       // For general responses, ensure activeTabKey is null to show Main View
       setActiveTabKey(null);
       setLastBehavioralTabData(null);
       setLastCodeTabData(null);
       if (!breadcrumbAdded) {
          addTranscriptBreadcrumb(`Generated ${tabFilename}`, { analysisSummary: breadcrumbSummary, codePreview: breadcrumbPreview });
       }
    }
    // This brace now correctly closes the 'if (responseDataToProcess.output && ...)' block from L677
    // or the 'else if (responseDataToProcess.text && ...)' from L764
    // or the 'else' from L771, ensuring all tab processing is within these conditions.
    } // This closes the main 'if/else if/else' chain for responseDataToProcess
    // The main 'try' block (from L299) is now properly closed by the brace above.
    catch (error) { // Main catch block
      logger.error('[App] Error fetching or processing response:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      addTranscriptMessage(uuidv4(), 'assistant', `Error fetching response: ${errorMessage}`);
      setChatStatus('error');
      setPreviousChatSuccess(false);
      setLastBehavioralTabData(null); setLastCodeTabData(null);
    } // Closes catch (error)
    finally {
       // Remove conversation history update from here, as context is managed by OpenAI/backend
     } // Closes finally
        logger.info("[DEBUG] Successfully reached end of speaker completion IF block.");
     break; // End of .completed case
   }
   // <<<<<<<<<<<<<<<<<<<<<<<<<<<< END OF ADDED FETCH CALL >>>>>>>>>>>>>>>>>>>>>>>>>>
   default:
     // logger.info(`[App] Ignoring event type: ${event.type}`);
      break; // This is the break for the default case of the switch statement
    } // This curly brace closes the switch statement (which started on line 215)
  }, // This curly brace closes the async function body (which started on line 209)
  [ // This square bracket starts the dependency array for useCallback
    addTranscriptMessage,
    addTranscriptBreadcrumb,
    setChatStatus,
    setPreviousChatSuccess,
    tabCounter,
    lastResponseId,
    lastBehavioralTabData,
    lastCodeTabData,
    setActiveTabKey,
    setTabData,
    setTabCounter,
    setLastResponseId,
    setCurrentFunctionName,
    setLastBehavioralTabData,
    setLastCodeTabData,
    lastMicTranscript,
    setCurrentTranscript,
    conversationId,
    tabData, // Added tabData to dependency array
  ] // This square bracket closes the dependency array
) // This parenthesis closes the useCallback hook call
  // Auto-connect on mount
  useEffect(() => {
    logger.info("App: Auto-connecting on component mount...");
    setConnectTrigger(c => c + 1);
  }, []);

  // Load/Save mute state
  useEffect(() => {
    const storedMicMuted = localStorage.getItem("microphoneMuted");
    if (storedMicMuted) setIsMicrophoneMuted(storedMicMuted === "true");
  }, []);

  useEffect(() => {
    localStorage.setItem("microphoneMuted", isMicrophoneMuted.toString());
  }, [isMicrophoneMuted]);

  // Render AppContent directly (StatusProvider is now in layout.tsx)
  return (
      <AppContent
        connectionState={connectionState}
        isMicrophoneMuted={isMicrophoneMuted}
        setIsMicrophoneMuted={setIsMicrophoneMuted}
        onToggleConnection={onToggleConnection}
        handleMicStatusUpdate={handleMicStatusUpdate}
        handleSpeakerStatusUpdate={handleSpeakerStatusUpdate}
        handleProcessTurn={handleProcessTurn} // Pass the function defined in App
        connectTrigger={connectTrigger}
        disconnectTrigger={disconnectTrigger}
        transcriptItems={transcriptItems}
        userText={userText}
        setUserText={setUserText}
        micConnectionStatus={micConnectionStatus}
        speakerConnectionStatus={speakerConnectionStatus}
        onReconnectMic={handleReconnectMic}
        onReconnectSpeaker={handleReconnectSpeaker}
        onCycleViewRequest={handleCycleViewRequest}
        cycleViewTrigger={cycleViewTrigger}
        // Pass lifted state down
        activeTabKey={activeTabKey}
        setActiveTabKey={setActiveTabKey}
        tabData={tabData}
      />
  );
}

export default App;
