// src/app/types/index.ts

// Defines the structure for a turn in the transcript, potentially containing
// both user (mic) and system/assistant (speaker) contributions.
export interface TranscriptTurn {
    micTranscript?: string;
    speakerTranscript?: string;
    timestamp: number;
    processed: boolean; // Indicates if this turn has been processed by the main assistant
}

// Defines the structure for holding error dialog information.
export interface ErrorState {
    isOpen: boolean;
    title: string;
    message: string;
    details: string;
    retryAction: (() => void) | null;
}

// Connection state for the overall application (distinct from individual WebRTC states)
export type AppConnectionState =
  | "INITIAL"
  | "FETCHING_KEY"
  | "KEY_INVALID"
  | "CONNECTING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "ERROR";

// You can add other shared types here as the application grows. 