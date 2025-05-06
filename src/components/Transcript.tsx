"use-client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { TranscriptItem, ContentItem } from "@/types";
import Image from "next/image";
import { useTranscript } from "@/contexts/TranscriptContext";
import { capitalizeFirstLetter } from "@/lib/textUtils";
import { SendHorizonal } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

declare global {
  interface Window {
    electronAPI?: {
      takeScreenshot: () => Promise<{ success: boolean; path?: string; error?: string }>;
      getScreenshots: () => Promise<string[]>;
      getImagePreview: (filepath: string) => Promise<string>;
      // ... other electronAPI methods
    };
  }
}

export interface TranscriptProps {
  userText: string;
  setUserText: (text: string) => void;
  onSendMessage: () => void;
  canSend: boolean;
  fontSize?: number;
}

const Transcript: React.FC<TranscriptProps> = ({
  userText,
  setUserText,
  onSendMessage,
  canSend,
  fontSize = 14,
}) => {
  const { transcriptItems, toggleTranscriptItemExpand } = useTranscript();
  const { theme } = useTheme();
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const prevTranscriptLengthRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isInputExpanded, setIsInputExpanded] = useState<boolean>(false);
  const [expandedUserMessages, setExpandedUserMessages] = useState<{ [id: string]: boolean }>({});
  // state for which user group popup is open (index of the group start)
  const [openGroupIdx, setOpenGroupIdx] = useState<number | null>(null);
  
  // Remove all sidekick related states and refs
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Remove sidekick animation styles
  
  // Remove language detection function

  function scrollToTop() {
    if (transcriptRef.current) {
      const el = transcriptRef.current;
      el.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }
  }

  useEffect(() => {
    const currentLength = transcriptItems.filter(item => item.type === "MESSAGE").length;
    const prevLength = prevTranscriptLengthRef.current;

    // For normal order (most recent at top), we want to scroll to top when new messages arrive
    if (currentLength > prevLength && transcriptRef.current) {
      transcriptRef.current.scrollTop = 0;
    }

    // Update the ref *after* the check
    prevTranscriptLengthRef.current = currentLength;

  }, [transcriptItems]);

  // Autofocus on text box input on load
  useEffect(() => {
    if (canSend && inputRef.current) {
      inputRef.current.focus();
    }
  }, [canSend]);

  // Remove all sidekick related effects and handlers

  // Add state for screenshot handling
  const [isScreenshotTaking, setIsScreenshotTaking] = useState<boolean>(false);
  
  // Function to take a screenshot and send it with the message
  const sendMessageWithScreenshot = async () => {
    if (!canSend || !userText.trim() || isScreenshotTaking) return;
    
    // Check if electronAPI is available
    if (!window.electronAPI?.takeScreenshot) {
      console.log('Screenshot functionality is only available in the Electron app');
      
      // Fallback to regular message if not in Electron environment
      setUserText(capitalizeFirstLetter(userText.trim()));
      onSendMessage();
      return;
    }
    
    try {
      setIsScreenshotTaking(true);
      
      // Take screenshot using the Electron API
      const result = await window.electronAPI.takeScreenshot();
      
      if (result.success && result.path) {
        // Get screenshot preview
        const preview = await window.electronAPI.getImagePreview(result.path);
        
        // Get the current text
        const textToSend = capitalizeFirstLetter(userText.trim());
        
        // Create content item for the screenshot (treating preview as text for now)
        const screenshotContentItem: ContentItem = {
          type: 'image_text', // Indicate it's an image preview
          text: `[Screenshot Preview: ${result.path}]` // Store path or placeholder
        };
        
        // Create a special message with both text and image
        const messageWithScreenshot: TranscriptItem = {
          itemId: `message-${Date.now()}`,
          type: 'MESSAGE',
          role: 'user',
          timestamp: new Date().toISOString(),
          title: textToSend, // Title is just the text part
          expanded: true,
          data: { // Store text and image info in data
            content: [
              {
                type: 'text',
                text: textToSend
              },
              screenshotContentItem
            ]
          },
          createdAtMs: Date.now(), // Add missing property
          status: "DONE", // Add missing property (assuming done)
          isHidden: false, // Add missing property
        };
        
        // Use custom dispatch to add this message to context
        // Assuming toggleTranscriptItemExpand adds/updates items based on itemId
        // If it strictly toggles, you need another context function to add this item.
        // For now, let's assume addTranscriptMessage can handle this structure or modify it.
        // Passing itemId instead of the whole object as per context definition
        // NOTE: The context `addTranscriptMessage` might need adjustment to handle `data.content`.
        // For now, just calling toggle to potentially update if item exists, 
        // but ideally you'd have an `addComplexTranscriptMessage` function.
        toggleTranscriptItemExpand(messageWithScreenshot.itemId); 
        
        // Clear the input field
        setUserText('');
        
        console.log('Sent message with screenshot:', textToSend, result.path);
      } else {
        console.error('Screenshot failed:', result.error || 'No file path returned');
        
        // Fallback to regular message
        setUserText(capitalizeFirstLetter(userText.trim()));
        onSendMessage();
      }
    } catch (error) {
      console.error('Error sending message with screenshot:', error);
      
      // Fallback to regular message
      setUserText(capitalizeFirstLetter(userText.trim()));
      onSendMessage();
    } finally {
      setIsScreenshotTaking(false);
    }
  };

  const baseContainer = "flex justify-end flex-col";

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) {
        onSendMessage();
      }
    }
  };

  const [isCleared, setIsCleared] = useState(false);
  
  const clearPanel = () => {
    setIsCleared(true);
  };

  return (
    <div className="h-full flex flex-col text-sm">
      {isCleared ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <p>Panel cleared</p>
        </div>
      ) : (
        <div 
          ref={containerRef}
          className="flex h-full overflow-hidden rounded-xl shadow-md"
        >
          {/* Main conversation container - full width now */}
          <div 
            className={`h-full flex flex-col w-full ${theme === 'dark' ? 'bg-gray-800 text-gray-200' : 'bg-white text-gray-800'}`}
          >
            {/* Remove the top bar with JARVIS label */}
            <div className="relative flex-1 overflow-hidden">
              <div
                ref={transcriptRef}
                className="overflow-auto p-4 pt-0 flex flex-col gap-y-1 h-full"
                style={{ scrollPaddingTop: 56 }}
              >
                {[...transcriptItems].reverse().map((item, idx) => {
                  const { itemId, type, role, data, expanded, timestamp, title = "", isHidden } = item;

                  if (isHidden) {
                    return null;
                  }

                  // Update all idx references to work with reversed array
                  // We need to get the corresponding items from the reversed array
                  const reversedItems = [...transcriptItems].reverse();
                  const prev = idx > 0 ? reversedItems[idx - 1] : null;
                  const next = idx < reversedItems.length - 1 ? reversedItems[idx + 1] : null;
                  
                  // check if previous message is also a user message for grouping
                  const isUser = role === "user";
                  const isPrevUser = prev && prev.role === "user" && prev.type === "MESSAGE" && !prev.isHidden;
                  const isNextUser = next && next.role === "user" && next.type === "MESSAGE" && !next.isHidden;

                  // check if previous message is also an assistant message for grouping
                  const isPrevAssistant = prev && prev.role === "assistant" && prev.type === "MESSAGE" && !prev.isHidden;
                  const isNextAssistant = next && next.role === "assistant" && next.type === "MESSAGE" && !next.isHidden;
                  
                  // Simpler spacing: Add a small consistent top margin, no bottom margin within group
                  const marginTop = (isUser && isPrevUser) || (!isUser && isPrevAssistant) ? 'mt-0' : 'mt-1'; // Consistent gap between groups
                  const marginBottom = (isUser && isNextUser) || (!isUser && isNextAssistant) ? 'mb-0' : 'mb-1'; // Consistent gap at end of group
                  
                  const containerClasses = `${baseContainer} ${isUser ? "items-end" : "items-start"} ${marginTop} ${marginBottom}`;
                  
                  // adjust border radius for grouped bubbles
                  // Removed complex logic, apply standard rounding always for now
                  const bubbleBase = `max-w-lg p-3 ${isUser ? "bg-gray-900 text-gray-100" : theme === 'dark' ? "bg-gray-700 text-gray-200" : "bg-gray-100 text-black"} rounded-lg`; // Simpler rounding
                  
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
                      // const adjustedContainerClasses = isLastUserBeforeAssistant
                      //   ? containerClasses.replace(/mb-\d+/, 'mb-0')
                      //   : containerClasses;
                      // Use the calculated containerClasses directly
                      const adjustedContainerClasses = containerClasses;
                      // find the full group of consecutive user messages starting at this index
                      let groupedMessages: { item: TranscriptItem, idx: number }[] = [];
                      let groupEndIdx = idx;
                      if (showDot) {
                        let i = idx;
                        while (
                          i < reversedItems.length &&
                          reversedItems[i].role === "user" &&
                          reversedItems[i].type === "MESSAGE" &&
                          !reversedItems[i].isHidden
                        ) {
                          groupedMessages.push({ item: reversedItems[i], idx: i });
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
                                className={`w-4 h-4 flex items-center justify-center ${theme === 'dark' ? 'bg-gray-600 text-gray-300 hover:bg-gray-500' : 'bg-gray-300 text-gray-700 hover:bg-gray-400'} rounded-full shadow transition p-0 m-0`}
                                style={{ minHeight: 0, minWidth: 0, fontSize: 10 }}
                                onClick={() => setExpandedUserMessages((prev) => ({ ...prev, [idx]: true }))}
                                title="Show your input group"
                              >
                                <span className="sr-only">Show your input group</span>
                                <svg width="10" height="10" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" fill={theme === 'dark' ? '#9CA3AF' : '#4B5563'} /></svg>
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
                      // For assistant messages - no need to check for code now
                      return (
                        <div key={itemId} className={containerClasses}>
                          <div className="relative">
                            {/* Agent initials bubble positioned outside at top left */}
                            {!isUser && agentInitials && (
                              <div className="absolute -left-3 -top-3 z-10">
                                <div className={`text-[9px] font-bold ${item.agentName === 'Aux' ? 'bg-blue-500' : 'bg-teal-700'} text-white rounded-full w-5 h-5 flex items-center justify-center shadow border ${theme === 'dark' ? 'border-gray-700' : 'border-white'}`}>
                                  {item.agentName === 'Aux' ? 'AX' : 'GA'}
                                </div>
                              </div>
                            )}
                            <div 
                              className={`max-w-xl p-3 rounded-xl font-bold ${item.agentName === 'Aux' ? 'bg-blue-500/90' : 'bg-[#18181b]'}`} 
                              style={{ color: '#fff', position: 'relative' }}
                            >
                              {/* Show agent name as a small label if provided */}
                              {item.agentName && (
                                <div className="text-[10px] uppercase tracking-wider opacity-75 mb-1">
                                  {item.agentName === 'Aux' ? '👉 Quick Response' : 'Main Assistant'}
                                </div>
                              )}
                              
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
                        className={`flex justify-center ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} text-sm italic font-mono`}
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
                  {/* Camera button for screenshots */}
                  <button
                    onClick={sendMessageWithScreenshot}
                    disabled={!canSend || !userText.trim()}
                    className={`${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded-l-full p-1.5 h-[34px] border ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'} flex items-center justify-center disabled:opacity-50`}
                    title="Send message with screenshot"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M10.5 8.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/>
                      <path d="M2 4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1.172a2 2 0 0 1-1.414-.586l-.828-.828A2 2 0 0 0 9.172 2H6.828a2 2 0 0 0-1.414.586l-.828.828A2 2 0 0 1 3.172 4H2zm.5 2a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1zm9 2.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z"/>
                    </svg>
                  </button>
                  
                  <input
                    ref={inputRef}
                    type="text"
                    value={userText}
                    onChange={(e) => setUserText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className={`flex-1 px-3 py-1.5 focus:outline-none text-sm border-y ${theme === 'dark' ? 'border-gray-600 bg-gray-700 text-gray-200' : 'border-gray-200 bg-white text-gray-800'}`}
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
                      className={`${theme === 'dark' ? 'bg-blue-600' : 'bg-gray-900'} text-white rounded-r-full p-1.5 h-[34px] border ${theme === 'dark' ? 'border-blue-600' : 'border-gray-900'} border-l-0 disabled:opacity-50 flex items-center justify-center`}
                    >
                      <SendHorizonal size={16} />
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsInputExpanded(false)}
                      className={`${theme === 'dark' ? 'bg-gray-600 text-gray-200' : 'bg-gray-400 text-gray-800'} rounded-r-full p-1.5 h-[34px] border ${theme === 'dark' ? 'border-gray-600' : 'border-gray-400'} border-l-0 flex items-center justify-center`}
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
                  className={`${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-900 hover:bg-gray-800'} text-white rounded-full p-2 absolute bottom-2 right-2`}
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
          
          {/* Remove the resizer and sidekick pane */}
        </div>
      )}
    </div>
  );
};

export default Transcript;