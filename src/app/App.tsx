"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import Image from "next/image";

// UI components
import Transcript from "./components/Transcript";
import Dashboard from "./components/Dashboard";
import AgentAnswers from "./components/AgentAnswers";
import TopControls from "./components/TopControls";
import MobileSwipeContainer from "./components/MobileSwipeContainer";

// Types
import { AgentConfig, ConnectionState, TranscriptItem, TranscriptTurn } from "@/app/types";

// Context providers & hooks
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { useEvent } from "@/app/contexts/EventContext";
import { useStatus, StatusProvider } from "@/app/contexts/StatusContext";

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
  transcriptItems: TranscriptItem[]; 
  userText: string;
  setUserText: (text: string) => void;
  isAnswersPaneExpanded: boolean;
  isMobileView: boolean | null;
  setActiveMobilePanel: (panel: number) => void;
  activeMobilePanel: number;
  micConnectionStatus: WebRTCConnectionStatus;
  speakerConnectionStatus: WebRTCConnectionStatus;
  onReconnectMic: () => void;
  onReconnectSpeaker: () => void;
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
  isAnswersPaneExpanded,
  isMobileView,
  setActiveMobilePanel,
  activeMobilePanel,
  micConnectionStatus,
  speakerConnectionStatus,
  onReconnectMic,
  onReconnectSpeaker,
}: AppContentProps) {
  // Hooks that need context can be called here
  const { setChatStatus, setPreviousChatSuccess } = useStatus();
  const { addTranscriptMessage } = useTranscript(); // Assuming TranscriptProvider wraps App
  
  // Add state for conversation history
  const [conversationHistory, setConversationHistory] = useState<Array<{role: string, content: string}>>([]);
  const MAX_HISTORY_LENGTH = 10; // Maximum number of messages to keep in history

  // Move handleProcessTurn here as it uses context hooks
  const handleProcessTurn = useCallback(async (turn: TranscriptTurn) => {
    console.log('[AppContent] Received turn to process:', turn);
    
    const userSaid = turn.micTranscript;
    const speakerSaid = turn.speakerTranscript;

    // Only proceed if we have some transcript content
    if (!userSaid && !speakerSaid) {
      console.log('[AppContent] No transcript content to process, skipping API call');
      return;
    }

    // Determine which transcript to use - prefer speaker transcript if available
    const transcriptToProcess = speakerSaid || userSaid;
    console.log(`[AppContent] Processing transcript: "${transcriptToProcess}"`);
    
    setChatStatus('processing');
    setPreviousChatSuccess(false);

    // Create AbortController for cancellation support
    const abortController = new AbortController();
    const signal = abortController.signal;

    try {
      console.log('[AppContent] Preparing fetch to /api/chat/completions...');
      
      // Define the messages array including the refined developer instruction
      const messagesToSend = [
        {
          role: 'developer',
          content: "Your response must strictly follow this structure: 1. **Analysis & Approach:** Briefly analyze the user's query and outline your plan. 2. **Plan:** Present a clear, numbered list of steps. 3. **Execution:** For each step, use a bold title and provide the content/action for that step. 4. **Review & Conclusion:** Briefly review your reasoning, check for errors, and state your final conclusion or answer. Absolutely avoid conversational fluff, greetings (like 'Hello!'), or closing remarks (like 'Let me know if you need anything else!'). Focus *only* on executing the request according to the structure."
        },
        // Include conversation history
        ...conversationHistory,
        // Add the current user message
        { role: 'user', content: transcriptToProcess }
      ];

      console.log('[AppContent] Sending messages:', messagesToSend);

      // Using streaming as recommended in the strategy document
      const response = await fetch('/api/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          messages: messagesToSend,
          stream: true // Enable streaming for better responsiveness
        }),
        signal // Pass AbortController signal for cancellation
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' }));
        console.error('[AppContent] Chat API Error:', response.status, errorData);
        setChatStatus('error');
        setPreviousChatSuccess(false); 
        return;
      }

      // Handle streaming response
      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedResponse = '';

      console.log('[AppContent] Starting to process streaming response');

      // Process the stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        // Process each chunk (lines starting with "data: ")
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            if (data === '[DONE]') {
              // Stream completed
              console.log('[AppContent] Stream completed');
              break;
            }
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                accumulatedResponse += content;
                // You can update UI incrementally here if desired
              }
            } catch (e) {
              console.error('[AppContent] Error parsing chunk:', e);
            }
          }
        }
      }

      console.log('[AppContent] Chat API Success - accumulated response:', accumulatedResponse);
      setChatStatus('done');
      setPreviousChatSuccess(true);
      
      if (accumulatedResponse) {
        // Add the message to the transcript
        addTranscriptMessage(uuidv4(), 'assistant', accumulatedResponse);
        
        // Update conversation history with proper typing
        setConversationHistory(prev => {
          // Ensure all content values are strings
          const userMessage = { role: 'user', content: transcriptToProcess || '' };
          const assistantMessage = { role: 'assistant', content: accumulatedResponse || '' };
          
          const newHistory = [
            ...prev,
            userMessage,
            assistantMessage
          ];
          
          // Limit history length, keeping only the most recent messages
          if (newHistory.length > MAX_HISTORY_LENGTH) {
            return newHistory.slice(newHistory.length - MAX_HISTORY_LENGTH);
          }
          
          return newHistory;
        });
      } else {
        console.warn('[AppContent] No content received from API');
      }
    } catch (error) {
      // Check if this was an abort error (user interruption)
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.log('[AppContent] Fetch aborted by user - skipping error handling');
        return;
      }

      console.error('[AppContent] CAUGHT fetch error:', error);
      setChatStatus('error');
      setPreviousChatSuccess(false);
    }
  }, [addTranscriptMessage, setChatStatus, setPreviousChatSuccess, conversationHistory]);

  // Return the main layout structure
  return (
      <div className="text-base flex flex-col h-screen bg-gray-100 text-gray-800 relative rounded-xl">
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
              <div className="relative w-full h-1 bg-gray-200 rounded-full">
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
                  <div className="flex flex-1 gap-1 px-2 pb-2 pt-2 overflow-hidden rounded-xl">
                    <div className="flex-1 flex flex-row h-full gap-1">
                      {isAnswersPaneExpanded && (
                        <div className={`w-2/5 transition-all duration-200 h-full rounded-xl border border-gray-600`}>
                          <Transcript
                            userText={userText}
                            setUserText={setUserText}
                            onSendMessage={() => { console.warn("Send message not implemented yet."); }}
                            canSend={false}
                          />
                        </div>
                      )}

                      {isAnswersPaneExpanded && (
                        <div className={`w-3/5 transition-all duration-200 h-full rounded-xl border border-gray-600 border-r`}>
                           {/* Transcript Messages Display Area */}
                          <div className="flex-1 overflow-y-auto p-2 flex flex-col-reverse space-y-2 space-y-reverse">
                            {transcriptItems
                              .filter(item => item.type === 'MESSAGE')
                              .map((item) => (
                                <div
                                  key={item.itemId}
                                  className="w-full p-2 rounded-md shadow-sm bg-white border border-gray-200"
                                >
                                  <p className="text-xs font-medium text-gray-500 mb-1">{item.agentName || item.role}</p>
                                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{item.title}</p>
                                </div>
                              ))}
                          </div>
                          {transcriptItems.filter(item => item.type === 'MESSAGE').length === 0 && (
                            <div className="flex-1 flex items-center justify-center text-gray-400">
                              No responses yet
                            </div>
                          )}
                        </div>
                      )}

                      <div style={{ width: "56px", minWidth: "56px", maxWidth: "56px", alignSelf: "stretch", flexShrink: 0 }} className="rounded-xl border border-gray-600">
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
                    />
                     {/* Panel 2: Transcript Messages */}
                    <div className="h-full flex flex-col">
                      <div className="flex-1 overflow-y-auto p-2 flex flex-col-reverse space-y-2 space-y-reverse">
                        {transcriptItems
                          .filter(item => item.type === 'MESSAGE')
                          .map((item) => (
                            <div 
                              key={item.itemId}
                              className="w-full p-2 rounded-md shadow-sm bg-white border border-gray-200"
                            >
                              <p className="text-xs font-medium text-gray-500 mb-1">{item.agentName || item.role}</p>
                              <p className="text-sm text-gray-800 whitespace-pre-wrap">{item.title}</p>
                            </div>
                          ))}
                      </div>
                      {transcriptItems.filter(item => item.type === 'MESSAGE').length === 0 && (
                        <div className="flex-1 flex items-center justify-center text-gray-400">
                          No responses yet
                        </div>
                      )}
                    </div>
                     {/* Panel 3: Dashboard */}
                    <div style={{ width: "56px", minWidth: "56px", maxWidth: "56px" }} className="h-full rounded-xl border border-gray-600">
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
  const [isMicrophoneMuted, setIsMicrophoneMuted] = useState<boolean>(false);
  const [isAnswersPaneExpanded, setIsAnswersPaneExpanded] = useState<boolean>(true);
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
    const storedAnswersExpanded = localStorage.getItem("answersExpanded");
    if (storedAnswersExpanded) setIsAnswersPaneExpanded(storedAnswersExpanded === "true");
  }, []);

  useEffect(() => {
    localStorage.setItem("microphoneMuted", isMicrophoneMuted.toString());
  }, [isMicrophoneMuted]);

  useEffect(() => {
    localStorage.setItem("answersExpanded", isAnswersPaneExpanded.toString());
  }, [isAnswersPaneExpanded]);

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
        isAnswersPaneExpanded={isAnswersPaneExpanded}
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
