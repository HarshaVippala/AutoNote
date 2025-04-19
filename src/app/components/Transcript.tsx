"use-client";

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { TranscriptItem } from "@/app/types";
import Image from "next/image";
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { capitalizeFirstLetter } from "@/app/lib/textUtils";

export interface TranscriptProps {
  userText: string;
  setUserText: (val: string) => void;
  onSendMessage: () => void;
  canSend: boolean;
}

function Transcript({
  userText,
  setUserText,
  onSendMessage,
  canSend,
}: TranscriptProps) {
  const { transcriptItems, toggleTranscriptItemExpand } = useTranscript();
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const [prevLogs, setPrevLogs] = useState<TranscriptItem[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isInputExpanded, setIsInputExpanded] = useState<boolean>(false);
  const [fontSize, setFontSize] = useState(12); // default to 12px
  const [expandedUserMessages, setExpandedUserMessages] = useState<{ [id: string]: boolean }>({});
  // state for which user group popup is open (index of the group start)
  const [openGroupIdx, setOpenGroupIdx] = useState<number | null>(null);

  function scrollToBottom() {
    if (transcriptRef.current) {
      const el = transcriptRef.current;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      el.scrollTo({
        top: el.scrollHeight,
        behavior: isNearBottom ? 'smooth' : 'auto',
      });
    }
  }

  useEffect(() => {
    // only auto-scroll when a new MESSAGE is added
    const prevMessageCount = prevLogs.filter(item => item.type === "MESSAGE").length;
    const newMessageCount = transcriptItems.filter(item => item.type === "MESSAGE").length;
    const hasNewMessage = newMessageCount > prevMessageCount;
    const hasUpdatedMessage = transcriptItems.some((newItem, index) => {
      const oldItem = prevLogs[index];
      return (
        oldItem &&
        newItem.type === "MESSAGE" &&
        (newItem.title !== oldItem.title || newItem.data !== oldItem.data)
      );
    });

    if (hasNewMessage || hasUpdatedMessage) {
      scrollToBottom();
    }

    setPrevLogs(transcriptItems);
  }, [transcriptItems]);

  // Autofocus on text box input on load
  useEffect(() => {
    if (canSend && inputRef.current) {
      inputRef.current.focus();
    }
  }, [canSend]);

  const baseContainer = "flex justify-end flex-col";

  return (
    <div className="flex flex-col h-full bg-gray-100 rounded-xl">
      {/* Top bar with invisible border and JARVIS label */}
      <div className="relative w-full" style={{ minHeight: 36 }}>
        {/* JARVIS label, top left, fits inside the border area */}
        <div className="absolute left-4 top-0 flex items-center h-8 z-20">
          <span className="font-bold text-lg tracking-wide text-gray-700" style={{ letterSpacing: 2, fontSize: '1.05rem', marginTop: 0 }}>JARVIS</span>
        </div>
        {/* Up/down arrows, top right (existing, but now inside the border area) */}
        <div className="absolute right-4 top-0 flex items-center gap-2 z-20" style={{ marginTop: 4 }}>
          <button
            aria-label="Decrease font size"
            className="w-5 h-5 flex items-center justify-center bg-gray-900 hover:bg-gray-800 text-white rounded-full shadow transition-colors"
            onClick={() => setFontSize((f) => Math.max(8, f - 1))}
          >
            <svg width="10" height="10" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 12L10 16L14 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            aria-label="Increase font size"
            className="w-5 h-5 flex items-center justify-center bg-gray-900 hover:bg-gray-800 text-white rounded-full shadow transition-colors"
            onClick={() => setFontSize((f) => Math.min(24, f + 1))}
          >
            <svg width="10" height="10" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 8L10 4L14 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        {/* Invisible border for scroll buffer */}
        <div style={{ height: 36, width: '100%', pointerEvents: 'none', borderBottom: '2px solid transparent' }}></div>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={transcriptRef}
          className="overflow-auto p-4 flex flex-col gap-y-2 h-full"
          style={{ scrollPaddingTop: 56 }}
        >
          {transcriptItems.map((item, idx) => {
            const { itemId, type, role, data, expanded, timestamp, title = "", isHidden } = item;

            if (isHidden) {
              return null;
            }

            // check if previous message is also a user message for grouping
            const prev = transcriptItems[idx - 1];
            const next = transcriptItems[idx + 1];
            const isUser = role === "user";
            const isPrevUser = prev && prev.role === "user" && prev.type === "MESSAGE" && !prev.isHidden;
            const isNextUser = next && next.role === "user" && next.type === "MESSAGE" && !next.isHidden;

            // reduce space between user and assistant by using no margin between different roles
            const isPrevAssistant = prev && prev.role === "assistant" && prev.type === "MESSAGE" && !prev.isHidden;
            const isNextAssistant = next && next.role === "assistant" && next.type === "MESSAGE" && !next.isHidden;
            const containerClasses = `${baseContainer} ${isUser ? "items-end" : "items-start"} ${isUser && isPrevUser ? "mt-0" : isUser && isPrevAssistant ? "mt-0" : "mt-2"} ${isUser && isNextUser ? "mb-0" : isUser && isNextAssistant ? "mb-0" : "mb-2"}`;
            // adjust border radius for grouped bubbles
            const bubbleBase = `max-w-lg p-3 ${isUser ? "bg-gray-900 text-gray-100" : "bg-gray-100 text-black"} rounded-xl ${isUser && isPrevUser ? "rounded-tr-md" : ""} ${isUser && isNextUser ? "rounded-br-md" : ""}`;
            const isBracketedMessage = title.startsWith("[") && title.endsWith("]");
            const messageStyle = isBracketedMessage ? "italic text-gray-400" : "";
            const displayTitle = isBracketedMessage ? title.slice(1, -1) : title;

            // Get agent initials for assistant messages
            const agentInitials = !isUser ? 'GA' : '';

            if (type === "MESSAGE") {
              if (isUser) {
                // only show the dot if this is the first in a group (no previous user message)
                const showDot = !isPrevUser;
                // if this is the last user message before an assistant, remove mb-2 from the parent container
                const isLastUserBeforeAssistant = isUser && isNextAssistant;
                const adjustedContainerClasses = isLastUserBeforeAssistant
                  ? containerClasses.replace(/mb-\d+/, 'mb-0')
                  : containerClasses;
                // find the full group of consecutive user messages starting at this index
                let groupedMessages: { item: TranscriptItem, idx: number }[] = [];
                let groupEndIdx = idx;
                if (showDot) {
                  let i = idx;
                  while (
                    i < transcriptItems.length &&
                    transcriptItems[i].role === "user" &&
                    transcriptItems[i].type === "MESSAGE" &&
                    !transcriptItems[i].isHidden
                  ) {
                    groupedMessages.push({ item: transcriptItems[i], idx: i });
                    i++;
                  }
                  groupEndIdx = i - 1;
                }
                // expanded state for the group (keyed by group start idx)
                const isGroupExpanded = expandedUserMessages[idx];
                if (showDot && !isGroupExpanded) {
                  // show the dot button to expand the group
                  return (
                    <div key={itemId} className={adjustedContainerClasses}>
                      <div className="relative">
                        <button
                          className="w-4 h-4 flex items-center justify-center bg-gray-300 text-gray-700 rounded-full shadow hover:bg-gray-400 transition p-0 m-0"
                          style={{ minHeight: 0, minWidth: 0, fontSize: 10 }}
                          onClick={() => setExpandedUserMessages((prev) => ({ ...prev, [idx]: true }))}
                          title="Show your input group"
                        >
                          <span className="sr-only">Show your input group</span>
                          <svg width="10" height="10" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" fill="#4B5563" /></svg>
                        </button>
                      </div>
                    </div>
                  );
                }
                // if group is expanded, render all messages in the group as normal bubbles
                if (showDot && isGroupExpanded) {
                  // combine all messages into a single string, separated by a space
                  const combinedText = groupedMessages.map(({ item }) => item.title || "").join(" ");
                  return (
                    <div key={itemId} className={adjustedContainerClasses}>
                      <div
                        className="max-w-lg p-3 bg-blue-600 text-white rounded-xl cursor-pointer"
                        style={{ fontSize: fontSize, lineHeight: 1.2 }}
                        onClick={() => setExpandedUserMessages((prev) => ({ ...prev, [idx]: false }))}
                        title="Hide your input group"
                      >
                        <ReactMarkdown>{combinedText}</ReactMarkdown>
                      </div>
                    </div>
                  );
                }
                // for user messages that are not the start of a group, render nothing (handled by group rendering)
                if (!showDot) return null;
              } else {
                return (
                  <div key={itemId} className={containerClasses}>
                    <div className="relative">
                      {/* Agent initials bubble positioned outside at top left */}
                      {!isUser && agentInitials && (
                        <div className="absolute -left-3 -top-3 z-10">
                          <div className="text-[9px] font-bold bg-teal-700 text-white rounded-full w-5 h-5 flex items-center justify-center shadow border border-white">
                            {agentInitials}
                          </div>
                        </div>
                      )}
                      <div className="max-w-xl p-3 rounded-xl font-bold" style={{ background: '#18181b', color: '#fff' }}>
                        <div className={`whitespace-pre-wrap ${messageStyle}`}
                             style={{ fontSize: fontSize, lineHeight: 1.5 }}>
                          <ReactMarkdown>{displayTitle}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
            } else if (type === "BREADCRUMB") {
              // We're not showing breadcrumbs in the conversation window anymore
              // They will be displayed in the Dashboard component instead
              return null;
            } else {
              // Fallback if type is neither MESSAGE nor BREADCRUMB
              return (
                <div
                  key={itemId}
                  className="flex justify-center text-gray-500 text-sm italic font-mono"
                >
                  Unknown item type: {type}{" "}
                  <span className="ml-2 text-xs">{timestamp}</span>
                </div>
              );
            }
          })}
        </div>
      </div>

      <div className="flex-shrink-0 relative">
        {isInputExpanded || userText.trim() !== "" ? (
          <div className="flex items-center px-2 py-2">
            <input
              ref={inputRef}
              type="text"
              value={userText}
              onChange={(e) => setUserText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSend) {
                  // Capitalize text before sending
                  setUserText(capitalizeFirstLetter(userText.trim()));
                  onSendMessage();
                }
              }}
              className="flex-1 px-3 py-1.5 focus:outline-none text-sm border border-gray-200 rounded-l-full"
              placeholder="Type a message..."
              autoFocus
            />
            {userText.trim() !== "" ? (
              <button
                onClick={() => {
                  // Capitalize text before sending
                  setUserText(capitalizeFirstLetter(userText.trim()));
                  onSendMessage();
                }}
                disabled={!canSend || !userText.trim()}
                className="bg-gray-900 text-white rounded-r-full p-1.5 h-[34px] border border-gray-900 border-l-0 disabled:opacity-50 flex items-center justify-center"
              >
                <Image src="arrow.svg" alt="Send" width={20} height={20} />
              </button>
            ) : (
              <button
                onClick={() => setIsInputExpanded(false)}
                className="bg-gray-400 text-gray-800 rounded-r-full p-1.5 h-[34px] border border-gray-400 border-l-0 flex items-center justify-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                  <path fillRule="evenodd" d="M8 4a.5.5 0 0 1 .5.5v5.793l2.146-2.147a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 1 1 .708-.708L7.5 10.293V4.5A.5.5 0 0 1 8 4z"/>
                </svg>
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={() => setIsInputExpanded(true)}
            className="bg-gray-900 hover:bg-gray-800 text-white rounded-full p-2 absolute bottom-2 right-2"
            title="Open keyboard"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
              <path d="M14 5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h12zM2 4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H2z"/>
              <path d="M13 10.25a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm0-2a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-5 0A.25.25 0 0 1 8.25 8h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 8 8.75v-.5zm2 0a.25.25 0 0 1 .25-.25h1.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-1.5a.25.25 0 0 1-.25-.25v-.5zm1 2a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-5-2A.25.25 0 0 1 5.25 8h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 5 8.75v-.5zm-2 0A.25.25 0 0 1 3.25 8h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 3 8.75v-.5zm5 2A.25.25 0 0 1 8.25 10h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5z"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export default Transcript;