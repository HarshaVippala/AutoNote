"use client";

import React, { createContext, useContext, useState, FC, PropsWithChildren } from "react";
import { v4 as uuidv4 } from "uuid";
import { LoggedEvent as OriginalLoggedEvent } from "@/app/types";

interface LoggedEvent extends OriginalLoggedEvent {
  timestampMs: number;
}

type EventContextValue = {
  loggedEvents: LoggedEvent[];
  logClientEvent: (eventObj: Record<string, any>, eventNameSuffix?: string) => void;
  logServerEvent: (eventObj: Record<string, any>, eventNameSuffix?: string) => void;
  toggleExpand: (id: number | string) => void;
};

const EventContext = createContext<EventContextValue | undefined>(undefined);

export const EventProvider: FC<PropsWithChildren> = ({ children }) => {
  const [loggedEvents, setLoggedEvents] = useState<LoggedEvent[]>([]);

  function addLoggedEvent(direction: "client" | "server", eventName: string, eventData: Record<string, any>) {
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
      return newEvents.slice(-50);
    });
  }

  const logClientEvent: EventContextValue["logClientEvent"] = (eventObj, eventNameSuffix = "") => {
    const name = `${eventObj.type || ""} ${eventNameSuffix || ""}`.trim();
    addLoggedEvent("client", name, eventObj);
  };

  const logServerEvent: EventContextValue["logServerEvent"] = (eventObj, eventNameSuffix = "") => {
    const name = `${eventObj.type || ""} ${eventNameSuffix || ""}`.trim();
    addLoggedEvent("server", name, eventObj);
  };

  const toggleExpand: EventContextValue["toggleExpand"] = (id) => {
    setLoggedEvents((prev) =>
      prev.map((log) => {
        if (log.id === id) {
          return { ...log, expanded: !log.expanded };
        }
        return log;
      })
    );
  };


  return (
    <EventContext.Provider
      value={{ loggedEvents, logClientEvent, logServerEvent, toggleExpand }}
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