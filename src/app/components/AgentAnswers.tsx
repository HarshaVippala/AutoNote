"use client";

import React, { useRef, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { TranscriptItem } from "@/app/types";

export interface AgentAnswersProps {
  isExpanded: boolean;
}

function AgentAnswers({ isExpanded }: AgentAnswersProps) {
  const [prevTranscriptItems, setPrevTranscriptItems] = useState<TranscriptItem[]>([]);
  const answersContainerRef = useRef<HTMLDivElement | null>(null);

  const { transcriptItems } = useTranscript();
  
  // Filter transcript items to get only assistant messages from responseAgent
  const assistantMessages = transcriptItems.filter(
    (item) => 
      item.type === "MESSAGE" && 
      item.role === "assistant" && 
      !item.isHidden && 
      item.agentName === "responseAgent"
  );

  useEffect(() => {
    const hasNewMessage = assistantMessages.length > 
      prevTranscriptItems.filter(item => 
        item.type === "MESSAGE" && 
        item.role === "assistant" && 
        item.agentName === "responseAgent"
      ).length;

    if (isExpanded && hasNewMessage && answersContainerRef.current) {
      answersContainerRef.current.scrollTop = answersContainerRef.current.scrollHeight;
    }

    setPrevTranscriptItems(transcriptItems);
  }, [transcriptItems, assistantMessages.length, isExpanded]);

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
          <div className="font-semibold px-6 py-4 sticky top-0 z-10 text-base border-b bg-white">
            Response Agent Answers
          </div>
          <div className="overflow-auto p-4 flex-1 flex flex-col gap-y-4">
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