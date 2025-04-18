"use client";

import { Suspense } from "react";
import { TranscriptProvider } from "@/app/contexts/TranscriptContext";
import { EventProvider } from "@/app/contexts/EventContext";
import App from "./App";

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-800 mx-auto mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-800">Loading Application...</h2>
        <p className="text-gray-600 mt-2">Setting up your realtime connection</p>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <TranscriptProvider>
      <EventProvider>
        <Suspense fallback={<LoadingFallback />}>
          <App />
        </Suspense>
      </EventProvider>
    </TranscriptProvider>
  );
}
