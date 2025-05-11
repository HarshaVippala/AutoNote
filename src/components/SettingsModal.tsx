"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import { useEvent } from "@/contexts/EventContext"; // Import useEvent

type WebRTCConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'failed' | 'error';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  micConnectionStatus: WebRTCConnectionStatus;
  speakerConnectionStatus: WebRTCConnectionStatus;
  onReconnectMic?: () => void;
  onReconnectSpeaker?: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  micConnectionStatus,
  speakerConnectionStatus,
  onReconnectMic = () => console.log('Mic reconnect handler not provided'),
  onReconnectSpeaker = () => console.log('Speaker reconnect handler not provided'),
}) => {
  const { theme } = useTheme();
  const { clearLoggedEvents } = useEvent(); // Get clearLoggedEvents from context
  const [apiKey, setApiKey] = useState('');
  const [vectorStoreId, setVectorStoreId] = useState('');

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedApiKey = localStorage.getItem('openai_api_key') || '';
    const savedVectorStoreId = localStorage.getItem('vector_store_id') || '';
    setApiKey(savedApiKey);
    setVectorStoreId(savedVectorStoreId);
  }, []);

  const handleSave = () => {
    localStorage.setItem('openai_api_key', apiKey);
    localStorage.setItem('vector_store_id', vectorStoreId);
    // Optionally, trigger a refresh or state update in the parent if needed immediately
    alert('Settings saved! You might need to reconnect for changes to take effect.');
    onClose();
  };

  const handleClearData = () => {
    if (window.confirm("Are you sure you want to clear all session data? This action cannot be undone.")) {
      clearLoggedEvents();
      alert('Session data cleared.');
      // Optionally close the modal or give other feedback
      // onClose();
    }
  };

  // --- Reused Helper Functions from Dashboard/TopControls ---
  const getStatusColor = (status: WebRTCConnectionStatus) => {
    // Dark theme only
    if (status === "connecting") return "bg-yellow-600 text-white";
    if (status === "connected") return "bg-green-600 text-white";
    if (status === "error" || status === "failed") return "bg-red-600 text-white";
    return "bg-slate-700 text-slate-300"; // Idle/disconnected color
  };

  const isButtonClickable = (connectionStatus: WebRTCConnectionStatus): boolean => {
    return connectionStatus === 'disconnected' ||
           connectionStatus === 'failed' ||
           connectionStatus === 'error';
  };

  const getButtonCursorStyle = (connectionStatus: WebRTCConnectionStatus): string => {
    return isButtonClickable(connectionStatus) ? "cursor-pointer" : "cursor-default";
  };

  const getButtonTitle = (type: 'user' | 'speaker', connectionStatus: WebRTCConnectionStatus): string => {
    const streamName = type === 'user' ? 'User Input (Mic)' : 'Speaker Output';
    if (connectionStatus === 'connected') return `${streamName} Connected`;
    if (connectionStatus === 'connecting') return `${streamName} Connecting...`;
    if (connectionStatus === 'disconnected') return `Click to Connect ${streamName}`;
    if (connectionStatus === 'failed' || connectionStatus === 'error') return `Click to Reconnect ${streamName} (Error)`;
    return `${streamName} Status Unknown`;
  };
  // --- End Reused Helper Functions ---


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className={`p-6 rounded-lg shadow-xl w-full max-w-md ${theme === 'dark' ? 'bg-slate-800 text-slate-200' : 'bg-white text-black'}`}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className={`p-1 rounded-full ${theme === 'dark' ? 'text-slate-400 hover:bg-slate-700' : 'text-gray-500 hover:bg-gray-200'}`}
            title="Close Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* API Key Input */}
        <div className="mb-4">
          <label htmlFor="apiKey" className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
            OpenAI API Key
          </label>
          <input
            type="password" // Use password type to obscure key
            id="apiKey"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 ${
              theme === 'dark'
                ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400 focus:ring-sky-500 focus:border-sky-500'
                : 'bg-white border-gray-300 text-black focus:ring-indigo-500 focus:border-indigo-500'
            }`}
          />
           <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>
            Your key is stored locally in your browser's localStorage.
          </p>
        </div>

        {/* Vector Store ID Input */}
        <div className="mb-6">
          <label htmlFor="vectorStoreId" className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
            Vector Store ID (Optional)
          </label>
          <input
            type="text"
            id="vectorStoreId"
            value={vectorStoreId}
            onChange={(e) => setVectorStoreId(e.target.value)}
            placeholder="vs_..."
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 ${
              theme === 'dark'
                ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400 focus:ring-sky-500 focus:border-sky-500'
                : 'bg-white border-gray-300 text-black focus:ring-indigo-500 focus:border-indigo-500'
            }`}
          />
        </div>

        {/* Status Indicators */}
        <div className={`mb-6 border-t pt-4 mt-4 ${theme === 'dark' ? 'border-slate-700' : 'border-gray-500'}`}>
           <h3 className={`text-lg font-medium mb-3 ${theme === 'dark' ? 'text-slate-200' : 'text-gray-900'}`}>Connection Status</h3>
           <div className="flex items-center justify-center space-x-4">
             {/* User (Mic) Status Button */}
             <button
               onClick={onReconnectMic}
               disabled={!isButtonClickable(micConnectionStatus)}
               title={getButtonTitle('user', micConnectionStatus)}
               className={`flex flex-col items-center justify-between h-16 w-10 border rounded-lg p-1 transition-colors hover:opacity-90 ${getStatusColor(micConnectionStatus)} ${getButtonCursorStyle(micConnectionStatus)} ${theme === 'dark' ? 'border-slate-600' : 'border-gray-400'}`}
             >
               <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                 <path d="M8 3a1 1 0 0 1 1 1v16a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1Zm8 2a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Zm-4 2a1 1 0 0 1 1 1v8a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1ZM4 9a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-4a1 1 0 0 1 1-1Zm16 0a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-4a1 1 0 0 1 1-1Z"></path>
               </svg>
               <span className={`font-bold text-xs mt-1 ${theme === 'dark' ? 'text-slate-100' : 'text-gray-700'}`}>MIC</span>
               {micConnectionStatus === 'connecting' && (
                 <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20 rounded-lg">
                   <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                 </div>
               )}
             </button>

             {/* Speaker Status Button */}
             <button
               onClick={onReconnectSpeaker}
               disabled={!isButtonClickable(speakerConnectionStatus)}
               title={getButtonTitle('speaker', speakerConnectionStatus)}
               className={`flex flex-col items-center justify-between h-16 w-10 border rounded-lg p-1 transition-colors hover:opacity-90 ${getStatusColor(speakerConnectionStatus)} ${getButtonCursorStyle(speakerConnectionStatus)} ${theme === 'dark' ? 'border-slate-600' : 'border-gray-400'}`}
             >
               <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                 <path d="M8 3a1 1 0 0 1 1 1v16a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1Zm8 2a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Zm-4 2a1 1 0 0 1 1 1v8a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1ZM4 9a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-4a1 1 0 0 1 1-1Zm16 0a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-4a1 1 0 0 1 1-1Z"></path>
               </svg>
               <span className={`font-bold text-xs mt-1 ${theme === 'dark' ? 'text-slate-100' : 'text-gray-700'}`}>SPK</span>
               {speakerConnectionStatus === 'connecting' && (
                 <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20 rounded-lg">
                   <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                 </div>
               )}
             </button>
           </div>
        </div>


        {/* Action Buttons */}
        {/* Action Buttons - Grouped to the right */}
        <div className="flex justify-end space-x-3 mt-6">
          {/* Clear Data Button */}
          <button
            onClick={handleClearData}
            className={`px-4 py-2 rounded border ${
              theme === 'dark'
                ? 'border-red-700 bg-red-800 text-red-200 hover:bg-red-700' // Adjusted for better contrast
                : 'border-red-400 bg-red-100 text-red-700 hover:bg-red-200'
            }`}
            title="Clears all logged events from this session"
          >
            Clear Session Data
          </button>

          {/* Cancel Button */}
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded border ${
              theme === 'dark'
                ? 'border-slate-600 text-slate-300 hover:bg-slate-700'
                : 'border-gray-300 text-gray-700 hover:bg-gray-100'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className={`px-4 py-2 rounded border text-white ${
              theme === 'dark'
                ? 'bg-sky-600 hover:bg-sky-500 border-sky-700' // Using sky for accent
                : 'bg-indigo-600 hover:bg-indigo-700 border-indigo-700'
            }`}
          >
            Save Settings
          </button>
        </div>
{/* Closing tag for the flex justify-end container */}
</div>
</div>
  );
};

export default SettingsModal;