"use client";

import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism'; // Dark theme
import { coy } from 'react-syntax-highlighter/dist/cjs/styles/prism'; // Light theme
import ReactMarkdown from 'react-markdown';
import { TabData } from '@/types';
import TabsPanel from './TabsPanel';
import { preprocessCode } from '@/lib/codeUtils';

interface EnhancedCodePaneProps {
  theme: 'light' | 'dark';
  activeTabKey: string;
  onTabChange: (key: string) => void;
  onTabClose?: (key: string) => void;
  tabs: TabData[]; // Restore tabs prop
}

const EnhancedCodePane: React.FC<EnhancedCodePaneProps> = ({ 
  theme, 
  activeTabKey, 
  onTabChange, 
  onTabClose,
  tabs,
}) => {
  const [isCleared, setIsCleared] = useState(false);

  const clearPanel = () => {
    setIsCleared(true);
  };

  const codeStyle = theme === 'dark' ? vscDarkPlus : coy;
  
  // Find the active tab data
  const activeTab = tabs.find(tab => tab.key === activeTabKey);

  // <<< ADD DEBUG LOG HERE >>>
  console.log(`[EnhancedCodePane] Rendering for activeTabKey: ${activeTabKey}. Found activeTab:`, activeTab ? true : false);
  if (activeTab) {
    console.log(`[EnhancedCodePane] activeTab.code value: "${activeTab.code}"`); // Log the actual code value
    console.log(`[EnhancedCodePane] activeTab.language value: "${activeTab.language}"`);
    // Log the whole object for inspection
    console.log('[EnhancedCodePane] Full activeTab object:', activeTab); // Log the object directly
  }
  // <<< END DEBUG LOG >>>

  return (
    <div className="h-full flex flex-col text-xs">
      {tabs.length > 0 ? (
        <div className="h-full flex flex-col">
          {/* Tabs Bar */}
          <TabsPanel 
            tabs={tabs}
            activeTabKey={activeTabKey}
            onTabChange={onTabChange}
            onTabClose={onTabClose}
            theme={theme}
          />
          <div className="flex-1 overflow-y-auto overflow-x-auto mt-1">
            {activeTab ? (
              activeTab.code === "Streaming..." ? (
                <div className={`p-4 text-xs italic ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Streaming code...</div>
              ) :
              activeTab.language === 'markdown' ? (
                <div className="p-2">
                  <ReactMarkdown 
                    className={`prose ${theme === 'dark' ? 'prose-invert' : ''} max-w-none text-xs`}
                  >
                    {activeTab.code} 
                  </ReactMarkdown>
                </div>
              ) : (
                <SyntaxHighlighter
                  language={activeTab.language}
                  style={codeStyle}
                  customStyle={{ 
                    background: 'transparent', 
                    fontSize: '0.45rem', 
                    margin: 0, 
                    padding: '0.35rem',
                    lineHeight: '1.2',
                    maxHeight: '100%',
                    width: '100%'
                  }}
                  wrapLongLines={true}
                  wrapLines={true}
                  showLineNumbers={false}
                >
                  {/* Apply preprocessing to code before rendering */}
                  {preprocessCode(activeTab.code)}
                </SyntaxHighlighter>
              )
            ) : (
              <div className={`p-4 text-center ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                No code tab selected or available.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className={`p-4 text-center ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
          No code tabs available.
        </div>
      )}
    </div>
  );
};

export default EnhancedCodePane; 