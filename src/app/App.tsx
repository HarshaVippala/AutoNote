"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import Image from "next/image";
import { createParser } from 'eventsource-parser';
import { logger } from '@/app/api/realtime-assistant-webRTC/webRTCConnection-webRTC';

// Set logger level at the beginning
logger.setLevel('ERROR');

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
      <div className={`text-base flex flex-col h-screen w-screen ${theme === 'dark' ? 'bg-gray-800 text-gray-200' : 'bg-gray-100 text-gray-800'} relative`}>
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
          <div className={`flex-1 ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} overflow-hidden flex flex-col`}>
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
        const payload = {
          // Speaker's transcript is the main trigger
          transcript: speakerTranscript,
          // Include last user (mic) transcript for context
          lastUserTranscript: lastMicTranscript,
          conversationId,
          // Include previous response ID if available for proper follow-up handling
          ...(lastResponseId ? { previousResponseId: lastResponseId } : {}),
          // questionType and model can be omitted if relying on backend classification
        };

        let responseData: any = null; // Declare responseData for later use

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
                    name: event.name, // Fix
                    id: event.id,     // Fix
                    call_id: event.call_id, // Fix
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
                  const funcIndexDelta = event.output_index ?? 0;
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
                  const funcIndexDone = event.output_index ?? 0;
                  if (currentFunctionCalls[funcIndexDone] && event.item?.arguments) {
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
                  const responseData = event.response;
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
        }

        if (!responseData) {
          logger.info("[Stream] ended without 'completed' event. Constructing partial response.");
          Object.entries(currentFunctionCalls).forEach(([indexStr, call]) => {
             const funcIndex = parseInt(indexStr, 10);
             if (call.isFollowUp && call.targetTabKey) {
                try {
                   const finalArgs = JSON.parse(accumulatedFunctionArgs[funcIndex]);
                   setTabData(prevTabData => prevTabData.map(tab => {
                      if (tab.key === call.targetTabKey) {
                         let updatedFollowUps = tab.followUps || [];
                         const currentFollowUpIndex = updatedFollowUps.length - 1;
                         if (currentFollowUpIndex >= 0 && JSON.stringify(updatedFollowUps[currentFollowUpIndex]) !== JSON.stringify(finalArgs)) { updatedFollowUps[currentFollowUpIndex] = finalArgs; }
                         else if (currentFollowUpIndex < 0) { updatedFollowUps = [finalArgs]; }
                         logger.info(`[Stream Fallback] Finalizing follow-up for tab ${call.targetTabKey}`, finalArgs);
                         return { ...tab, followUps: updatedFollowUps };
                      }
                      return tab;
                   }));
                } catch (e) { logger.error("Error parsing final follow-up args on fallback:", e); }
             }
          });
          responseData = { id: currentResponseId, output: Object.values(currentFunctionCalls) };
        }
        logger.info('[App] Final processed data from stream:', responseData);

      } else {
        // --- Handle Non-Streamed Response ---
        logger.info('[App] Processing non-streamed response...');
        responseData = await response.json();
        logger.info('[App] Received complete response data (non-streamed):', responseData);
      }

      // --- Common Logic after getting responseData ---
      if (!responseData) { throw new Error("Failed to get response data."); }

      setChatStatus('done');
      setPreviousChatSuccess(true);
      const finalResponseId = responseData.id || currentResponseId;
      setLastResponseId(finalResponseId);

      // --- Final Tab Processing & Breadcrumb Logic ---
      let isCodeResponse = false; let isBehavioralResponse = false; let isGeneralResponse = true;
      let isFollowUpResponse = false;
      let tabLabel = ''; let tabLanguage = 'plaintext'; let tabCode = ''; let tabAnalysis = '';
      let tabStructuredAnalysis: any = undefined; let tabFilename = ''; let functionCallData = null;
      let breadcrumbSummary = 'Response processed.'; let breadcrumbPreview = '';
      let tentativeFilename = `Response-${tabCounter}`;

      // Check if responseData.output exists and is an array before processing
      if (responseData.output && Array.isArray(responseData.output) && responseData.output.length > 0) {
          const functionCallItem = responseData.output.find((item: any) => item.type === 'function_call');
          const messageItem = responseData.output.find((item: any) => item.type === 'message' && item.role === 'assistant');
          let responseText = messageItem?.content?.[0]?.type === 'text' ? (messageItem.content[0].text.value || '') : '';

          if (functionCallItem) {
            setCurrentFunctionName(functionCallItem.name);
            try {
              const finalArgs = JSON.parse(functionCallItem.arguments);
              tabStructuredAnalysis = finalArgs;
              functionCallData = { id: functionCallItem.id, call_id: functionCallItem.call_id, name: functionCallItem.name, arguments: functionCallItem.arguments };

              // Check if this is a follow-up based on headers or metadata from backend
              // Check if the response has a "meta" field indicating it was a follow-up
              const possibleFollowUp = responseData.meta?.isFollowUp || 
                                     (responseData.lastQuestionType === "BEHAVIORAL_QUESTION" && 
                                      functionCallItem.name === 'format_behavioral_star_answer');
              
              logger.info(`[App] Response metadata:`, responseData.meta);
              logger.info(`[App] Last question type:`, responseData.lastQuestionType);

              if (functionCallItem.name === 'format_comprehensive_code') {
                isCodeResponse = true; isGeneralResponse = false; setLastBehavioralTabData(null);
                tabLanguage = finalArgs.lang || 'plaintext'; tabCode = finalArgs.cd || ''; tabAnalysis = JSON.stringify(finalArgs, null, 2);
                tabLabel = `${tabLanguage} Snippet`; tentativeFilename = `Code: ${tabLanguage}`;
                breadcrumbSummary = `Code: ${tabLanguage}`; breadcrumbPreview = tabCode.substring(0, 100) + '...';
              } else if (functionCallItem.name === 'format_behavioral_star_answer') {
                isBehavioralResponse = true; isGeneralResponse = false; setLastCodeTabData(null);
                
                // Check if we have a previous behavioral tab AND either the backend told us it's a follow-up
                // OR our frontend detected it could be a follow-up
                if (lastBehavioralTabData !== null && (possibleFollowUp || responseData.lastQuestionType === "BEHAVIORAL_QUESTION")) { 
                  isFollowUpResponse = true; 
                  logger.info(`[App] Identified behavioral follow-up for tab: ${lastBehavioralTabData.key}`);
                  logger.info(`[App] Follow-up detection:`, {
                    possibleFollowUp,
                    lastQuestionType: responseData.lastQuestionType,
                    hasLastBehavioralTab: !!lastBehavioralTabData
                  });
                }
                
                tabLanguage = 'markdown'; tabAnalysis = JSON.stringify(finalArgs, null, 2);
                tabLabel = `STAR: ${finalArgs.situation?.substring(0, 15) || 'Response'}...`; tentativeFilename = tabLabel;
                breadcrumbSummary = `Behavioral: ${finalArgs.situation?.substring(0, 50)}...`; breadcrumbPreview = `Situation: ${finalArgs.situation?.substring(0, 50)}...`;
                tabCode = `Situation: ${finalArgs.situation || ''}\nTask: ...`;
              } else if (functionCallItem.name === 'format_simple_explanation' && finalArgs.explanation) {
                 isGeneralResponse = true; setLastBehavioralTabData(null); setLastCodeTabData(null);
                 const explanationText = finalArgs.explanation;
                 addTranscriptMessage(uuidv4(), 'assistant', explanationText);
                 tentativeFilename = `Explanation: ${explanationText.substring(0, 20)}...`;
                 breadcrumbSummary = explanationText.substring(0, 150) + '...'; breadcrumbPreview = explanationText.substring(0, 100) + '...';
              } else { // Unknown function
                isGeneralResponse = true; setLastBehavioralTabData(null); setLastCodeTabData(null);
                const errorMessage = `Processed unknown function call: ${functionCallItem.name}`;
                addTranscriptMessage(uuidv4(), 'assistant', errorMessage); tentativeFilename = `Error-UnknownFunction`;
                breadcrumbSummary = errorMessage; breadcrumbPreview = errorMessage.substring(0, 100) + '...';
              }
            } catch (parseError) { // Error parsing final arguments
              isGeneralResponse = true; setLastBehavioralTabData(null); setLastCodeTabData(null);
              const errorMessage = `Error parsing final tool arguments for ${functionCallItem?.name || 'unknown function'}: ${(parseError as Error).message}`;
              addTranscriptMessage(uuidv4(), 'assistant', errorMessage); tentativeFilename = `Error-Parsing`;
              breadcrumbSummary = errorMessage; breadcrumbPreview = errorMessage.substring(0, 100) + '...';
              isCodeResponse = false; isBehavioralResponse = false; functionCallData = null; tabStructuredAnalysis = undefined;
            }
          } else if (responseText) { // General text response
             isGeneralResponse = true; setLastBehavioralTabData(null); setLastCodeTabData(null);
             addTranscriptMessage(uuidv4(), 'assistant', responseText);
             tentativeFilename = `Response: ${responseText.substring(0, 20)}...`;
             breadcrumbSummary = responseText.substring(0, 150) + '...'; breadcrumbPreview = responseText.substring(0, 100) + '...';
          } else { // Neither function call nor text
            isGeneralResponse = true; setLastBehavioralTabData(null); setLastCodeTabData(null);
            const errorMessage = `Received response with no actionable output.`;
            addTranscriptMessage(uuidv4(), 'assistant', errorMessage); tentativeFilename = `Error-NoOutput`;
            breadcrumbSummary = errorMessage; breadcrumbPreview = errorMessage.substring(0, 100) + '...';
          }
      } else if (responseData.text && typeof responseData.text === 'string') { // Fallback simple text
        isGeneralResponse = true; setLastBehavioralTabData(null); setLastCodeTabData(null);
        const responseText = responseData.text; addTranscriptMessage(uuidv4(), 'assistant', responseText);
        tentativeFilename = `Response: ${responseText.substring(0, 20)}...`;
        breadcrumbSummary = responseText.substring(0, 150) + '...'; breadcrumbPreview = responseText.substring(0, 100) + '...';
      } else { // No recognizable output
        isGeneralResponse = true; setLastBehavioralTabData(null); setLastCodeTabData(null);
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
         setActiveTabKey(lastBehavioralTabData.key);
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
         
         addTranscriptBreadcrumb(`Generated ${tabFilename}`, { analysisSummary: breadcrumbSummary, codePreview: breadcrumbPreview });
         breadcrumbAdded = true;

      } else if ((isCodeResponse || isBehavioralResponse) && !isFollowUpResponse) {
         // Increment the counter FIRST for unique keys
         const nextTabCount = tabCounter + 1;
         const newTabKey = `response-${uuidv4()}`; // Use UUID for guaranteed uniqueness
         const newTab: LocalTabData = { key: newTabKey, filename: tabFilename, language: tabLanguage, code: tabCode, analysis: tabAnalysis, structuredAnalysis: tabStructuredAnalysis, responseId: finalResponseId, functionCall: functionCallData ?? undefined, followUps: [] };
         logger.info(`[App] Creating new tab:`, newTab);
         setTabData(prev => [...prev, newTab]);
         setActiveTabKey(newTabKey);
         setTabCounter(nextTabCount); // Use the same incremented value
         if (isBehavioralResponse) { setLastBehavioralTabData(newTab); setLastCodeTabData(null); }
         else if (isCodeResponse) { setLastCodeTabData(newTab); setLastBehavioralTabData(null); }
         addTranscriptBreadcrumb(`Generated ${tabFilename}`, { analysisSummary: breadcrumbSummary, codePreview: breadcrumbPreview });
         breadcrumbAdded = true;

      } else if (isGeneralResponse) {
         setLastBehavioralTabData(null);
         setLastCodeTabData(null);
         if (!breadcrumbAdded) {
            addTranscriptBreadcrumb(`Generated ${tabFilename}`, { analysisSummary: breadcrumbSummary, codePreview: breadcrumbPreview });
         }
      }

    } catch (error) { // Main catch block
      logger.error('[App] Error fetching or processing response:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      addTranscriptMessage(uuidv4(), 'assistant', `Error fetching response: ${errorMessage}`);
      setChatStatus('error');
      setPreviousChatSuccess(false);
      setLastBehavioralTabData(null); setLastCodeTabData(null);
    } finally {
       // Remove conversation history update from here, as context is managed by OpenAI/backend
     }
        logger.info("[DEBUG] Successfully reached end of speaker completion IF block.");
     break; // End of .completed case
   }
   // <<<<<<<<<<<<<<<<<<<<<<<<<<<< END OF ADDED FETCH CALL >>>>>>>>>>>>>>>>>>>>>>>>>>
   default:
     // logger.info(`[App] Ignoring event type: ${event.type}`);
     break;
 }
}, [
   addTranscriptMessage, addTranscriptBreadcrumb, setChatStatus, setPreviousChatSuccess,
   tabCounter, lastResponseId, conversationId,
   lastBehavioralTabData, lastCodeTabData,
   setActiveTabKey, setTabData, setTabCounter, setLastResponseId, setCurrentFunctionName,
   setLastBehavioralTabData, setLastCodeTabData,
   // Add new state dependencies for mic transcript storage
   lastMicTranscript, setLastMicTranscript,
   setCurrentTranscript
]);
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
