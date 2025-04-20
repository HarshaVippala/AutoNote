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
import MobileSwipeContainer from "./components/MobileSwipeContainer"; // Import the new component

// Types
import { AgentConfig, ConnectionState } from "@/app/types";

// Context providers & hooks
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { useEvent } from "@/app/contexts/EventContext";

// Agent configs
import { allAgentSets, defaultAgentSetKey } from "@/app/agentConfigs";

// Assuming WebRTCConnectionStatus is defined and exported from TopControls.tsx
// This might require exporting it from TopControls.tsx first.
// Let's assume it's NOT exported yet and define it here temporarily to fix linter,
// then we can move it properly later.
type WebRTCConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'failed' | 'error';

function App() {
  const searchParams = useSearchParams();

  const { transcriptItems, addTranscriptMessage, addTranscriptBreadcrumb } =
    useTranscript();
  const {
    loggedEvents,
    logClientEvent,
    logServerEvent,
  } = useEvent();

  const [selectedAgentName, setSelectedAgentName] = useState<string>("");
  const [selectedAgentConfigSet, setSelectedAgentConfigSet] =
    useState<AgentConfig[] | null>(null);

  const [connectionState, setConnectionState] =
    useState<ConnectionState>("INITIAL");

  const [isMicrophoneMuted, setIsMicrophoneMuted] = useState<boolean>(false);
  const [isEventsPaneExpanded, setIsEventsPaneExpanded] = useState<boolean>(false);
  const [isAnswersPaneExpanded, setIsAnswersPaneExpanded] = useState<boolean>(true);
  const [userText, setUserText] = useState<string>("");
  const [activeMobilePanel, setActiveMobilePanel] = useState<number>(0);
  const [isMobileView, setIsMobileView] = useState<boolean | null>(null);

  const [connectTrigger, setConnectTrigger] = useState(0);
  const [disconnectTrigger, setDisconnectTrigger] = useState(0);

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
    if (
      connectionState === "CONNECTED" &&
      selectedAgentConfigSet &&
      selectedAgentName
    ) {
      const currentAgent = selectedAgentConfigSet.find(
        (a) => a.name === selectedAgentName
      );
      addTranscriptBreadcrumb(
        `Agent: ${selectedAgentName}`,
        currentAgent
      );
    }
  }, [selectedAgentConfigSet, selectedAgentName, connectionState, addTranscriptBreadcrumb]);

  const handleMicStatusUpdate = useCallback((status: WebRTCConnectionStatus) => {
    console.log(`App received mic status update: ${status}`);
    switch (status) {
      case 'connecting':
        setConnectionState('CONNECTING');
        break;
      case 'connected':
        setConnectionState('CONNECTED');
        break;
      case 'disconnected':
        setConnectionState('DISCONNECTED');
        break;
      case 'failed':
      case 'error':
        setConnectionState('ERROR');
        break;
      default:
        setConnectionState('INITIAL');
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

  const handleSelectedAgentChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const newAgentName = e.target.value;
    setSelectedAgentName(newAgentName);
  };

  const handleDashboardToggle = useCallback((checked: boolean) => {
    setIsEventsPaneExpanded(checked);
    localStorage.setItem("logsExpanded", checked.toString());
  }, [setIsEventsPaneExpanded]);

  useEffect(() => {
    const storedMicMuted = localStorage.getItem("microphoneMuted");
    if (storedMicMuted) {
      setIsMicrophoneMuted(storedMicMuted === "true");
    }
    const storedLogsExpanded = localStorage.getItem("logsExpanded");
    if (storedLogsExpanded) {
      setIsEventsPaneExpanded(storedLogsExpanded === "true");
    }
    const storedAnswersExpanded = localStorage.getItem("answersExpanded");
    if (storedAnswersExpanded) {
      setIsAnswersPaneExpanded(storedAnswersExpanded === "true");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("microphoneMuted", isMicrophoneMuted.toString());
  }, [isMicrophoneMuted]);

  useEffect(() => {
    localStorage.setItem("answersExpanded", isAnswersPaneExpanded.toString());
  }, [isAnswersPaneExpanded]);

  useEffect(() => {
    const checkMobileView = () => {
      setIsMobileView(window.innerWidth <= 640);
    };

    checkMobileView();
    window.addEventListener('resize', checkMobileView);

    return () => {
      window.removeEventListener('resize', checkMobileView);
    };
  }, []);

  return (
    <div className="text-base flex flex-col h-screen bg-gray-100 text-gray-800 relative rounded-xl">
      <TopControls
        appConnectionState={connectionState}
        isMicrophoneMuted={isMicrophoneMuted}
        setIsMicrophoneMuted={setIsMicrophoneMuted}
        onToggleConnection={onToggleConnection}
        isMobileView={isMobileView}
        isEventsPaneExpanded={isEventsPaneExpanded}
        setIsEventsPaneExpanded={setIsEventsPaneExpanded}
        handleDashboardToggle={handleDashboardToggle}
        setActiveMobilePanel={setActiveMobilePanel}
        activeMobilePanel={activeMobilePanel}
        triggerConnect={connectTrigger}
        triggerDisconnect={disconnectTrigger}
        onMicStatusChange={handleMicStatusUpdate}
        addTranscriptMessage={addTranscriptMessage}
      />

      {isMobileView && (
        <div className="relative w-full h-1 bg-gray-200 rounded-full">
          <div
            className="absolute top-0 left-0 h-full bg-blue-500 rounded-full transition-all duration-300 ease-in-out"
            style={{
              width: `${100 / (isEventsPaneExpanded ? 3 : 2)}%`,
              transform: `translateX(${activeMobilePanel * 100}%)`
            }}
          />
        </div>
      )}

      {/* Conditionally render the main content area only after isMobileView is determined */}
      {isMobileView !== null && (
          !isMobileView ? (
            <div className="flex flex-1 gap-1 px-2 pb-2 pt-2 overflow-hidden rounded-xl">
              {isAnswersPaneExpanded && (
                <div className={`${isEventsPaneExpanded ? 'w-1/4' : 'w-2/5'} transition-all duration-200 h-full rounded-xl border border-gray-600`}>
                  <Transcript
                    userText={userText}
                    setUserText={setUserText}
                    onSendMessage={() => { console.warn("Send message not implemented yet."); }}
                    canSend={false}
                  />
                </div>
              )}

              {isAnswersPaneExpanded && (
                <div className={`${isEventsPaneExpanded ? 'w-1/2' : 'w-3/5'} transition-all duration-200 h-full rounded-xl border border-gray-600`}>
                  <AgentAnswers isExpanded={isAnswersPaneExpanded} />
                </div>
              )}

              {isEventsPaneExpanded && (
                <div className="w-1/4 transition-all duration-200 h-full rounded-xl border border-gray-600">
                  <Dashboard 
                    isExpanded={true} 
                    isDashboardEnabled={isEventsPaneExpanded} 
                    transcriptItems={transcriptItems}
                  />
                </div>
              )}
            </div>
          ) : (
            <MobileSwipeContainer
              activeMobilePanel={activeMobilePanel}
              setActiveMobilePanel={setActiveMobilePanel}
              isEventsPaneExpanded={isEventsPaneExpanded}
            >
              <Transcript
                userText={userText}
                setUserText={setUserText}
                onSendMessage={() => { console.warn("Send message not implemented yet."); }}
                canSend={false}
              />
              <AgentAnswers isExpanded={activeMobilePanel === 1} />
              <Dashboard 
                isExpanded={true} 
                isDashboardEnabled={isEventsPaneExpanded} 
                transcriptItems={transcriptItems}
              />
            </MobileSwipeContainer>
          )
        )
       }
    </div>
  );
}

export default App;
