"use client";

import React, { useState } from 'react';
import { TabData, AnalysisResponse } from '@/app/types/index';

interface EnhancedAnalysisPaneProps {
  theme: 'light' | 'dark';
  activeTabKey: string;
  tabs: TabData[];
}

// Define the STAR interface for behavioral answers
interface BehavioralStarResponse {
  situation: string;
  task: string;
  action: string;
  result: string;
}

// Fix existing structuredAnalysis type issues by extending TabData
interface ExtendedTabData extends TabData {
  structuredAnalysis?: AnalysisResponse | BehavioralStarResponse;
}

const EnhancedAnalysisPane = ({ theme, activeTabKey, tabs }: EnhancedAnalysisPaneProps) => {
  const [isCleared, setIsCleared] = useState(false);

  const clearPanel = () => {
    setIsCleared(true);
  };

  // Find the active tab data
  const activeTab = tabs.find(tab => tab.key === activeTabKey) as ExtendedTabData | undefined;

  // Type guard to check if it's a behavioral STAR response
  const isBehavioralResponse = (data: any): data is BehavioralStarResponse => {
    return data && 
      typeof data.situation === 'string' && 
      typeof data.task === 'string' && 
      typeof data.action === 'string' && 
      typeof data.result === 'string';
  };

  // Type guard to check if it's a comprehensive code analysis
  const isComprehensiveAnalysis = (data: any): data is AnalysisResponse => {
    return data && 
      Array.isArray(data.planning_steps) && 
      data.complexity && 
      typeof data.explanation === 'string';
  };

  // Render different content based on the type of response
  const renderContent = () => {
    if (!activeTab) {
      return (
        <p className={`text-sm italic mt-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
          Select a code tab to see analysis.
        </p>
      );
    }

    if (activeTab.structuredAnalysis) {
      // Check if it's a behavioral response (STAR format)
      if (activeTab.filename?.startsWith('format_behavioral_star_answer-') && 
          isBehavioralResponse(activeTab.structuredAnalysis)) {
        return renderBehavioralAnalysis(activeTab.structuredAnalysis);
      }
      // Otherwise it's comprehensive code analysis
      else if (isComprehensiveAnalysis(activeTab.structuredAnalysis)) {
        return renderComprehensiveAnalysis(activeTab.structuredAnalysis);
      }
    }

    // Fallback to raw analysis string if no structured analysis
    return activeTab.analysis ? (
      <pre className={`text-base whitespace-pre-wrap font-sans ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
        {activeTab.analysis}
      </pre>
    ) : (
      <p className={`text-sm italic mt-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
        No analysis available for this tab.
      </p>
    );
  };

  // Render STAR format analysis
  const renderBehavioralAnalysis = (data: BehavioralStarResponse) => {
    return (
      <div className={`text-base font-sans ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
        {data.situation && (
          <div className="mb-4">
            <h3 className={`text-md font-semibold mb-1 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>
              Situation:
            </h3>
            <p>{data.situation}</p>
          </div>
        )}
        
        {data.task && (
          <div className="mb-4">
            <h3 className={`text-md font-semibold mb-1 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>
              Task:
            </h3>
            <p>{data.task}</p>
          </div>
        )}
        
        {data.action && (
          <div className="mb-4">
            <h3 className={`text-md font-semibold mb-1 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>
              Action:
            </h3>
            <p>{data.action}</p>
          </div>
        )}
        
        {data.result && (
          <div>
            <h3 className={`text-md font-semibold mb-1 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>
              Result:
            </h3>
            <p>{data.result}</p>
          </div>
        )}
      </div>
    );
  };

  // Render comprehensive code analysis
  const renderComprehensiveAnalysis = (data: AnalysisResponse) => {
    return (
      <div className={`text-base font-sans ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
        {data.planning_steps && data.planning_steps.length > 0 && (
          <div className="mb-4">
            <h3 className={`text-md font-semibold mb-1 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>
              Planning Steps:
            </h3>
            <ul className={`list-disc list-inside mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              {data.planning_steps.map((step: string, index: number) => (
                <li key={index} className="mb-1">{step}</li>
              ))}
            </ul>
          </div>
        )}
        
        {data.complexity && (
          <div className="mb-4">
            <h3 className={`text-md font-semibold mb-1 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>
              Complexity:
            </h3>
            <p className="mb-1">
              <span className="font-medium">Time:</span> {data.complexity.time}
            </p>
            <p>
              <span className="font-medium">Space:</span> {data.complexity.space}
            </p>
          </div>
        )}
        
        {data.explanation && (
          <div>
            <h3 className={`text-md font-semibold mb-1 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>
              Explanation:
            </h3>
            <p className="whitespace-pre-line">{data.explanation}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
          Analysis
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
      ) : activeTab?.analysis ? (
        <div className={`w-full h-full p-2 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>
          <div className="overflow-auto">
            {renderContent()}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <p>No analysis available for this tab.</p>
        </div>
      )}
    </div>
  );
};

export default EnhancedAnalysisPane; 