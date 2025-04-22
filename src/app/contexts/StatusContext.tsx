import React, { createContext, useContext, useState } from "react";

type Status = "idle" | "processing" | "done" | "error";

interface StatusContextType {
  userRealtimeStatus: Status;
  setUserRealtimeStatus: (s: Status) => void;
  speakerRealtimeStatus: Status;
  setSpeakerRealtimeStatus: (s: Status) => void;
  chatStatus: Status;
  setChatStatus: (s: Status) => void;
  assistantStatus: Status;
  setAssistantStatus: (s: Status) => void;
  previousChatSuccess: boolean;
  setPreviousChatSuccess: (success: boolean) => void;
}

const StatusContext = createContext<StatusContextType | undefined>(undefined);

export function StatusProvider({ children }: { children: React.ReactNode }) {
  const [userRealtimeStatus, setUserRealtimeStatus] = useState<Status>("idle");
  const [speakerRealtimeStatus, setSpeakerRealtimeStatus] = useState<Status>("idle");
  const [chatStatus, setChatStatus] = useState<Status>("idle");
  const [assistantStatus, setAssistantStatus] = useState<Status>("idle");
  const [previousChatSuccess, setPreviousChatSuccess] = useState<boolean>(false);

  return (
    <StatusContext.Provider value={{
      userRealtimeStatus, setUserRealtimeStatus,
      speakerRealtimeStatus, setSpeakerRealtimeStatus,
      chatStatus, setChatStatus,
      assistantStatus, setAssistantStatus,
      previousChatSuccess, setPreviousChatSuccess
    }}>
      {children}
    </StatusContext.Provider>
  );
}

export function useStatus() {
  const ctx = useContext(StatusContext);
  if (!ctx) throw new Error("useStatus must be used within a StatusProvider");
  return ctx;
}