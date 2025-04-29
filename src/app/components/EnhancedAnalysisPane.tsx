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
  // Accept a single active tab object, which might have followUps
  activeTabData: (TabData & { followUps?: StarData[] }) | undefined | null;
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
  const renderStarSectionContent = (content: string | undefined, index: number) => { // Removed : JSX.Element | null
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
  const renderStarResponse = (starData: StarData, isFollowUp: boolean = false) => { // Removed : JSX.Element
    const sections: (keyof StarData)[] = ['situation', 'task', 'action', 'result'];
    return (
      <div className={`border rounded ${theme === 'dark' ? 'border-gray-700' : 'border-gray-300'} overflow-hidden`}>
        {isFollowUp && <h4 className={`text-xs font-bold p-2 border-b ${theme === 'dark' ? 'bg-gray-700 text-gray-300 border-gray-600' : 'bg-gray-200 text-gray-700 border-gray-300'}`}>Follow-up:</h4>}
        {sections.map((key, index) => renderStarSectionContent(starData[key], index))}
      </div>
    );
  };

  // Helper to render standard analysis key-value pairs
  // Helper to render standard analysis key-value pairs
  const renderStandardAnalysisField = (key: string, value: any) => { // Removed : JSX.Element | null
    if (value === null || value === undefined || value === '') return null;

    const title = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    let contentElement; // Use a different variable name to avoid conflict if 'content' is a key

    // Determine how to render the content based on the key and value type
    if (key === 'code' && typeof value === 'string') {
      // Render code using <pre>
      contentElement = <pre className={`text-xs font-mono p-2 rounded whitespace-pre-wrap break-words ${theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-800'}`}>{value}</pre>;
    } else if (key === 'complexity' && typeof value === 'object' && value.t && value.s) {
      // Render complexity object nicely
      contentElement = <p>Time: {value.t}, Space: {value.s}</p>;
    } else if (Array.isArray(value)) {
      // Render arrays as lists
      contentElement = <ul className="list-disc list-inside space-y-1">{value.map((item: any, index: number) => <li key={index} className="break-words">{typeof item === 'object' ? <pre className={`text-xs font-mono p-1 rounded whitespace-pre-wrap break-words ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}>{JSON.stringify(item, null, 2)}</pre> : item}</li>)}</ul>;
    } else if (typeof value === 'object') {
       // Render other objects by mapping key-value pairs (excluding complexity handled above)
       contentElement = Object.entries(value).map(([subKey, subValue]) => <p key={subKey} className="whitespace-pre-wrap break-words ml-2"><strong className="capitalize">{subKey}:</strong> {String(subValue)}</p>);
    } else if (typeof value === 'string') {
       // Render plain strings
       contentElement = <p className="whitespace-pre-wrap break-words">{value}</p>;
    } else {
      // Fallback for other types
      contentElement = <p>{String(value)}</p>;
    }

    // Return the rendered field
    return (
      <div key={key} className="mb-3">
        <h3 className={`text-xs font-semibold mb-1 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>{title}:</h3>
        <div className="text-xs ml-1">{contentElement}</div>
        <hr className="border-gray-600 my-2 opacity-50 last:hidden" />
      </div>
    );
  };
  // --- Render Logic ---
  const renderMainContent = () => { // Removed : JSX.Element
    if (!activeTab) {
      // Keep the placeholder centered if no tab data
      return (
         <div className="flex-1 flex items-center justify-center text-gray-500 h-full">
             <p className={`text-xs italic ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Select a tab to see analysis.</p>
         </div>
      );
    }

    // Determine if it's behavioral based on the active tab data
    const isBehavioral = activeTab.filename?.startsWith('Behavioral-') || activeTab.filename?.startsWith('STAR:') || (activeTab.structuredAnalysis && typeof activeTab.structuredAnalysis === 'object' && 'situation' in activeTab.structuredAnalysis);

    // --- Behavioral View ---
    if (isBehavioral && activeTab.structuredAnalysis && typeof activeTab.structuredAnalysis === 'object' && 'situation' in activeTab.structuredAnalysis) {
      const originalStarData = activeTab.structuredAnalysis as StarData;
      const followUpData = activeTab.followUps || [];

      return (
         // Use flex-col to stack original and follow-ups
         <div className="w-full h-full flex flex-col p-3"> {/* Add padding here */}
           {/* Top Row: Original Response */}
           <div className="flex-shrink-0 mb-4">
             {renderStarResponse(originalStarData)}
           </div>

           {/* Separator */}
           <hr className={`my-2 border-t-2 ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`} />

           {/* Bottom Row: Follow-ups (or placeholder) */}
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
               <p className={`text-xs italic ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                 No follow-up responses yet.
               </p>
             )}
           </div>
         </div>
       );
    }

    // --- Standard Analysis View (Non-Behavioral) ---
    let analysisData: any = null;

    // Prioritize structuredAnalysis if it's a valid object
    if (activeTab.structuredAnalysis && typeof activeTab.structuredAnalysis === 'object' && !('status' in activeTab.structuredAnalysis)) {
       analysisData = activeTab.structuredAnalysis;
       console.log('[AnalysisPane] Using structuredAnalysis:', analysisData);
    }
    // Fallback to parsing analysis string if structuredAnalysis isn't suitable
    else if (activeTab.analysis) {
      try {
        analysisData = JSON.parse(activeTab.analysis);
        console.log('[AnalysisPane] Parsed analysis string:', analysisData);
      } catch (e) {
        console.error('[AnalysisPane] Failed to parse analysis string, rendering raw:', activeTab.analysis, e);
        // Render the raw string if parsing fails (might be incomplete stream data)
        return <pre className={`text-xs whitespace-pre-wrap font-mono p-3 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>{activeTab.analysis}</pre>;
      }
    }

    // Render based on the determined analysisData
    if (analysisData && typeof analysisData === 'object') {
       console.log('[AnalysisPane] Rendering analysisData object:', analysisData);
      // Ensure 'language' and 'cd' (code) are included for code responses
      const fieldOrder: (keyof AnalysisResponse)[] = [
          'language', // Add language
          'cd',       // Changed from 'code' to 'cd'
          'clarifying_questions', 'think_out_loud', 'edge_cases',
          'test_cases', 'complexity', 'potential_optimizations'
      ];
      // Add padding for standard analysis view as well
      return <div className="w-full p-3">{fieldOrder.map(key => renderStandardAnalysisField(key, analysisData?.[key]))}</div>;
    } else {
      return <p className={`text-xs italic p-3 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>No analysis available for this tab.</p>;
    }
  }; // End of renderMainContent

  // --- Component Return ---
  // Determine if we need to render TabsPanel (only for behavioral view now)
   const isBehavioralView = activeTab?.filename?.startsWith('Behavioral-') || activeTab?.filename?.startsWith('STAR:') || (activeTab?.structuredAnalysis && typeof activeTab.structuredAnalysis === 'object' && 'situation' in activeTab.structuredAnalysis);

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