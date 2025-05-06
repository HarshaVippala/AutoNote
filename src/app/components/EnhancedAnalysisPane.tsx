"use client";

import React, { FC, memo } from 'react';
// Import all needed types from the central file
import { TabData, AnalysisResponse, BehavioralStarResponse } from '@/app/types/index'; // Assuming these types exist in types/index.ts
import TabsPanel from './TabsPanel'; // Import TabsPanel

// Define a type for the structured STAR data within the tab
interface StarData extends BehavioralStarResponse {
 // Potentially add timestamp or original question later if needed
}

// Define the props for this component
interface EnhancedAnalysisPaneProps {
  theme: 'light' | 'dark';
  // Update activeTabData to potentially include functionCall and followUps
  activeTabData: (TabData & {
    followUps?: StarData[];
    structuredAnalysis?: Record<string, any> | { status: string }; // Use Record<string, any> for flexibility
    functionCall?: { id: string; call_id: string; name: string; arguments: string; };
  }) | undefined | null;
  // Add props needed for TabsPanel when rendering behavioral view
  tabs?: TabData[]; // Make optional, only needed for behavioral
  activeTabKey?: string; // Make optional, only needed for behavioral
  onTabChange?: (key: string) => void; // Make optional, only needed for behavioral
  onTabClose?: (tabKey: string) => void; // Make optional, only needed for behavioral
}

const EnhancedAnalysisPane: FC<EnhancedAnalysisPaneProps> = ({
  theme,
  activeTabData,
  // Destructure optional props for TabsPanel
  tabs = [], // Default to empty array if not provided
  activeTabKey = '',
  onTabChange = () => {},
  onTabClose,
}) => {

  // Use the passed activeTabData directly
  const activeTab = activeTabData;

  // --- Helper Functions ---

  // Helper to render a single STAR section content with alternating background (NO TITLE)
  const renderStarSectionContent = (content: string | undefined, index: number) => {
    if (!content) return null;
    const bgColor = index % 2 === 0
      ? (theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50')
      : (theme === 'dark' ? 'bg-gray-850' : 'bg-white');

    return (
      <div key={index} className={`p-3 ${bgColor}`}>
        <p className="text-xs whitespace-pre-wrap break-words text-justify">{content}</p>
      </div>
    );
  };

  // Helper to render a full STAR response object
  const renderStarResponse = (starData: StarData, isFollowUp: boolean = false) => {
    const sections: (keyof StarData)[] = ['situation', 'task', 'action', 'result'];
    return (
      <div className={`border rounded ${theme === 'dark' ? 'border-gray-700' : 'border-gray-300'} overflow-hidden`}>
        {isFollowUp && <h4 className={`text-xs font-bold p-2 border-b ${theme === 'dark' ? 'bg-gray-700 text-gray-300 border-gray-600' : 'bg-gray-200 text-gray-700 border-gray-300'}`}>Follow-up:</h4>}
        {sections.map((key, index) => renderStarSectionContent(starData[key], index))}
      </div>
    );
  };

  // Helper to render standard analysis key-value pairs
  const renderStandardAnalysisField = (key: string, value: any) => {
    if (value === null || value === undefined || value === '') return null;

    const title = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    let contentElement;

    // Determine how to render the content based on the key and value type
    if (key === 'cd' && typeof value === 'string') {
      // Render code using <pre>
      contentElement = <pre className={`text-xs font-mono p-2 rounded whitespace-pre-wrap break-words ${theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-800'}`}>{value}</pre>;
    } else if (key === 'cmplx' && typeof value === 'object' && value !== null && 't' in value && 's' in value) {
      // Render complexity object nicely
      contentElement = (
        <div className="space-y-2">
          <div className={`p-2 rounded ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}`}>
            <p className="whitespace-pre-wrap break-words font-semibold">Time Complexity: <span className="font-bold">{value.t}</span></p>
            <p className="whitespace-pre-wrap break-words text-xs mt-1 ml-4 opacity-80">
              {value.t.includes('O(n + m)') 
                ? 'Where n and m are the lengths of the two input arrays. The algorithm processes each element exactly once.' 
                : value.t.includes('O(n)') 
                  ? 'Where n is the total number of elements across all inputs. Linear time as we process each element once.'
                  : value.t.includes('O(1)') 
                    ? 'Constant time operations regardless of input size.'
                    : ''}
            </p>
          </div>
          <div className={`p-2 rounded ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}`}>
            <p className="whitespace-pre-wrap break-words font-semibold">Space Complexity: <span className="font-bold">{value.s}</span></p>
            <p className="whitespace-pre-wrap break-words text-xs mt-1 ml-4 opacity-80">
              {value.s.includes('O(n + m)') 
                ? 'Where n and m are the lengths of the two input arrays. We create a new output array to store all elements.' 
                : value.s.includes('O(n)') 
                  ? 'Where n is the total number of elements. We need space proportional to the input size.'
                  : value.s.includes('O(1)') 
                    ? 'Constant space usage regardless of input size.'
                    : ''}
            </p>
          </div>
        </div>
      );
    } else if (Array.isArray(value)) {
      // Render arrays as lists
      contentElement = <ul className="list-disc list-inside space-y-1">{value.map((item: any, index: number) => <li key={index} className="break-words">{typeof item === 'object' ? <pre className={`text-xs font-mono p-1 rounded whitespace-pre-wrap break-words ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}>{JSON.stringify(item, null, 2)}</pre> : String(item)}</li>)}</ul>;
    } else if (typeof value === 'object' && value !== null) {
       // Render other objects by mapping key-value pairs
       contentElement = Object.entries(value).map(([subKey, subValue]) => <p key={subKey} className="whitespace-pre-wrap break-words ml-2"><strong className="capitalize">{subKey}:</strong> {String(subValue)}</p>);
    } else {
      // Render plain strings or other types
      contentElement = <p className="whitespace-pre-wrap break-words">{String(value)}</p>;
    }

    // Return the rendered field
    return (
      <div key={key} className="mb-3">
        <h3 className={`text-xs font-semibold mb-1 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>{title}:</h3>
        <div className="text-xs ml-1">{contentElement}</div>
        <hr className={`my-2 opacity-50 last:hidden ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`} />
      </div>
    );
  };

  // --- Render Logic ---
  const renderMainContent = () => {
    if (!activeTab) {
      return (
         <div className="flex-1 flex items-center justify-center text-gray-500 h-full">
             <p className={`text-xs italic ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Select a tab to see analysis.</p>
         </div>
      );
    }

    // Check for streaming status first
    if (activeTab.structuredAnalysis && typeof activeTab.structuredAnalysis === 'object' && 'status' in activeTab.structuredAnalysis && activeTab.structuredAnalysis.status === 'streaming') {
      return (
        <div className="flex-1 flex items-center justify-center text-gray-500 h-full">
          <p className={`text-xs italic ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Streaming response...</p>
        </div>
      );
    }

    // Safely access functionCall and structuredAnalysis
    const functionName = activeTab?.functionCall?.name;
    const analysisData = (activeTab?.structuredAnalysis && typeof activeTab.structuredAnalysis === 'object' && !('status' in activeTab.structuredAnalysis))
      ? activeTab.structuredAnalysis
      : null;

    // --- Render based on function name ---

    if (functionName === 'format_behavioral_star_answer' && analysisData) {
      const originalStarData = analysisData as StarData;
      const followUpData = activeTab.followUps || [];
      return (
        <div className="w-full h-full flex flex-col p-3">
          <div className="flex-shrink-0 mb-4">
            {renderStarResponse(originalStarData)}
          </div>
          <hr className={`my-2 border-t-2 ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`} />
          <div className="flex-1 overflow-y-auto pt-4 pr-2">
            {followUpData.length > 0 ? (
              <>
                <h3 className={`text-sm font-semibold mb-3 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>Follow-up Responses</h3>
                <div className="space-y-4">
                  {followUpData.map((followUp, index) => (
                    <div key={`followup-${index}`}>
                      {renderStarResponse(followUp, true)}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className={`text-xs italic ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>No follow-up responses yet.</p>
            )}
          </div>
        </div>
      );
    }

    if (functionName === 'format_comprehensive_code' && analysisData) {
      // Define the order of fields based on user requirements, inserting 'analysis' as the first element
      const fieldOrder: string[] = [
        'analysis',  // Problem paraphrase & I/O / constraint walkthrough
        'tol',       // Think out loud - step by step explanation 
        'cq',        // Clarifying questions (if applicable)
        'cmplx',     // Time & space complexity
        'tc',        // Test cases with expected outputs
        'ec',        // Edge cases and how they were handled
        'opt',       // Potential optimizations (if applicable)
      ];
      
      // Custom rendering without section titles
      return (
        <div className="w-full p-3 overflow-y-auto">
          {fieldOrder.map((key, index) => {
            if (!analysisData || !(key in analysisData) || !analysisData[key as keyof typeof analysisData]) {
              return null; // Skip empty fields
            }
            
            const value = analysisData[key as keyof typeof analysisData];
            let content;

            // Insert analysis field rendering as the first case, before tol
            if (key === 'analysis' && typeof value === 'string') {
              content = (
                <div className="mb-2">
                  <h3 className={`text-xs font-semibold mb-1 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>Analysis:</h3>
                  <p className="whitespace-pre-wrap break-words">{value}</p>
                </div>
              );
            } else if (key === 'tol' && typeof value === 'string') {
              content = <p className="whitespace-pre-wrap break-words">{value}</p>;
            } else if (key === 'cq' && Array.isArray(value)) {
              content = value.length > 0 ? (
                <ul className="list-disc list-inside">
                  {value.map((item, i) => <li key={i} className="whitespace-pre-wrap break-words">{item}</li>)}
                </ul>
              ) : null;
            } else if (key === 'cmplx' && typeof value === 'object' && 't' in value && 's' in value) {
              content = (
                <div className="space-y-2">
                  <div className={`p-2 rounded ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}`}>
                    <p className="whitespace-pre-wrap break-words font-semibold">Time Complexity: <span className="font-bold">{value.t}</span></p>
                    <p className="whitespace-pre-wrap break-words text-xs mt-1 ml-4 opacity-80">
                      {value.t.includes('O(n + m)') 
                        ? 'Where n and m are the lengths of the two input arrays. The algorithm processes each element exactly once.' 
                        : value.t.includes('O(n)') 
                          ? 'Where n is the total number of elements across all inputs. Linear time as we process each element once.'
                          : value.t.includes('O(1)') 
                            ? 'Constant time operations regardless of input size.'
                            : ''}
                    </p>
                  </div>
                  <div className={`p-2 rounded ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}`}>
                    <p className="whitespace-pre-wrap break-words font-semibold">Space Complexity: <span className="font-bold">{value.s}</span></p>
                    <p className="whitespace-pre-wrap break-words text-xs mt-1 ml-4 opacity-80">
                      {value.s.includes('O(n + m)') 
                        ? 'Where n and m are the lengths of the two input arrays. We create a new output array to store all elements.' 
                        : value.s.includes('O(n)') 
                          ? 'Where n is the total number of elements. We need space proportional to the input size.'
                          : value.s.includes('O(1)') 
                            ? 'Constant space usage regardless of input size.'
                            : ''}
                    </p>
                  </div>
                </div>
              );
            } else if (key === 'tc' && Array.isArray(value)) {
              content = (
                <div className="space-y-2">
                  {value.map((tc, i) => (
                    <div key={i} className={`p-2 rounded ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}`}>
                      <p className="whitespace-pre-wrap break-words"><strong>Input:</strong> {tc.in}</p>
                      <p className="whitespace-pre-wrap break-words"><strong>Output:</strong> {tc.out}</p>
                    </div>
                  ))}
                </div>
              );
            } else if (key === 'ec' && typeof value === 'string') {
              content = <p className="whitespace-pre-wrap break-words">{value}</p>;
            } else if (key === 'opt' && typeof value === 'string') {
              content = <p className="whitespace-pre-wrap break-words">{value}</p>;
            } else {
              // Fallback for any other type
              content = typeof value === 'object' ? 
                <pre className={`text-xs font-mono rounded whitespace-pre-wrap break-words ${theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-800'}`}>{JSON.stringify(value, null, 2)}</pre> : 
                <p className="whitespace-pre-wrap break-words">{String(value)}</p>;
            }
            
            return (
              <div key={key} className="mb-4">
                {content}
                {index < fieldOrder.length - 1 && (
                  <hr className={`my-3 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-300'}`} />
                )}
              </div>
            );
          })}
        </div>
      );
    }

    if (functionName === 'format_simple_explanation' && analysisData) {
       // Explanation is usually added directly to transcript, show fallback here
       return (
         <div className="w-full p-3">
           <h3 className={`text-xs font-semibold mb-1 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>Explanation:</h3>
           <p className="text-xs whitespace-pre-wrap break-words text-justify">
             {(analysisData as any)?.explanation || 'Explanation content not found.'}
           </p>
         </div>
       );
    }

    // Fallback if no specific function matches or analysisData is missing
    if (activeTab?.analysis) {
       // Try parsing the raw analysis string as a last resort
       try {
         const parsedFallback = JSON.parse(activeTab.analysis);
         if (parsedFallback && typeof parsedFallback === 'object') {
            console.warn('[AnalysisPane] Rendering fallback parsed analysis string');
            return <div className="w-full p-3">{Object.keys(parsedFallback).map(key => renderStandardAnalysisField(key, parsedFallback[key]))}</div>;
         }
       } catch (e) {
         console.warn('[AnalysisPane] Failed to parse fallback analysis string, rendering raw:', activeTab?.analysis);
         return <pre className={`text-xs whitespace-pre-wrap font-mono p-3 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>{activeTab?.analysis}</pre>;
       }
    }

    // Final fallback if no data is available
    return <p className={`text-xs italic p-3 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>No analysis available for this tab.</p>;
  }; // End of renderMainContent

  // --- Component Return ---
  // Determine if we need to render TabsPanel (only for behavioral view now)
   // Determine view type based on function call name primarily, handle potential null activeTab
   const functionName = activeTab?.functionCall?.name;
   const isBehavioralView = functionName === 'format_behavioral_star_answer';

  return (
    <div className="h-full w-full flex flex-col text-xs" style={{ minHeight: 0 }}>
       {/* Render TabsPanel only if it's the behavioral view and necessary props are passed */}
       {isBehavioralView && tabs && tabs.length > 0 && onTabChange && (
         <TabsPanel
           tabs={tabs} // Pass the full list for tab selection
           activeTabKey={activeTabKey} // Pass the active key
           onTabChange={onTabChange}
           onTabClose={onTabClose}
           theme={theme}
         />
       )}
       {/* Render the main content area */}
       <div className="flex-1 overflow-y-auto overflow-x-auto w-full">
         {renderMainContent()}
       </div>
    </div>
  );
}; // End of EnhancedAnalysisPane component

export default memo(EnhancedAnalysisPane);