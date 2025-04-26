import React from 'react';

// Import the TabData type
import { TabData } from '@/app/types';

interface AnalysisPaneProps {
  theme: 'light' | 'dark';
  activeTabKey: string;
  tabs: TabData[]; // Add the new prop
  // Add other props as needed, e.g., analysis content
}

const AnalysisPane: React.FC<AnalysisPaneProps> = ({ theme, activeTabKey, tabs }) => { // Destructure tabs
  console.log('[AnalysisPane] Received props:', { activeTabKey, tabs }); // Add logging
  // Find the analysis content for the active tab
  // Find the active tab data
  const activeTab = tabs.find(tab => tab.key === activeTabKey);
  console.log('[AnalysisPane] Active tab:', activeTab); // Log the active tab

  return (
    <div className={`w-full h-full p-2 overflow-hidden ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>
      <h2 className="text-lg font-semibold mb-2">Analysis</h2> {/* Changed title to be more general */}
      
      <div className="overflow-y-auto overflow-x-hidden h-[calc(100%-2rem)]">
        {/* Render the analysis content dynamically */}
        {activeTab ? (
          activeTab.structuredAnalysis ? (
            // Render structured analysis if available
            <div className="text-base font-sans">
              {/* Check if it's a behavioral response based on filename */}
              {activeTab.filename?.startsWith('format_behavioral_star_answer-') ? (
                <>
                  {console.log('[AnalysisPane] Rendering behavioral analysis:', activeTab.structuredAnalysis)} {/* Add logging */}
                  {activeTab.structuredAnalysis.situation && (
                    <>
                      <h3 className="text-md font-semibold mt-2 mb-1">Situation:</h3>
                      <p className="break-words whitespace-normal overflow-wrap-anywhere mb-2">{activeTab.structuredAnalysis.situation}</p>
                    </>
                  )}
                  {activeTab.structuredAnalysis.task && (
                    <>
                      <h3 className="text-md font-semibold mt-2 mb-1">Task:</h3>
                      <p className="break-words whitespace-normal overflow-wrap-anywhere mb-2">{activeTab.structuredAnalysis.task}</p>
                    </>
                  )}
                  {activeTab.structuredAnalysis.action && (
                    <>
                      <h3 className="text-md font-semibold mt-2 mb-1">Action:</h3>
                      <p className="break-words whitespace-normal overflow-wrap-anywhere mb-2">{activeTab.structuredAnalysis.action}</p>
                    </>
                  )}
                  {activeTab.structuredAnalysis.result && (
                    <>
                      <h3 className="text-md font-semibold mt-2 mb-1">Result:</h3>
                      <p className="break-words whitespace-normal overflow-wrap-anywhere mb-2">{activeTab.structuredAnalysis.result}</p>
                    </>
                  )}
                </>
              ) : (
                // Render comprehensive code analysis
                <>
                  {console.log('[AnalysisPane] Rendering comprehensive analysis:', activeTab.structuredAnalysis)} {/* Add logging */}
                  {activeTab.structuredAnalysis.planning_steps && activeTab.structuredAnalysis.planning_steps.length > 0 && (
                    <>
                      <h3 className="text-md font-semibold mt-2 mb-1">Planning Steps:</h3>
                      <ul className="list-disc list-inside mb-2">
                        {activeTab.structuredAnalysis.planning_steps.map((step, index) => (
                          <li key={index} className="break-words whitespace-normal overflow-wrap-anywhere mb-1">{step}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {activeTab.structuredAnalysis.complexity && (
                    <>
                      <h3 className="text-md font-semibold mt-2 mb-1">Complexity:</h3>
                      <p className="mb-1">Time: {activeTab.structuredAnalysis.complexity.time}</p>
                      <p className="mb-2">Space: {activeTab.structuredAnalysis.complexity.space}</p>
                    </>
                  )}
                  {activeTab.structuredAnalysis.explanation && (
                    <>
                      <h3 className="text-md font-semibold mt-2 mb-1">Explanation:</h3>
                      <p className="break-words whitespace-normal overflow-wrap-anywhere">{activeTab.structuredAnalysis.explanation}</p>
                    </>
                  )}
                </>
              )}
            </div>
          ) : (
            // Fallback to raw analysis string if no structured analysis
            activeTab.analysis ? (
               <>
                 {console.log('[AnalysisPane] Rendering raw analysis:', activeTab.analysis)} {/* Add logging */}
                 <pre className="text-base whitespace-pre-wrap break-words overflow-wrap-anywhere font-sans">
                   {activeTab.analysis}
                 </pre>
               </>
            ) : (
              <p className="text-sm italic mt-4">No analysis available for this tab.</p>
            )
          )
        ) : (
          <p className="text-sm italic mt-4">Select a code tab to see analysis.</p>
        )}
      </div>
    </div>
  );
};

export default AnalysisPane; 