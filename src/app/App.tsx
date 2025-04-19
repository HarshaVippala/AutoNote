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
  const audioElementRef = useRef<HTMLAudioElement | null>(null); // Ref for the audio element
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
  const [resumeText, setResumeText] = useState<string | null>(null); // State to hold resume text

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

      // Ensure the audio element ref is ready (it should be rendered in JSX now)
      if (!audioElementRef.current) {
         console.error("Audio element ref not available for connection.");
         setSessionStatus("DISCONNECTED");
         logClientEvent({}, "error.audio_element_missing");
         return;
      }
      // Configuration (autoplay, volume) is now done on the element directly in JSX

      const { pc, dc, audioTrack } = await createRealtimeConnection(
        EPHEMERAL_KEY,
        audioElementRef // Pass the ref directly
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

    // Explicitly stop the track and null the ref
    if (audioTrackRef.current) {
      audioTrackRef.current.stop();
      audioTrackRef.current = null;
    }
    setDataChannel(null);
    dcRef.current = null; // Null the data channel ref as well
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

    const sessionData: any = {
      modalities: ["text", "audio"],
      instructions,
      voice: "coral",
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      input_audio_transcription: { model: "whisper-1" },
      turn_detection: turnDetection,
      tools,
    };

    // Include resume context if available
    if (resumeText) {
      sessionData.context = {
        resume_text: resumeText,
      };
      logClientEvent({ contextKeys: Object.keys(sessionData.context) }, "session_update_including_context");
    }

    const sessionUpdateEvent = {
      type: "session.update",
      session: sessionData,
    };


    sendClientEvent(sessionUpdateEvent);

    if (shouldTriggerResponse) {
      // Directly trigger the initial agent response without sending a simulated user message.
      // The greeterAgent's instructions should handle the initial prompt.
      sendClientEvent({ type: "response.create" }, "trigger initial agent response");
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

  const handleFileUpload = (file: File) => {
    // 1) Telemetry & breadcrumb for start
    logClientEvent(
      { fileName: file.name, fileSize: file.size, fileType: file.type },
      "file_upload_start"
    );
    addTranscriptBreadcrumb(`Uploading and processing file: ${file.name}`);
  
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64DataUrl = event.target?.result;
      if (typeof base64DataUrl !== "string") {
        console.error("Failed to read file as Data URL");
        logClientEvent({ fileName: file.name }, "error.file_read_local_base64");
        addTranscriptBreadcrumb(`Error reading file: ${file.name}`);
        return;
      }
  
      console.log("File read as Data URL successfully.");
      logClientEvent({ fileName: file.name }, "file_read_success_local_base64");
  
      // 2) Build a function_call message just like handleSendTextMessage
      const messageId = uuidv4();
      addTranscriptMessage(
        messageId,
        "user",
        "", // no visible text
        false,
        "user",
        {
          function_call: {
            name: "uploadResume",
            arguments: JSON.stringify({
              file: {
                name: file.name,
                type: file.type,
                data: base64DataUrl,
              },
            }),
          },
        }
      );
  
      // 3) Emit the same conversation.item.create event for your backend
      sendClientEvent(
        {
          type: "conversation.item.create",
          item: {
            id: messageId,
            type: "message",
            role: "user",
            content: [
              {
                type: "function_call",
                name: "uploadResume",
                arguments: {
                  file: {
                    name: file.name,
                    type: file.type,
                    data: base64DataUrl,
                  },
                },
              },
            ],
          },
        },
        "(tool_call.uploadResume)"
      );
      addTranscriptBreadcrumb(`File "${file.name}" sent to agent for processing.`);
  
      // 4) Finally trigger your assistant to run immediately
      sendClientEvent({ type: "response.create" }, "trigger response");
    };
  
    reader.onerror = (event) => {
      console.error("Error reading file:", event.target?.error);
      logClientEvent(
        { fileName: file.name, error: event.target?.error?.message },
        "error.file_read_local_onerror"
      );
      addTranscriptBreadcrumb(`Error reading file: ${file.name}`);
    };
  
    // Read the file as Base64 string
    reader.readAsDataURL(file);
  };
  


  // Top Controls Component
  const TopControls = () => {
    const { loggedEvents } = useEvent();
    const [apiKeyStatus, setApiKeyStatus] = useState<{ isPresent: boolean; statusMessage: string }>({
      isPresent: false,
      statusMessage: "API Key Not Configured"
    });

    useEffect(() => {
      // Consider active connection as valid API key
      if (sessionStatus === "CONNECTED") {
        setApiKeyStatus({
          isPresent: true,
          statusMessage: "API Key Valid"
        });
        return;
      }

      // Check token events if not connected
      const tokenEvents = loggedEvents.filter(e => e.eventName === "fetch_session_token_response");
      if (tokenEvents.length > 0) {
        const latest = tokenEvents[tokenEvents.length - 1];
        const hasError = latest.eventData?.error || !latest.eventData?.client_secret?.value;

        setApiKeyStatus({
          isPresent: !hasError,
          statusMessage: hasError ? (latest.eventData?.error || "Invalid API Key") : "API Key Valid"
        });
      }
    }, [loggedEvents, sessionStatus]);

    return (
      <div className="border-b border-gray-200 bg-white flex items-center justify-between overflow-hidden" style={{ height: 56 }}>
        <div className="flex items-center h-full">
          <div onClick={() => window.location.reload()} style={{ cursor: 'pointer', height: '100%' }}>
            <Image
              src="/logo.png"
              alt="Logo"
              width={56}
              height={56}
              className="block sm:hidden"
              style={{ height: '100%', width: 'auto' }}
            />
            <Image
              src="/logo.png"
              alt="Logo"
              width={56}
              height={56}
              className="hidden sm:block"
              style={{ height: '100%', width: 'auto' }}
            />
          </div>
        </div>

        <div className="flex space-x-3 items-center mr-4">
          {/* API Key Status Icon */}
          <div
            className="relative group"
            title={apiKeyStatus.statusMessage}
          >
            <div className={`flex items-center justify-center h-9 w-9 rounded-full ${
              apiKeyStatus.isPresent
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M0 8a4 4 0 0 1 7.465-2H14a.5.5 0 0 1 .354.146l1.5 1.5a.5.5 0 0 1 0 .708l-1.5 1.5a.5.5 0 0 1-.708 0L13 9.207l-.646.647a.5.5 0 0 1-.708 0L11 9.207l-.646.647a.5.5 0 0 1-.708 0L9 9.207l-.646.647A.5.5 0 0 1 8 10h-.535A4 4 0 0 1 0 8zm4-3a3 3 0 1 0 2.712 4.285A.5.5 0 0 1 7.163 9h.63l.853-.854a.5.5 0 0 1 .708 0l.646.647.646-.647a.5.5 0 0 1 .708 0l.646.647.646-.647a.5.5 0 0 1 .708 0l.646.647.793-.793-1-1h-6.63a.5.5 0 0 1-.451-.285A3 3 0 0 0 4 5z"/>
                <path d="M4 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
              </svg>
            </div>
            <div className="hidden group-hover:block absolute top-full mt-2 p-2 bg-white shadow-lg rounded-md text-xs w-48 z-10">
              {apiKeyStatus.statusMessage}
            </div>
          </div>

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

          {/* Agent Selection removed */}

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef} // Need to add this ref
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleFileUpload(file);
              }
              // Reset input value
              if (e.target) {
                e.target.value = '';
              }
            }}
            className="hidden"
            accept=".pdf,.doc,.docx,.txt" // Specify acceptable file types
          />

          {/* Upload Resume Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            title={sessionStatus === "CONNECTED" && dcRef.current?.readyState === "open" ? "Upload Resume" : "Connect first to upload resume"}
            disabled={!(sessionStatus === "CONNECTED" && dcRef.current?.readyState === "open")}
            className={`flex items-center justify-center h-9 w-9 rounded-full ${
              sessionStatus === "CONNECTED" && dcRef.current?.readyState === "open"
                ? "bg-blue-100 text-blue-700 hover:bg-blue-200 cursor-pointer"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
              <path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/>
            </svg>
          </button>

        </div>
      </div>
    );
  };

  // Add ref for file input
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="text-base flex flex-col h-screen bg-gray-100 text-gray-800 relative rounded-xl">
      <TopControls />

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
      {/* Hidden Audio Element for WebRTC Output */}
      <audio ref={audioElementRef} autoPlay playsInline style={{ display: 'none' }} />
    </div>
  );
}

export default App;