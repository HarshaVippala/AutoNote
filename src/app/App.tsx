"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

import Image from "next/image";

// UI components
import Transcript from "./components/Transcript";
import Dashboard from "./components/Dashboard";
// import AgentAnswers from "./components/AgentAnswers"; // Removed AgentAnswers component

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

  // Top Controls Component
  const TopControls: React.FC = () => (
    <div className="p-2 border-b border-gray-200 bg-white flex items-center justify-between overflow-hidden">
      <div className="flex items-center">
        <div onClick={() => window.location.reload()} style={{ cursor: 'pointer' }}>
          {/* OpenAI Logo Removed */}
          {/* <Image
            src="/openai-logomark.svg"
            alt="OpenAI Logo"
            width={20}
            height={20}
            className="mr-2"
          /> */}
          <span className="block sm:hidden font-bold text-lg">JARVIS</span>
        </div>
        <div className="hidden sm:block font-bold text-lg">
          JARVIS
        </div>
      </div>

      <div className="flex space-x-3 items-center">
        {/* Connection Button */}
        <button
          onClick={onToggleConnection}
          title={sessionStatus === "CONNECTED" ? "Disconnect" : "Connect"}
          className={`flex items-center justify-center h-9 w-9 rounded-full ${
            sessionStatus === "CONNECTED"
              ? "bg-red-600 hover:bg-red-700"
              : sessionStatus === "CONNECTING"
              ? "bg-black hover:bg-gray-900 cursor-not-allowed"
              : "bg-black hover:bg-gray-900"
          }`}
          disabled={sessionStatus === "CONNECTING"}
        >
          {sessionStatus === "CONNECTING" ? (
            <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : sessionStatus === "CONNECTED" ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="white" viewBox="0 0 16 16">
              <path d="M13.854 2.146a.5.5 0 0 1 0 .708l-11 11a.5.5 0 0 1-.708-.708l11-11a.5.5 0 0 1 .708 0Z"/>
              <path d="M2.146 2.146a.5.5 0 0 0 0 .708l11 11a.5.5 0 0 0 .708-.708l-11-11a.5.5 0 0 0-.708 0Z"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="white" viewBox="0 0 16 16">
              <path d="M6.5 10.5a.5.5 0 0 1 .5.5h1.5a.5.5 0 0 1 0 1H6a.5.5 0 0 1-.5-.5v-2A.5.5 0 0 1 6 9h4a.5.5 0 0 1 0 1H6.5v.5z"/>
              <path d="M14 9.5a4.5 4.5 0 0 1-4.5 4.5h-5A4.5 4.5 0 0 1 0 9.5v-5A4.5 4.5 0 0 1 4.5 0h5A4.5 4.5 0 0 1 14 4.5v5zm-4.5 3.5a3.5 3.5 0 0 0 3.5-3.5v-5A3.5 3.5 0 0 0 9.5 1h-5A3.5 3.5 0 0 0 1 4.5v5A3.5 3.5 0 0 0 4.5 13h5z"/>
            </svg>
          )}
        </button>

        {/* Microphone Button */}
        <button
          onClick={() => setIsMicrophoneMuted(!isMicrophoneMuted)}
          disabled={sessionStatus !== "CONNECTED"}
          title={isMicrophoneMuted ? "Unmute Microphone" : "Mute Microphone"}
          className={`flex items-center justify-center h-9 w-9 rounded-full ${
            sessionStatus !== "CONNECTED"
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : isMicrophoneMuted
              ? "bg-red-100 text-red-700 hover:bg-red-200 cursor-pointer"
              : "bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer"
          }`}
        >
          {isMicrophoneMuted ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M13 8c0 .564-.094 1.107-.266 1.613l-.814-.814A4.02 4.02 0 0 0 12 8V7a.5.5 0 0 1 1 0v1zm-5 4c.818 0 1.578-.245 2.212-.667l.718.719a4.973 4.973 0 0 1-2.43.923V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 1 0v1a4 4 0 0 0 4 4zm3-9v4.879L5.158 2.037A3.001 3.001 0 0 1 11 3z"/>
              <path d="M9.486 10.607 5 6.12V8a3 3 0 0 0 4.486 2.607zm-7.84-9.253 12 12 .708-.708-12-12-.708.708z"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M5 3a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0V3z"/>
              <path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5z"/>
            </svg>
          )}
        </button>

        {/* Dashboard Toggle */}
        {!isMobileView && (
          <button 
            onClick={() => handleDashboardToggle(!isEventsPaneExpanded)}
            title="Toggle Dashboard"
            className={`flex items-center justify-center h-9 w-9 rounded-full ${
              isEventsPaneExpanded 
                ? "bg-blue-100 text-blue-700" 
                : "bg-gray-100 text-gray-600"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8 4a.5.5 0 0 1 .5.5V6a.5.5 0 0 1-1 0V4.5A.5.5 0 0 1 8 4zM3.732 5.732a.5.5 0 0 1 .707 0l.915.914a.5.5 0 1 1-.708.708l-.914-.915a.5.5 0 0 1 0-.707zM2 10a.5.5 0 0 1 .5-.5h1.586a.5.5 0 0 1 0 1H2.5A.5.5 0 0 1 2 10zm9.5 0a.5.5 0 0 1 .5-.5h1.5a.5.5 0 0 1 0 1H12a.5.5 0 0 1-.5-.5zm.754-4.246a.389.389 0 0 0-.527-.02L7.547 9.31a.91.91 0 1 0 1.302 1.258l3.434-4.297a.389.389 0 0 0-.029-.518z"/>
            </svg>
          </button>
        )}


        {/* Mobile View Buttons */}
        {isMobileView && (
          <div className="flex">
            <button 
              onClick={() => {
                // Toggle dashboard functionality, similar to desktop behavior
                const newState = !isEventsPaneExpanded;
                setIsEventsPaneExpanded(newState);
                localStorage.setItem("logsExpanded", newState.toString());

                // Only switch to dashboard panel if we're enabling it
                if (newState) {
                  setActiveMobilePanel(2);
                } else if (activeMobilePanel === 2) {
                  // If we're disabling it and currently on dashboard, switch to agent answers
                  setActiveMobilePanel(1);
                }
              }}
              title="Toggle Dashboard"
              className={`flex items-center justify-center h-8 w-8 rounded-full ${
                isEventsPaneExpanded 
                  ? "bg-blue-100 text-blue-700" 
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8 4a.5.5 0 0 1 .5.5V6a.5.5 0 0 1-1 0V4.5A.5.5 0 0 1 8 4zM3.732 5.732a.5.5 0 0 1 .707 0l.915.914a.5.5 0 1 1-.708.708l-.914-.915a.5.5 0 0 1 0-.707zM2 10a.5.5 0 0 1 .5-.5h1.586a.5.5 0 0 1 0 1H2.5A.5.5 0 0 1 2 10zm9.5 0a.5.5 0 0 1 .5-.5h1.5a.5.5 0 0 1 0 1H12a.5.5 0 0 1-.5-.5zm.754-4.246a.389.389 0 0 0-.527-.02L7.547 9.31a.91.91 0 1 0 1.302 1.258l3.434-4.297a.389.389 0 0 0-.029-.518z"/>
              </svg>
            </button>
          </div>
        )}

        {/* Agent Selection (only if multiple agents available) */}
        {selectedAgentConfigSet && selectedAgentConfigSet.length > 1 && (
          <div className="relative inline-block ml-1">
            <select
              value={selectedAgentName}
              onChange={handleSelectedAgentChange}
              title="Select Agent"
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
                {/* AgentAnswers is removed for mobile */}
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
            className="mobile-swipe-panel absolute top-0 left-0 w-full h-full transition-transform duration-300 ease-in-out"
            style={{ transform: `translateX(${100 - (activeMobilePanel * 100)}%)` }}
          >
            {/* This panel is for agent answers only */}
            <div className="w-full h-full overflow-auto flex flex-col bg-white rounded-xl">
              <div className="font-semibold text-base px-4 py-2 border-b bg-gray-50">
                Agent Answers
              </div>
              <div className="flex-1 overflow-auto p-4 flex flex-col gap-y-4">
                {transcriptItems
                  .filter(item => item.type === "MESSAGE" && item.role === "assistant" && !item.isHidden)
                  .map((item) => (
                    <div key={item.itemId} className="border-b border-gray-200 py-3 px-4">
                      <div className="flex flex-col">
                        <div className="text-xs text-gray-500 font-mono mb-2">
                          {item.timestamp}
                        </div>
                        <div className="whitespace-pre-wrap text-gray-800">
                          {item.title}
                        </div>
                      </div>
                    </div>
                  ))}
                {transcriptItems.filter(item => item.type === "MESSAGE" && item.role === "assistant" && !item.isHidden).length === 0 && (
                  <div className="text-gray-500 text-center italic p-4 flex-1 flex items-center justify-center">
                    No agent answers yet
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Dashboard Panel */}
          <div 
            className="mobile-swipe-panel absolute top-0 left-0 w-full h-full transition-transform duration-300 ease-in-out"
            style={{ transform: `translateX(${200 - (activeMobilePanel * 100)}%)` }}
          >
            <Dashboard isExpanded={true} isDashboardEnabled={isEventsPaneExpanded} />
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