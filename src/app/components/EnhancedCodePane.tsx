"use client";

import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism'; // Dark theme
import { coy } from 'react-syntax-highlighter/dist/cjs/styles/prism'; // Light theme
import { TabData } from '@/app/types';
import TabsPanel from './TabsPanel';

interface EnhancedCodePaneProps {
  theme: 'light' | 'dark';
  activeTabKey: string;
  onTabChange: (key: string) => void;
  onTabClose?: (key: string) => void;
  tabs: TabData[];
}

const EnhancedCodePane: React.FC<EnhancedCodePaneProps> = ({ 
  theme, 
  activeTabKey, 
  onTabChange, 
  onTabClose,
  tabs 
}) => {
  const [isCleared, setIsCleared] = useState(false);

  const clearPanel = () => {
    setIsCleared(true);
  };

  const codeStyle = theme === 'dark' ? vscDarkPlus : coy;
  
  // Find the active tab data
  const activeTab = tabs.find(tab => tab.key === activeTabKey);
  
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
          Code
        </h2>
        <button 
          onClick={clearPanel}
          className={`px-2 py-1 text-xs rounded ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
        >
          Clear
        </button>
      </div>
      
      {isCleared ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <p>Panel cleared</p>
        </div>
      ) : tabs.length > 0 ? (
        <div className="h-full flex flex-col">
          {/* Tabs Bar */}
          <TabsPanel 
            tabs={tabs}
            activeTabKey={activeTabKey}
            onTabChange={onTabChange}
            onTabClose={onTabClose}
            theme={theme}
          />
          
          {/* Code Content */}
          <div className="flex-1 overflow-auto mt-1">
            {activeTab ? (
              <SyntaxHighlighter
                language={activeTab.language}
                style={codeStyle}
                customStyle={{ 
                  background: 'transparent', 
                  fontSize: '0.875rem', 
                  margin: 0, 
                  padding: '0.5rem',
                  minHeight: '100%'
                }}
                wrapLongLines={true}
              >
                {activeTab.code}
              </SyntaxHighlighter>
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