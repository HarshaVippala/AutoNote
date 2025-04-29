"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import Image from "next/image";
import { createParser } from 'eventsource-parser';

// UI components
import Transcript from "./components/Transcript";
import TopControls from "./components/TopControls";
import DraggablePanelLayout from './components/DraggablePanelLayout';

// Types
// Import types directly, use StarData alias internally if needed
import { AgentConfig, ConnectionState, TranscriptItem, TranscriptTurn, TabData } from "@/app/types"; // Removed BehavioralStarResponse, AnalysisResponse

// Define StarData alias locally for clarity - Placeholder as BehavioralStarResponse is not exported
type StarData = Record<string, any>; // Use a generic object type for now

// Context providers & hooks
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { useEvent } from "@/app/contexts/EventContext";
import { useStatus, StatusProvider } from "@/app/contexts/StatusContext";
import { useTheme } from "./contexts/ThemeContext";

// Define WebRTC status type locally if not exported from TopControls
type WebRTCConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'failed' | 'error';

// Extend TabData locally for state management including followUps
interface LocalTabData extends TabData {
  followUps?: StarData[]; // Array to hold follow-up STAR responses
  // Keep structuredAnalysis flexible for different response types or streaming status
  structuredAnalysis?: StarData | { status: string }; // Removed AnalysisResponse as it's not defined
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
  connectTrigger: number;
  disconnectTrigger: number;
  transcriptItems: TranscriptItem[];
  userText: string;
  setUserText: (text: string) => void;
  micConnectionStatus: WebRTCConnectionStatus;
  speakerConnectionStatus: WebRTCConnectionStatus;
  onReconnectMic: () => void;
  onReconnectSpeaker: () => void;
  onCycleViewRequest: () => void; // Add prop for cycle request
  cycleViewTrigger: number; // Add prop for cycle trigger
}

// --- Inner Component: AppContent ---
function AppContent({
  connectionState,
  isMicrophoneMuted,
  setIsMicrophoneMuted,
  onToggleConnection,
  handleMicStatusUpdate,
  handleSpeakerStatusUpdate,
  connectTrigger,
  disconnectTrigger,
  transcriptItems,
  userText,
  setUserText,
  micConnectionStatus,
  speakerConnectionStatus,
  onReconnectMic,
  onReconnectSpeaker,
  onCycleViewRequest, // Destructure cycle request handler
  cycleViewTrigger, // Destructure cycle trigger
}: AppContentProps) {
  const { chatStatus, setChatStatus, setPreviousChatSuccess } = useStatus();
  const { addTranscriptMessage, addTranscriptBreadcrumb } = useTranscript();
  const { theme } = useTheme();

  const [activeTabKey, setActiveTabKey] = useState<string | null>(null);
  const [tabData, setTabData] = useState<LocalTabData[]>([]);
  const [tabCounter, setTabCounter] = useState<number>(1);
  const [lastResponseId, setLastResponseId] = useState<string | null>(null);
  const [currentFunctionName, setCurrentFunctionName] = useState<string | null>(null);
  const [lastBehavioralTabData, setLastBehavioralTabData] = useState<LocalTabData | null>(null);
  const [lastCodeTabData, setLastCodeTabData] = useState<LocalTabData | null>(null);
  const [conversationHistory, setConversationHistory] = useState<any[]>([]);
  const [processedInputs, setProcessedInputs] = useState<Set<string>>(new Set());

  // --- Main Processing Logic ---
  const handleProcessTurn = useCallback(async (turn: TranscriptTurn) => {
    console.log('[AppContent] Received turn to process:', turn);
    const speakerSaid = turn.speakerTranscript;

    if (!speakerSaid) {
      console.log('[AppContent] No Speaker transcript content to process, skipping API calls');
      return;
    }

    const trimmedInput = speakerSaid.trim();
    if (processedInputs.has(trimmedInput)) {
      console.log('[AppContent] Already processed this input, skipping duplicate:', trimmedInput);
      return;
    }

    setProcessedInputs(prev => new Set(prev).add(trimmedInput));
    setTimeout(() => {
      setProcessedInputs(current => {
        const newSet = new Set(current);
        newSet.delete(trimmedInput);
        return newSet;
      });
    }, 5000);

    console.log(`[AppContent] Requesting analysis for prompt: "${speakerSaid}"`);
    setChatStatus('processing');
    setPreviousChatSuccess(false);
    const currentResponseId = uuidv4(); // Used as fallback if API doesn't provide one

    const userMessage = { role: 'user', content: speakerSaid };
    let updatedHistory = [...conversationHistory, userMessage];

    // Add previous function call/output context if applicable
    if (lastResponseId) {
      const previousTab = tabData.find(tab => tab.responseId === lastResponseId);
      if (previousTab?.structuredAnalysis && previousTab.functionCall) {
         console.log('[AppContent] Adding previous function call context:', previousTab.functionCall.name);
         updatedHistory.push({ type: "function_call", call_id: previousTab.functionCall.call_id, name: previousTab.functionCall.name, arguments: previousTab.functionCall.arguments });
         updatedHistory.push({ type: "function_call_output", call_id: previousTab.functionCall.call_id, output: JSON.stringify(previousTab.structuredAnalysis) });
      }
    }

    let responseData: any = null; // Define outside try block

    try {
      const sanitizedMessages = updatedHistory.map((msg: any) => {
         if (msg.role === 'assistant' && typeof msg.content === 'object' && msg.content !== null) {
           return { ...msg, content: msg.content.text || '' };
         }
         return msg;
       });

      const response = await fetch('/api/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: sanitizedMessages, vector_store_id: 'vs_6806911f19a081918abcc7bbb8410f5f' }), // Replace with dynamic ID if needed
      });

      if (!response.ok) {
        let errorDetails = 'Unknown error';
        try { const errorData = await response.json(); errorDetails = errorData.error || JSON.stringify(errorData); }
        catch (e) { errorDetails = await response.text(); }
        throw new Error(`HTTP error! status: ${response.status}, details: ${errorDetails}`);
      }

      const contentType = response.headers.get('Content-Type');
      let accumulatedFunctionArgs: { [key: number]: string } = {};
      let currentFunctionCalls: { [key: number]: any } = {};
      let streamCreatedTabKey: string | null = null;

      // --- Stream Processing ---
      if (contentType && contentType.includes('application/jsonl') && response.body) {
        console.log('[AppContent] Processing streamed JSONL response...');
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
                  const funcIndexStart = event.output_index;
                  console.log(`[Stream] Function call started (Index ${funcIndexStart}): ${event.name}`);
                  currentFunctionCalls[funcIndexStart] = { name: event.name, id: event.id, call_id: event.call_id, arguments: '', tabKey: null, isFollowUp: false, targetTabKey: null };
                  accumulatedFunctionArgs[funcIndexStart] = '';

                  if (event.name === 'format_comprehensive_code' || event.name === 'format_behavioral_star_answer') {
                    const newTabKey = `response-${tabCounter}`;
                    const isBehavioral = event.name === 'format_behavioral_star_answer';
                    const isFollowUp = isBehavioral && lastBehavioralTabData !== null;

                    if (isFollowUp) {
                      console.log('[Stream] Identified potential behavioral follow-up during stream.');
                      currentFunctionCalls[funcIndexStart].isFollowUp = true;
                      currentFunctionCalls[funcIndexStart].targetTabKey = lastBehavioralTabData.key;
                      streamCreatedTabKey = null; // Don't create a new tab yet
                    } else {
                      streamCreatedTabKey = newTabKey;
                      currentFunctionCalls[funcIndexStart].tabKey = newTabKey;
                      const initialLang = isBehavioral ? 'markdown' : 'plaintext';
                      const initialFilename = isBehavioral ? `Behavioral-${tabCounter}` : `Code-${tabCounter}`; // Placeholder name

                      const newTab: LocalTabData = {
                        key: newTabKey, filename: initialFilename, language: initialLang, code: "Streaming...", analysis: JSON.stringify({ status: "streaming" }, null, 2),
                        structuredAnalysis: { status: "streaming" }, responseId: currentResponseId, // Use fallback ID initially
                        functionCall: { id: event.id, call_id: event.call_id, name: event.name, arguments: '' },
                        followUps: [] // Initialize followUps
                      };
                      setTabData(prev => [...prev, newTab]);
                      setActiveTabKey(newTabKey);
                      setTabCounter(prev => prev + 1);
                      if (isBehavioral) { setLastBehavioralTabData(newTab); setLastCodeTabData(null); }
                      else { setLastCodeTabData(newTab); setLastBehavioralTabData(null); }
                    }
                  }
                  break;
                }
                case 'function_call_delta': {
                  const funcIndexDelta = event.output_index;
                  if (currentFunctionCalls[funcIndexDelta] && event.delta) {
                    accumulatedFunctionArgs[funcIndexDelta] += event.delta;
                    currentFunctionCalls[funcIndexDelta].arguments = accumulatedFunctionArgs[funcIndexDelta];
                    const updateKey = currentFunctionCalls[funcIndexDelta].isFollowUp
                      ? currentFunctionCalls[funcIndexDelta].targetTabKey
                      : currentFunctionCalls[funcIndexDelta].tabKey;

                    if (updateKey) {
                      try {
                        const partialArgs = JSON.parse(accumulatedFunctionArgs[funcIndexDelta]);
                        setTabData(prevTabData => prevTabData.map(tab => {
                          if (tab.key === updateKey) {
                            let updatedCode = tab.code; let updatedAnalysis = tab.analysis; let updatedFilename = tab.filename; let updatedLang = tab.language; let updatedFollowUps = tab.followUps || [];

                            if (currentFunctionCalls[funcIndexDelta].name === 'format_comprehensive_code') {
                              updatedCode = partialArgs.code || tab.code; updatedLang = partialArgs.language || tab.language;
                              if (updatedLang !== tab.language && tab.filename.startsWith('Code-')) { updatedFilename = `Code: ${updatedLang}`; }
                              updatedAnalysis = JSON.stringify(partialArgs, null, 2);
                              return { ...tab, code: updatedCode === "Streaming..." && partialArgs.code ? partialArgs.code : updatedCode, analysis: updatedAnalysis, structuredAnalysis: partialArgs, filename: updatedFilename, language: updatedLang, functionCall: { ...tab.functionCall!, arguments: accumulatedFunctionArgs[funcIndexDelta] } };
                            } else if (currentFunctionCalls[funcIndexDelta].name === 'format_behavioral_star_answer') {
                              if (currentFunctionCalls[funcIndexDelta].isFollowUp) {
                                const currentFollowUpIndex = updatedFollowUps.length - 1;
                                if (currentFollowUpIndex >= 0) {
                                  updatedFollowUps[currentFollowUpIndex] = { ...updatedFollowUps[currentFollowUpIndex], ...partialArgs };
                                } else {
                                  updatedFollowUps = [partialArgs]; // Add as first follow-up
                                }
                                updatedAnalysis = JSON.stringify(partialArgs, null, 2); // Store partial args for finalization
                                return { ...tab, analysis: updatedAnalysis, structuredAnalysis: partialArgs, followUps: updatedFollowUps }; // Update follow-ups
                              } else {
                                // Update main behavioral response
                                updatedCode = `Situation: ${partialArgs.situation?.substring(0, 50) || ''}...`; // Use situation for code preview
                                updatedAnalysis = JSON.stringify(partialArgs, null, 2);
                                if (partialArgs.situation && tab.filename.startsWith('Behavioral-')) { updatedFilename = `STAR: ${partialArgs.situation.substring(0, 15)}...`; }
                                return { ...tab, code: updatedCode, analysis: updatedAnalysis, structuredAnalysis: partialArgs, filename: updatedFilename, language: 'markdown', functionCall: { ...tab.functionCall!, arguments: accumulatedFunctionArgs[funcIndexDelta] }, followUps: updatedFollowUps };
                              }
                            }
                          }
                          return tab;
                        }));
                        // Update last tab context only for NEW tabs during stream
                        if (!currentFunctionCalls[funcIndexDelta].isFollowUp) {
                           setTabData(currentTabs => {
                              const updatedTab = currentTabs.find(t => t.key === updateKey);
                              if (updatedTab) {
                                 if (currentFunctionCalls[funcIndexDelta].name === 'format_behavioral_star_answer') { setLastBehavioralTabData(updatedTab); }
                                 else if (currentFunctionCalls[funcIndexDelta].name === 'format_comprehensive_code') { setLastCodeTabData(updatedTab); }
                              }
                              return currentTabs;
                           });
                        }
                      } catch (e) { /* Incomplete JSON, ignore */ }
                    }
                  }
                  break;
                }
                case 'text_delta': {
                  if (event.delta) { addTranscriptMessage(uuidv4(), 'assistant', event.delta, true); }
                  break;
                }
                case 'completed': {
                  console.log('[Stream] Completed event received.');
                  responseData = event.response; // Assign final data from stream
                  // Finalize follow-up data based on accumulated args
                  Object.entries(currentFunctionCalls).forEach(([indexStr, call]) => {
                     const funcIndex = parseInt(indexStr, 10);
                     if (call.isFollowUp && call.targetTabKey) {
                        try {
                           const finalArgs = JSON.parse(accumulatedFunctionArgs[funcIndex]);
                           setTabData(prevTabData => prevTabData.map(tab => {
                              if (tab.key === call.targetTabKey) {
                                 let updatedFollowUps = tab.followUps || [];
                                 const currentFollowUpIndex = updatedFollowUps.length - 1;
                                 if (currentFollowUpIndex >= 0) {
                                    updatedFollowUps[currentFollowUpIndex] = finalArgs; // Replace partial with final
                                 } else {
                                    updatedFollowUps = [finalArgs]; // Add final if it wasn't added before
                                 }
                                 console.log(`[Stream Completed] Finalizing follow-up for tab ${call.targetTabKey}`, finalArgs);
                                 return { ...tab, followUps: updatedFollowUps };
                              }
                              return tab;
                           }));
                        } catch (e) { console.error("Error parsing final follow-up args:", e); }
                     }
                  });
                  break;
                }
                case 'error': {
                  console.error('[Stream] Error event:', event.error);
                  throw new Error(event.error?.message || 'Unknown stream error');
                }
                default: break;
              }
            } catch (parseError) { console.error('[Stream] Error parsing JSON line:', line, parseError); }
          }
        }

        // Fallback finalization if stream ends without 'completed'
        if (!responseData) {
          console.warn("[Stream] ended without 'completed' event. Constructing partial response.");
          Object.entries(currentFunctionCalls).forEach(([indexStr, call]) => {
             const funcIndex = parseInt(indexStr, 10);
             if (call.isFollowUp && call.targetTabKey) {
                try {
                   const finalArgs = JSON.parse(accumulatedFunctionArgs[funcIndex]);
                   setTabData(prevTabData => prevTabData.map(tab => {
                      if (tab.key === call.targetTabKey) {
                         let updatedFollowUps = tab.followUps || [];
                         const currentFollowUpIndex = updatedFollowUps.length - 1;
                         if (currentFollowUpIndex >= 0 && JSON.stringify(updatedFollowUps[currentFollowUpIndex]) !== JSON.stringify(finalArgs)) {
                            updatedFollowUps[currentFollowUpIndex] = finalArgs;
                         } else if (currentFollowUpIndex < 0) {
                            updatedFollowUps = [finalArgs];
                         }
                         console.log(`[Stream Fallback] Finalizing follow-up for tab ${call.targetTabKey}`, finalArgs);
                         return { ...tab, followUps: updatedFollowUps };
                      }
                      return tab;
                   }));
                } catch (e) { console.error("Error parsing final follow-up args on fallback:", e); }
             }
          });
          // Construct a minimal responseData if none was received from 'completed'
          responseData = { id: currentResponseId, output: Object.values(currentFunctionCalls) };
        }
        console.log('[AppContent] Final processed data from stream:', responseData);

      } else {
        // --- Handle Non-Streamed Response ---
        console.log('[AppContent] Processing non-streamed response...');
        responseData = await response.json();
        console.log('[AppContent] Received complete response data (non-streamed):', responseData);
      }

      // --- Common Logic after getting responseData ---
      if (!responseData) { throw new Error("Failed to get response data."); }

      setChatStatus('done');
      setPreviousChatSuccess(true);
      // Assign finalResponseId *after* responseData is confirmed
      const finalResponseId = responseData.id || currentResponseId;
      setLastResponseId(finalResponseId);

      // --- Final Tab Processing & Breadcrumb Logic ---
      let isCodeResponse = false; let isBehavioralResponse = false; let isGeneralResponse = true;
      let isFollowUpResponse = false; // Flag for follow-up identification
      let tabLabel = ''; let tabLanguage = 'plaintext'; let tabCode = ''; let tabAnalysis = '';
      let tabStructuredAnalysis: any = undefined; let tabFilename = ''; let functionCallData = null;
      let breadcrumbSummary = 'Response processed.'; let breadcrumbPreview = '';
      let tentativeFilename = `Response-${tabCounter}`; // Default tentative name

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

            if (functionCallItem.name === 'format_comprehensive_code') {
              isCodeResponse = true; isGeneralResponse = false; setLastBehavioralTabData(null);
              tabLanguage = finalArgs.language || 'plaintext'; tabCode = finalArgs.code || ''; tabAnalysis = JSON.stringify(finalArgs, null, 2);
              tabLabel = `${tabLanguage} Snippet`; tentativeFilename = `Code: ${tabLanguage}`;
              breadcrumbSummary = `Code: ${tabLanguage}`; breadcrumbPreview = tabCode.substring(0, 100) + '...';
            } else if (functionCallItem.name === 'format_behavioral_star_answer') {
              isBehavioralResponse = true; isGeneralResponse = false; setLastCodeTabData(null);
              if (lastBehavioralTabData !== null) {
                 isFollowUpResponse = true;
                 console.log(`[AppContent] Identified behavioral follow-up for tab: ${lastBehavioralTabData.key}`);
              }
              tabLanguage = 'markdown'; tabAnalysis = JSON.stringify(finalArgs, null, 2);
              tabLabel = `STAR: ${finalArgs.situation?.substring(0, 15) || 'Response'}...`; tentativeFilename = tabLabel;
              breadcrumbSummary = `Behavioral: ${finalArgs.situation?.substring(0, 50)}...`; breadcrumbPreview = `Situation: ${finalArgs.situation?.substring(0, 50)}...`;
              tabCode = `Situation: ${finalArgs.situation || ''}\nTask: ...`; // Code preview
            } else if (functionCallItem.name === 'format_simple_explanation' && finalArgs.explanation) {
               isGeneralResponse = true; setLastBehavioralTabData(null); setLastCodeTabData(null);
               const explanationText = finalArgs.explanation;
               // Always add the final explanation to the transcript, even if streamed via text_delta, as a fallback.
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
           // Always add the final text response to the transcript, even if streamed via text_delta, as a fallback.
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

      tabFilename = tentativeFilename; // Finalize filename

      // --- Final Tab State Update & Creation ---
      let breadcrumbAdded = false;
      if (isFollowUpResponse && lastBehavioralTabData && tabStructuredAnalysis) {
         // Append to existing behavioral tab's followUps array
         setTabData(prevTabData => prevTabData.map(tab => {
            if (tab.key === lastBehavioralTabData.key) {
               console.log(`[AppContent] Appending follow-up to tab ${tab.key}`);
               const newFollowUps = [...(tab.followUps || []), tabStructuredAnalysis as StarData];
               // Use the correctly assigned finalResponseId
               return { ...tab, followUps: newFollowUps, responseId: finalResponseId };
            }
            return tab;
         }));
         setActiveTabKey(lastBehavioralTabData.key); // Ensure the updated tab is active
         addTranscriptBreadcrumb(`Appended follow-up to ${lastBehavioralTabData.filename}`, { analysisSummary: breadcrumbSummary, codePreview: breadcrumbPreview });
         breadcrumbAdded = true;

      } else if (streamCreatedTabKey) {
         // Finalize the state of the tab created during the stream
         setTabData(prevTabData => prevTabData.map(tab => {
            if (tab.key === streamCreatedTabKey) {
               console.log("[AppContent] Finalizing streamed tab state:", streamCreatedTabKey);
               const finalFollowUps = tab.followUps || []; // Ensure followUps array exists
               // Use the correctly assigned finalResponseId
               return { ...tab, filename: tabFilename, language: tabLanguage, code: tabCode, analysis: tabAnalysis, structuredAnalysis: tabStructuredAnalysis, responseId: finalResponseId, functionCall: functionCallData ?? tab.functionCall, followUps: finalFollowUps };
             }
             return tab;
          }));
          // Update last tab context one last time based on the finalized tab
          setTabData(currentTabs => {
             const finalTab = currentTabs.find(t => t.key === streamCreatedTabKey);
             if (finalTab) {
                if (isBehavioralResponse) { setLastBehavioralTabData(finalTab); }
                else if (isCodeResponse) { setLastCodeTabData(finalTab); }
             }
             return currentTabs;
          });
         addTranscriptBreadcrumb(`Generated ${tabFilename}`, { analysisSummary: breadcrumbSummary, codePreview: breadcrumbPreview });
         breadcrumbAdded = true;

      } else if ((isCodeResponse || isBehavioralResponse) && !isFollowUpResponse) {
         // Create a new tab if it wasn't streamed and isn't a follow-up
         const newTabKey = `response-${tabCounter}`;
         // Use the correctly assigned finalResponseId
         const newTab: LocalTabData = { key: newTabKey, filename: tabFilename, language: tabLanguage, code: tabCode, analysis: tabAnalysis, structuredAnalysis: tabStructuredAnalysis, responseId: finalResponseId, functionCall: functionCallData ?? undefined, followUps: [] }; // Initialize followUps
         console.log(`[AppContent] Creating new tab:`, newTab);
         setTabData(prev => [...prev, newTab]);
         setActiveTabKey(newTabKey);
         setTabCounter(prev => prev + 1);
         if (isBehavioralResponse) { setLastBehavioralTabData(newTab); setLastCodeTabData(null); }
         else if (isCodeResponse) { setLastCodeTabData(newTab); setLastBehavioralTabData(null); }
         addTranscriptBreadcrumb(`Generated ${tabFilename}`, { analysisSummary: breadcrumbSummary, codePreview: breadcrumbPreview });
         breadcrumbAdded = true;

      } else if (isGeneralResponse) {
         // Clear contexts for general responses
         setLastBehavioralTabData(null);
         setLastCodeTabData(null);
         // Only add breadcrumb if not already added (e.g., simple explanation handled above)
         if (!breadcrumbAdded) {
            addTranscriptBreadcrumb(`Generated ${tabFilename}`, { analysisSummary: breadcrumbSummary, codePreview: breadcrumbPreview });
         }
      }

    } catch (error) { // Main catch block
      console.error('[AppContent] Error fetching or processing response:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      addTranscriptMessage(uuidv4(), 'assistant', `Error fetching response: ${errorMessage}`);
      setChatStatus('error');
      setPreviousChatSuccess(false);
      setLastBehavioralTabData(null); setLastCodeTabData(null); // Clear contexts on error
    } finally {
       // Update conversation history regardless of success/error for context in next turn
       // Add the assistant's response (or error) to history
       const assistantResponseContent = responseData?.output?.find((item: any) => item.type === 'message')?.content?.[0]?.text?.value
                                     || responseData?.text
                                     || (responseData ? JSON.stringify(responseData) : null) // Store structured data if no text
                                     || { error: 'Failed to get response content' };

       updatedHistory.push({ role: 'assistant', content: assistantResponseContent });
       // Limit history length if needed
       // setConversationHistory(updatedHistory.slice(-MAX_HISTORY_LENGTH));
       setConversationHistory(updatedHistory);
    }
  }, [
      addTranscriptMessage, addTranscriptBreadcrumb, setChatStatus, setPreviousChatSuccess,
      tabCounter, lastResponseId, conversationHistory, tabData, processedInputs,
      lastBehavioralTabData, lastCodeTabData, // Include context states
      setActiveTabKey, setTabData, setTabCounter, setLastResponseId, setCurrentFunctionName,
      setLastBehavioralTabData, setLastCodeTabData, setConversationHistory // Include setters
  ]);

  // --- Render AppContent ---
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
          onProcessTurn={handleProcessTurn}
          onSpeakerStatusChange={handleSpeakerStatusUpdate}
          onReconnectMic={onReconnectMic}
          onReconnectSpeaker={onReconnectSpeaker}
          micConnectionStatus={micConnectionStatus}
          onCycleViewRequest={onCycleViewRequest} // Pass handler down
        />
        <div className="flex flex-col flex-1 gap-1 overflow-hidden">
          <div className={`flex-1 ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} overflow-hidden flex flex-col`}>
            <DraggablePanelLayout
              theme={theme}
              activeTabKey={activeTabKey ?? ''}
              onTabChange={setActiveTabKey}
              tabs={tabData as TabData[]} // Pass down potentially extended data, cast back to base type for prop
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
              cycleViewTrigger={cycleViewTrigger} // Pass trigger down
            />
          </div>
        </div>
      </div>
  );
}

// --- Main App Component (Wrapper) ---
function App() {
  const { transcriptItems } = useTranscript(); // Removed unused addTranscriptMessage, addTranscriptBreadcrumb
  const [connectionState, setConnectionState] = useState<ConnectionState>("INITIAL");
  const [isMicrophoneMuted, setIsMicrophoneMuted] = useState<boolean>(true);
  const [userText, setUserText] = useState<string>("");
  const [connectTrigger, setConnectTrigger] = useState(0);
  const [disconnectTrigger, setDisconnectTrigger] = useState(0);
  const [micConnectionStatus, setMicConnectionStatus] = useState<WebRTCConnectionStatus>('disconnected');
  const [speakerConnectionStatus, setSpeakerConnectionStatus] = useState<WebRTCConnectionStatus>('disconnected');
  const [cycleViewTrigger, setCycleViewTrigger] = useState(0); // State to trigger view cycle

  // --- Callbacks modifying App state ---
  const handleMicStatusUpdate = useCallback((status: WebRTCConnectionStatus) => {
    console.log(`App received mic status update: ${status}`);
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
    console.log(`App received speaker status update: ${status}`);
    setSpeakerConnectionStatus(status);
  }, []);

  const handleReconnectMic = useCallback(() => {
    console.log("App: Requesting mic reconnection...");
    setConnectTrigger(c => c + 1);
  }, []);

  const handleReconnectSpeaker = useCallback(() => {
    console.log("App: Requesting speaker reconnection...");
    setConnectTrigger(c => c + 1); // Use same trigger for now
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

  // Handler to trigger view cycle
  const handleCycleViewRequest = useCallback(() => {
    console.log("App: Requesting view cycle via trigger...");
    setCycleViewTrigger(c => c + 1);
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    console.log("App: Auto-connecting on component mount...");
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

  // Render StatusProvider wrapping AppContent
  return (
    <StatusProvider>
      <AppContent
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
        micConnectionStatus={micConnectionStatus}
        speakerConnectionStatus={speakerConnectionStatus}
        onReconnectMic={handleReconnectMic}
        onReconnectSpeaker={handleReconnectSpeaker}
        onCycleViewRequest={handleCycleViewRequest} // Pass the handler
        cycleViewTrigger={cycleViewTrigger} // Pass the trigger state
      />
    </StatusProvider>
  );
}

export default App;
