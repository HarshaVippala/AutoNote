# AgentAssist - Implementation Analysis

## Architecture Overview

AgentAssist is a modern web application built with Next.js that leverages WebRTC for real-time audio processing and communication with OpenAI's Realtime API. The application can be run in two modes:

1. **Web Mode**: Running as a standard Next.js web application
2. **Desktop Mode**: Running as an Electron desktop application with additional features like transparency and always-on-top behavior

### Key Components Architecture

```
┌───────────────────────────────────────────────────────┐
│                      UI Layer                         │
│  ┌───────────┐  ┌───────────┐  ┌───────────────────┐  │
│  │ TopControls│  │ Transcript│  │DraggablePanelLayout│  │
│  └───────────┘  └───────────┘  └───────────────────┘  │
├───────────────────────────────────────────────────────┤
│                     State Layer                       │
│  ┌──────────────┐ ┌─────────────┐ ┌───────────────┐  │
│  │TranscriptCtx │ │  StatusCtx  │ │   ThemeCtx    │  │
│  └──────────────┘ └─────────────┘ └───────────────┘  │
├───────────────────────────────────────────────────────┤
│                  Connection Layer                     │
│  ┌──────────────┐ ┌─────────────┐ ┌───────────────┐  │
│  │ WebRTC Conn. │ │OpenAI Client│ │Response Process│  │
│  └──────────────┘ └─────────────┘ └───────────────┘  │
└───────────────────────────────────────────────────────┘
```

## Technology Stack

- **Frontend**: 
  - React 19.0.0 with Next.js 15.2.4
  - TypeScript
  - Tailwind CSS for styling
  - React Context API for state management
  
- **Backend**:
  - Next.js API routes
  - Node.js server
  
- **External Services**:
  - OpenAI API (standard and realtime endpoints)
  
- **Desktop Integration**:
  - Electron for desktop application packaging
  - Native macOS integration (planned)

- **Communication**:
  - WebRTC for real-time audio streaming
  - Server-Sent Events (SSE) for streaming AI responses

## Data Flow

### Voice Input Flow

1. **Audio Capture**: 
   - User's microphone input is captured via browser WebRTC API
   - Audio stream is processed through WebAudio API

2. **WebRTC Connection**:
   - `webRTCConnection-webRTC.ts` establishes connection with OpenAI
   - Ephemeral tokens are obtained from `/api/realtime-token`
   - SDP offer/answer exchange sets up connection

3. **Transcript Processing**:
   - Transcribed text is received via WebRTC data channel
   - Text is displayed in the Transcript component
   - Text is sent to the responses API for AI processing

### AI Response Flow

1. **Response Generation**:
   - `/api/responses/route.ts` handles incoming transcript requests
   - Question type is classified (CODE_QUESTION, BEHAVIORAL_QUESTION, GENERAL_QUESTION)
   - Appropriate OpenAI model is selected based on question type
   - Function calling is used to structure responses

2. **Response Streaming**:
   - Responses are streamed back using Server-Sent Events
   - Client processes these events in real-time
   - UI updates progressively as content arrives

3. **Response Display**:
   - Structured responses are categorized and displayed in appropriate panes
   - Code responses go to CodePane with syntax highlighting
   - STAR format responses get special formatting in analysis panes

## Key Implementation Details

### WebRTC Connection

The WebRTC connection is handled by the `connectionManager` in `webRTCConnection-webRTC.ts`, which:

- Manages peer connections for different streams (microphone and speaker)
- Handles connection state management and error recovery
- Processes data channel messages from OpenAI
- Provides hooks for reconnection logic

### Response Processing

The responses API route (`/api/responses/route.ts`) implements:

- Question classification using OpenAI
- Context management for conversation history
- Follow-up detection for multi-turn interactions
- OpenAI state management with `previous_response_id` for maintaining conversation context
- Function calling with structured schemas:
  - `ComprehensiveCodeSchema` for code questions
  - `BehavioralStarSchema` for behavioral questions
  - `SimpleExplanationSchema` for general knowledge

### UI Components

The UI is built with several key components:

- **App.tsx**: Core component managing the application state and flow
- **TopControls.tsx**: Handles WebRTC connections and audio controls
- **DraggablePanelLayout.tsx**: Flexible layout system with resizable panels
- **Transcript.tsx**: Displays conversation history
- **CodePane.tsx**: Shows and formats code with syntax highlighting
- **EnhancedAnalysisPane.tsx**: Displays structured analysis of responses

### State Management

State is managed primarily through React Context providers:

- **TranscriptContext**: Manages conversation history and updates
- **StatusContext**: Tracks application connection status
- **ThemeContext**: Handles light/dark theme preferences
- **EventContext**: Provides event handling across components

### Electron Integration

The Electron implementation provides desktop-specific features:

- Transparent window that can be positioned anywhere
- Always-on-top capability for use during screen sharing
- Global shortcuts for window management
- Screenshot functionality
- Click-through mode to interact with applications underneath

## Performance Considerations

1. **Real-time Processing**:
   - Audio streaming is optimized for low latency
   - WebRTC connections implement reconnection logic for reliability

2. **Response Streaming**:
   - Server-Sent Events minimize time-to-first-response
   - Progressive UI updates provide immediate feedback

3. **UI Responsiveness**:
   - React component design optimizes rendering
   - Tailwind CSS provides efficient styling

## Security Considerations

1. **API Token Management**:
   - Ephemeral tokens with limited lifetime
   - Server-side token generation to avoid exposing API keys

2. **Data Handling**:
   - Conversation state is managed in memory
   - No persistent storage of conversation data

## Future Development Directions

1. **Native macOS Integration**:
   - Implementation of the MACOS_WRAPPER_PLAN.md
   - Better integration with system audio (BlackHole)

2. **Enhanced UI/UX**:
   - More customizable panel layouts
   - Additional themes and visual options

3. **Expanded AI Capabilities**:
   - Support for additional OpenAI models
   - Integration with other LLM providers
   - Enhanced function calling schemas 