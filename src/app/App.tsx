"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

import Image from "next/image";

// UI components
import Transcript from "./components/Transcript";
import Dashboard from "./components/Dashboard";
import AgentAnswers from "./components/AgentAnswers";
import TopControls from "./components/TopControls";

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
  const [activeMobilePanel, setActiveMobilePanel] = useState<number>(0); // Default to Transcript
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

    // For smoother visual feedback during swipe
    if (touchStart && e.targetTouches[0].clientX) {
      const difference = touchStart - e.targetTouches[0].clientX;
      const maxDiff = window.innerWidth * 0.15; // Limit drag effect

      // Determine max panel index based on if dashboard is enabled
      const maxPanelIndex = isEventsPaneExpanded ? 2 : 1;

      // Only apply visual feedback if difference is within acceptable range
      // and prevent rightward swipe past the maximum allowed panel
      if (Math.abs(difference) < maxDiff) {
        const swipePanels = document.querySelectorAll('.mobile-swipe-panel');
        const translateOffset = -activeMobilePanel * 100;

        // Prevent rightward swipe to dashboard when it's disabled
        if (!isEventsPaneExpanded && difference < 0 && activeMobilePanel >= maxPanelIndex) {
          return;
        }

        swipePanels.forEach((panel, index) => {
          const el = panel as HTMLElement;
          const panelTranslate = translateOffset + (index * 100) - (difference / window.innerWidth * 20);
          el.style.transform = `translateX(${panelTranslate}%)`;
        });
      }
    }
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) {
      // Reset to original positions if no complete swipe detected
      const swipePanels = document.querySelectorAll('.mobile-swipe-panel');
      swipePanels.forEach((panel, index) => {
        const el = panel as HTMLElement;
        const translateOffset = activeMobilePanel * -100;
        el.style.transform = `translateX(${100 * index + translateOffset}%)`;
      });
      return;
    }

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    // Reset touch values
    setTouchStart(null);
    setTouchEnd(null);

    // Determine maximum panel index based on dashboard state
    const maxPanelIndex = isEventsPaneExpanded ? 2 : 1;

    if (isLeftSwipe && activeMobilePanel < maxPanelIndex) {
      // Next panel - only allow swipe to dashboard (panel 2) if it's enabled
      const nextPanel = Math.min(activeMobilePanel + 1, maxPanelIndex);
      setActiveMobilePanel(nextPanel);
    } else if (isRightSwipe && activeMobilePanel > 0) {
      // Previous panel
      setActiveMobilePanel(prev => Math.max(prev - 1, 0));
    } else {
      // Reset to original positions if no change
      const swipePanels = document.querySelectorAll('.mobile-swipe-panel');
      swipePanels.forEach((panel, index) => {
        const el = panel as HTMLElement;
        const translateOffset = activeMobilePanel * -100;
        el.style.transform = `translateX(${100 * index + translateOffset}%)`;
      });
    }
  };

  return (
    <div className="text-base flex flex-col h-screen bg-gray-100 text-gray-800 relative rounded-xl">
      <TopControls
        sessionStatus={sessionStatus}
        isMicrophoneMuted={isMicrophoneMuted}
        setIsMicrophoneMuted={setIsMicrophoneMuted}
        onToggleConnection={onToggleConnection}
        isMobileView={isMobileView}
        isEventsPaneExpanded={isEventsPaneExpanded}
        setIsEventsPaneExpanded={setIsEventsPaneExpanded}
        handleDashboardToggle={handleDashboardToggle}
        setActiveMobilePanel={setActiveMobilePanel}
        activeMobilePanel={activeMobilePanel}
      />

      {!isMobileView ? (
        // Desktop layout
        <div className="flex flex-1 gap-1 px-2 pb-2 pt-2 overflow-hidden rounded-xl">
          {/* Transcript Panel */}
          {isAnswersPaneExpanded && (
            <div className={`${isEventsPaneExpanded ? 'w-1/4' : 'w-2/5'} transition-all duration-200 h-full rounded-xl border border-gray-600`}>
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
          )}

          {/* Agent Answers Panel */}
          {isAnswersPaneExpanded && (
            <div className={`${isEventsPaneExpanded ? 'w-1/2' : 'w-3/5'} transition-all duration-200 h-full rounded-xl border border-gray-600`}>
              <AgentAnswers isExpanded={isAnswersPaneExpanded} />
            </div>
          )}

          {/* Dashboard Panel */}
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
        // Mobile layout with swipe
        <div 
          className="mobile-swipe-container flex-1 overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Conversation Panel */}
          <div 
            className="mobile-swipe-panel absolute top-0 left-0 w-full h-full transition-transform duration-300 ease-in-out"
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

          {/* Agent Answers Panel (middle panel) */}
          <div 
            className="mobile-swipe-panel absolute top-0 left-0 w-full h-full transition-transform duration-300 easein-out"
            style={{ transform: `translateX(${100 - (activeMobilePanel * 100)}%)` }}
          >
            <AgentAnswers isExpanded={activeMobilePanel === 1} />
          </div>

          {/* Dashboard Panel */}
          <div 
            className="mobile-swipe-panel absolute top-0 left-0 w-full h-full transition-transform duration-300 ease-in-out"
            style={{ transform: `translateX(${200 - (activeMobilePanel * 100)}%)` }}
          >
            <Dashboard isExpanded={true} isDashboardEnabled={isEventsPaneExpanded} transcriptItems={transcriptItems} />
          </div>

          {/* Mobile Panel Indicators */}
          <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center gap-3 pointer-events-none">
            {['Chat', 'Answers', 'Dashboard'].map((name, index) => {
              // Only show Dashboard indicator if the dashboard is enabled
              if (name === 'Dashboard' && !isEventsPaneExpanded) {
                return null;
              }

              return (
                <div 
                  key={index}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    activeMobilePanel === index 
                      ? 'w-6 bg-blue-500' 
                      : 'w-1.5 bg-gray-300'
                  }`}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;