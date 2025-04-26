"use client";

import React, { useState, useRef, useEffect } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import Transcript from './Transcript';
import EnhancedCodePane from './EnhancedCodePane';
import EnhancedAnalysisPane from './EnhancedAnalysisPane';
import Dashboard from './Dashboard';
import { TabData } from '@/app/types';

// Component-specific styles
import './DraggablePanelLayout.css';

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
  micConnectionStatus: any;
  speakerConnectionStatus: any;
  onMuteToggle: () => void;
  onReconnectMic: () => void;
  onReconnectSpeaker: () => void;
}

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
  onReconnectSpeaker
}) => {
  // Handle tab closing
  const handleCloseTab = (tabKey: string) => {
    // Remove tab logic would go here
    console.log(`Close tab requested for: ${tabKey}`);
    // You would update the tabs array in the parent component
    // For now just log it since we don't have this function yet
  };

  // Persist panel layout
  const [panelSizes, setPanelSizes] = useState<number[]>([35, 35, 30]);

  // Save panel layout when it changes
  const handleLayoutChange = (sizes: number[]) => {
    setPanelSizes(sizes);
    localStorage.setItem('panel-layout', JSON.stringify(sizes));
  };
  
  // Load saved layout on component mount
  useEffect(() => {
    const savedLayout = localStorage.getItem('panel-layout');
    if (savedLayout) {
      try {
        const sizes = JSON.parse(savedLayout);
        setPanelSizes(sizes);
      } catch (e) {
        console.error('Failed to parse saved panel layout', e);
      }
    }
  }, []);

  return (
    <div className="flex flex-1 gap-1 px-2 pb-2 overflow-hidden rounded-xl">
      <div className="flex-1 flex flex-row h-full gap-1">
        <PanelGroup 
          direction="horizontal" 
          onLayout={handleLayoutChange}
          className="flex-1"
        >
          {/* Pane 1: Conversation (Left) */}
          <Panel 
            defaultSize={panelSizes[0]} 
            minSize={20}
            className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-xl border ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}
          >
            <div className="p-2 h-full overflow-auto">
              <Transcript
                userText={userText}
                setUserText={setUserText}
                onSendMessage={onSendMessage}
                canSend={canSend}
              />
            </div>
          </Panel>
          
          {/* Resize handle between panes */}
          <PanelResizeHandle 
            className={`panel-resize-handle ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
          >
            <div className={`handle-bar ${theme === 'dark' ? 'bg-gray-500' : 'bg-gray-400'}`}></div>
          </PanelResizeHandle>
          
          {/* Pane 2: Code Implementation (Middle) */}
          <Panel 
            defaultSize={panelSizes[1]} 
            minSize={20}
            className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-xl border ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}
          >
            <div className="p-2 h-full overflow-auto">
              <EnhancedCodePane 
                theme={theme} 
                activeTabKey={activeTabKey}
                onTabChange={onTabChange} 
                onTabClose={handleCloseTab}
                tabs={tabs}
              />
            </div>
          </Panel>
          
          {/* Resize handle between panes */}
          <PanelResizeHandle 
            className={`panel-resize-handle ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
          >
            <div className={`handle-bar ${theme === 'dark' ? 'bg-gray-500' : 'bg-gray-400'}`}></div>
          </PanelResizeHandle>
          
          {/* Pane 3: Algorithm Analysis (Right) */}
          <Panel 
            defaultSize={panelSizes[2]} 
            minSize={20}
            className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-xl border ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}
          >
            <div className="p-2 h-full overflow-auto">
              <EnhancedAnalysisPane 
                theme={theme} 
                activeTabKey={activeTabKey}
                tabs={tabs}
              />
            </div>
          </Panel>
        </PanelGroup>
        
        {/* Separate Dashboard Sidebar (Far Right) */}
        <div 
          className={`rounded-xl border ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}
          style={{ width: "48px", minWidth: "48px", maxWidth: "48px", alignSelf: "stretch", flexShrink: 0 }}
        >
          <Dashboard
            isExpanded={true}
            isDashboardEnabled={true}
            transcriptItems={transcriptItems}
            isMicrophoneMuted={isMicrophoneMuted}
            micConnectionStatus={micConnectionStatus}
            speakerConnectionStatus={speakerConnectionStatus}
            onMuteToggle={onMuteToggle}
            onReconnectMic={onReconnectMic}
            onReconnectSpeaker={onReconnectSpeaker}
          />
        </div>
      </div>
    </div>
  );
};

export default DraggablePanelLayout; 