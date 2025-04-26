import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism'; // Dark theme
import { coy } from 'react-syntax-highlighter/dist/cjs/styles/prism'; // Light theme
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; // Import shadcn tabs

// Import the TabData type
import { TabData } from '@/app/types';

// REMOVE Example code snippets
// const javaCode = ...
// const pythonCode = ...

interface CodePaneProps {
  theme: 'light' | 'dark';
  activeTabKey: string;
  onTabChange: (key: string) => void;
  tabs: TabData[]; // Add the new prop
}

const CodePane: React.FC<CodePaneProps> = ({ theme, activeTabKey, onTabChange, tabs }) => {
  console.log('[CodePane] Received props:', { activeTabKey, tabs }); // Add logging
  const codeStyle = theme === 'dark' ? vscDarkPlus : coy;

  // Find the active tab data
  const activeTab = tabs.find(tab => tab.key === activeTabKey);
  console.log('[CodePane] Active tab:', activeTab); // Log the active tab

  return (
    <div className="h-full flex flex-col">
      <Tabs value={activeTabKey} onValueChange={onTabChange} className="flex-1 flex flex-col">
        <TabsList className="flex-shrink-0">
          {/* Dynamically generate Tab Triggers */}
          {tabs.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key} className="px-2 py-1 text-xs">
              {tab.filename}
            </TabsTrigger>
          ))}
        </TabsList>
        
        {/* Dynamically generate Tab Content */}
        {tabs.map((tab) => (
          <TabsContent key={tab.key} value={tab.key} className="flex-1 overflow-auto mt-1">
            <div className="w-full h-full overflow-hidden">
              <SyntaxHighlighter
                language={tab.language} // Use dynamic language
                style={codeStyle}
                customStyle={{ 
                  background: 'transparent', 
                  fontSize: '0.875rem', 
                  margin: 0, 
                  padding: '0.5rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word'
                }}
                wrapLongLines={true}
                wrapLines={true}
              >
                {tab.code} {/* Use dynamic code */}
              </SyntaxHighlighter>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default CodePane; 