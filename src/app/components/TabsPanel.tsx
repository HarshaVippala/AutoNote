"use client";

import React, { useState, useRef, useEffect } from 'react';
import { TabData } from '@/app/types';
import './DraggablePanelLayout.css';

interface TabsPanelProps {
  tabs: TabData[];
  activeTabKey: string;
  onTabChange: (tabKey: string) => void;
  onTabClose?: (tabKey: string) => void;
  theme: 'light' | 'dark';
}

const TabsPanel: React.FC<TabsPanelProps> = ({
  tabs,
  activeTabKey,
  onTabChange,
  onTabClose,
  theme
}) => {
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  
  // Scroll to active tab when it changes
  useEffect(() => {
    if (tabsContainerRef.current && activeTabKey) {
      const activeTab = tabsContainerRef.current.querySelector(`[data-tab-key="${activeTabKey}"]`);
      if (activeTab) {
        const container = tabsContainerRef.current;
        const tabRect = activeTab.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        if (tabRect.left < containerRect.left) {
          // Active tab is to the left of the visible area
          container.scrollLeft -= (containerRect.left - tabRect.left + 8);
        } else if (tabRect.right > containerRect.right) {
          // Active tab is to the right of the visible area
          container.scrollLeft += (tabRect.right - containerRect.right + 8);
        }
      }
    }
  }, [activeTabKey]);
  
  // Get a truncated filename for display
  const getTruncatedFilename = (filename: string): string => {
    if (filename.length <= 20) return filename;
    return filename.substring(0, 17) + '...';
  }

  return (
    <div 
      ref={tabsContainerRef} 
      className="tab-container"
    >
      {tabs.map((tab) => (
        <div
          key={tab.key}
          data-tab-key={tab.key}
          className={`tab-item ${activeTabKey === tab.key ? 'active' : ''} ${
            theme === 'dark' 
              ? activeTabKey === tab.key 
                ? 'bg-gray-800 text-blue-400' 
                : 'bg-gray-900 text-gray-400 hover:text-gray-300' 
              : activeTabKey === tab.key 
                ? 'bg-white text-blue-600' 
                : 'bg-gray-100 text-gray-600 hover:text-gray-900'
          }`}
          onClick={() => onTabChange(tab.key)}
          title={tab.filename}
        >
          {getTruncatedFilename(tab.filename)}
          {onTabClose && (
            <span 
              className="tab-close" 
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.key);
              }}
            >
              &times;
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

export default TabsPanel;