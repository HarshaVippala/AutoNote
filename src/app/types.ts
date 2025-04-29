export type SessionStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED";

export type ConnectionState =
  | "INITIAL"
  | "FETCHING_KEY"
  | "KEY_INVALID"
  | "KEY_VALID" // Maybe remove this if CONNECTING implies valid key?
  | "CONNECTING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "ERROR"; // General error state

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

export interface Log {
  id: number;
  timestamp: string;
  direction: string;
  eventName: string;
  data: any;
  expanded: boolean;
  type: string;
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
}

// <<< ADDED: Shared type for transcript turns >>>
export interface TranscriptTurn {
  micTranscript?: string;
  speakerTranscript?: string;
  timestamp: number;
  processed: boolean;
}

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

// Add the TabData interface definition here
export interface TabData {
  key: string; // Unique identifier, e.g., filename or a generated ID
  filename: string; // Display name for the tab trigger
  language: string; // Language for syntax highlighting
  code: string; // The actual code content
  analysis: string; // The analysis content
}

// Schema for sending code questions with screenshots
export interface ComprehensiveCodeSchema {
  question: string; // The user's question about the code
  image: string;    // Base64 encoded PNG image data URL of the screenshot
}
