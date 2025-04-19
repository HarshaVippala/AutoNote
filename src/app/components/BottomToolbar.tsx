import React, { useEffect, useState } from "react";
import { SessionStatus } from "@/app/types";

interface BottomToolbarProps {
  sessionStatus: SessionStatus;
  onToggleConnection: () => void;
  isMicrophoneMuted: boolean;
  setIsMicrophoneMuted: (val: boolean) => void;
  isEventsPaneExpanded: boolean;
  setIsEventsPaneExpanded: (val: boolean) => void;
  isAnswersPaneExpanded: boolean;
  setIsAnswersPaneExpanded: (val: boolean) => void;
}

function BottomToolbar({
  sessionStatus,
  onToggleConnection,
  isMicrophoneMuted,
  setIsMicrophoneMuted,
  isEventsPaneExpanded,
  setIsEventsPaneExpanded,
  isAnswersPaneExpanded,
  setIsAnswersPaneExpanded,
  activeMobilePanel = 0,
  setActiveMobilePanel = () => {},
}: BottomToolbarProps) {
  const isConnected = sessionStatus === "CONNECTED";
  const isConnecting = sessionStatus === "CONNECTING";
  const [isMobileView, setIsMobileView] = useState<boolean>(false);

  useEffect(() => {
    const checkMobileView = () => {
      setIsMobileView(window.innerWidth <= 640);
    };
    
    checkMobileView();
    window.addEventListener('resize', checkMobileView);
    
    return () => {
      window.removeEventListener('resize', checkMobileView);
    };
  }, []);

  function getConnectionButtonLabel() {
    if (isConnected) return "Disconnect";
    if (isConnecting) return "Connecting...";
    return "Connect";
  }

  function getConnectionButtonClasses() {
    const baseClasses = "text-white text-sm sm:text-base p-2 w-32 sm:w-36 rounded-full h-full";
    const cursorClass = isConnecting ? "cursor-not-allowed" : "cursor-pointer";

    if (isConnected) {
      // Connected -> label "Disconnect" -> red
      return `bg-red-600 hover:bg-red-700 ${cursorClass} ${baseClasses}`;
    }
    // Disconnected or connecting -> label is either "Connect" or "Connecting" -> black
    return `bg-black hover:bg-gray-900 ${cursorClass} ${baseClasses}`;
  }

  function getMicButtonClasses() {
    const baseClasses = "py-1 sm:py-2 px-3 sm:px-4 rounded-full flex items-center gap-1 sm:gap-2 text-sm sm:text-base";
    
    if (!isConnected) {
      return `${baseClasses} bg-gray-100 text-gray-400 cursor-not-allowed`;
    }
    
    if (isMicrophoneMuted) {
      return `${baseClasses} bg-red-100 text-red-700 hover:bg-red-200 cursor-pointer`;
    }
    
    return `${baseClasses} bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer`;
  }

  return (
    <div className="p-2 sm:p-4 flex flex-row flex-wrap items-center justify-center gap-2 sm:gap-x-8">
      {/* Always show connection button */}
      <button
        onClick={onToggleConnection}
        className={getConnectionButtonClasses()}
        disabled={isConnecting}
      >
        {getConnectionButtonLabel()}
      </button>

      {/* Always show mic button */}
      <button
        onClick={() => setIsMicrophoneMuted(!isMicrophoneMuted)}
        disabled={!isConnected}
        className={getMicButtonClasses()}
      >
        {isMicrophoneMuted ? (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M13 8c0 .564-.094 1.107-.266 1.613l-.814-.814A4.02 4.02 0 0 0 12 8V7a.5.5 0 0 1 1 0v1zm-5 4c.818 0 1.578-.245 2.212-.667l.718.719a4.973 4.973 0 0 1-2.43.923V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 1 0v1a4 4 0 0 0 4 4zm3-9v4.879L5.158 2.037A3.001 3.001 0 0 1 11 3z"/>
              <path d="M9.486 10.607 5 6.12V8a3 3 0 0 0 4.486 2.607zm-7.84-9.253 12 12 .708-.708-12-12-.708.708z"/>
            </svg>
            <span className="ml-1">Unmute</span>
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M5 3a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0V3z"/>
              <path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5z"/>
            </svg>
            <span className="ml-1">Mute</span>
          </>
        )}
      </button>

      {isMobileView ? (
        // Mobile view: No panel indicators needed
        <div className="flex items-center">
          {/* Empty div to maintain toolbar layout */}
        </div>
      ) : (
        // Desktop view: Show checkboxes
        <>
          <div className="mt-2 sm:mt-0 flex flex-row items-center gap-2">
            <input
              id="answers"
              type="checkbox"
              checked={isAnswersPaneExpanded}
              onChange={e => setIsAnswersPaneExpanded(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="answers" className="flex items-center cursor-pointer text-sm sm:text-base">
              Answers
            </label>
          </div>

          <div className="mt-2 sm:mt-0 flex flex-row items-center gap-2">
            <input
              id="logs"
              type="checkbox"
              checked={isEventsPaneExpanded}
              onChange={e => setIsEventsPaneExpanded(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="logs" className="flex items-center cursor-pointer text-sm sm:text-base">
              Dashboard
            </label>
          </div>
        </>
      )}
    </div>
  );
}

export default BottomToolbar;
