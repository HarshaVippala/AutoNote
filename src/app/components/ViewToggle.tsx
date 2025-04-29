import React from 'react';
import { ViewType } from './DraggablePanelLayout';

interface ViewToggleProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  theme: 'light' | 'dark';
}

const ViewToggle: React.FC<ViewToggleProps> = ({
  currentView,
  onViewChange,
  theme
}) => {
  const isDarkTheme = theme === 'dark';
  
  const buttonClass = (view: ViewType) => {
    const isActive = currentView === view;
    return `px-3 py-1 text-xs rounded-md font-medium ${
      isActive 
        ? isDarkTheme 
          ? 'bg-blue-600 text-white' 
          : 'bg-blue-500 text-white'
        : isDarkTheme
          ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
    } transition-colors`;
  };

  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded-md ${isDarkTheme ? 'bg-gray-800' : 'bg-white'}`}>
      <div className="text-xs text-gray-500 mr-1">View:</div>
      <div className="flex gap-1">
        <button 
          className={buttonClass('main')}
          onClick={() => onViewChange('main')}
          title="Main Conversation View (Alt+1)"
        >
          Conversation
        </button>
        <button 
          className={buttonClass('code')}
          onClick={() => onViewChange('code')}
          title="Code View (Alt+2)"
        >
          Code
        </button>
        <button 
          className={buttonClass('behavioral')}
          onClick={() => onViewChange('behavioral')}
          title="Behavioral Questions View (Alt+3)"
        >
          Behavioral
        </button>
      </div>
    </div>
  );
};

export default ViewToggle; 