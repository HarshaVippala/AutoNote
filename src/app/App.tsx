
"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

import Image from "next/image";

// UI components
import Transcript from "./components/Transcript";
import Dashboard from "./components/Dashboard";
import AgentAnswers from "./components/AgentAnswers";

// Types
import { AgentConfig, SessionStatus } from "@/app/types";

// Context providers & hooks
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { useEvent } from "@/app/contexts/EventContext";
import { useHandleServerEvent } from "./hooks/useHandleServerEvent";

// Utilities
import { createRealtimeConnection } from "./lib/realtimeConnection";

// Agent configs
import { allAgentSets, defaultAgentSetKey } from "@/app/agentConfigs";

function App() {
  const searchParams = useSearchParams();

  const { transcriptItems, addTranscriptMessage, addTranscriptBreadcrumb } =
    useTranscript();
  const { logClientEvent, logServerEvent } = useEvent();

  const [selectedAgentName, setSelectedAgentName] = useState<string>("");
  const [selectedAgentConfigSet, setSelectedAgentConfigSet] =
    useState<AgentConfig[] | null>(null);

  const [, setDataChannel] = useState<RTCDataChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const [sessionStatus, setSessionStatus] =
    useState<SessionStatus>("DISCONNECTED");

  const [isEventsPaneExpanded, setIsEventsPaneExpanded] =
    useState<boolean>(true);
  const [isAnswersPaneExpanded, setIsAnswersPaneExpanded] = useState<boolean>(true);
  const [userText, setUserText] = useState<string>("");
  const [isMicrophoneMuted, setIsMicrophoneMuted] = useState<boolean>(false);
  const [activeMobilePanel, setActiveMobilePanel] = useState<number>(0);
  const [isMobileView, setIsMobileView] = useState<boolean>(false);
  
  // Touch event handlers
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  
  // Minimum required distance between touchStart and touchEnd to be detected as swipe
  const minSwipeDistance = 50;

  const sendClientEvent = (eventObj: any, eventNameSuffix = "") => {
    if (dcRef.current && dcRef.current.readyState === "open") {
      logClientEvent(eventObj, eventNameSuffix);
      dcRef.current.send(JSON.stringify(eventObj));
    } else {
      logClientEvent(
        { attemptedEvent: eventObj.type },
        "error.data_channel_not_open"
      );
      console.error(
        "Failed to send message - no data channel available",
        eventObj
      );
    }
  };

  const handleServerEventRef = useHandleServerEvent({
    setSessionStatus,
    selectedAgentName,
    selectedAgentConfigSet,
    sendClientEvent,
    setSelectedAgentName,
  });

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
    if (selectedAgentName && sessionStatus === "DISCONNECTED") {
      connectToRealtime();
    }
  }, [selectedAgentName]);

  useEffect(() => {
    if (
      sessionStatus === "CONNECTED" &&
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
      updateSession(true);
    }
  }, [selectedAgentConfigSet, selectedAgentName, sessionStatus]);

  // Update microphone state when mute status changes
  useEffect(() => {
    if (audioTrackRef.current) {
      audioTrackRef.current.enabled = !isMicrophoneMuted;
    }
  }, [isMicrophoneMuted]);

  const fetchEphemeralKey = async (): Promise<string | null> => {
    logClientEvent({ url: "/session" }, "fetch_session_token_request");
    const tokenResponse = await fetch("/api/session");
    const data = await tokenResponse.json();
    logServerEvent(data, "fetch_session_token_response");

    if (!data.client_secret?.value) {
      logClientEvent(data, "error.no_ephemeral_key");
      console.error("No ephemeral key provided by the server");
      setSessionStatus("DISCONNECTED");
      return null;
    }

    return data.client_secret.value;
  };

  const connectToRealtime = async () => {
    if (sessionStatus !== "DISCONNECTED") return;
    setSessionStatus("CONNECTING");

    try {
      const EPHEMERAL_KEY = await fetchEphemeralKey();
      if (!EPHEMERAL_KEY) {
        return;
      }

      if (!audioElementRef.current) {
        audioElementRef.current = document.createElement("audio");
      }
      audioElementRef.current.autoplay = true;
      audioElementRef.current.volume = 0;

      const { pc, dc, audioTrack } = await createRealtimeConnection(
        EPHEMERAL_KEY,
        audioElementRef
      );
      pcRef.current = pc;
      dcRef.current = dc;
      audioTrackRef.current = audioTrack;

      // Apply initial mute state
      if (audioTrackRef.current) {
        audioTrackRef.current.enabled = !isMicrophoneMuted;
      }

      dc.addEventListener("open", () => {
        logClientEvent({}, "data_channel.open");
      });
      dc.addEventListener("close", () => {
        logClientEvent({}, "data_channel.close");
      });
      dc.addEventListener("error", (err: any) => {
        logClientEvent({ error: err }, "data_channel.error");
      });
      dc.addEventListener("message", (e: MessageEvent) => {
        handleServerEventRef.current(JSON.parse(e.data));
      });

      setDataChannel(dc);
    } catch (err) {
      console.error("Error connecting to realtime:", err);
      setSessionStatus("DISCONNECTED");
    }
  };

  const disconnectFromRealtime = () => {
    if (pcRef.current) {
      pcRef.current.getSenders().forEach((sender) => {
        if (sender.track) {
          sender.track.stop();
        }
      });

      pcRef.current.close();
      pcRef.current = null;
    }
    audioTrackRef.current = null;
    setDataChannel(null);
    setSessionStatus("DISCONNECTED");

    logClientEvent({}, "disconnected");
  };

  const sendSimulatedUserMessage = (text: string) => {
    const id = uuidv4().slice(0, 32);
    addTranscriptMessage(id, "user", text, true, "user");

    sendClientEvent(
      {
        type: "conversation.item.create",
        item: {
          id,
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }],
        },
      },
      "(simulated user text message)"
    );
    sendClientEvent(
      { type: "response.create" },
      "(trigger response after simulated user text message)"
    );
  };

  const updateSession = (shouldTriggerResponse: boolean = false) => {
    sendClientEvent(
      { type: "input_audio_buffer.clear" },
      "clear audio buffer on session update"
    );

    const currentAgent = selectedAgentConfigSet?.find(
      (a) => a.name === selectedAgentName
    );

    // Always use server voice activity detection regardless of microphone mute state
    const turnDetection = {
      type: "server_vad",
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 200,
      create_response: true,
    };

    const instructions = currentAgent?.instructions || "";
    const tools = currentAgent?.tools || [];

    const sessionUpdateEvent = {
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        instructions,
        voice: "coral",
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        input_audio_transcription: { model: "whisper-1" },
        turn_detection: turnDetection,
        tools,
      },
    };

    sendClientEvent(sessionUpdateEvent);

    if (shouldTriggerResponse) {
      sendSimulatedUserMessage("hi");
    }
  };

  const cancelAssistantSpeech = async () => {
    const mostRecentAssistantMessage = [...transcriptItems]
      .reverse()
      .find((item) => item.role === "assistant");

    if (!mostRecentAssistantMessage) {
      console.warn("can't cancel, no recent assistant message found");
      return;
    }
    if (mostRecentAssistantMessage.status === "DONE") {
      console.log("No truncation needed, message is DONE");
      return;
    }

    sendClientEvent({
      type: "conversation.item.truncate",
      item_id: mostRecentAssistantMessage?.itemId,
      content_index: 0,
      audio_end_ms: Date.now() - mostRecentAssistantMessage.createdAtMs,
    });
    sendClientEvent(
      { type: "response.cancel" },
      "(cancel due to user interruption)"
    );
  };

  const handleSendTextMessage = () => {
    if (!userText.trim()) return;
    cancelAssistantSpeech();

    const messageId = uuidv4();
    addTranscriptMessage(messageId, "user", userText.trim(), false, "user");

    sendClientEvent(
      {
        type: "conversation.item.create",
        item: {
          id: messageId,
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: userText.trim() }],
        },
      },
      "(send user text message)"
    );
    setUserText("");

    sendClientEvent({ type: "response.create" }, "trigger response");
  };

  const onToggleConnection = () => {
    if (sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING") {
      disconnectFromRealtime();
      setSessionStatus("DISCONNECTED");
    } else {
      connectToRealtime();
    }
  };

  const handleSelectedAgentChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const newAgentName = e.target.value;
    setSelectedAgentName(newAgentName);
  };

  const handleDashboardToggle = (checked: boolean) => {
    setIsEventsPaneExpanded(checked);
    localStorage.setItem("logsExpanded", checked.toString());
  };

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
  
  // Check if we're in mobile view
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
  
  // Touch event handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };
  
  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    if (isLeftSwipe) {
      // Next panel (if not on the last one)
      setActiveMobilePanel(prev => Math.min(prev + 1, 2));
    }
    
    if (isRightSwipe) {
      // Previous panel (if not on the first one)
      setActiveMobilePanel(prev => Math.max(prev - 1, 0));
    }
  };

  // Top Controls Component
  const TopControls = () => (
    <div className="p-2 border-b border-gray-200 bg-white flex items-center justify-between">
      <div className="flex items-center">
        <div onClick={() => window.location.reload()} style={{ cursor: 'pointer' }}>
          <Image
            src="/openai-logomark.svg"
            alt="OpenAI Logo"
            width={20}
            height={20}
            className="mr-2"
          />
        </div>
        <div className="hidden sm:block">
          Realtime API <span className="text-gray-500">Agents</span>
        </div>
      </div>
      
      <div className="flex space-x-4 items-center">
        {/* Connection Button */}
        <button
          onClick={onToggleConnection}
          className={`text-white text-sm p-2 w-28 rounded-full ${
            sessionStatus === "CONNECTED"
              ? "bg-red-600 hover:bg-red-700"
              : sessionStatus === "CONNECTING"
              ? "bg-black hover:bg-gray-900 cursor-not-allowed"
              : "bg-black hover:bg-gray-900"
          }`}
          disabled={sessionStatus === "CONNECTING"}
        >
          {sessionStatus === "CONNECTED"
            ? "Disconnect"
            : sessionStatus === "CONNECTING"
            ? "Connecting..."
            : "Connect"}
        </button>
        
        {/* Microphone Button */}
        <button
          onClick={() => setIsMicrophoneMuted(!isMicrophoneMuted)}
          disabled={sessionStatus !== "CONNECTED"}
          className={`py-1 px-3 rounded-full flex items-center gap-1 text-sm ${
            sessionStatus !== "CONNECTED"
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : isMicrophoneMuted
              ? "bg-red-100 text-red-700 hover:bg-red-200 cursor-pointer"
              : "bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer"
          }`}
        >
          {isMicrophoneMuted ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                <path d="M13 8c0 .564-.094 1.107-.266 1.613l-.814-.814A4.02 4.02 0 0 0 12 8V7a.5.5 0 0 1 1 0v1zm-5 4c.818 0 1.578-.245 2.212-.667l.718.719a4.973 4.973 0 0 1-2.43.923V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 1 0v1a4 4 0 0 0 4 4zm3-9v4.879L5.158 2.037A3.001 3.001 0 0 1 11 3z"/>
                <path d="M9.486 10.607 5 6.12V8a3 3 0 0 0 4.486 2.607zm-7.84-9.253 12 12 .708-.708-12-12-.708.708z"/>
              </svg>
              <span className="ml-1">Unmute</span>
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                <path d="M5 3a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0V3z"/>
                <path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5z"/>
              </svg>
              <span className="ml-1">Mute</span>
            </>
          )}
        </button>
        
        {isMobileView ? (
          <div className="flex space-x-2">
            {['Chat', 'Answers', 'Dashboard'].map((name, index) => (
              <button
                key={index}
                className={`w-2 h-2 rounded-full ${
                  activeMobilePanel === index 
                    ? 'bg-blue-500' 
                    : 'bg-gray-300'
                }`}
                onClick={() => setActiveMobilePanel(index)}
              />
            ))}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <input
                id="answers"
                type="checkbox"
                checked={isAnswersPaneExpanded}
                onChange={e => setIsAnswersPaneExpanded(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="answers" className="cursor-pointer text-sm">
                Answers
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="logs"
                type="checkbox"
                checked={isEventsPaneExpanded}
                onChange={e => handleDashboardToggle(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="logs" className="cursor-pointer text-sm">
                Dashboard
              </label>
            </div>
          </>
        )}
        
        {/* Agent Selection (only if multiple agents available) */}
        {selectedAgentConfigSet && selectedAgentConfigSet.length > 1 && (
          <div className="relative inline-block">
            <select
              value={selectedAgentName}
              onChange={handleSelectedAgentChange}
              className="appearance-none border border-gray-300 rounded-lg text-sm px-2 py-1 pr-6 cursor-pointer font-normal focus:outline-none"
            >
              {selectedAgentConfigSet?.map(agent => (
                <option key={agent.name} value={agent.name}>
                  {agent.name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1 text-gray-600">
              <svg
                className="h-3 w-3"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 10.44l3.71-3.21a.75.75 0 111.04 1.08l-4.25 3.65a.75.75 0 01-1.04 0L5.21 8.27a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="text-base flex flex-col h-screen bg-gray-100 text-gray-800 relative">
      <TopControls />

      {!isMobileView ? (
        // Desktop layout
        <div className="flex flex-1 gap-2 px-2 pb-2 pt-2 overflow-hidden">
          <div className={`${(isAnswersPaneExpanded || isEventsPaneExpanded) ? 'w-1/3' : 'w-full'} transition-all duration-200 h-full`}>
            <Transcript
              userText={userText}
              setUserText={setUserText}
              onSendMessage={handleSendTextMessage}
              canSend={
                sessionStatus === "CONNECTED" &&
                dcRef.current?.readyState === "open"
              }
            />
          </div>

          <div className="flex flex-1 gap-2 h-full">
            {isAnswersPaneExpanded && (
              <div className={`${isEventsPaneExpanded ? 'w-1/2' : 'w-full'} transition-all duration-200 h-full`}>
                <AgentAnswers isExpanded={true} />
              </div>
            )}
            
            {isEventsPaneExpanded && (
              <div className={`${isAnswersPaneExpanded ? 'w-1/2' : 'w-full'} transition-all duration-200 h-full`}>
                <Dashboard isExpanded={true} isDashboardEnabled={isEventsPaneExpanded} />
              </div>
            )}
          </div>
        </div>
      ) : (
        // Mobile layout with swipe
        <div 
          className="mobile-swipe-container flex-1 overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div 
            className="mobile-swipe-panel"
            style={{ transform: `translateX(${(activeMobilePanel * -100)}%)` }}
          >
            <Transcript
              userText={userText}
              setUserText={setUserText}
              onSendMessage={handleSendTextMessage}
              canSend={
                sessionStatus === "CONNECTED" &&
                dcRef.current?.readyState === "open"
              }
            />
          </div>
          
          <div 
            className="mobile-swipe-panel"
            style={{ transform: `translateX(${100 - (activeMobilePanel * 100)}%)` }}
          >
            <AgentAnswers isExpanded={true} />
          </div>
          
          <div 
            className="mobile-swipe-panel"
            style={{ transform: `translateX(${200 - (activeMobilePanel * 100)}%)` }}
          >
            <Dashboard isExpanded={true} isDashboardEnabled={true} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
