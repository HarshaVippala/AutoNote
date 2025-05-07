"use client";

import React, { createContext, useContext, useState, useEffect, FC, PropsWithChildren, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { LoggedEvent as OriginalLoggedEvent } from "@/types";

interface LoggedEvent extends OriginalLoggedEvent {
  timestampMs: number;
}

type EventContextValue = {
  loggedEvents: LoggedEvent[];
  logClientEvent: (eventObj: Record<string, any>, eventNameSuffix?: string) => void;
  logServerEvent: (eventObj: Record<string, any>, eventNameSuffix?: string) => void;
  toggleExpand: (id: number | string) => void;
  clearLoggedEvents: () => void; // Add clear function type
};

const EventContext = createContext<EventContextValue | undefined>(undefined);

const LOCAL_STORAGE_KEY = "loggedEvents";

export const EventProvider: FC<PropsWithChildren> = ({ children }) => {
  const [loggedEvents, setLoggedEvents] = useState<LoggedEvent[]>([]);

  // Load events from localStorage on initial mount
  useEffect(() => {
    try {
      const storedEvents = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (storedEvents) {
        setLoggedEvents(JSON.parse(storedEvents));
      }
    } catch (error) {
      console.error("Failed to load events from localStorage:", error);
      // Optionally clear corrupted data
      // localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }, []);

  // Save events to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(loggedEvents));
    } catch (error) {
      console.error("Failed to save events to localStorage:", error);
    }
  }, [loggedEvents]);


  const addLoggedEvent = useCallback((direction: "client" | "server", eventName: string, eventData: Record<string, any>) => {
    const id = eventData.event_id || eventData.id || uuidv4();
    const newTimestampMs = Date.now();
    setLoggedEvents((prev) => {
      const newEvent: LoggedEvent = {
        id: id,
        direction: direction,
        eventName: eventName,
        eventData: eventData,
        timestamp: new Date(newTimestampMs).toLocaleTimeString(),
        timestampMs: newTimestampMs,
        expanded: false,
      };

      const newEvents = [
        ...prev,
        newEvent
      ];
      // Keep the logic to limit events if desired, or remove .slice(-20) for full persistence
      return newEvents.slice(-100); // Increased limit for persistence
    });
  }, []); // Empty dependency array as setLoggedEvents is stable

  const logClientEvent: EventContextValue["logClientEvent"] = useCallback((eventObj, eventNameSuffix = "") => {
    const name = `${eventObj.type || ""} ${eventNameSuffix || ""}`.trim();
    addLoggedEvent("client", name, eventObj);
  }, [addLoggedEvent]);

  const logServerEvent: EventContextValue["logServerEvent"] = useCallback((eventObj, eventNameSuffix = "") => {
    const name = `${eventObj.type || ""} ${eventNameSuffix || ""}`.trim();
    addLoggedEvent("server", name, eventObj);
  }, [addLoggedEvent]);

  const toggleExpand: EventContextValue["toggleExpand"] = useCallback((id) => {
    setLoggedEvents((prev) =>
      prev.map((log) => {
        if (log.id === id) {
          return { ...log, expanded: !log.expanded };
        }
        return log;
      })
    );
  }, []); // Empty dependency array as setLoggedEvents is stable

  // Function to clear events
  const clearLoggedEvents = useCallback(() => {
    setLoggedEvents([]);
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (error) {
      console.error("Failed to clear events from localStorage:", error);
    }
  }, []);


  return (
    <EventContext.Provider
      value={{ loggedEvents, logClientEvent, logServerEvent, toggleExpand, clearLoggedEvents }} // Add clearLoggedEvents to provider value
    >
      {children}
    </EventContext.Provider>
  );
};

export function useEvent() {
  const context = useContext(EventContext);
  if (!context) {
    throw new Error("useEvent must be used within an EventProvider");
  }
  return context;
}