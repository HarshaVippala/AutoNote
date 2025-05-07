"use client";

import React, { createContext, useContext, useState, FC, PropsWithChildren, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { TranscriptItem } from "@/types";

type TranscriptContextValue = {
  transcriptItems: TranscriptItem[];
  addTranscriptMessage: (itemId: string, role: "user" | "assistant", text: string, hidden?: boolean, agentName?: string) => void;
  updateTranscriptMessage: (itemId: string, text: string, isDelta: boolean) => void;
  addTranscriptBreadcrumb: (title: string, data?: Record<string, any>) => void;
  toggleTranscriptItemExpand: (itemId: string) => void;
  updateTranscriptItemStatus: (itemId: string, newStatus: "IN_PROGRESS" | "DONE") => void;
};

const TranscriptContext = createContext<TranscriptContextValue | undefined>(undefined);

export const TranscriptProvider: FC<PropsWithChildren> = ({ children }) => {
  const [transcriptItems, setTranscriptItems] = useState<TranscriptItem[]>([]);

  const newTimestampPretty = useCallback((): string => {
    return new Date().toLocaleTimeString([], {
      hour12: true,
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  }, []);

  const addTranscriptMessage: TranscriptContextValue["addTranscriptMessage"] = useCallback((itemId, role, text = "", isHidden = false, agentName) => {
    setTranscriptItems((prev) => {
      if (prev.some((log) => log.itemId === itemId && log.type === "MESSAGE")) {
        console.warn(`[addTranscriptMessage] skipping; message already exists for itemId=${itemId}, role=${role}, text=${text}`);
        return prev;
      }

      const newItem: TranscriptItem = {
        itemId,
        type: "MESSAGE",
        role,
        title: text,
        expanded: false,
        timestamp: newTimestampPretty(),
        createdAtMs: Date.now(),
        status: "IN_PROGRESS",
        isHidden,
        agentName,
      };

      const updatedItems = [...prev, newItem];
      return updatedItems.slice(-50);
    });
  }, [newTimestampPretty]);

  const updateTranscriptMessage: TranscriptContextValue["updateTranscriptMessage"] = useCallback((itemId, newText, append = false) => {
    setTranscriptItems((prev) =>
      prev.map((item) => {
        if (item.itemId === itemId && item.type === "MESSAGE") {
          return {
            ...item,
            title: append ? (item.title ?? "") + newText : newText,
          };
        }
        return item;
      })
    );
  }, []);

  const addTranscriptBreadcrumb: TranscriptContextValue["addTranscriptBreadcrumb"] = useCallback((title, data) => {
    const newItem: TranscriptItem = {
      itemId: `breadcrumb-${uuidv4()}`,
      type: "BREADCRUMB",
      title,
      data,
      expanded: false,
      timestamp: newTimestampPretty(),
      createdAtMs: Date.now(),
      status: "DONE",
      isHidden: false,
    };
    setTranscriptItems((prev) => {
      const updatedItems = [...prev, newItem];
      return updatedItems.slice(-50);
    });
  }, [newTimestampPretty]);

  const toggleTranscriptItemExpand: TranscriptContextValue["toggleTranscriptItemExpand"] = useCallback((itemId) => {
    setTranscriptItems((prev) =>
      prev.map((log) =>
        log.itemId === itemId ? { ...log, expanded: !log.expanded } : log
      )
    );
  }, []);

  const updateTranscriptItemStatus: TranscriptContextValue["updateTranscriptItemStatus"] = useCallback((itemId, newStatus) => {
    setTranscriptItems((prev) =>
      prev.map((item) =>
        item.itemId === itemId ? { ...item, status: newStatus } : item
      )
    );
  }, []);

  const contextValue = React.useMemo(() => ({
    transcriptItems,
    addTranscriptMessage,
    updateTranscriptMessage,
    addTranscriptBreadcrumb,
    toggleTranscriptItemExpand,
    updateTranscriptItemStatus,
  }), [
    transcriptItems,
    addTranscriptMessage,
    updateTranscriptMessage,
    addTranscriptBreadcrumb,
    toggleTranscriptItemExpand,
    updateTranscriptItemStatus
  ]);

  return (
    <TranscriptContext.Provider value={contextValue}>
      {children}
    </TranscriptContext.Provider>
  );
};

export function useTranscript() {
  const context = useContext(TranscriptContext);
  if (!context) {
    throw new Error("useTranscript must be used within a TranscriptProvider");
  }
  return context;
}