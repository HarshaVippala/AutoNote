"use-client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { TranscriptItem, ContentItem } from "@/app/types";
import Image from "next/image";
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { capitalizeFirstLetter } from "@/app/lib/textUtils";
import { SendHorizonal } from "lucide-react";
import { useTheme } from "@/app/contexts/ThemeContext";

export interface TranscriptProps {
  userText: string;
  setUserText: (text: string) => void;
  onSendMessage: () => void;
  canSend: boolean;
  fontSize: number;
}

const Transcript: React.FC<TranscriptProps> = ({
  userText,
  setUserText,
  onSendMessage,
  canSend,
  fontSize,
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
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  
  // Dual pane specific states
  const [sidekickVisible, setSidekickVisible] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'code' | 'explanation'>('code');
  const [paneRatio, setPaneRatio] = useState<number>(65); // Default main pane takes 65% of the width
  const resizingRef = useRef<boolean>(false);
  const startXRef = useRef<number>(0);
  const startRatioRef = useRef<number>(65);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Code content state
  const [codeContent, setCodeContent] = useState<string>('');
  const [explanationContent, setExplanationContent] = useState<string>('');

  // Add update states at the beginning of the component
  const [codeUpdated, setCodeUpdated] = useState<boolean>(false);
  const [explanationUpdated, setExplanationUpdated] = useState<boolean>(false);

  // Animation for highlighting updated content
  const animateHighlight = `
    @keyframes highlight-fade {
      from { background-color: ${theme === 'dark' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)'}; }
      to { background-color: transparent; }
    }
    .animate-highlight {
      animation: highlight-fade 2s ease-out;
    }
    .copied {
      background-color: ${theme === 'dark' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.1)'};
      transition: background-color 0.3s ease-out;
    }
  `;

  // Language detection for syntax highlighting
  const detectLanguage = useCallback((langHint: string): string => {
    const lang = langHint.toLowerCase().trim();
    
    // Map common language names to normalized ones
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'ts': 'typescript',
      'py': 'python',
      'rb': 'ruby',
      'go': 'golang',
      'java': 'java',
      'c#': 'csharp',
      'cs': 'csharp',
      'php': 'php',
      'rust': 'rust',
      'sh': 'bash',
      'bash': 'bash',
      'shell': 'bash',
      'html': 'html',
      'css': 'css',
      'jsx': 'jsx',
      'tsx': 'tsx',
      'json': 'json',
      'yml': 'yaml',
      'yaml': 'yaml',
      'sql': 'sql',
      'swift': 'swift',
      'kotlin': 'kotlin',
      'r': 'r',
      'cpp': 'cpp',
      'c++': 'cpp',
      'c': 'c',
    };
    
    return languageMap[lang] || 'javascript'; // Default to JavaScript if we can't detect it
  }, []);

  // Handle content updates and notifications in a separate effect
  useEffect(() => {
    const handleCodeUpdated = (isUpdated: boolean) => {
      if (isUpdated) {
        setCodeUpdated(true);
        setTimeout(() => setCodeUpdated(false), 2000);
      }
    };
    
    const handleExplanationUpdated = (isUpdated: boolean) => {
      if (isUpdated) {
        setExplanationUpdated(true);
        setTimeout(() => setExplanationUpdated(false), 2000);
      }
    };
    
    // Current content state
    const currentCodeContent = codeContent;
    const currentExplanationContent = explanationContent;
    
    return () => {
      // Cleanup any pending timeouts
      setCodeUpdated(false);
      setExplanationUpdated(false);
    };
  }, []);

  function scrollToBottom() {
    if (transcriptRef.current) {
      const el = transcriptRef.current;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      el.scrollTo({
        top: el.scrollHeight,
        behavior: isNearBottom ? 'smooth' : 'auto',
      });
    }
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  useEffect(() => {
    const currentLength = transcriptItems.filter(item => item.type === "MESSAGE").length;
    const prevLength = prevTranscriptLengthRef.current;

    // Since we're using flex-col-reverse, scrolling behavior changes
    // For reverse order, we want to keep the view at the bottom when new messages arrive
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

  // Define stable resize handlers using useCallback
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!resizingRef.current || !containerRef.current) return;
    
    const containerWidth = containerRef.current.offsetWidth;
    const offsetX = e.clientX - containerRef.current.getBoundingClientRect().left;
    // Ensure setPaneRatio is stable or included if needed, though useState setters usually are
    const newRatio = Math.min(Math.max((offsetX / containerWidth) * 100, 40), 75);
    setPaneRatio(newRatio);
  }, [containerRef, setPaneRatio]); // Dependencies: refs usually don't need to be deps, but containerRef.current access pattern might warrant it. setPaneRatio is stable.

  const handleMouseUp = useCallback(() => {
    if (resizingRef.current) {
      resizingRef.current = false;
      document.body.style.cursor = '';
      // Use the stable function references for removal
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
  }, [handleMouseMove]); // Depends on the stable handleMouseMove reference for removal

  // Effect for cleanup only
  useEffect(() => {
    // Cleanup function uses the stable handlers defined above
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      // Ensure cursor is reset if component unmounts while dragging
      if (resizingRef.current) {
        document.body.style.cursor = '';
      }
    };
  }, [handleMouseMove, handleMouseUp]); // Effect depends on the stable handlers
  
  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    startXRef.current = e.clientX;
    startRatioRef.current = paneRatio;
    document.body.style.cursor = 'ew-resize';
    
    // Add listeners using the stable callback references
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };
  
  const resetSplit = () => {
    setPaneRatio(65); // Reset to default 65/35 split
  };

  // Detect code blocks in transcript and update sidekick
  useEffect(() => {
    // Look for code blocks in the latest assistant message
    const assistantMessages = transcriptItems.filter(
      item => item.role === 'assistant' && item.type === 'MESSAGE'
    );
    
    if (assistantMessages.length === 0) return;
    
    const latestMessage = assistantMessages[assistantMessages.length - 1];
    
    // Check if message contains code blocks
    const messageTitle = latestMessage.title || '';
    const codeBlockRegex = /```([a-zA-Z]*)\n([\s\S]*?)\n```/g;
    const matches = [...messageTitle.matchAll(codeBlockRegex)];
    
    if (matches.length > 0) {
      // Extract the code from the first code block
      const codeBlock = matches[0][2];
      const langHint = matches[0][1] || '';
      const language = detectLanguage(langHint);
      
      // Check if code content has changed
      const isNewCode = codeContent !== codeBlock;
      
      // Extract explanation (everything except code blocks)
      let explanation = messageTitle;
      matches.forEach(match => {
        explanation = explanation.replace(match[0], '');
      });
      
      const newExplanation = explanation.trim();
      const isNewExplanation = explanationContent !== newExplanation;
      
      // Update content
      setCodeContent(codeBlock);
      setExplanationContent(newExplanation);
      
      // Show sidekick when code is detected
      setSidekickVisible(true);
      
      // Flash notification if content was updated
      if (isNewCode) {
        setCodeUpdated(true);
        setTimeout(() => setCodeUpdated(false), 2000);
      }
      
      if (isNewExplanation) {
        setExplanationUpdated(true);
        setTimeout(() => setExplanationUpdated(false), 2000);
      }
    } else if (messageTitle.includes('```')) {
      // Handle incomplete code blocks
      const parts = messageTitle.split('```');
      if (parts.length >= 2) {
        const newCode = parts[1].trim();
        const newExplanation = parts[0].trim();
        
        const isNewCode = codeContent !== newCode;
        const isNewExplanation = explanationContent !== newExplanation;
        
        setCodeContent(newCode);
        setExplanationContent(newExplanation);
        setSidekickVisible(true);
        
        // Flash notification if content was updated
        if (isNewCode) {
          setCodeUpdated(true);
          setTimeout(() => setCodeUpdated(false), 2000);
        }
        
        if (isNewExplanation) {
          setExplanationUpdated(true);
          setTimeout(() => setExplanationUpdated(false), 2000);
        }
      }
    }
  }, [transcriptItems, detectLanguage]);

  // Add keyboard event handler
  useEffect(() => {
    // Only register keyboard events when sidekick is visible
    if (!sidekickVisible) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt+S to toggle sidekick visibility
      if (e.altKey && e.key === 's') {
        e.preventDefault();
        setSidekickVisible(prev => !prev);
      }
      
      // Alt+1 to switch to code tab
      if (e.altKey && e.key === '1') {
        e.preventDefault();
        setActiveTab('code');
      }
      
      // Alt+2 to switch to explanation tab
      if (e.altKey && e.key === '2') {
        e.preventDefault();
        setActiveTab('explanation');
      }
      
      // Alt+C to copy code to clipboard
      if (e.altKey && e.key === 'c' && activeTab === 'code') {
        e.preventDefault();
        navigator.clipboard.writeText(codeContent)
          .then(() => {
            // Show brief visual feedback that copy worked
            const codeElement = document.querySelector('.code-content');
            if (codeElement) {
              codeElement.classList.add('copied');
              setTimeout(() => {
                codeElement.classList.remove('copied');
              }, 500);
            }
          })
          .catch(err => {
            console.error('Failed to copy code: ', err);
          });
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [sidekickVisible, activeTab, codeContent]);
  
  // Persist sidekick state across component re-renders using localStorage
  useEffect(() => {
    // Save state to localStorage when changed
    if (sidekickVisible) {
      localStorage.setItem('sidekick-active-tab', activeTab);
      localStorage.setItem('sidekick-pane-ratio', paneRatio.toString());
    }
  }, [sidekickVisible, activeTab, paneRatio]);
  
  // Restore sidekick state on component mount
  useEffect(() => {
    // Only run once on component mount
    const savedActiveTab = localStorage.getItem('sidekick-active-tab');
    const savedPaneRatio = localStorage.getItem('sidekick-pane-ratio');
    
    if (savedActiveTab) {
      setActiveTab(savedActiveTab as 'code' | 'explanation');
    }
    
    if (savedPaneRatio) {
      const ratio = parseFloat(savedPaneRatio);
      if (!isNaN(ratio) && ratio >= 40 && ratio <= 75) {
        setPaneRatio(ratio);
      }
    }
  }, []);

  const baseContainer = "flex justify-end flex-col";

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) {
        onSendMessage();
      }
    }
  };

  return (
    <>
      {/* Add style tag for animations */}
      <style jsx>{animateHighlight}</style>
      
      <div 
        ref={containerRef}
        className={`flex h-full overflow-hidden rounded-xl shadow-md`}
      >
        {/* Main Pane (Left) */}
        <div 
          className={`h-full flex flex-col ${theme === 'dark' ? 'bg-gray-800 text-gray-200' : 'bg-white text-gray-800'}`}
          style={{ width: `${sidekickVisible ? paneRatio : 100}%` }}
        >
          {/* Top bar with invisible border and JARVIS label */}
          <div className="relative w-full" style={{ minHeight: 36 }}>
            {/* Add toggle sidekick button */}
            <div className="absolute left-4 top-0 flex items-center gap-2 z-20" style={{ marginTop: 4 }}>
              <button
                aria-label="Toggle sidekick"
                className={`flex items-center justify-center ${theme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-800'}`}
                onClick={() => setSidekickVisible(!sidekickVisible)}
                title="Toggle sidekick panel"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M11.704 8.998a.5.5 0 0 0-.707-.707l-4.5 4.5a.5.5 0 0 0 .707.707l4.5-4.5a.5.5 0 0 0 0-.707l-4.5-4.5a.5.5 0 1 0-.707.707l4.146 4.146-4.146 4.147a.5.5 0 0 0 .707.707l4.5-4.5z"/>
                </svg>
                <span className="ml-1 text-xs">{sidekickVisible ? 'Hide' : 'Show'} sidekick</span>
              </button>
            </div>
            {/* Remove the up/down arrows for font size */}
            {/* Invisible border for scroll buffer */}
            <div style={{ height: 36, width: '100%', pointerEvents: 'none', borderBottom: '2px solid transparent' }}></div>
          </div>
          <div className="relative flex-1 overflow-hidden">
            <div
              ref={transcriptRef}
              className="overflow-auto p-4 pt-0 flex flex-col-reverse gap-y-0.5 h-full"
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
                // Simpler spacing: mt-0.5 unless previous was same role, mb-0.5 unless next is same role
                const marginTop = (isUser && isPrevUser) || (!isUser && isPrevAssistant) ? 'mt-0' : 'mt-0.5';
                const marginBottom = (isUser && isNextUser) || (!isUser && isNextAssistant) ? 'mb-0' : 'mb-0.5';
                const containerClasses = `${baseContainer} ${isUser ? "items-end" : "items-start"} ${marginTop} ${marginBottom}`;
                // adjust border radius for grouped bubbles
                const bubbleBase = `max-w-lg p-3 ${isUser ? "bg-gray-900 text-gray-100" : theme === 'dark' ? "bg-gray-700 text-gray-200" : "bg-gray-100 text-black"} rounded-xl ${isUser && isPrevUser ? "rounded-tr-md" : ""} ${isUser && isNextUser ? "rounded-br-md" : ""}`;
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
                    // Check if message contains code and should be partially hidden in main pane
                    const hasCode = title.includes('```');
                    
                    // For assistant messages with code, show a simplified message that indicates code is in sidekick
                    if (hasCode) {
                      // Extract just the non-code part or a preview
                      const codeBlockRegex = /```([a-zA-Z]*)\n([\s\S]*?)\n```/g;
                      let displayContent = title;
                      const matches = [...title.matchAll(codeBlockRegex)];
                      
                      if (matches.length > 0) {
                        // Replace code blocks with an indicator
                        matches.forEach(match => {
                          displayContent = displayContent.replace(match[0], '');
                        });
                        displayContent = displayContent.trim();
                        
                        // If there's no meaningful content left, add a basic message
                        if (!displayContent) {
                          displayContent = "I've provided code that you can see in the right panel.";
                        }
                      }
                      
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
                              
                              {/* Move code indicator to top right */}
                              <div className="text-xs italic text-gray-300 absolute top-2 right-2 flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16" className="mr-1">
                                  <path d="M10.478 1.647a.5.5 0 1 0-.956-.294l-4 13a.5.5 0 0 0 .956.294l4-13zM4.854 4.146a.5.5 0 0 1 0 .708L1.707 8l3.147 3.146a.5.5 0 0 1-.708.708l-3.5-3.5a.5.5 0 0 1 0-.708l3.5-3.5a.5.5 0 0 1 .708 0zm6.292 0a.5.5 0 0 0 0 .708L14.293 8l-3.147 3.146a.5.5 0 0 0 .708.708l3.5-3.5a.5.5 0 0 0 0-.708l-3.5-3.5a.5.5 0 0 0-.708 0z"/>
                                </svg>
                                <span>&lt;&gt;</span>
                              </div>
                              
                              <div className={`whitespace-pre-wrap ${messageStyle}`}
                                  style={{ fontSize: fontSize, lineHeight: 1.5 }}>
                                <ReactMarkdown>{displayContent}</ReactMarkdown>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    
                    // Regular assistant message without code
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
                            
                            {/* Move code indicator to top right */}
                            <div className="text-xs italic text-gray-300 absolute top-2 right-2 flex items-center">
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16" className="mr-1">
                                <path d="M10.478 1.647a.5.5 0 1 0-.956-.294l-4 13a.5.5 0 0 0 .956.294l4-13zM4.854 4.146a.5.5 0 0 1 0 .708L1.707 8l3.147 3.146a.5.5 0 0 1-.708.708l-3.5-3.5a.5.5 0 0 1 0-.708l3.5-3.5a.5.5 0 0 1 .708 0zm6.292 0a.5.5 0 0 0 0 .708L14.293 8l-3.147 3.146a.5.5 0 0 0 .708.708l3.5-3.5a.5.5 0 0 0 0-.708l-3.5-3.5a.5.5 0 0 0-.708 0z"/>
                              </svg>
                              <span>&lt;&gt;</span>
                            </div>
                            
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
              <div ref={transcriptEndRef} />
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
                  onKeyDown={handleKeyDown}
                  className={`flex-1 px-3 py-1.5 focus:outline-none text-sm border ${theme === 'dark' ? 'border-gray-600 bg-gray-700 text-gray-200' : 'border-gray-200 bg-white text-gray-800'} rounded-l-full`}
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
                    <Image src="arrow.svg" alt="Send" width={20} height={20} />
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
        
        {/* Resizer */}
        <div 
          className={`w-1 h-full cursor-ew-resize flex items-center justify-center ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
          onMouseDown={startResizing}
          onDoubleClick={resetSplit}
        >
          <div className={`w-1 h-8 ${theme === 'dark' ? 'bg-gray-500' : 'bg-gray-400'}`}></div>
        </div>
        
        {/* Sidekick Pane (Right) */}
        {sidekickVisible && (
          <div 
            className={`h-full flex flex-col ${theme === 'dark' ? 'bg-gray-900 text-gray-200' : 'bg-gray-100 text-gray-800'}`}
            style={{ width: `${100 - paneRatio - 0.3}%` }}
          >
            {/* Sidekick Header with Tabs */}
            <div className={`flex items-center border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-300'} px-2`}>
              <div className="flex-1 flex">
                <button 
                  className={`px-4 py-2 text-sm font-medium border-b-2 relative ${activeTab === 'code' 
                    ? `${theme === 'dark' ? 'border-blue-500 text-blue-400' : 'border-blue-600 text-blue-600'}` 
                    : `${theme === 'dark' ? 'border-transparent text-gray-400' : 'border-transparent text-gray-500'}`}`}
                  onClick={() => setActiveTab('code')}
                  title="Code (Alt+1)"
                >
                  CODE
                  {/* Notification dot for code updates */}
                  {codeUpdated && activeTab !== 'code' && (
                    <span className="absolute h-2 w-2 rounded-full bg-blue-500 top-2 right-2 animate-pulse" />
                  )}
                </button>
                <button 
                  className={`px-4 py-2 text-sm font-medium border-b-2 relative ${activeTab === 'explanation' 
                    ? `${theme === 'dark' ? 'border-blue-500 text-blue-400' : 'border-blue-600 text-blue-600'}` 
                    : `${theme === 'dark' ? 'border-transparent text-gray-400' : 'border-transparent text-gray-500'}`}`}
                  onClick={() => setActiveTab('explanation')}
                  title="Explanation (Alt+2)"
                >
                  EXPLANATION
                  {/* Notification dot for explanation updates */}
                  {explanationUpdated && activeTab !== 'explanation' && (
                    <span className="absolute h-2 w-2 rounded-full bg-blue-500 top-2 right-2 animate-pulse" />
                  )}
                </button>
              </div>
              <div className="flex items-center gap-1">
                {/* Copy button for code */}
                {activeTab === 'code' && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(codeContent);
                      const codeElement = document.querySelector('.code-content');
                      if (codeElement) {
                        codeElement.classList.add('copied');
                        setTimeout(() => {
                          codeElement.classList.remove('copied');
                        }, 500);
                      }
                    }}
                    className={`p-1 rounded-full ${theme === 'dark' ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'}`}
                    title="Copy code (Alt+C)"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                      <path d="M9.5 1h-3a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => setSidekickVisible(false)}
                  className={`p-1 rounded-full ${theme === 'dark' ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'}`}
                  title="Collapse sidekick (Alt+S)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Sidekick Content */}
            <div className="flex-1 overflow-auto p-4">
              {activeTab === 'code' ? (
                <pre className={`rounded-lg p-0 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} overflow-auto code-content ${codeUpdated ? 'animate-highlight' : ''}`} style={{ position: 'relative' }}>
                  <div className="flex flex-row" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>
                    {/* Line numbers column */}
                    <div className={`text-right select-none ${theme === 'dark' ? 'bg-gray-900 text-gray-500' : 'bg-gray-100 text-gray-400'}`} style={{ 
                      padding: '0.5em 0.5em 0.5em 1em', 
                      minWidth: '3em',
                      fontSize: fontSize - 1,
                      lineHeight: 1.6,
                      position: 'sticky',
                      left: 0,
                      borderRight: `1px solid ${theme === 'dark' ? '#2d3748' : '#e2e8f0'}`
                    }}>
                      {codeContent.split('\n').map((_, i) => (
                        <div key={i}>{i + 1}</div>
                      ))}
                    </div>
                    
                    {/* Code content column - simplified without custom highlighting */}
                    <div style={{ 
                      padding: '0.5em', 
                      fontSize: fontSize,
                      lineHeight: 1.6,
                      color: theme === 'dark' ? '#e2e8f0' : '#1a202c'
                    }}>
                      {codeContent.split('\n').map((line, i) => (
                        <div 
                          key={i} 
                          className={`${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                        >
                          {line || '\u00A0'}
                        </div>
                      ))}
                    </div>
                  </div>
                </pre>
              ) : (
                <div className={`whitespace-pre-wrap rounded-lg p-4 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} ${explanationUpdated ? 'animate-highlight' : ''}`} style={{ fontSize: fontSize, lineHeight: '1.5' }}>
                  <ReactMarkdown>{explanationContent}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Transcript;