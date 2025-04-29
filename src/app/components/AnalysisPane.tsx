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
          (activeTab as any).structuredAnalysis ? ( // Use 'any' assertion
            // Render structured analysis based on type
            <div className="text-sm p-4 overflow-auto h-full text-gray-300 flex flex-col">
              {/* Log the type and content being rendered */}
              {console.log('[AnalysisPane] Rendering analysis type:', (activeTab as any).structuredAnalysis?.situation ? 'behavioral' : 'comprehensive', '| Data:', (activeTab as any).structuredAnalysis)}

              {/* Behavioral STAR Analysis */}
              {(activeTab as any).structuredAnalysis?.situation && ( // Use 'any' assertion and optional chaining
                <>
                  {/* Removed explicit headings, rely on implicit structure */}
                  <p className="break-words whitespace-pre-wrap overflow-wrap-anywhere mb-3 font-medium text-gray-200">{(activeTab as any).structuredAnalysis.situation}</p>
                  <hr className="border-gray-600 my-2" />
                  {(activeTab as any).structuredAnalysis.task && <p className="break-words whitespace-pre-wrap overflow-wrap-anywhere mb-3">{(activeTab as any).structuredAnalysis.task}</p>}
                  <hr className="border-gray-600 my-2" />
                  {(activeTab as any).structuredAnalysis.action && <p className="break-words whitespace-pre-wrap overflow-wrap-anywhere mb-3">{(activeTab as any).structuredAnalysis.action}</p>}
                  <hr className="border-gray-600 my-2" />
                  {(activeTab as any).structuredAnalysis.result && <p className="break-words whitespace-pre-wrap overflow-wrap-anywhere">{(activeTab as any).structuredAnalysis.result}</p>}
                </>
              )}

              {/* Comprehensive Code/Analysis */}
              {/* Check for a field unique to comprehensive schema, like think_out_loud */}
              {(activeTab as any).structuredAnalysis?.think_out_loud && ( // Use 'any' assertion and optional chaining
                <>
                  {/* Clarifying Questions (Optional) */}
                  {(activeTab as any).structuredAnalysis.clarifying_questions && (activeTab as any).structuredAnalysis.clarifying_questions.length > 0 && (
                    <>
                      <ul className="list-disc list-inside mb-3">
                        {(activeTab as any).structuredAnalysis.clarifying_questions.map((q: string, index: number) => ( // Add types for map params
                          <li key={index} className="break-words whitespace-pre-wrap overflow-wrap-anywhere">{q}</li>
                        ))}
                      </ul>
                      <hr className="border-gray-600 my-2" />
                    </>
                  )}

                  {/* Think Out Loud */}
                  <p className="break-words whitespace-pre-wrap overflow-wrap-anywhere mb-3">{(activeTab as any).structuredAnalysis.think_out_loud}</p>
                  <hr className="border-gray-600 my-2" />

                  {/* Edge Cases */}
                  <p className="break-words whitespace-pre-wrap overflow-wrap-anywhere mb-3">{(activeTab as any).structuredAnalysis.edge_cases}</p>
                  <hr className="border-gray-600 my-2" />

                  {/* Test Cases */}
                  <div className="mb-3">
                    {(activeTab as any).structuredAnalysis.test_cases?.map((tc: { input: string; expected_output: string }, index: number) => ( // Add types for map params
                      <div key={index} className="mb-2 p-2 bg-gray-700 rounded">
                        <p className="font-mono text-xs break-words whitespace-pre-wrap overflow-wrap-anywhere"><strong className="font-semibold text-gray-400">Input:</strong> {tc.input}</p>
                        <p className="font-mono text-xs break-words whitespace-pre-wrap overflow-wrap-anywhere"><strong className="font-semibold text-gray-400">Output:</strong> {tc.expected_output}</p>
                      </div>
                    ))}
                  </div>
                  <hr className="border-gray-600 my-2" />

                  {/* Complexity */}
                  <div className="mb-3">
                    <p className="mb-1 break-words whitespace-pre-wrap overflow-wrap-anywhere"><strong>Time:</strong> {(activeTab as any).structuredAnalysis.complexity?.time}</p>
                    <p className="break-words whitespace-pre-wrap overflow-wrap-anywhere"><strong>Space:</strong> {(activeTab as any).structuredAnalysis.complexity?.space}</p>
                  </div>
                  <hr className="border-gray-600 my-2" />

                  {/* Potential Optimizations (Optional) */}
                  {(activeTab as any).structuredAnalysis.potential_optimizations && (
                    <>
                      <p className="break-words whitespace-pre-wrap overflow-wrap-anywhere">{(activeTab as any).structuredAnalysis.potential_optimizations}</p>
                      {/* No divider after the last element */}
                    </>
                  )}
                </>
              )}

              {/* Fallback for unexpected structure - might need adjustment */}
              {/* {!activeTab.structuredAnalysis.situation && !activeTab.structuredAnalysis.think_out_loud && ( */}
              {/*   <p className="text-gray-400">Raw analysis data: {JSON.stringify(activeTab.structuredAnalysis)}</p> */}
              {/* )} */}
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