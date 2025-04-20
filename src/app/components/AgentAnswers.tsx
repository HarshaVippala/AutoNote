"use client";

import React, { useRef, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { TranscriptItem } from "@/app/types";

export interface AgentAnswersProps {
  isExpanded: boolean;
}

function AgentAnswers({ isExpanded }: AgentAnswersProps) {
  const answersContainerRef = useRef<HTMLDivElement | null>(null);
  const prevAssistantMessagesLengthRef = useRef<number>(0);

  const { transcriptItems } = useTranscript();
  
  // Filter transcript items to get only assistant messages
  const assistantMessages = transcriptItems.filter(
    (item) =>
      item.type === "MESSAGE" &&
      item.role === "assistant" &&
      !item.isHidden
  );

  useEffect(() => {
    // Compare current length with previous length from ref
    const hasNewMessage = assistantMessages.length > prevAssistantMessagesLengthRef.current;

    if (isExpanded && hasNewMessage && answersContainerRef.current) {
      answersContainerRef.current.scrollTop = answersContainerRef.current.scrollHeight;
    }

    // Update the ref with the current length *after* the check
    prevAssistantMessagesLengthRef.current = assistantMessages.length;

    // Dependencies are now just the length and visibility
  }, [assistantMessages.length, isExpanded]);

  return (
    <div
      className={
        (isExpanded ? "w-full h-full overflow-auto" : "w-0 overflow-hidden opacity-0") +
        " transition-all rounded-xl duration-200 ease-in-out flex flex-col bg-white"
      }
      ref={answersContainerRef}
    >
      {isExpanded && (
        <div className="h-full flex flex-col">
          {/* Sticky top bar with invisible border and RESPONSE label styled like big JARVIS */}
          <div className="relative w-full" style={{ minHeight: 36 }}>
            {/* RESPONSE label, top left, fits inside the border area */}
            <div className="absolute left-4 top-0 flex items-center h-8 z-20">
              <span className="font-bold text-lg tracking-wide text-gray-700" style={{ letterSpacing: 2, fontSize: '1.05rem', marginTop: 0 }}>RESPONSE</span>
            </div>
            {/* Invisible border for scroll buffer */}
            <div style={{ height: 36, width: '100%', pointerEvents: 'none', borderBottom: '2px solid transparent' }}></div>
          </div>
          <div className="overflow-auto p-4 pt-2 flex-1 flex flex-col gap-y-4">
            {assistantMessages.map((item) => {
              return (
                <div key={item.itemId} className="border-b border-gray-200 py-3 px-4">
                  <div className="flex flex-col">
                    <div className="text-xs text-gray-500 font-mono mb-2">
                      {item.timestamp}
                    </div>
                    <div className="whitespace-pre-wrap text-gray-800">
                      <ReactMarkdown>{item.title || ""}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              );
            })}
            {assistantMessages.length === 0 && (
              <div className="text-gray-500 text-center italic p-4 flex-1 flex items-center justify-center">
                No agent answers yet
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AgentAnswers; 