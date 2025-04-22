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
}

// --- New Inner Component --- 
function AppContent({ 
  connectionState, 
  isMicrophoneMuted, 
  setIsMicrophoneMuted, 
  onToggleConnection, 
  handleMicStatusUpdate,
  connectTrigger,
  disconnectTrigger,
  transcriptItems, // Destructure props
  userText,
  setUserText,
  isAnswersPaneExpanded,
  isMobileView,
  setActiveMobilePanel,
  activeMobilePanel,
}: AppContentProps) {
  // Hooks that need context can be called here
  const { setChatStatus, setPreviousChatSuccess } = useStatus();
  const { addTranscriptMessage } = useTranscript(); // Assuming TranscriptProvider wraps App

  // Move handleProcessTurn here as it uses context hooks
  const handleProcessTurn = useCallback(async (turn: TranscriptTurn) => {
    console.log('[AppContent] Received turn to process:', turn);
    
    const userSaid = turn.micTranscript;
    const speakerSaid = turn.speakerTranscript;

    if (speakerSaid) {
      console.log(`[AppContent] Speaker finished saying: "${speakerSaid}" - Triggering Chat API...`);
      
      setChatStatus('processing');
      setPreviousChatSuccess(false);

      try {
        console.log('[AppContent] Attempting fetch to /api/chat/completions...');
        const response = await fetch('/api/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            messages: [{ role: 'user', content: speakerSaid }] 
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' }));
          console.error('[AppContent] Chat API Error:', response.status, errorData);
          setChatStatus('error');
          setPreviousChatSuccess(false); 
        } else {
          const result = await response.json();
          console.log('[AppContent] Chat API Success:', result);
          setChatStatus('done');
          setPreviousChatSuccess(true);
          const assistantMessage = result.choices?.[0]?.message?.content || result.message || 'No content received'; 
          addTranscriptMessage(uuidv4(), 'assistant', assistantMessage);
        }
      } catch (error) {
        console.error('[AppContent] CAUGHT fetch error:', error);
        setChatStatus('error');
        setPreviousChatSuccess(false);
      }
    } else if (userSaid) {
      console.log(`[AppContent] User finished saying: "${userSaid}"`);
    }
  }, [addTranscriptMessage, setChatStatus, setPreviousChatSuccess]);

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
                          micConnectionStatus={connectionState === 'CONNECTED' ? 'connected' : connectionState === 'CONNECTING' ? 'connecting' : 'disconnected'} 
                          onMuteToggle={() => setIsMicrophoneMuted(!isMicrophoneMuted)} // Pass setter directly
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
                        micConnectionStatus={connectionState === 'CONNECTED' ? 'connected' : connectionState === 'CONNECTING' ? 'connecting' : 'disconnected'}
                        onMuteToggle={() => setIsMicrophoneMuted(!isMicrophoneMuted)} // Pass setter directly
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

  // --- Callbacks modifying App state --- 
  const handleMicStatusUpdate = useCallback((status: WebRTCConnectionStatus) => {
    console.log(`App received mic status update: ${status}`);
    switch (status) {
      case 'connecting': setConnectionState('CONNECTING'); break;
      case 'connected': setConnectionState('CONNECTED'); break;
      case 'disconnected': setConnectionState('DISCONNECTED'); break;
      case 'failed': case 'error': setConnectionState('ERROR'); break;
      default: setConnectionState('INITIAL');
    }
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
        connectTrigger={connectTrigger}
        disconnectTrigger={disconnectTrigger}
        transcriptItems={transcriptItems}
        userText={userText}
        setUserText={setUserText}
        isAnswersPaneExpanded={isAnswersPaneExpanded}
        isMobileView={isMobileView}
        setActiveMobilePanel={setActiveMobilePanel}
        activeMobilePanel={activeMobilePanel}
      />
    </StatusProvider>
  );
}

export default App;
