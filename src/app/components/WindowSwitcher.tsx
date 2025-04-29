"use client";

import React, { useState } from 'react';
import { useTheme } from "@/app/contexts/ThemeContext";

type WindowType = 'code' | 'behavior' | 'general';

interface WindowSwitcherProps {
  // Add props later if needed to control parent state
  // Example: onWindowChange: (window: WindowType) => void;
}

const WindowSwitcher: React.FC<WindowSwitcherProps> = () => {
  const [activeWindow, setActiveWindow] = useState<WindowType>('code'); // Default to 'code'
  const { theme } = useTheme();

  const windows: WindowType[] = ['code', 'behavior', 'general'];

  const getButtonClass = (window: WindowType) => {
    const isActive = activeWindow === window;
    const baseClass = `px-4 py-1 text-sm font-medium rounded-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1`;
    const themeBase = theme === 'dark' ? 'focus:ring-offset-gray-900' : 'focus:ring-offset-white';

    if (isActive) {
      return `${baseClass} ${themeBase} ${
        theme === 'dark'
          ? 'bg-indigo-600 text-white focus:ring-indigo-500'
          : 'bg-indigo-500 text-white focus:ring-indigo-400'
      }`;
    } else {
      return `${baseClass} ${themeBase} ${
        theme === 'dark'
          ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 focus:ring-gray-500'
          : 'bg-gray-200 text-gray-700 hover:bg-gray-300 focus:ring-gray-400'
      }`;
    }
  };

  return (
    <div className={`px-4 py-2 border-b ${theme === 'dark' ? 'border-gray-700 bg-gray-850' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex space-x-2">
        {windows.map((window) => (
          <button
            key={window}
            onClick={() => setActiveWindow(window)}
            className={getButtonClass(window)}
          >
            {/* Capitalize first letter for display */}
            {window.charAt(0).toUpperCase() + window.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
};

export default WindowSwitcher;