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
  // Find the analysis content for the active tab
  const activeAnalysis = tabs.find(tab => tab.key === activeTabKey)?.analysis;

  return (
    <div className={`w-full h-full p-2 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>
      <h2 className="text-lg font-semibold mb-2">Algorithm Analysis</h2>
      
      {/* Render the analysis content dynamically */}
      {activeAnalysis ? (
        // Using a pre element to respect newlines in the analysis string
        <pre className="text-base whitespace-pre-wrap font-sans">
          {activeAnalysis}
        </pre>
      ) : (
        <p className="text-sm italic mt-4">Select a code tab to see analysis.</p>
      )}
    </div>
  );
};

export default AnalysisPane; 