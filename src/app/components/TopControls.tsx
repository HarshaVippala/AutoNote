"use client";

import React, { useState, useEffect, memo } from 'react';
import Image from 'next/image';
import { ConnectionState } from "@/app/types"; // Import ConnectionState, remove SessionStatus, LoggedEvent

interface TopControlsProps {
  connectionState: ConnectionState; // Replace sessionStatus
  isMicrophoneMuted: boolean;
  setIsMicrophoneMuted: (muted: boolean) => void;
  onToggleConnection: () => void;
  isMobileView: boolean;
  isEventsPaneExpanded: boolean;
  setIsEventsPaneExpanded: (expanded: boolean) => void; // Used directly by mobile toggle
  handleDashboardToggle: (expanded: boolean) => void; // Used by desktop toggle
  setActiveMobilePanel: (panel: number) => void; // Used by mobile toggle
  activeMobilePanel: number; // Used by mobile toggle logic
}

const TopControls: React.FC<TopControlsProps> = memo(({
  connectionState, // Replace sessionStatus
  isMicrophoneMuted,
  setIsMicrophoneMuted,
  onToggleConnection,
  isMobileView,
  isEventsPaneExpanded,
  setIsEventsPaneExpanded,
  handleDashboardToggle,
  setActiveMobilePanel,
  activeMobilePanel,
}) => {
  // Helper function to determine button text and title based on state
  const getConnectionButtonProps = () => {
    switch (connectionState) {
      case "CONNECTED":
        return { text: "Disconnect", title: "Disconnect Assistant", disabled: false, connecting: false };
      case "CONNECTING":
      case "FETCHING_KEY":
        return { text: "Connecting...", title: "Connecting Assistant", disabled: true, connecting: true };
      case "INITIAL":
      case "DISCONNECTED":
      case "KEY_INVALID":
      case "ERROR":
      default:
        return { text: "Connect", title: "Connect Assistant", disabled: false, connecting: false };
    }
  };

  // Helper function to determine API Key status message and presence
  const getApiKeyStatus = () => {
    switch (connectionState) {
      case "CONNECTED":
      case "CONNECTING": // Assume key is valid if connecting
        return { isPresent: true, statusMessage: "API Key Valid" };
      case "KEY_INVALID":
        return { isPresent: false, statusMessage: "Invalid API Key" };
      case "FETCHING_KEY":
        return { isPresent: false, statusMessage: "Checking API Key..." };
      case "INITIAL":
      case "DISCONNECTED":
      case "ERROR":
      default:
        return { isPresent: false, statusMessage: "API Key Not Configured" };
    }
  };

  const { text: connectButtonText, title: connectButtonTitle, disabled: connectButtonDisabled, connecting: isConnecting } = getConnectionButtonProps();
  const { isPresent: isApiKeyPresent, statusMessage: apiKeyStatusMessage } = getApiKeyStatus();

  return (
    <div className="border-b border-gray-200 bg-white flex items-center justify-between overflow-hidden" style={{ height: 56 }}>
      <div className="flex items-center h-full">
        <div 
          onClick={() => {
            if (isMobileView) {
              setActiveMobilePanel(1); // Switch to AgentAnswers panel (index 1)
            } else {
              window.location.reload(); // Keep reload for desktop
            }
          }}
          style={{ cursor: 'pointer', height: '100%' }}
        >
          {/* Use relative path for images in public */}
          <Image
            src="/logo.png"
            alt="Logo"
            width={56}
            height={56}
            className="block sm:hidden"
            style={{ height: '100%', width: 'auto' }}
            priority // Add priority for LCP element
          />
          <Image
            src="/logo.png"
            alt="Logo"
            width={56}
            height={56}
            className="hidden sm:block"
            style={{ height: '100%', width: 'auto' }}
            priority // Add priority for LCP element
          />
        </div>
      </div>

      <div className="flex space-x-3 items-center mr-4">
        {/* Connection Button - Updated logic */}
        <button
          onClick={onToggleConnection}
          title={connectButtonTitle}
          className={`flex items-center justify-center h-9 rounded-full px-3 text-sm font-medium text-white transition-colors ${ // Adjusted styles: added px-3, text-sm, font-medium, text-white, transition
            connectionState === "CONNECTED"
              ? "bg-red-600 hover:bg-red-700"
              : (connectionState === "CONNECTING" || connectionState === "FETCHING_KEY")
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700"
          }`}
          disabled={connectButtonDisabled}
        >
          {isConnecting ? (
            <>
              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div> {/* Spinner */}
              <span>{connectButtonText}</span>
            </>
          ) : (
             <>
               {/* Power Icon SVG */}
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="mr-2" viewBox="0 0 16 16">
                 <path d="M7.5 1v7h1V1h-1z"/>
                 <path d="M3 8.812a4.999 4.999 0 0 1 10 0V11a.5.5 0 0 1-1 0V8.812a3.999 3.999 0 0 0-8 0V11a.5.5 0 0 1-1 0V8.812z"/>
               </svg>
               <span>{connectButtonText}</span>
            </>
          )}
        </button>

        {/* Microphone Button - Updated disabled logic */}
        <button
          onClick={() => setIsMicrophoneMuted(!isMicrophoneMuted)}
          disabled={connectionState !== "CONNECTED"}
          title={isMicrophoneMuted ? "Unmute Microphone" : "Mute Microphone"}
          className={`flex items-center justify-center h-9 w-9 rounded-full ${
            connectionState !== "CONNECTED"
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : isMicrophoneMuted
              ? "bg-red-100 text-red-700 hover:bg-red-200 cursor-pointer"
              : "bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer"
          }`}
        >
          {isMicrophoneMuted ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M13 8c0 .564-.094 1.107-.266 1.613l-.814-.814A4.02 4.02 0 0 0 12 8V7a.5.5 0 0 1 1 0v1zm-5 4c.818 0 1.578-.245 2.212-.667l.718.719a4.973 4.973 0 0 1-2.43.923V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 1 0v1a4 4 0 0 0 4 4zm3-9v4.879L5.158 2.037A3.001 3.001 0 0 1 11 3z"/>
              <path d="M9.486 10.607 5 6.12V8a3 3 0 0 0 4.486 2.607zm-7.84-9.253 12 12 .708-.708-12-12-.708.708z"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M5 3a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0V3z"/>
              <path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5z"/>
            </svg>
          )}
        </button>

        {/* API Key Status Icon - Updated logic */}
        <div
          className="relative group"
          title={apiKeyStatusMessage}
        >
          <div className={`flex items-center justify-center h-9 w-9 rounded-full ${
            isApiKeyPresent
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M0 8a4 4 0 0 1 7.465-2H14a.5.5 0 0 1 .354.146l1.5 1.5a.5.5 0 0 1 0 .708l-1.5 1.5a.5.5 0 0 1-.708 0L13 9.207l-.646.647a.5.5 0 0 1-.708 0L11 9.207l-.646.647a.5.5 0 0 1-.708 0L9 9.207l-.646.647A.5.5 0 0 1 8 10h-.535A4 4 0 0 1 0 8zm4-3a3 3 0 1 0 2.712 4.285A.5.5 0 0 1 7.163 9h.63l.853-.854a.5.5 0 0 1 .708 0l.646.647.646-.647a.5.5 0 0 1 .708 0l.646.647.646-.647a.5.5 0 0 1 .708 0l.646.647.793-.793-1-1h-6.63a.5.5 0 0 1-.451-.285A3 3 0 0 0 4 5z"/>
              <path d="M4 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
            </svg>
          </div>
          {/* Tooltip */}
          <div className="hidden group-hover:block absolute top-full right-0 mt-2 p-2 bg-gray-800 text-white shadow-lg rounded-md text-xs w-48 z-10">
            {apiKeyStatusMessage}
          </div>
        </div>

        {/* Dashboard Toggle (Desktop only) */}
        {!isMobileView && (
          <button
            onClick={() => handleDashboardToggle(!isEventsPaneExpanded)}
            title="Toggle Dashboard"
            className={`flex items-center justify-center h-9 w-9 rounded-full ${
              isEventsPaneExpanded
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
               {/* Dashboard Icon - Using a simple list/layout icon */}
               <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/>
             </svg>
          </button>
        )}

        {/* Mobile View Buttons */}
        {isMobileView && (
          <div className="flex">
            <button
              onClick={() => {
                // Toggle dashboard state via parent
                const newState = !isEventsPaneExpanded;
                setIsEventsPaneExpanded(newState); // Let parent handle persistence

                // Only switch to dashboard panel if we're enabling it
                if (newState) {
                  setActiveMobilePanel(2);
                } else if (activeMobilePanel === 2) {
                  // If we're disabling it and currently on dashboard, switch to agent answers
                  setActiveMobilePanel(1);
                }
              }}
              title="Toggle Dashboard"
              className={`flex items-center justify-center h-8 w-8 rounded-full ${
                isEventsPaneExpanded
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                 {/* Dashboard Icon - Using a simple list/layout icon */}
                 <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/>
              </svg>
            </button>
          </div>
        )}

        {/* Agent Selection removed */}
      </div>
    </div>
  );
});

export default TopControls; 