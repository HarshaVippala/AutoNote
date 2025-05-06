"use client";

import React from 'react';
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import 'react-tabs/style/react-tabs.css'; // Basic styling, can be customized
import { TabData } from '@/app/types'; // Assuming TabData is defined here
import CodeBlock from './CodeBlock'; // Assuming CodeBlock is used for code display
import { XMarkIcon } from '@heroicons/react/24/solid'; // Updated import for Heroicons v2

interface SecondaryPaneProps {
  theme: 'light' | 'dark';
  activeTabKey: string;
  onTabChange: (key: string) => void;
  tabs: TabData[];
  onTabClose: (key: string) => void;
  contentType: 'code' | 'behavioral' | null; // Optional: Could be used to initially focus
}

// Extend TabData interface to include the fields we need
interface ExtendedTabData extends TabData {
  structuredAnalysis?: any;
}

const SecondaryPane: React.FC<SecondaryPaneProps> = ({
  theme,
  activeTabKey,
  onTabChange,
  tabs,
  onTabClose,
  contentType,
}) => {
  const activeIndex = tabs.findIndex(tab => tab.key === activeTabKey);

  if (!tabs || tabs.length === 0) {
    return <div className="p-4 text-center text-gray-500">No code or analysis available.</div>;
  }

  const tabListClasses = `flex border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-300'}`;
  const tabClasses = (selected: boolean) => 
    `px-3 py-2 cursor-pointer text-sm relative flex items-center ${
      selected 
        ? (theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white text-blue-600 border-gray-300') + ' border-l border-t border-r rounded-t -mb-px' 
        : (theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-black')
    }`;
  const tabPanelClasses = `h-full flex-grow overflow-auto ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`;

  return (
    <div className="flex flex-col h-full">
      <Tabs 
        selectedIndex={activeIndex >= 0 ? activeIndex : 0} 
        onSelect={(index: number) => onTabChange(tabs[index].key)}
        className="flex flex-col flex-grow"
      >
        <TabList className={tabListClasses}>
          {tabs.map(tab => (
            <Tab 
              key={tab.key} 
              className={tabClasses(tab.key === activeTabKey)}
              selectedClassName="selected-tab-dummy-class" // Prevent default styling override
              disabledClassName="disabled-tab-dummy-class" // Prevent default styling override
            >
              <span className="mr-2 truncate max-w-[150px]" title={tab.filename}>
                 {tab.filename || `Tab ${tab.key}`}
              </span>
              <button 
                 onClick={(e) => { 
                    e.stopPropagation(); // Prevent tab selection when closing
                    onTabClose(tab.key); 
                 }}
                 className={`ml-1 p-0.5 rounded hover:bg-gray-500 ${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-black'}`}
                 aria-label="Close tab"
              >
                 <XMarkIcon className="h-3 w-3" />
              </button>
            </Tab>
          ))}
        </TabList>

        {tabs.map(tab => (
          <TabPanel 
            key={tab.key} 
            className={tabPanelClasses}
            selectedClassName="block" // Ensure panel is visible when selected
          >
            {/* Display CodeBlock and Analysis side-by-side for code */}
            {tab.language !== 'markdown' && tab.code ? (
              // Use flex row for horizontal split
              <div className="flex flex-row h-full gap-1">
                {/* Code Block Pane (Left) - auto-width based on content */}
                <div className="flex-shrink-0 overflow-auto" style={{ maxWidth: '60%' }}>
                  <CodeBlock 
                    language={tab.language || 'plaintext'} 
                    code={tab.code} 
                    theme={theme} 
                  />
                </div>
                 {/* Analysis Pane (Right) - takes remaining space */}
                 {tab.analysis && (
                   <>
                    {/* Simple vertical separator */}
                    <div className={`w-px ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'}`}></div>
                    <div className="flex-1 overflow-auto p-2"> {/* flex-1 to take remaining space */}
                      {(() => {
                        try {
                          // If analysis is already parsed as an object, use that, otherwise try to parse JSON string
                          const analysisData = typeof (tab as ExtendedTabData).structuredAnalysis === 'object' 
                            ? (tab as ExtendedTabData).structuredAnalysis 
                            : typeof tab.analysis === 'string' 
                              ? JSON.parse(tab.analysis) 
                              : null;
                          
                          if (!analysisData) {
                            return <pre className="whitespace-pre-wrap text-sm">{tab.analysis}</pre>;
                          }
                          
                          // Nice formatted display of analysis data, exclude code/language fields and remove most headings
                          return (
                            <div className="space-y-4 pt-1">
                              {/* think_out_loud - display content without heading */}
                              {analysisData.think_out_loud && (
                                <div className="mb-3">
                                  <p className="text-sm whitespace-pre-wrap ml-1">{analysisData.think_out_loud}</p>
                                </div>
                              )}
                              
                              {/* Explanation - no heading */}
                              {analysisData.explanation && (
                                <div className="mb-3">
                                  <p className="text-sm whitespace-pre-wrap ml-1">{analysisData.explanation}</p>
                                </div>
                              )}
                              
                              {/* Complexity Section - keep this heading */}
                              {analysisData.complexity && (
                                <div className="mb-3">
                                  <h5 className={`text-xs font-semibold mb-1 ${theme === 'dark' ? 'text-blue-300' : 'text-blue-600'}`}>Complexity:</h5>
                                  <div className="ml-3 text-sm">
                                    {analysisData.complexity.time && (
                                      <div><span className="font-medium">Time:</span> {analysisData.complexity.time}</div>
                                    )}
                                    {analysisData.complexity.space && (
                                      <div><span className="font-medium">Space:</span> {analysisData.complexity.space}</div>
                                    )}
                                  </div>
                                </div>
                              )}
                              
                              {/* Edge Cases - no heading */}
                              {analysisData.edge_cases && (
                                <div className="mb-3">
                                  <div className="ml-3 text-sm">
                                    {typeof analysisData.edge_cases === 'string' ? (
                                      <p>{analysisData.edge_cases}</p>
                                    ) : Array.isArray(analysisData.edge_cases) ? (
                                      <ul className="list-disc ml-2">
                                        {analysisData.edge_cases.map((item: string, i: number) => (
                                          <li key={i}>{item}</li>
                                        ))}
                                      </ul>
                                    ) : null}
                                  </div>
                                </div>
                              )}
                              
                              {/* Planning Steps Section - no heading */}
                              {analysisData.planning_steps && analysisData.planning_steps.length > 0 && (
                                <div className="mb-3">
                                  <ol className="list-decimal ml-5 space-y-1">
                                    {analysisData.planning_steps.map((step: string, index: number) => (
                                      <li key={index} className="text-sm">{step}</li>
                                    ))}
                                  </ol>
                                </div>
                              )}
                              
                              {/* Any other fields except the ones we've already handled */}
                              {Object.entries(analysisData)
                                .filter(([key]) => !['code', 'language', 'planning_steps', 'complexity', 'explanation', 'edge_cases', 'think_out_loud'].includes(key))
                                .map(([key, value]) => (
                                  <div key={key} className="mb-3">
                                    {/* No headings for other sections */}
                                    <div className="ml-1 text-sm">
                                      {typeof value === 'string' ? (
                                        <p className="whitespace-pre-wrap">{value}</p>
                                      ) : (
                                        <pre className="text-xs overflow-auto">{JSON.stringify(value, null, 2)}</pre>
                                      )}
                                    </div>
                                  </div>
                                ))
                              }
                            </div>
                          );
                        } catch (e) {
                          // Fallback to original display if parsing fails
                          return <pre className="whitespace-pre-wrap text-sm">{tab.analysis}</pre>;
                        }
                      })()}
                    </div>
                   </>
                 )}
              </div>
            ) : tab.language === 'markdown' && tab.code ? (
              // Basic markdown rendering for behavioral (full width)
              <pre className="whitespace-pre-wrap text-sm">{tab.code}</pre> 
            ) : tab.analysis ? (
              // Fallback to analysis string if code isn't present
              <pre className="whitespace-pre-wrap text-sm">{tab.analysis}</pre> 
            ) : (
              <p>No content for this tab.</p>
            )}
          </TabPanel>
        ))}
      </Tabs>
    </div>
  );
};

export default SecondaryPane; 