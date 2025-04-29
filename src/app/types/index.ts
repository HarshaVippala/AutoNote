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
  structuredAnalysis?: AnalysisResponse | BehavioralStarResponse; 
}

// Define the structured analysis type (mirrors ComprehensiveCodeSchema from route.ts)
export interface AnalysisResponse { 
  clarifying_questions?: string[]; // Optional array of strings
  think_out_loud: string;
  language: string;
  cd: string; // Changed from 'code' to 'cd' to match API response
  edge_cases: string;
  test_cases: {
    input: string;
    expected_output: string;
  }[]; // Array of test case objects
  complexity: {
    time: string;
    space: string;
  };
  potential_optimizations?: string; // Optional string
}

// Define the structure for behavioral STAR answers
export interface BehavioralStarResponse {
  situation: string;
  task: string;
  action: string;
  result: string;
}

// You can add other shared types here as the application grows. 