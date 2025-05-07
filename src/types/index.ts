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
  structuredAnalysis?: AnalysisResponse | BehavioralStarResponse | { status: string };
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

// Shared application type definitions
export type SessionStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED";

export interface ToolParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
  pattern?: string;
  properties?: Record<string, ToolParameterProperty>;
  required?: string[];
  additionalProperties?: boolean;
  items?: ToolParameterProperty;
}

export interface ToolParameters {
  type: string;
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface Tool {
  type: "function";
  name: string;
  description: string;
  parameters: ToolParameters;
}

export interface AgentConfig {
  name: string;
  publicDescription: string; // gives context to agent transfer tool
  instructions: string;
  tools: Tool[];
  toolLogic?: Record<
    string,
    (args: any, transcriptLogsFiltered: TranscriptItem[]) => Promise<any> | any
  >;
  downstreamAgents?: AgentConfig[] | { name: string; publicDescription: string }[];
}

export type AllAgentConfigsType = Record<string, AgentConfig[]>;

export interface TranscriptItem {
  itemId: string;
  type: "MESSAGE" | "BREADCRUMB";
  role?: "user" | "assistant";
  title?: string;
  data?: Record<string, any>;
  expanded: boolean;
  timestamp: string;
  createdAtMs: number;
  status: "IN_PROGRESS" | "DONE";
  isHidden: boolean;
  agentName?: string;
}

// New type definition based on ServerEvent item content structure
export interface ContentItem {
  type?: string;
  transcript?: string | null;
  text?: string;
  // Add other potential properties if needed based on actual usage
}

export interface ServerEvent {
  type: string;
  event_id?: string;
  item_id?: string;
  transcript?: string;
  delta?: string;
  session?: {
    id?: string;
  };
  item?: {
    id?: string;
    object?: string;
    type?: string;
    status?: string;
    name?: string;
    arguments?: string;
    role?: "user" | "assistant";
    content?: {
      type?: string;
      transcript?: string | null;
      text?: string;
    }[];
  };
  response?: {
    output?: {
      type?: string;
      name?: string;
      arguments?: any;
      call_id?: string;
    }[];
    status_details?: {
      error?: any;
    };
  };
}

export interface LoggedEvent {
  id: number;
  direction: "client" | "server";
  expanded: boolean;
  timestamp: string;
  eventName: string;
  eventData: Record<string, any>; // can have arbitrary objects logged
  timestampMs: number; // Added for consistency with EventContext
}

export type Status = "idle" | "processing" | "done" | "error";
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

// Schema for sending code questions with screenshots
export interface ComprehensiveCodeSchema {
  question: string; // The user's question about the code
  image: string;    // Base64 encoded PNG image data URL of the screenshot
}