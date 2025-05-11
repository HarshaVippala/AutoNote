"use client";

import React, { useRef, useEffect } from 'react';
import { TabData } from '@/types';

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
      className={`flex flex-row space-x-2 overflow-x-auto border-b pb-0 mb-2 whitespace-nowrap scrollbar-thin ${theme === 'dark' ? 'border-slate-700' : 'border-slate-300'}`}
    >
      {tabs.map((tab) => (
        <div
          key={tab.key}
          data-tab-key={tab.key}
          onClick={() => onTabChange(tab.key)}
          title={tab.filename}
          className={`flex items-center px-2 py-1 text-xs cursor-pointer rounded-t-md border truncate ${
            activeTabKey === tab.key
              ? theme === 'dark' // Active tab - Dark theme
                ? 'bg-slate-800 border-slate-600 text-sky-400 border-b-0'
                : 'bg-white border-slate-300 text-sky-600 border-b-0' // Active tab - Light theme (retained for consistency)
              : theme === 'dark' // Inactive tab - Dark theme
                ? 'bg-slate-900 border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                : 'bg-slate-100 border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-200' // Inactive tab - Light theme (retained)
          }`}
        >
          {getTruncatedFilename(tab.filename)}
          {onTabClose && (
            <span
              className="ml-1 opacity-60 hover:opacity-100"
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