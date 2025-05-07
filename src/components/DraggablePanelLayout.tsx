"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TabData } from '@/types';
import Transcript from './Transcript';
import EnhancedCodePane from './EnhancedCodePane';
import EnhancedAnalysisPane from './EnhancedAnalysisPane';
import TabsPanel from './TabsPanel'; // Import TabsPanel
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';

// Component-specific styles
import styles from './DraggablePanelLayout.module.css';

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
import { BehavioralStarResponse } from '@/types'; // Note: This import might cause issues if types/index.ts doesn't exist or export this. Assuming it does for now.


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

  // State for code panel sizes (only used for initial load)
  const [codePanelSizes, setCodePanelSizes] = useState<number[]>([50, 50]);

  // Use ref to track current sizes without causing re-renders
  const currentSizesRef = useRef<number[]>([50, 50]);

  // Load saved layout on component mount - only run once
  useEffect(() => {
    try {
      const savedLayout = localStorage.getItem('code-panel-layout');
      if (savedLayout) {
        const parsedSizes = JSON.parse(savedLayout);
        if (
          Array.isArray(parsedSizes) &&
          parsedSizes.length === 2 &&
          typeof parsedSizes[0] === 'number' &&
          typeof parsedSizes[1] === 'number' &&
          parsedSizes[0] >= 0 && parsedSizes[1] >= 0 &&
          Math.abs(parsedSizes[0] + parsedSizes[1] - 100) < 1
        ) {
          setCodePanelSizes(parsedSizes);
          currentSizesRef.current = parsedSizes;
        }
      }
    } catch (e) {
      console.error('Failed to load panel layout', e);
    }
  }, []); // Empty dependency array = run once on mount

  // Memoize filtered tabs to stabilize dependencies
  const codeTabs = useMemo(() => tabs.filter(tab => {
    const isCodeTab = !tab.filename?.toLowerCase().includes('behavioral') &&
                     !tab.filename?.toLowerCase().includes('star') &&
                     !tab.filename?.toLowerCase().startsWith('star:');
    return isCodeTab;
  }), [tabs]);

  const behavioralTabs = useMemo(() => tabs.filter(tab => {
    const isBehavioralTab = tab.filename?.toLowerCase().includes('behavioral') ||
                           tab.filename?.toLowerCase().includes('star') ||
                           tab.filename?.toLowerCase().startsWith('star:');
    return isBehavioralTab;
  }), [tabs]);
  // Find the active tab data
  const activeTabData = tabs.find(tab => tab.key === activeTabKey);

  // Function to cycle to the next view
  // Function to cycle to the next view - ONLY determines the next view
  const cycleToNextView = () => {
    setCurrentView(current => {
      const hasCodeTabs = codeTabs.length > 0;
      const hasBehavioralTabs = behavioralTabs.length > 0;

      if (current === 'main') {
        if (hasCodeTabs) return 'code';
        if (hasBehavioralTabs) return 'behavioral';
        return 'main';
      } else if (current === 'code') {
        if (hasBehavioralTabs) return 'behavioral';
        return 'main';
      } else { // current === 'behavioral'
        if (hasCodeTabs) return 'code';
        return 'main';
      }
    });
  };

  // Effect to synchronize the active tab after the view changes, only on view transitions
  const prevViewRef = useRef<ViewType>(currentView);
  useEffect(() => {
    // only act when the view has just changed
    if (prevViewRef.current !== currentView) {
      let targetTabKey: string | null = null;
      if (currentView === 'code' && codeTabs.length > 0) {
        // if active tab isn't a code tab, switch to first code tab
        if (!codeTabs.some(tab => tab.key === activeTabKey)) {
          targetTabKey = codeTabs[0].key;
        }
      } else if (currentView === 'behavioral' && behavioralTabs.length > 0) {
        if (!behavioralTabs.some(tab => tab.key === activeTabKey)) {
          targetTabKey = behavioralTabs[0].key;
        }
      }
      if (targetTabKey) {
        onTabChange(targetTabKey);
      }
    }
    // update previous view for next comparison
    prevViewRef.current = currentView;
  }, [currentView, codeTabs, behavioralTabs, onTabChange]);

  // Auto-switch view based on activeTabKey
  useEffect(() => {
    if (activeTabKey) {
      const activeTab = tabs.find(tab => tab.key === activeTabKey);
      
      if (activeTab) {
        const isInBehavioral = behavioralTabs.some(bt => bt.key === activeTabKey);
        const isInCode = codeTabs.some(ct => ct.key === activeTabKey);
        
        // Auto-switch to appropriate view when a tab is selected
        if (isInBehavioral) {
          setCurrentView('behavioral');
        } else if (isInCode) {
          setCurrentView('code');
        }
      }
    }
  }, [activeTabKey, tabs, codeTabs, behavioralTabs]); // Keep all dependencies

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleToNextView]); // Keep dependency on cycleToNextView, disable lint warning if needed

  // Effect to cycle view when trigger changes
  useEffect(() => {
    if (cycleViewTrigger > 0) {
      cycleToNextView();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleViewTrigger]); // Depend only on the trigger

  // Get the active tab based on the current view
  const activeCodeTab = codeTabs.find(tab => tab.key === activeTabKey);
  const activeBehavioralTab = behavioralTabs.find(tab => tab.key === activeTabKey);

  // Determine visible tabs based on the current view
  const visibleTabs = tabs.filter(tab => tab.filename?.toLowerCase().includes('code') || tab.filename?.toLowerCase().includes('plaintext') || tab.filename?.toLowerCase().startsWith('code:')); // Added plaintext check

  // Create a simple, stable render function for the code view
  const renderCodeView = () => {
    if (!activeCodeTab) return <div className="h-full flex items-center justify-center">No code tab selected</div>;
    
    return (
      <div className="h-full grid grid-cols-2 gap-2">
        <div className={`overflow-auto ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'}`}>
          <EnhancedCodePane
            theme={theme}
            activeTabKey={activeCodeTab?.key || ''}
            onTabChange={onTabChange}
            onTabClose={onTabClose}
            tabs={codeTabs}
          />
        </div>
        <div className={`overflow-auto ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'}`}>
          <EnhancedAnalysisPane
            theme={theme}
            activeTabData={activeCodeTab}
          />
        </div>
      </div>
    );
  };

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
              {renderCodeView()}
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