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

// Represents the data associated with a single tab in the UI
export interface TabData {
  key: string;          // Unique identifier for the tab
  filename: string;     // Display name, often like "Solution-1.ts"
  language: string;     // Programming language for syntax highlighting (e.g., 'typescript', 'python')
  code: string;         // The code content
  analysis: string;     // The textual analysis or explanation 
  // Add the structured analysis field (optional because older tabs might not have it)
  structuredAnalysis?: AnalysisResponse; 
}

// Define the structured analysis type (mirrors the one temporarily in App.tsx)
// TODO: Remove the duplicate definition in App.tsx after this is confirmed
export interface AnalysisResponse { 
  planning_steps: string[];
  complexity: {
    time: string;
    space: string;
  };
  explanation: string;
}

// You can add other shared types here as the application grows. 