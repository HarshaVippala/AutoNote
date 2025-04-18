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

  function scrollToBottom() {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }

  useEffect(() => {
    const hasNewMessage = transcriptItems.length > prevLogs.length;
    const hasUpdatedMessage = transcriptItems.some((newItem, index) => {
      const oldItem = prevLogs[index];
      return (
        oldItem &&
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

  const [isInputExpanded, setIsInputExpanded] = useState<boolean>(false);

  return (
    <div className="flex flex-col h-full bg-white rounded-xl">
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={transcriptRef}
          className="overflow-auto p-4 flex flex-col gap-y-4 h-full"
        >
          {transcriptItems.map((item) => {
            const { itemId, type, role, data, expanded, timestamp, title = "", isHidden } = item;

            if (isHidden) {
              return null;
            }

            if (type === "MESSAGE") {
              const isUser = role === "user";
              const baseContainer = "flex justify-end flex-col";
              const containerClasses = `${baseContainer} ${isUser ? "items-end" : "items-start"}`;
              const bubbleBase = `max-w-lg p-3 rounded-xl ${isUser ? "bg-gray-900 text-gray-100" : "bg-gray-100 text-black"}`;
              const isBracketedMessage = title.startsWith("[") && title.endsWith("]");
              const messageStyle = isBracketedMessage ? "italic text-gray-400" : "";
              const displayTitle = isBracketedMessage ? title.slice(1, -1) : title;

              // Get agent initials for assistant messages
              const agentInitials = !isUser ? 'GA' : '';
              
              return (
                <div key={itemId} className={containerClasses}>
                  <div className="relative">
                    {/* Agent initials bubble positioned outside at top left */}
                    {!isUser && agentInitials && (
                      <div className="absolute -left-3 -top-3 z-10">
                        <div className="text-xs bg-teal-600 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-sm">
                          {agentInitials}
                        </div>
                      </div>
                    )}
                    <div className={bubbleBase}>
                      <div className={`whitespace-pre-wrap ${messageStyle}`}>
                        <ReactMarkdown>{displayTitle}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>
              );
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

      <div className="border-t border-gray-200 flex-shrink-0">
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
                className="bg-gray-400 text-white rounded-r-full p-1.5 h-[34px] border border-gray-400 border-l-0 flex items-center justify-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                  <path fillRule="evenodd" d="M8 4a.5.5 0 0 1 .5.5v5.793l2.146-2.147a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 1 1 .708-.708L7.5 10.293V4.5A.5.5 0 0 1 8 4z"/>
                </svg>
              </button>
            )}
          </div>
        ) : (
          <div className="flex justify-center py-2">
            <button
              onClick={() => setIsInputExpanded(true)}
              className="bg-gray-400 hover:bg-gray-500 text-white rounded-full p-2 flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                <path d="M14 5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h12zM2 4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H2z"/>
                <path d="M13 10.25a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm0-2a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-5 0A.25.25 0 0 1 8.25 8h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 8 8.75v-.5zm2 0a.25.25 0 0 1 .25-.25h1.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-1.5a.25.25 0 0 1-.25-.25v-.5zm1 2a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-5-2A.25.25 0 0 1 5.25 8h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 5 8.75v-.5zm-2 0A.25.25 0 0 1 3.25 8h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 3 8.75v-.5zm5 2A.25.25 0 0 1 8.25 10h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5z"/>
              </svg>
              <span className="text-sm">Keyboard</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Transcript;