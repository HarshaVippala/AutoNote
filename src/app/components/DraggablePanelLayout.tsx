"use client";

import React, { useState, useEffect } from 'react';
import { TabData } from '@/app/types';
import Transcript from './Transcript';
import EnhancedCodePane from './EnhancedCodePane';
import EnhancedAnalysisPane from './EnhancedAnalysisPane';
import TabsPanel from './TabsPanel'; // Import TabsPanel
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';

// Component-specific styles
import './DraggablePanelLayout.css';

// Define view types
export type ViewType = 'main' | 'code' | 'behavioral';

// Remove local definition of EnhancedAnalysisPaneProps to avoid confusion

interface DraggablePanelLayoutProps {
  theme: 'light' | 'dark';
  activeTabKey: string;
  onTabChange: (key: string) => void;
  tabs: TabData[];
  userText: string;
  setUserText: (text: string) => void;
  onSendMessage: () => void;
  canSend: boolean;
  transcriptItems: any[];
  isMicrophoneMuted: boolean;
  micConnectionStatus: any; // Consider using a more specific type if available
  speakerConnectionStatus: any; // Consider using a more specific type if available
  onMuteToggle: () => void;
  onReconnectMic: () => void;
  onReconnectSpeaker: () => void;
  onTabClose?: (tabKey: string) => void; // Add onTabClose prop
  cycleViewTrigger: number; // Add prop for cycle trigger
}

// Re-import BehavioralStarResponse if needed for casting
import { BehavioralStarResponse } from '@/app/types/index'; // Note: This import might cause issues if types/index.ts doesn't exist or export this. Assuming it does for now.


const DraggablePanelLayout: React.FC<DraggablePanelLayoutProps> = ({
  theme,
  activeTabKey,
  onTabChange,
  tabs,
  userText,
  setUserText,
  onSendMessage,
  canSend,
  transcriptItems,
  isMicrophoneMuted,
  micConnectionStatus,
  speakerConnectionStatus,
  onMuteToggle,
  onReconnectMic,
  onReconnectSpeaker,
  onTabClose, // Destructure onTabClose
  cycleViewTrigger // Destructure cycleViewTrigger
}) => {

  // State for current view
  const [currentView, setCurrentView] = useState<ViewType>('main');

  // State for code panel sizes
  const [codePanelSizes, setCodePanelSizes] = useState<number[]>([50, 50]);

  // Save panel layout when it changes
  const handleCodeLayoutChange = (sizes: number[]) => {
    setCodePanelSizes(sizes);
    localStorage.setItem('code-panel-layout', JSON.stringify(sizes));
  };

  // Load saved layout on component mount
  useEffect(() => {
    const savedLayout = localStorage.getItem('code-panel-layout');
    if (savedLayout) {
      try {
        const sizes = JSON.parse(savedLayout);
        setCodePanelSizes(sizes);
      } catch (e) {
        console.error('Failed to parse saved code panel layout', e);
      }
    }
  }, []);

  // Filter tabs by type (Improved filtering)
  const codeTabs = tabs.filter(tab => !tab.filename?.toLowerCase().includes('behavioral') && !tab.filename?.toLowerCase().startsWith('star:'));
  const behavioralTabs = tabs.filter(tab => tab.filename?.toLowerCase().includes('behavioral') || tab.filename?.toLowerCase().startsWith('star:'));


  // Function to cycle to the next view
  const cycleToNextView = () => {
    setCurrentView(current => {
      const hasCodeTabs = codeTabs.length > 0;
      const hasBehavioralTabs = behavioralTabs.length > 0;

      if (current === 'main') {
        if (hasCodeTabs) {
          const currentCodeTab = codeTabs.find(tab => tab.key === activeTabKey);
          if (!currentCodeTab && codeTabs[0]) onTabChange(codeTabs[0].key);
          return 'code';
        } else if (hasBehavioralTabs) {
          const currentBehavioralTab = behavioralTabs.find(tab => tab.key === activeTabKey);
          if (!currentBehavioralTab && behavioralTabs[0]) onTabChange(behavioralTabs[0].key);
          return 'behavioral';
        }
        return 'main';
      } else if (current === 'code') {
        if (hasBehavioralTabs) {
          const currentBehavioralTab = behavioralTabs.find(tab => tab.key === activeTabKey);
          if (!currentBehavioralTab && behavioralTabs[0]) onTabChange(behavioralTabs[0].key);
          return 'behavioral';
        }
        return 'main';
      } else { // current === 'behavioral'
        return 'main';
      }
    });
  };

  // Auto-switch view based on activeTabKey
  // Auto-switch view based on activeTabKey - COMMENTED OUT TO PREVENT CONFLICT WITH MANUAL CYCLE
  /*
  useEffect(() => {
    console.log('[View Switch Debug] useEffect triggered. activeTabKey:', activeTabKey);
    if (activeTabKey) {
      const activeTab = tabs.find(tab => tab.key === activeTabKey);
      console.log('[View Switch Debug] Found activeTab:', activeTab);
      if (activeTab) {
        const isInBehavioral = behavioralTabs.some(bt => bt.key === activeTabKey);
        const isInCode = codeTabs.some(ct => ct.key === activeTabKey);
        console.log(`[View Switch Debug] isInBehavioral: ${isInBehavioral}, isInCode: ${isInCode}`);
        if (isInBehavioral) {
          console.log('[View Switch Debug] Setting view to behavioral');
          setCurrentView('behavioral');
        } else if (isInCode) {
          console.log('[View Switch Debug] Setting view to code');
          setCurrentView('code');
        } else {
          console.log('[View Switch Debug] Active tab not found in code or behavioral tabs. Setting view to main.');
          setCurrentView('main');
        }
      } else {
         console.log('[View Switch Debug] activeTabKey exists but no matching tab found. Setting view to main.');
         setCurrentView('main');
      }
    } else {
       console.log('[View Switch Debug] No activeTabKey. Setting view to main.');
       setCurrentView('main');
    }
  }, [activeTabKey, tabs, codeTabs, behavioralTabs]); // Added dependencies
  */
  // Set up hotkey handler for view cycling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'Space') {
        e.preventDefault();
        cycleToNextView();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [cycleToNextView]); // Dependency on cycleToNextView

  // Effect to cycle view when trigger changes
  useEffect(() => {
    if (cycleViewTrigger > 0) {
      console.log("DraggablePanelLayout: Cycle view triggered from App");
      cycleToNextView();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleViewTrigger]); // Depend only on the trigger

  // Get the active tab based on the current view
  const activeCodeTab = codeTabs.find(tab => tab.key === activeTabKey);
  const activeBehavioralTab = behavioralTabs.find(tab => tab.key === activeTabKey);

  // Render the main container structure
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: 'calc(100vh - 48px)', // Adjusted height based on TopControls height
        margin: 0,
        padding: 0,
        backgroundColor: theme === 'dark' ? '#1f2937' : '#f9fafb', // Use theme colors
        overflow: 'hidden'
      }}>
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden"> {/* Ensure main content area handles overflow */}
        {/* Content area - changes based on current view */}
        <div className="flex-1 overflow-hidden"> {/* Ensure content area fills space */}
          {currentView === 'main' && (
            <div className={`h-full ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'}`}>
              <Transcript
                userText={userText}
                setUserText={setUserText}
                onSendMessage={onSendMessage}
                canSend={canSend}
              />
            </div>
          )}

          {currentView === 'code' && (
            <div className="h-full"> {/* Ensure code view takes full height */}
              {/* Restore the PanelGroup for side-by-side view */}
              <PanelGroup
                direction="horizontal"
                onLayout={handleCodeLayoutChange}
                className="h-full"
              >
                <Panel
                  defaultSize={codePanelSizes[0]}
                  minSize={20}
                  className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} overflow-hidden flex flex-col`}
                >
                  <EnhancedCodePane
                    theme={theme}
                    activeTabKey={activeCodeTab?.key || ''}
                    onTabChange={onTabChange}
                    onTabClose={onTabClose}
                    tabs={codeTabs}
                  />
                </Panel>
                <PanelResizeHandle
                  className={`panel-resize-handle ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
                >
                  <div className={`handle-bar ${theme === 'dark' ? 'bg-gray-500' : 'bg-gray-400'}`}></div>
                </PanelResizeHandle>
                <Panel
                  defaultSize={codePanelSizes[1]}
                  minSize={20}
                  className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} overflow-hidden flex flex-col`}
                >
                  <EnhancedAnalysisPane
                    theme={theme}
                    activeTabData={activeCodeTab}
                  />
                </Panel>
              </PanelGroup>
            </div>
          )}

          {currentView === 'behavioral' && (
            // Single column layout for behavioral view
            <div className={`h-full w-full ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} overflow-hidden flex flex-col`}>
              {/* Render TabsPanel for behavioral tabs */}
              <TabsPanel
                tabs={behavioralTabs}
                activeTabKey={activeBehavioralTab?.key || ''} // Use activeBehavioralTab
                onTabChange={onTabChange}
                onTabClose={onTabClose}
                theme={theme}
              />
              {/* Render Analysis Pane below tabs, passing only the active behavioral tab data */}
              <div className="flex-1 overflow-hidden"> {/* Container for the analysis content */}
                <EnhancedAnalysisPane
                  theme={theme}
                  // Pass the single active behavioral tab object
                 activeTabData={activeBehavioralTab} // Pass activeBehavioralTab here
                 // Remove props that EnhancedAnalysisPane no longer expects
                 // tabs={behavioralTabs}
                 // activeTabKey={activeBehavioralTab?.key}
                 // onTabChange={onTabChange}
                 // onTabClose={onTabClose}
               />
             </div>
           </div>
          )}
        </div> {/* Close content area div */}
      </div> {/* Close main content div */}
    </div> // Close main container div
  );
};

export default DraggablePanelLayout;