"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import Image from "next/image";
import { createParser } from 'eventsource-parser';
// Add OpenAI SDK and Zod imports
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

// UI components
import Transcript from "./components/Transcript";
import Dashboard from "./components/Dashboard";
import TopControls from "./components/TopControls";
import MobileSwipeContainer from "./components/MobileSwipeContainer";
import CodePane from './components/CodePane';
import AnalysisPane from './components/AnalysisPane';
import DraggablePanelLayout from './components/DraggablePanelLayout';

// Types
import { AgentConfig, ConnectionState, TranscriptItem, TranscriptTurn, TabData } from "@/app/types";

// Context providers & hooks
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { useEvent } from "@/app/contexts/EventContext";
import { useStatus, StatusProvider } from "@/app/contexts/StatusContext";
import { useTheme } from "./contexts/ThemeContext";


//Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY, // Make sure this is set in your environment
  dangerouslyAllowBrowser: true, // Only for client-side usage
});

// Define Zod schemas for structured outputs
const ComprehensiveCodeSchema = z.object({
  planning_steps: z.array(z.string()),
  language: z.string(),
  code: z.string(),
  complexity: z.object({
    time: z.string(),
    space: z.string(),
  }),
  explanation: z.string(),
});

const SimpleExplanationSchema = z.object({
  explanation: z.string(),
});

const BehavioralStarSchema = z.object({
  situation: z.string(),
  task: z.string(),
  action: z.string(),
  result: z.string(),
});

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
  responseId?: string | null;
  functionCall?: {
    id: string;
    call_id: string;
    name: string;
    arguments: string;
  };
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
  // Add state to track current function name
  const [currentFunctionName, setCurrentFunctionName] = useState<string | null>(null);

  // Add theme hook
  const { theme } = useTheme();

  // Updated handleProcessTurn to use OpenAI SDK with structured outputs
  // Add state for conversation history
  const [conversationHistory, setConversationHistory] = useState<any[]>([]);

  // Add this near the other state declarations at the beginning of the AppContent component:
  const [processedInputs, setProcessedInputs] = useState<Set<string>>(new Set());

  const handleProcessTurn = useCallback(async (turn: TranscriptTurn) => {
    console.log('[AppContent] Received turn to process:', turn);

    const speakerSaid = turn.speakerTranscript;

    if (!speakerSaid) {
      console.log('[AppContent] No Speaker transcript content to process, skipping API calls');
      return;
    }
    
    // Check if we've already processed this exact input within last few seconds
    const trimmedInput = speakerSaid.trim();
    if (processedInputs.has(trimmedInput)) {
      console.log('[AppContent] Already processed this input, skipping duplicate:', trimmedInput);
      return;
    }
    
    // Add to processed inputs
    setProcessedInputs(prev => {
      const updated = new Set(prev);
      updated.add(trimmedInput);
      return updated;
    });
    
    // Set a timeout to clear this input from processed set after a few seconds
    setTimeout(() => {
      setProcessedInputs(current => {
        const newSet = new Set(current);
        newSet.delete(trimmedInput);
        return newSet;
      });
    }, 5000); // Clear after 5 seconds
    
    console.log(`[AppContent] Requesting analysis for prompt: "${speakerSaid}"`);

    setChatStatus('processing');
    setPreviousChatSuccess(false);
    const currentTabId = tabCounter; // Capture current counter for this request

    // Initialize a new tab for the incoming response
    const newTabKey = `response-${currentTabId}`;
    const initialTabData: LocalTabData = {
      key: newTabKey,
      filename: `Response-${currentTabId}.txt`, // Default filename
      language: 'plaintext', // Default language
      code: '',
      analysis: '',
      structuredAnalysis: undefined,
      responseId: null,
    };
    setTabData(prev => [...prev, initialTabData]);
    setActiveTabKey(newTabKey);
    setTabCounter(prev => prev + 1);
    setCurrentFunctionName(null); // Reset function name

    // Add user message to conversation history
    const userMessage = { role: 'user', content: speakerSaid };
    let updatedHistory = [...conversationHistory, userMessage];

    // Check the last assistant message in history for tool calls
    const lastAssistantMessage = conversationHistory.findLast(msg => msg.role === 'assistant');
    
    // In our new approach with Responses API, we don't store tool_calls directly in the conversation history
    // Instead, when we receive function calls, we'll extract them from responseData.output when saving lastResponseId
    
    // Check if we have a previous response ID that might have had function calls
    if (lastResponseId) {
        // Find the tab data for the previous response
        const previousTab = tabData.find(tab => tab.responseId === lastResponseId);

        if (previousTab && previousTab.structuredAnalysis) {
             console.log('[AppContent] Found previous structured analysis for response ID:', lastResponseId);
             
             // For Responses API, we need to add function calls with their outputs directly to the request
             if (previousTab.functionCall) {
                 // Use the actual function call information that we stored
                 updatedHistory.push({
                     type: "function_call",
                     call_id: previousTab.functionCall.call_id,
                     name: previousTab.functionCall.name,
                     arguments: previousTab.functionCall.arguments
                 });
                 
                 // Add the function output immediately after
                 updatedHistory.push({
                     type: "function_call_output",
                     call_id: previousTab.functionCall.call_id,
                     output: JSON.stringify(previousTab.structuredAnalysis) // Send the structured data as output
                 });
             } else if (currentFunctionName) {
                 // Fallback to using the current function name if we don't have the full function call data
                 const functionCallId = `call_${Math.random().toString(36).substring(2, 15)}`;
                 updatedHistory.push({
                     type: "function_call",
                     call_id: functionCallId,
                     name: currentFunctionName,
                     arguments: '{}' // This should ideally be the actual arguments from the previous call
                 });
                 
                 // Add the function output immediately after
                 updatedHistory.push({
                     type: "function_call_output",
                     call_id: functionCallId,
                     output: JSON.stringify(previousTab.structuredAnalysis) // Send the structured data as output
                 });
             }
        } else {
             console.warn('[AppContent] Previous response ID exists but no structured analysis found');
        }
    }

    try {
      // Before sending the request, validate and fix the message format
      const sanitizedMessages = updatedHistory.map((msg: any) => {
        // If this is an assistant message with invalid content format, fix it
        if (msg.role === 'assistant') {
          // If content is an object, extract text or use empty string
          if (typeof msg.content === 'object') {
            // Try to find text in the format object or various places it might be hiding
            if (msg.content.format?.type === 'text') {
              return { ...msg, content: '' }; // Empty string for format objects
            } else if (msg.content.text) {
              return { ...msg, content: msg.content.text };
            } else {
              return { ...msg, content: '' }; // Default to empty string
            }
          }
        }
        return msg;
      });

      const response = await fetch('/api/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: sanitizedMessages,
          previous_response_id: lastResponseId,
          vector_store_id: 'vs_6806911f19a081918abcc7bbb8410f5f'
        }),
      });

      if (!response.ok) { // Check response.ok for non-2xx status codes
        const errorData = await response.json();
        console.error('[AppContent] API Error Response:', response.status, errorData);
        throw new Error(`HTTP error! status: ${response.status}, details: ${errorData.error || 'Unknown error'}`);
      }

      const responseData = await response.json();
      console.log('[AppContent] Received complete response data:', responseData);

      setChatStatus('done');
      setPreviousChatSuccess(true);

      // Process the complete response data
      const responseId = responseData.id;
      setLastResponseId(responseId);

      // IMPORTANT: For OpenAI Responses API, we need to handle conversation history differently than ChatCompletions
      // 1. In conversation history stored in state, we only store simple text messages with role/content
      // 2. When sending a request, we reconstruct function calls/outputs in the correct format for Responses API
      // 3. This prevents the "Unknown parameter: 'input[].tool_calls'" error by ensuring proper formatting
      
      // Add assistant message (including tool calls if any) to conversation history
      if (responseData.output && Array.isArray(responseData.output) && responseData.output.length > 0) {
        // Find the function_call in the output array (not assuming it's always at index 0)
        const functionCallItem = responseData.output.find((item: { type: string }) => item.type === 'function_call');
        
        console.log('[AppContent] Found function call item:', functionCallItem);
        
        if (functionCallItem) {
          setCurrentFunctionName(functionCallItem.name);
          
          // Process function call arguments directly without special casing
          try {
            const structuredAnalysisData = JSON.parse(functionCallItem.arguments);
            console.log('[AppContent] Set structured analysis from function call arguments:', structuredAnalysisData);

            // Special handling for displaying STAR answers in transcript
            if (functionCallItem.name === 'format_behavioral_star_answer') {
              // Add more detailed logging for STAR answers
              console.log('[AppContent] Processing behavioral STAR answer:', functionCallItem.name);
              console.log('[AppContent] STAR data:', structuredAnalysisData);
              
              // Add the STAR answer to the transcript with proper formatting
              const starMessage = `**Situation:** ${structuredAnalysisData.situation}\n\n**Task:** ${structuredAnalysisData.task}\n\n**Action:** ${structuredAnalysisData.action}\n\n**Result:** ${structuredAnalysisData.result}`;
              console.log('[AppContent] Adding STAR message to transcript:', starMessage.substring(0, 100) + '...');
              addTranscriptMessage(uuidv4(), 'assistant', starMessage);
              
              // Add a specific breadcrumb for STAR answers
              console.log('[AppContent] Adding STAR breadcrumb');
              addTranscriptBreadcrumb(`STAR Answer`, {
                analysisSummary: `${structuredAnalysisData.situation.substring(0, 50)}... (STAR format)`,
                codePreview: `Situation: ${structuredAnalysisData.situation.substring(0, 50)}...`
              });
            }
            
            // Log before updating tab data
            console.log('[AppContent] Active tab key before update:', activeTabKey);
            console.log('[AppContent] Tab data before update:', tabData);

            // Determine language for code pane if it's a comprehensive code response
            const codeLanguage = functionCallItem.name === 'format_comprehensive_code' ? structuredAnalysisData.language : 'plaintext';

            // Update tab data with the function call results
            setTabData(prev => {
              const newTabData = prev.map(tab =>
                tab.key === newTabKey ? {
                  ...tab,
                  filename: `${functionCallItem.name}-${currentTabId}.${codeLanguage === 'plaintext' ? 'txt' : codeLanguage}`,
                  language: codeLanguage,
                  // For STAR answers, use formatted text in code pane
                  code: functionCallItem.name === 'format_behavioral_star_answer' 
                    ? `Situation: ${structuredAnalysisData.situation}\n\nTask: ${structuredAnalysisData.task}\n\nAction: ${structuredAnalysisData.action}\n\nResult: ${structuredAnalysisData.result}`
                    : (structuredAnalysisData.code || JSON.stringify(structuredAnalysisData, null, 2)),
                  analysis: JSON.stringify(structuredAnalysisData, null, 2),
                  structuredAnalysis: structuredAnalysisData,
                  responseId: responseId,
                  functionCall: {
                    id: functionCallItem.id,
                    call_id: functionCallItem.call_id,
                    name: functionCallItem.name,
                    arguments: functionCallItem.arguments
                  }
                } : tab
              );
              console.log('[AppContent] Tab data after update:', newTabData);
              return newTabData;
            });
            
            // Ensure active tab is set correctly
            console.log('[AppContent] Setting active tab to:', newTabKey);
            setActiveTabKey(newTabKey);

            // If it's a simple explanation, add it directly to transcript
            if (functionCallItem.name === 'format_simple_explanation' && structuredAnalysisData.explanation) {
              addTranscriptMessage(uuidv4(), 'assistant', structuredAnalysisData.explanation);
            }
            
          } catch (parseError) {
            console.error('[AppContent] Error parsing function call arguments:', parseError, functionCallItem.arguments);
            addTranscriptMessage(uuidv4(), 'assistant', `Error parsing tool arguments: ${(parseError as Error).message}`);
            setTabData(prev => prev.map(tab =>
              tab.key === newTabKey ? { ...tab, analysis: `Error parsing tool arguments: ${(parseError as Error).message}\n\nRaw arguments:\n${functionCallItem.arguments}` } : tab
            ));
          }
        } else if (responseData.output[0].type === 'text' && responseData.output[0].text) {
           // Handle direct text response
           setTabData(prev => prev.map(tab =>
             tab.key === newTabKey ? { ...tab, code: responseData.output[0].text, analysis: responseData.output[0].text, language: 'plaintext', filename: `Response-${currentTabId}.txt` } : tab
           ));
           console.log('[AppContent] Set text response:', responseData.output[0].text);
        }
      } else if (responseData.text && typeof responseData.text === 'string') {
         // Handle cases where text might be directly on the response object (less likely with tools)
          setTabData(prev => prev.map(tab =>
             tab.key === newTabKey ? { ...tab, code: responseData.text, analysis: responseData.text, language: 'plaintext', filename: `Response-${currentTabId}.txt` } : tab
           ));
           console.log('[AppContent] Set direct text response from response object:', responseData.text);
      } else {
         console.warn('[AppContent] Received response with no recognizable output:', responseData);
         addTranscriptMessage(uuidv4(), 'assistant', `Received response with no recognizable output.`);
          setTabData(prev => prev.map(tab =>
             tab.key === newTabKey ? { ...tab, analysis: 'Received response with no recognizable output.' } : tab
           ));
      }

      // Add breadcrumb after processing the full response
      // Determine the content for the breadcrumb based on the response type
      let breadcrumbContent = {
        filename: `Response-${currentTabId}.txt`,
        summary: 'No content',
        preview: 'No preview available',
      };

      if (responseData.output && Array.isArray(responseData.output) && responseData.output.length > 0) {
        const outputItem = responseData.output[0];
        if (outputItem.type === 'function_call') {
          breadcrumbContent.filename = `${outputItem.name}-${currentTabId}.json`; // Default filename for tool calls
           // If it's a comprehensive code tool, use the language for the extension
           if (outputItem.name === 'format_comprehensive_code' && responseData.output[0].arguments) {
               try {
                   const args = JSON.parse(outputItem.arguments);
                   if (args.language) {
                       breadcrumbContent.filename = `${outputItem.name}-${currentTabId}.${args.language}`;
                   }
               } catch (e) {
                   console.error('[AppContent] Error parsing args for breadcrumb filename:', e);
               }
           }


          try {
            const args = JSON.parse(outputItem.arguments);
            breadcrumbContent.summary = JSON.stringify(args, null, 2).substring(0, 150) + '...';
            // For code responses, use code preview
            if (outputItem.name === 'format_comprehensive_code' && args.code) {
                 breadcrumbContent.preview = args.code.substring(0, 100) + '...';
            } else {
                 breadcrumbContent.preview = 'Function call arguments'; // Or a snippet of the args
            }

          } catch (e) {
            breadcrumbContent.summary = 'Error parsing arguments...';
            breadcrumbContent.preview = 'Error parsing arguments';
          }
        } else if (outputItem.type === 'text' && outputItem.text) {
          breadcrumbContent.filename = `Response-${currentTabId}.txt`;
          breadcrumbContent.summary = outputItem.text.substring(0, 150) + '...';
          breadcrumbContent.preview = outputItem.text.substring(0, 100) + '...';
        }
        // Add other output types to breadcrumb if needed
      } else if (responseData.text) {
         breadcrumbContent.filename = `Response-${currentTabId}.txt`;
         breadcrumbContent.summary = responseData.text.substring(0, 150) + '...';
         breadcrumbContent.preview = responseData.text.substring(0, 100) + '...';
      }


      addTranscriptBreadcrumb(`Generated ${breadcrumbContent.filename}`, {
        analysisSummary: breadcrumbContent.summary,
        codePreview: breadcrumbContent.preview
      });


    } catch (error) {
      console.error('[AppContent] Error fetching or processing response:', error);
      addTranscriptMessage(uuidv4(), 'assistant', `Error fetching response: ${(error as Error).message}`);
      setChatStatus('error');
      setPreviousChatSuccess(false);
       // Update the tab with an error message
       setTabData(prev => prev.map(tab =>
          tab.key === newTabKey ? { ...tab, analysis: `Error fetching response: ${(error as Error).message}` } : tab
        ));
    }
  }, [addTranscriptMessage, addTranscriptBreadcrumb, setChatStatus, setPreviousChatSuccess, tabCounter, lastResponseId, conversationHistory, tabData, processedInputs]); // Add processedInputs to dependency array

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
                  // --- Desktop Layout - UPDATED TO USE NEW COMPONENT ---
                  <DraggablePanelLayout
                    theme={theme} 
                    activeTabKey={activeTabKey ?? ''}
                    onTabChange={setActiveTabKey}
                    tabs={tabData as TabData[]}
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
                  />
                ) : (
                   // --- Mobile Layout - Keep the existing implementation --- 
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
  const [isMicrophoneMuted, setIsMicrophoneMuted] = useState<boolean>(true);
  const [userText, setUserText] = useState<string>("");
  const [activeMobilePanel, setActiveMobilePanel] = useState<number>(0);
  const [isMobileView, setIsMobileView] = useState<boolean | null>(null);
  const [connectTrigger, setConnectTrigger] = useState(0);
  const [disconnectTrigger, setDisconnectTrigger] = useState(0);
  // Add state for speaker connection status
  const [micConnectionStatus, setMicConnectionStatus] = useState<WebRTCConnectionStatus>('disconnected');
  const [speakerConnectionStatus, setSpeakerConnectionStatus] = useState<WebRTCConnectionStatus>('disconnected');

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

  // Automatically connect on component mount
  useEffect(() => {
    // Trigger connection when the component mounts
    console.log("App: Auto-connecting on component mount...");
    setConnectTrigger(c => c + 1);
  }, []); // Empty dependency array means this runs once on mount

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
      />
    </StatusProvider>
  );
}

export default App;
