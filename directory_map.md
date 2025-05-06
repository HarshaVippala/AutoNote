# AgentAssist - Project Directory Map

## Overview
AgentAssist is a real-time AI assistant application that uses WebRTC to connect with OpenAI's realtime API. The application provides an interface for interacting with AI models through voice, processes transcripts, and displays structured responses.

## Main Project Structure

```
AgentAssist/
├── .next/                      # Next.js build artifacts
├── .cursor/                    # Cursor editor configuration
├── .github/                    # GitHub workflows
├── .vscode/                    # VS Code configuration
├── dist/                       # Compiled output
├── docs/                       # Project documentation
├── node_modules/               # Node.js dependencies
├── public/                     # Static files
│   └── worklets/               # Audio processing worklets
├── scripts/                    # Build and utility scripts
├── src/                        # Source code
│   ├── app/                    # Next.js app directory
│   │   ├── api/                # API routes
│   │   │   ├── assistants-api/ # Assistants API endpoints
│   │   │   ├── code-question/  # Code-specific endpoints
│   │   │   ├── realtime-assistant-webRTC/ # WebRTC connection
│   │   │   ├── realtime-token/ # Token fetching endpoint
│   │   │   └── responses/      # AI responses processing
│   │   ├── components/         # UI components
│   │   ├── contexts/           # React context providers
│   │   ├── hooks/              # Custom React hooks
│   │   ├── lib/                # Utility functions
│   │   └── types/              # TypeScript type definitions
│   ├── components/             # Shared UI components
│   └── lib/                    # Shared libraries
└── various configuration files # (.env, package.json, etc.)
```

## Key Files

### Core Application Files

- **electron-main.js**: The main Electron process that creates a transparent, always-on-top window
- **preload.js**: Electron preload script for context bridge
- **server.js**: Node.js server that serves the Next.js application
- **run-mac.sh**: Script to run the application on macOS
- **MACOS_WRAPPER_PLAN.md**: Plan for creating a native macOS wrapper for the application

### Source Code (src/)

#### API Routes

- **src/app/api/realtime-token/route.ts**: Generates ephemeral tokens for OpenAI's realtime API
- **src/app/api/realtime-assistant-webRTC/webRTCConnection-webRTC.ts**: Handles WebRTC connections for real-time communication
- **src/app/api/responses/route.ts**: Processes AI responses and manages conversation context

#### Components

- **src/app/App.tsx**: Main application component that orchestrates the UI and functionality
- **src/app/components/TopControls.tsx**: Controls for the top of the application
- **src/app/components/DraggablePanelLayout.tsx**: Responsive panel layout with draggable dividers
- **src/app/components/Transcript.tsx**: Displays the conversation transcript
- **src/app/components/CodePane.tsx**: Displays and edits code
- **src/app/components/EnhancedAnalysisPane.tsx**: Shows enhanced analysis of code or behavioral responses

#### Context Providers

- **src/app/contexts/TranscriptContext.tsx**: Manages transcript state and operations
- **src/app/contexts/EventContext.tsx**: Handles app-wide events
- **src/app/contexts/StatusContext.tsx**: Manages application status state
- **src/app/contexts/ThemeContext.tsx**: Handles theme switching

### Configuration Files

- **package.json**: Project dependencies and scripts
- **tsconfig.json**: TypeScript configuration
- **next.config.ts**: Next.js configuration
- **tailwind.config.ts**: Tailwind CSS configuration
- **postcss.config.mjs**: PostCSS configuration

## Application Flow

1. The application starts with Electron (electron-main.js) or via Next.js server (server.js)
2. The main App component (App.tsx) initializes contexts and renders the UI
3. TopControls component handles microphone and speaker connections via WebRTC
4. When audio is received:
   - It's processed through the OpenAI Realtime API via WebRTC connection
   - Transcriptions are received and displayed in the Transcript component
   - The transcript is sent to the responses API route for processing
   - Structured responses are displayed in appropriate panes based on content type

## Key Features

- Real-time voice transcription via WebRTC
- OpenAI integration for AI responses
- Code analysis and display
- Behavioral question responses using STAR format
- Theme switching
- Transparent, always-on-top window (Electron)
- Panel layout with resizable sections 