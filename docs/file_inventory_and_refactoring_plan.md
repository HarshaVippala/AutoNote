# File Inventory and Refactoring Plan

This document outlines the current state of project files, proposed renames, functionality summaries, dependencies, and refactoring notes.

## Directory: `src/app/`

---
### File: `src/app/App.tsx`

*   **Current Filename:** `App.tsx`
*   **Proposed New Filename:** `App.tsx` (Appropriate for the root client component of the page.)
*   **Core Functionality Summary:** Defines the main application client component (`App`) responsible for managing core application state (connections, UI state, tabs) and logic for WebRTC event handling, transcript processing, and backend API interactions. It also includes the `AppContent` presentational component.
*   **Key Components and Responsibilities:**
    *   `AppContent` (function component): Renders the main UI layout including `TopControls` and `DraggablePanelLayout`.
    *   `App` (function component): Manages core state, context usage, WebRTC event handling, API calls for responses, and tab data management.
*   **Internal Dependencies:**
    *   `../components/Transcript.tsx`
    *   `../components/TopControls.tsx`
    *   `../components/DraggablePanelLayout.tsx`
    *   `@/types` (various type imports)
    *   `@/contexts/TranscriptContext`
    *   `@/contexts/EventContext`
    *   `@/contexts/StatusContext`
    *   `../contexts/ThemeContext`
    *   `@/app/api/realtime-assistant-webRTC/webRTCConnection-webRTC` (for `logger`)
*   **Internal Dependents:**
    *   `src/app/page.tsx` (likely)
*   **Key External Library Dependencies:**
    *   `react`
    *   `next/navigation`
    *   `uuid`
    *   `next/image`
    *   `eventsource-parser`
*   **Refactoring Notes/Opportunities:**
    *   The `handleProcessTurn` function, particularly its stream processing logic, is complex and could be extracted to a dedicated module or custom hook.
    *   State management for tabs and responses is extensive and might benefit from further encapsulation (e.g., custom hook or state management library).
    *   Consider if `AppConnectionState as ConnectionState` aliasing is consistently handled or if direct use of `AppConnectionState` is preferable.

---
### File: `src/app/layout.tsx`

*   **Current Filename:** `layout.tsx`
*   **Proposed New Filename:** `layout.tsx` (Standard Next.js App Router file, should not be renamed.)
*   **Core Functionality Summary:** Defines the root HTML structure and layout for all pages. It includes global styles, initializes theme settings (to prevent flashing), and wraps page content with necessary context providers (`ThemeProvider`, `StatusProvider`).
*   **Key Components and Responsibilities:**
    *   `ThemeInitScript` (function component): Injects an inline script for immediate theme application based on localStorage or system preference.
    *   `RootLayout` (function component): Sets up `<html>` and `<body>` tags, includes metadata, `ThemeInitScript`, and wraps child content with `ThemeProvider` and `StatusProvider`.
*   **Internal Dependencies:**
    *   `./globals.css`
    *   `../contexts/ThemeContext` (for `ThemeProvider`)
    *   `../contexts/StatusContext` (for `StatusProvider`)
*   **Internal Dependents:**
    *   All pages within the application.
*   **Key External Library Dependencies:**
    *   `next` (specifically `Metadata` type)
    *   `react` (specifically `ReactNode` type)
*   **Refactoring Notes/Opportunities:**
    *   The use of an inline script for `ThemeInitScript` is a standard practice for preventing theme flashing and is acceptable.
    *   The file is well-structured and follows Next.js conventions.

---
### File: `src/app/page.tsx`

*   **Current Filename:** `page.tsx`
*   **Proposed New Filename:** `page.tsx` (Standard Next.js App Router file, should not be renamed.)
*   **Core Functionality Summary:** Defines the main page component for the application's root route. It sets up necessary context providers (`TranscriptProvider`, `EventProvider`) and renders the primary `App` client component, including error handling (`ErrorBoundary`) and loading states (`Suspense`).
*   **Key Components and Responsibilities:**
    *   `LoadingFallback` (function component): Provides a simple UI to display while the main application component is loading.
    *   `Page` (function component): Serves as the entry point for the root URL. It orchestrates the setup of context providers and renders the `App` component within `Suspense` and `ErrorBoundary`.
*   **Internal Dependencies:**
    *   `@/contexts/TranscriptContext` (for `TranscriptProvider`)
    *   `@/contexts/EventContext` (for `EventProvider`)
    *   `./App` (for the main `App` component)
    *   `../components/ErrorBoundary` (for `ErrorBoundary` component)
*   **Internal Dependents:**
    *   Rendered by the Next.js App Router for the root path.
*   **Key External Library Dependencies:**
    *   `react` (specifically `Suspense`)
*   **Refactoring Notes/Opportunities:**
    *   The structure is standard for a Next.js page.
    *   The `LoadingFallback` component is basic and could be styled or made more informative if desired.

---
### File: `src/app/globals.css`

*   **Current Filename:** `globals.css`
*   **Proposed New Filename:** `globals.css` (Standard Next.js file for global styles, should not be renamed.)
*   **Core Functionality Summary:** Provides global styling for the application. It includes Tailwind CSS setup, custom utility classes, CSS custom properties for theming (light/dark modes), base body styles, and responsive styles for mobile devices.
*   **Key Components and Responsibilities:**
    *   Integration of Tailwind CSS.
    *   Definition of custom animations (e.g., `animate-blink`, `spin-slow`).
    *   CSS variable setup for light and dark themes.
    *   Global element styling (e.g., `body`, `html`).
    *   Mobile-specific layout and interaction styles (e.g., for swipeable panels).
*   **Internal Dependencies:** None.
*   **Internal Dependents:** Imported by `src/app/layout.tsx`, affecting the entire application.
*   **Key External Library Dependencies:** Tailwind CSS (implicitly).
*   **Refactoring Notes/Opportunities:**
    *   CSS variable definitions for themes appear somewhat duplicated and could potentially be streamlined.
    *   Styles specific to certain components (e.g., `.mobile-swipe-container`) could be moved to CSS modules co-located with those components if they aren't truly global.
    *   Consider organizing the extensive list of CSS variables for themes, perhaps grouping them or using a more structured approach if complexity increases.

---
## Directory: `src/app/api/`

### Subdirectory: `src/app/api/assistants-api/`

#### File: `src/app/api/assistants-api/types.ts`

*   **Current Filename:** `types.ts`
*   **Proposed New Filename:** `types.ts` (Acceptable within this specific API route group. Could be `assistants-api.types.ts` for more global clarity if moved, or integrated into a larger `src/types/openai.types.ts` if shared with frontend.)
*   **Core Functionality Summary:** Defines TypeScript interfaces for data structures related to the OpenAI Assistants API, such as Threads, Messages, and Runs.
*   **Key Components and Responsibilities:**
    *   `Thread`: Interface for OpenAI Thread objects.
    *   `ThreadMessage`: Interface for OpenAI Message objects.
    *   `MessageContent`: Interface for the content part of a Message.
    *   `Run`: Interface for OpenAI Run objects.
*   **Internal Dependencies:** None.
*   **Internal Dependents:**
    *   `src/app/api/assistants-api/check-run/route.ts` (likely)
    *   `src/app/api/assistants-api/process-transcript/route.ts` (likely)
*   **Key External Library Dependencies:** None.
*   **Refactoring Notes/Opportunities:**
    *   Consider moving these types to `src/types/openai/` if they are or will be used by frontend components to ensure a single source of truth for these data structures.
    *   Replace `any` types in interfaces (e.g., `Run.tools`, `Run.required_action`, `MessageContent.annotations`) with more specific types if possible for better type safety.

---
#### File: `src/app/api/assistants-api/check-run/route.ts`

*   **Current Filename:** `route.ts`
*   **Proposed New Filename:** `route.ts` (Standard for Next.js API routes. However, see notes.)
*   **Core Functionality Summary (Intended):** This API route is designed to handle GET requests to check the status of an OpenAI Assistant run. It would take `threadId` and `runId` as parameters, retrieve the run status, and if completed, fetch and return the latest assistant message.
*   **Key Components and Responsibilities (Intended):**
    *   `GET` (async function): Request handler for checking run status and retrieving messages.
*   **Internal Dependencies (Intended):**
    *   `next/server`
    *   `../threadManager` (Note: This file seems to be missing or was not listed, which would be a broken dependency if uncommented.)
*   **Internal Dependents:** None (API route).
*   **Key External Library Dependencies (Intended):** Likely an OpenAI SDK via `threadManager`.
*   **Refactoring Notes/Opportunities:**
    *   **CRITICAL: The entire functional code within this file is commented out.** The route `/api/assistants-api/check-run` is currently non-functional.
    *   **Action Required:** Decide whether this functionality is still needed.
        *   If yes: Uncomment the code, ensure the `../threadManager` dependency is correctly implemented and available, and test thoroughly.
        *   If no: This file should be deleted as it's obsolete.
    *   The placeholder `export {};` should be removed if the code is uncommented.

---
#### File: `src/app/api/assistants-api/process-transcript/route.ts`

*   **Current Filename:** `route.ts`
*   **Proposed New Filename:** `route.ts` (Standard for Next.js API routes. However, see notes.)
*   **Core Functionality Summary (Intended):** This API route is designed to handle POST requests for processing audio transcripts. It would take mic and/or speaker transcripts, an assistant ID, manage an OpenAI Assistant thread (creating or retrieving), add the transcripts as messages, and initiate a run with the specified assistant.
*   **Key Components and Responsibilities (Intended):**
    *   `POST` (async function): Request handler for receiving transcripts, interacting with the OpenAI Assistants API via a `threadManager`, and returning thread/run identifiers.
*   **Internal Dependencies (Intended):**
    *   `next/server`
    *   `../threadManager` (Note: This file seems to be missing or was not listed, which would be a broken dependency if uncommented.)
*   **Internal Dependents:** None (API route).
*   **Key External Library Dependencies (Intended):** Likely an OpenAI SDK via `threadManager`.
*   **Refactoring Notes/Opportunities:**
    *   **CRITICAL: The entire functional code within this file is commented out.** The route `/api/assistants-api/process-transcript` is currently non-functional.
    *   **Action Required:** Decide whether this functionality is still needed.
        *   If yes: Uncomment the code, ensure the `../threadManager` dependency is correctly implemented and available, and test.
        *   If no: This file should be deleted.
    *   The logic of how speaker vs. mic transcripts are added to the thread (roles, prefixes) is application-specific.
    *   The placeholder `export {};` should be removed if the code is uncommented.

---
### Subdirectory: `src/app/api/code-question/`

#### File: `src/app/api/code-question/route.ts`

*   **Current Filename:** `route.ts`
*   **Proposed New Filename:** `route.ts` (Standard for Next.js API routes.)
*   **Core Functionality Summary:** This API route handles POST requests for code-related questions that include an image (screenshot). It uses the OpenAI `gpt-4o-mini` model to analyze the code in the image along with the user's question and returns the model's textual response.
*   **Key Components and Responsibilities:**
    *   `POST` (async function): Request handler that parses the input (question and base64 image), constructs a payload for OpenAI's chat completions API (including image URL), calls the API, and returns the assistant's response.
*   **Internal Dependencies:**
    *   `next/server` (NextRequest, NextResponse)
    *   `@/types` (for `ComprehensiveCodeSchema`)
*   **Internal Dependents:** None (API route).
*   **Key External Library Dependencies:**
    *   `openai` (OpenAI Node.js SDK)
*   **Refactoring Notes/Opportunities:**
    *   The OpenAI model (`gpt-4o-mini`) and `max_tokens` are hardcoded; consider making them configurable via environment variables.
    *   Input validation for the image (e.g., size, further type checking beyond prefix) could be enhanced.
    *   Error reporting to the client could be more structured.

---
### Subdirectory: `src/app/api/realtime-assistant-webRTC/`

#### File: `src/app/api/realtime-assistant-webRTC/webRTCConnectionManager.ts`

*   **Current Filename:** `webRTCConnectionManager.ts` (Previously `webRTCConnection-webRTC.ts`. Renamed during initial analysis.)
*   **Proposed New Filename:** `webRTCConnectionManager.ts` (Rename already completed.)
*   **Rationale for Renaming:** The original name `webRTCConnection-webRTC.ts` was redundant. `webRTCConnectionManager.ts` more clearly describes its role.
*   **Core Functionality Summary:** Provides a `connectionManager` object for establishing and managing WebRTC connections (e.g., for mic and speaker audio streams) with a backend service. It handles token fetching, SDP exchange, data channel communication, connection state, and basic error/reconnection logic. Also includes a `logger` utility.
*   **Key Components and Responsibilities:**
    *   `logger`: Utility for leveled console logging.
    *   `fetchEphemeralToken`: Fetches an ephemeral token from `/api/realtime-token`.
    *   `connectionManager`: Manages multiple WebRTC connections, including their setup (PeerConnection, DataChannel, SDP exchange), state tracking, message sending, and disconnection.
*   **Internal Dependencies:** None (after removing unused `RefObject` from `react`).
*   **Internal Dependents:**
    *   `src/app/App.tsx` (imports `logger` from the new path)
    *   `src/components/TopControls.tsx` (imports `connectionManager`, `logger` from the new path)
*   **Key External Library Dependencies:** Interacts with browser WebRTC APIs.
*   **Refactoring Notes/Opportunities:**
    *   **Rename Status:** Confirmed renamed to `webRTCConnectionManager.ts`. Dependent files ([`src/app/App.tsx`](src/app/App.tsx:0) and [`src/components/TopControls.tsx`](src/components/TopControls.tsx:0)) correctly import from the new path.
    *   The "Frontend Integration Logic Placeholder" within `dc.onmessage` should be reviewed and either properly implemented if it's backend logic or removed if it's meant for the frontend.
    *   Hardcoded URLs (like `REALTIME_CONNECTION_URL`) and default model names could be moved to environment variables.
    *   Reconnection logic is basic; could be enhanced (e.g., exponential backoff).
    *   The `logger` is simple; a more robust library could be used for larger-scale applications.

---
### Subdirectory: `src/app/api/realtime-token/`

#### File: `src/app/api/realtime-token/route.ts`

*   **Current Filename:** `route.ts`
*   **Proposed New Filename:** `route.ts` (Standard for Next.js API routes.)
*   **Core Functionality Summary:** This API route is responsible for generating ephemeral client tokens for OpenAI's Realtime API. It accepts a session type ('mic' or 'speaker') and optional client configuration, then creates an OpenAI Realtime Session to obtain and return a `client_secret` (token).
*   **Key Components and Responsibilities:**
    *   `POST` (async function): Handles requests by initializing the OpenAI client, determining session parameters based on request body and defaults, creating an OpenAI Realtime Session, and returning the `client_secret`.
*   **Internal Dependencies:**
    *   `next/server` (NextResponse)
*   **Internal Dependents:**
    *   `src/app/api/realtime-assistant-webRTC/webRTCConnectionManager.ts` (via `fetchEphemeralToken` function)
*   **Key External Library Dependencies:**
    *   `openai` (OpenAI Node.js SDK)
*   **Refactoring Notes/Opportunities:**
    *   Consider more robust error handling for OpenAI client initialization if the API key is missing at startup.
    *   The default fallback for an invalid `sessionType` to 'mic' might obscure client errors; returning a 400 error might be more appropriate.
    *   Hardcoded model names and default session parameters could be made configurable (e.g., via environment variables or a separate configuration file).
    *   The detailed 'mic' session instructions are embedded directly in the code; these could also be externalized if they become complex or need frequent changes.

---
### Subdirectory: `src/app/api/responses/`

#### File: `src/app/api/responses/route.ts`

*   **Current Filename:** `route.ts`
*   **Proposed New Filename:** `route.ts` (Standard for Next.js API routes.)
*   **Core Functionality Summary:** This is the primary API endpoint for generating structured AI responses. It receives transcripts, manages conversation context, classifies question types, selects appropriate OpenAI models and tools (defined using Zod schemas), and streams responses back to the client.
*   **Key Components and Responsibilities:**
    *   Zod schemas for `ComprehensiveCodeSchema`, `SimpleExplanationSchema`, `BehavioralStarSchema`.
    *   Conversion of Zod schemas to JSON schemas for OpenAI tools.
    *   In-memory conversation context management (`conversationContextStore`).
    *   `detectFollowUp` function for identifying follow-up questions.
    *   `POST` (async function): Main handler for processing requests, orchestrating context, classification, prompt engineering, OpenAI API calls (`openaiSDK.responses.create`), and streaming results.
*   **Internal Dependencies:**
    *   `next/server` (NextRequest, NextResponse)
*   **Internal Dependents:**
    *   `src/app/App.tsx` (via fetch call in `handleProcessTurn`)
*   **Key External Library Dependencies:**
    *   `zod`
    *   `zod-to-json-schema`
    *   `openai`
*   **Refactoring Notes/Opportunities:**
    *   **High Complexity:** This file is very large and handles many concerns. It should be broken down into smaller, more focused modules.
    *   **Modularity Suggestions:**
        *   Move Zod schema definitions and tool configurations to a dedicated file (e.g., `response.schemas.ts` or `response.tools.ts`).
        *   Extract conversation context management (currently in-memory) to a separate module and consider a persistent storage solution (e.g., Redis, database) for scalability and data persistence.
        *   Refactor `detectFollowUp`, question classification, model selection, and prompt generation logic into separate utility modules or services.
        *   Encapsulate the stream processing logic more cleanly.
    *   **Configuration:** Hardcoded model names should be externalized to environment variables.
    *   **Context Storage:** Review the strategy of only storing assistant messages in the context; ensure this meets application requirements.
    *   The use of `any` for `ChatMessage.content` and `apiInput` could be tightened with more specific types if possible.

---
## Directory: `src/app/lib/`

This directory primarily contains application-specific library code.

### Subdirectory: `src/app/lib/assistants/`

*   **Status:** This directory and its contents are to be preserved as is, per project requirements.
*   **Assumed Purpose:** Likely contains logic related to an older or different implementation of OpenAI Assistants, possibly using the Assistants API directly rather than the Realtime API or Responses API focused on in other route handlers.
*   **Files within (example, actual content not deeply analyzed due to preservation requirement):**
    *   `legacyAssistantProcessor.ts` (from initial file listing)
    *   `README.md` (from initial file listing)
*   **Refactoring Notes/Opportunities:**
    *   While preserved, it would be beneficial in the long term to understand its relationship with the newer AI interaction patterns seen in `/api/responses/` and `/api/realtime-assistant-webRTC/` to avoid deprecated code or conflicting logic. If it's truly legacy and superseded, a plan for its eventual deprecation or integration should be considered.

---
## Directory: `src/components/`

This directory contains reusable UI components.
### File: `src/components/AnalysisPane.tsx`

*   **Current Filename:** `AnalysisPane.tsx`
*   **Status:** Deleted (Superseded by `EnhancedAnalysisPane.tsx`)
*   **Core Functionality Summary:** (Formerly) A React component that displayed analysis content.
*   **Refactoring Notes/Opportunities:**
    *   This component was confirmed unused and has been deleted.

---
### File: `src/components/CodeBlock.tsx`

*   **Current Filename:** `CodeBlock.tsx`
*   **Status:** Deleted
*   **Core Functionality Summary:** (Formerly) A simple React component intended to display a block of code.
*   **Refactoring Notes/Opportunities:**
    *   This component was unused and has been deleted. `EnhancedCodePane.tsx` is the active component for displaying code.

---
### File: `src/components/CodePane.tsx`

*   **Current Filename:** `CodePane.tsx`
*   **Status:** Deleted (Superseded by `EnhancedCodePane.tsx`)
*   **Core Functionality Summary:** (Formerly) A React component for displaying code with syntax highlighting.
*   **Refactoring Notes/Opportunities:**
    *   This component was confirmed unused and has been deleted.

---
### File: `src/components/Dashboard.tsx`

*   **Current Filename:** `Dashboard.tsx`
*   **Status:** Deleted
*   **Core Functionality Summary:** (Formerly) Intended as a dashboard to display application metrics. It was confirmed as unused and has been deleted.
*   **Refactoring Notes/Opportunities:**
    *   This component was confirmed as unused and has been deleted.

---
### File: `src/components/DraggablePanelLayout.css`

*   **Current Filename:** `DraggablePanelLayout.css`
*   **Proposed New Filename:** `DraggablePanelLayout.module.css`
*   **Rationale for Renaming:** Using CSS Modules (`.module.css`) provides style encapsulation, preventing global scope conflicts and making styles local to the component that imports them.
*   **Core Functionality Summary:** Contains CSS styles specifically for the `DraggablePanelLayout` component, including styles for resize handles, and a custom tab interface (container, items, close button, scrollbars).
*   **Key Components and Responsibilities:**
    *   Styles for panel resize handles.
    *   Styles for a tabbed interface within the panels.
    *   Custom scrollbar styling.
*   **Internal Dependencies:** None.
*   **Internal Dependents:**
    *   `src/components/DraggablePanelLayout.tsx`
*   **Key External Library Dependencies:** None.
*   **Refactoring Notes/Opportunities:**
    *   **Convert to CSS Modules:** Rename to `DraggablePanelLayout.module.css` and update `DraggablePanelLayout.tsx` to import and use styles as modules (e.g., `import styles from './DraggablePanelLayout.module.css'; className={styles.myClass}`).
    *   **Theming:** Styles currently use hardcoded colors. For consistency with the application's light/dark theme, these should be updated to use CSS variables from `globals.css`.
    *   **Tab Consistency:** The project uses `shadcn/ui` Tabs elsewhere (e.g., in `CodePane.tsx`). Evaluate if the custom tab styling in this file is necessary or if `shadcn/ui` Tabs could be used here as well for a consistent look and feel. This CSS might be related to `TabsPanel.tsx` if that component implements this custom tab UI.

---
### File: `src/components/DraggablePanelLayout.tsx`

*   **Current Filename:** `DraggablePanelLayout.tsx`
*   **Proposed New Filename:** `DraggablePanelLayout.tsx` (Name is descriptive.)
*   **Core Functionality Summary:** Implements a flexible multi-view layout (main transcript, code with analysis, behavioral answer with analysis) using draggable and resizable panels. It manages view state, panel sizes, and integrates various child components for each view.
*   **Key Components and Responsibilities:**
    *   `DraggablePanelLayout` (React.FC):
        *   Manages view state (`currentView`: 'main', 'code', 'behavioral').
        *   Handles resizable panel sizes for the 'code' view, persisting to localStorage.
        *   Filters tabs into 'code' and 'behavioral' categories.
        *   Provides logic for cycling through views (manual trigger or hotkey).
        *   Automatically switches views based on the type of the active tab.
        *   Renders `Transcript`, `EnhancedCodePane`, `EnhancedAnalysisPane`, and `TabsPanel` based on the current view.
*   **Internal Dependencies:**
    *   `@/types` (for `TabData`, `BehavioralStarResponse`)
    *   `./Transcript.tsx`
    *   `./EnhancedCodePane.tsx`
    *   `./EnhancedAnalysisPane.tsx`
    *   `./TabsPanel.tsx`
    *   `./SecondaryPane.tsx` (This import was unused and has been removed as `SecondaryPane.tsx` was deleted.)
    *   `./DraggablePanelLayout.css` (for styling)
*   **Internal Dependents:**
    *   `src/app/App.tsx` (used in `AppContent`)
*   **Key External Library Dependencies:**
    *   `react`
    *   `react-resizable-panels`
*   **Refactoring Notes/Opportunities:**
    *   **Unused Import:** The import for `SecondaryPane` was removed as the component was deleted.
    *   **Type Safety:** Props `micConnectionStatus` and `speakerConnectionStatus` are typed as `any`. Use a more specific type (e.g., `WebRTCConnectionStatus` from other files).
    *   **Tab Filtering Logic:** Filtering tabs based on `filename` string matching is fragile. Consider adding an explicit `type` field to the `TabData` interface for more robust filtering.
    *   **`visibleTabs` Variable:** The `visibleTabs` variable is defined but not clearly used in the rendering logic for selecting tab sets; clarify its purpose or remove if redundant.
    *   The view cycling and auto-switching logic could potentially be simplified.

---
### File: `src/components/EnhancedAnalysisPane.tsx`

*   **Current Filename:** `EnhancedAnalysisPane.tsx`
*   **Proposed New Filename:** `EnhancedAnalysisPane.tsx` (Name is descriptive, but relationship with `AnalysisPane.tsx` should be clarified.)
*   **Core Functionality Summary:** A React component for displaying detailed, structured analysis content. It's tailored to render specific formats like behavioral STAR answers (including follow-ups) and comprehensive code analysis based on the active tab's data and function call information.
*   **Key Components and Responsibilities:**
    *   `EnhancedAnalysisPane` (React.FC):
        *   Receives theme and detailed `activeTabData` (including `structuredAnalysis`, `functionCall`, `followUps`).
        *   Conditionally renders `TabsPanel` for behavioral views.
        *   Contains helper functions (`renderStarSectionContent`, `renderStarResponse`, `renderStandardAnalysisField`) to format different parts of the analysis.
        *   Main rendering logic (`renderMainContent`) switches display based on `activeTab.functionCall.name` to correctly format STAR, code, or simple explanations.
*   **Internal Dependencies:**
    *   `@/types` (for `TabData`, `AnalysisResponse`, `BehavioralStarResponse`)
    *   `./TabsPanel.tsx`
*   **Internal Dependents:**
    *   `src/components/DraggablePanelLayout.tsx`
*   **Key External Library Dependencies:**
    *   `react`
*   **Refactoring Notes/Opportunities:**
    *   **Relationship with `AnalysisPane.tsx`:** Clarify if this component replaces or complements `AnalysisPane.tsx`. If there's significant overlap or one is an evolution of the other, consider merging or removing the redundant one.
    *   **Type Safety:** The use of `Record<string, any>` for `structuredAnalysis` in props and internal casting (e.g., `as StarData`) could be improved with more robust type guards or by ensuring the `TabData.structuredAnalysis` type in `src/types` accurately covers all expected structures (including the `{ status: string }` for streaming state).
    *   **Component Granularity:** The `renderMainContent` function and its helpers for rendering different analysis types are complex. Consider extracting these into smaller, dedicated sub-components for better readability and maintainability (e.g., `BehavioralStarView.tsx`, `ComprehensiveCodeAnalysisView.tsx`).
    *   The fallback rendering of `activeTab.analysis` by attempting `JSON.parse` might be brittle.

---
### File: `src/components/EnhancedCodePane.tsx`

*   **Current Filename:** `EnhancedCodePane.tsx`
*   **Proposed New Filename:** `EnhancedCodePane.tsx` (Name is descriptive, but its relationship with `CodePane.tsx` needs to be clarified. If it supersedes `CodePane.tsx`, consider renaming this to `CodePane.tsx` after removing the other.)
*   **Core Functionality Summary:** A React component for displaying code snippets with syntax highlighting (`react-syntax-highlighter`) and support for markdown rendering. It uses a `TabsPanel` component to manage multiple code tabs and preprocesses code before display.
*   **Key Components and Responsibilities:**
    *   `EnhancedCodePane` (React.FC): Renders code with syntax highlighting, handles tab navigation via `TabsPanel`, supports markdown rendering, and applies preprocessing to code.
*   **Internal Dependencies:**
    *   `@/types` (for `TabData`)
    *   `./TabsPanel.tsx`
    *   `@/lib/codeUtils` (for `preprocessCode`)
*   **Internal Dependents:**
    *   `src/components/DraggablePanelLayout.tsx`
*   **Key External Library Dependencies:**
    *   `react`
    *   `react-syntax-highlighter`
    *   `react-markdown`
*   **Refactoring Notes/Opportunities:**
    *   **Consolidate with `CodePane.tsx`:** This component appears to have overlapping functionality with `CodePane.tsx`. A detailed comparison should be done to determine if one is redundant. If this is the preferred version, `CodePane.tsx` could potentially be removed and this file renamed to `CodePane.tsx` for simplicity.
    *   The `fontSize: '0.45rem'` in `SyntaxHighlighter` custom styles is very small and should be reviewed for accessibility and readability.
    *   Debugging `console.log` statements should be removed or made conditional for production builds.

---
### File: `src/components/ErrorDialog.tsx`

*   **Current Filename:** `ErrorDialog.tsx`
*   **Proposed New Filename:** `ErrorDialog.tsx` (Name is clear and descriptive.)
*   **Core Functionality Summary:** A theme-aware React modal dialog for displaying errors. It supports a title, message, optional expandable technical details, a retry action, and a dismiss action.
*   **Key Components and Responsibilities:**
    *   `ErrorDialog` (React.FC): Renders the error modal using `@headlessui/react` and `@heroicons/react`, adapting styles based on the current theme from `ThemeContext`.
*   **Internal Dependencies:**
    *   `@/contexts/ThemeContext`
*   **Internal Dependents:**
    *   `src/components/TopControls.tsx` (Confirmed by search)
*   **Key External Library Dependencies:**
    *   `react`
    *   `@headlessui/react`
    *   `@heroicons/react/24/outline`
*   **Refactoring Notes/Opportunities:**
    *   The component is well-structured and uses appropriate libraries.
    *   No immediate refactoring needs are apparent. It is actively used.

---
### File: `src/components/ErrorBoundary.tsx`

*   **Current Filename:** `ErrorBoundary.tsx`
*   **Proposed New Filename:** `ErrorBoundary.tsx` (Standard name for this pattern.)
*   **Core Functionality Summary:** A React class component that implements an error boundary. It catches JavaScript errors in its children, logs them, and displays a fallback UI with options to retry or refresh. Displays detailed error info in development.
*   **Key Components and Responsibilities:**
    *   `ErrorBoundary` (React.Component): Implements `getDerivedStateFromError` and `componentDidCatch` to handle errors. Renders children or a fallback UI.
*   **Internal Dependencies:** None.
*   **Internal Dependents:**
    *   `src/app/page.tsx` (Wraps the main application content)
*   **Key External Library Dependencies:**
    *   `react`
*   **Refactoring Notes/Opportunities:**
    *   Solid implementation.
    *   Consider integrating a production error reporting service (e.g., Sentry) as hinted in the code comments for `componentDidCatch`.

---
### File: `src/components/LoadingSpinner.tsx`

*   **Status:** Confirmed Absent (Not on filesystem). This file could not be located at the specified path.
*   **Action:** Mark as potentially unused or deleted. Will verify if any other files attempt to import it.

---
### File: `src/components/MarkdownRenderer.tsx`

*   **Status:** Confirmed Absent (Not on filesystem). This file could not be located at the specified path.
*   **Action:** Mark as potentially unused or deleted. Will verify if any other files attempt to import it.

---
### File: `src/components/MobileSwipeContainer.tsx`

*   **Current Filename:** `MobileSwipeContainer.tsx`
*   **Status:** Deleted
*   **Core Functionality Summary:** (Formerly) A React component designed to provide a swipeable interface for mobile devices.
*   **Refactoring Notes/Opportunities:**
    *   This component was confirmed as unused and has been deleted.

---
### File: `src/components/PanelHeader.tsx`

*   **Status:** Confirmed Absent (Not on filesystem). This file could not be located at the specified path.
*   **Action:** Mark as potentially unused or deleted. Will verify if any other files attempt to import it.

---
### File: `src/components/ResizablePanels.tsx`

*   **Status:** Confirmed Absent (Not on filesystem). This file could not be located at the specified path.
*   **Action:** Mark as potentially unused or deleted. Will verify if any other files attempt to import it.

---
### File: `src/components/SecondaryPane.tsx`

*   **Current Filename:** `SecondaryPane.tsx`
*   **Status:** Deleted (Confirmed unused and depended on deleted `CodeBlock.tsx`)
*   **Core Functionality Summary:** (Formerly) A React component using `react-tabs` to display multiple content tabs.
*   **Refactoring Notes/Opportunities:**
    *   This component has been deleted.

---
### File: `src/components/SettingsModal.tsx`

*   **Current Filename:** `SettingsModal.tsx`
*   **Proposed New Filename:** `SettingsModal.tsx` (Name is clear.)
*   **Core Functionality Summary:** A theme-aware modal dialog for managing application settings. It allows users to save OpenAI API key and Vector Store ID to `localStorage`, view WebRTC connection statuses (mic/speaker) with reconnect options, and clear session event logs.
*   **Key Components and Responsibilities:**
    *   `SettingsModal` (React.FC): Handles settings input, `localStorage` persistence, displays connection statuses, and provides action buttons (save, cancel, clear data, reconnect).
*   **Internal Dependencies:**
    *   `@/contexts/ThemeContext`
    *   `@/contexts/EventContext`
*   **Internal Dependents:**
    *   `src/components/TopControls.tsx` (Confirmed by search)
*   **Key External Library Dependencies:**
    *   `react`
*   **Refactoring Notes/Opportunities:**
    *   **Shared Utilities:** Extract helper functions (`getStatusColor`, `isButtonClickable`, etc.), currently noted as "Reused Helper Functions from Dashboard/TopControls", into a common utility module (e.g., `src/lib/uiUtils.ts` or similar) to avoid duplication.
    *   **User Feedback:** Replace `window.alert` calls with a more integrated notification system (e.g., toasts) for better UX.
    *   **API Key Security:** While `localStorage` is convenient, acknowledge its security implications for API keys. For production or sensitive data, server-side handling or more secure client-side storage should be considered.
    *   Ensure that `onReconnectMic` and `onReconnectSpeaker` props are always provided with functional handlers by the parent component (`TopControls.tsx`).

---
### File: `src/components/Sidebar.tsx`

*   **Status:** Confirmed Absent (Not on filesystem). This file could not be located at the specified path.
*   **Action:** Mark as potentially unused or deleted. Will verify if any other files attempt to import it.

---
### File: `src/components/Spinner.tsx`

*   **Status:** Confirmed Absent (Not on filesystem). This file could not be located at the specified path. (Similar to `LoadingSpinner.tsx`, `MarkdownRenderer.tsx`, `PanelHeader.tsx`, `ResizablePanels.tsx`, and `Sidebar.tsx`).
*   **Action:** Mark as potentially unused or deleted. Will verify if any other files attempt to import it.

---
### File: `src/components/SystemMessage.tsx`

*   **Status:** Confirmed Absent (Not on filesystem). This file could not be located at the specified path.
*   **Action:** Mark as potentially unused or deleted. Will verify if any other files attempt to import it.

---
### File: `src/components/TabButton.tsx`

*   **Status:** Confirmed Absent (Not on filesystem). This file could not be located at the specified path.
*   **Action:** Mark as potentially unused or deleted. Will verify if any other files attempt to import it.

---
### File: `src/components/TabsPanel.tsx`

*   **Current Filename:** `TabsPanel.tsx`
*   **Proposed New Filename:** `TabsPanel.tsx` (Name is descriptive for its specific implementation.)
*   **Core Functionality Summary:** Renders a theme-aware, horizontal, scrollable panel of tabs with optional close buttons. It automatically scrolls the active tab into view and truncates long filenames.
*   **Key Components and Responsibilities:**
    *   `TabsPanel` (React.FC): Manages display and interaction for a list of tabs.
*   **Internal Dependencies:**
    *   `@/app/types` (for `TabData`)
    *   `./DraggablePanelLayout.css` (for styling)
*   **Internal Dependents:**
    *   `src/components/DraggablePanelLayout.tsx`
    *   `src/components/EnhancedCodePane.tsx`
    *   `src/components/EnhancedAnalysisPane.tsx` (used conditionally)
*   **Key External Library Dependencies:**
    *   `react`
*   **Refactoring Notes/Opportunities:**
    *   **CSS Dependency:** Relies on [`./DraggablePanelLayout.css`](./DraggablePanelLayout.css:0). Evaluate if these styles can be migrated to Tailwind CSS for consistency or if the separate CSS file is necessary.
    *   **Close Button Icon:** Replace the `&times;` text for the close button with an SVG icon (e.g., `XMarkIcon` from Heroicons) for better visual consistency and accessibility.
    *   **Tab Implementation Choice:** This is a custom tab implementation. Compare its features and necessity against `react-tabs` (used in `SecondaryPane.tsx`) and ShadCN UI Tabs (`src/components/ui/tabs.tsx`) to see if consolidation is possible or if this custom version serves a unique, justified purpose (e.g., specific scroll/close behaviors not easily replicated). It appears to be used for a more editor-like tab strip.

---
### File: `src/components/ThemeToggle.tsx`

*   **Status:** Confirmed Absent (Not on filesystem). This file could not be located at the specified path.
*   **Action:** Mark as potentially unused or deleted. Will verify if any other files attempt to import it.

---
### File: `src/components/TopControls.tsx`

*   **Current Filename:** `TopControls.tsx`
*   **Proposed New Filename:** `TopControls.tsx`
*   **Core Functionality Summary:** A major application component serving as the main control bar. It manages WebRTC audio connections (mic/speaker), AI assistant configurations, UI controls (connect, mute, screen capture, view cycle, settings), status displays, and renders `SettingsModal` and `ErrorDialog`. Includes an `AudioLevelMeter` sub-component.
*   **Key Components and Responsibilities:**
    *   `AudioLevelMeter` (Nested FC): Visualizes mic audio levels.
    *   `TopControls` (React.FC, memoized): Handles WebRTC lifecycle, AI interaction setup, UI button actions, status display, and modal triggering.
*   **Internal Dependencies:**
    *   Types: `AppConnectionState`, `TranscriptTurn`, `ComprehensiveCodeSchema` (from `@/types`)
    *   Modules: `connectionManager`, `logger` (from `@/app/api/realtime-assistant-webRTC/webRTCConnectionManager`)
    *   Components: `ErrorDialog.tsx`, `SettingsModal.tsx`
    *   Contexts: `useTheme`, `useStatus`
*   **Internal Dependents:**
    *   `src/app/App.tsx` (Primary usage)
    *   Referenced by `src/components/SettingsModal.tsx` (for reused helper functions - needs refactoring)
    *   Influences layout in `src/components/DraggablePanelLayout.tsx` (height calculation)
*   **Key External Library Dependencies:**
    *   `react`
    *   `next/image`
    *   `uuid`
*   **Refactoring Notes/Opportunities:**
    *   **High Complexity:** This component is very large and handles too many responsibilities. It urgently needs to be broken down into smaller, focused sub-components and custom hooks/services.
        *   Move `AudioLevelMeter` to its own file: `src/components/ui/AudioLevelMeter.tsx`.
        *   Encapsulate WebRTC logic (connection, state, error handling, message processing for mic/speaker) into custom hooks (e.g., `useWebRTCStream`) or a dedicated service.
        *   Extract UI button groups (e.g., main action buttons, status buttons) into separate components.
    *   **Shared Utilities:** Extract duplicated helper functions (e.g., `getStatusColor`, `getStatusButtonStyle`) into a shared utility module (e.g., `src/lib/uiUtils.ts` or `src/utils/styleUtils.ts`).
    *   **Centralize Types:** Move local type definitions (`WebRTCConnectionStatus`, `ErrorState`) to `@/app/types/index.ts`.
    *   **Cleanup Legacy/Placeholders:** Remove commented-out code, "REVERTED FOR NOW" comments, and the redundant placeholder for `SettingsModal` content.
    *   **Device Selection:** Make hardcoded device label checks (e.g., "MacBook Pro Microphone", "BlackHole 2ch") configurable or more robust.
    *   **State Management:** Review `micConnectionStatus` (prop) vs. `speakerConnectionStatus` (local state) for consistency.
    *   **Logo Path:** Consider making `/logo.png` configurable if it might change.

---
### File: `src/components/Transcript.tsx`

*   **Current Filename:** `Transcript.tsx`
*   **Proposed New Filename:** `Transcript.tsx`
*   **Core Functionality Summary:** Renders the main conversation transcript area, including user and assistant messages, and provides the user input field with send and optional screenshot (Electron-only) capabilities. Manages message grouping and display.
*   **Key Components and Responsibilities:**
    *   `Transcript` (React.FC): Displays transcript items from `TranscriptContext`, handles user input, message sending, and Electron-specific screenshot functionality.
*   **Internal Dependencies:**
    *   Types: `TranscriptItem`, `ContentItem` (from `@/types`)
    *   Contexts: `useTranscript`, `useTheme`
    *   Utilities: `capitalizeFirstLetter` (from `@/lib/textUtils`)
*   **Internal Dependents:**
    *   `src/components/DraggablePanelLayout.tsx`
    *   `src/app/App.tsx`
*   **Key External Library Dependencies:**
    *   `react`
    *   `react-markdown`
    *   `next/image`
    *   `lucide-react`
*   **Refactoring Notes/Opportunities:**
    *   **Component Size:** Large component; the rendering logic for transcript items (especially user message grouping and different message types) should be extracted into smaller sub-components (e.g., `UserMessageGroup.tsx`, `AssistantMessageBubble.tsx`, `TranscriptInputBar.tsx`).
    *   **Electron Dependency:** The `window.electronAPI` usage for screenshots is platform-specific. The global type declaration for `window.electronAPI` should be moved to a global `.d.ts` file (e.g., `src/types/electron.d.ts`).
    *   **TranscriptContext Interaction:** The method for adding screenshot messages to the context (`toggleTranscriptItemExpand`) is indirect. The context should ideally have a more explicit `addTranscriptItem` or `addComplexMessage` function.
    *   **Sidekick Feature Removal:** Verify complete removal of all related code, state, and effects.
    *   **Styling:** Review message bubble styling for consistency and visual appeal.

---
### File: `src/components/ViewToggle.tsx`

*   **Current Filename:** `ViewToggle.tsx`
*   **Status:** Deleted
*   **Core Functionality Summary:** (Formerly) A theme-aware component that renders a set of buttons to switch between three predefined application views.
*   **Refactoring Notes/Opportunities:**
    *   This component was confirmed as unused and has been deleted.

---
### File: `src/components/ui/button.tsx`

*   **Status:** Confirmed Absent (Not on filesystem). This file, typically part of a ShadCN UI setup, could not be located.
*   **Action:** Mark as potentially unused, deleted, or never integrated. Will verify if any other files attempt to import it.

---
### File: `src/components/ui/card.tsx`

*   **Status:** Confirmed Absent (Not on filesystem). This file, typically part of a ShadCN UI setup, could not be located.
*   **Action:** Mark as potentially unused, deleted, or never integrated. Will verify if any other files attempt to import it.

---
### File: `src/components/ui/dialog.tsx`

*   **Status:** Confirmed Absent (Not on filesystem). This file, typically part of a ShadCN UI setup, could not be located.
*   **Action:** Mark as potentially unused, deleted, or never integrated. Will verify if any other files attempt to import it.

---
### File: `src/components/ui/dropdown-menu.tsx`

*   **Status:** Confirmed Absent (Not on filesystem). This file, typically part of a ShadCN UI setup, could not be located.
*   **Action:** Mark as potentially unused, deleted, or never integrated. Will verify if any other files attempt to import it.

---
### File: `src/components/ui/input.tsx`

*   **Status:** Confirmed Absent (Not on filesystem). This file, typically part of a ShadCN UI setup, could not be located.
*   **Action:** Mark as potentially unused, deleted, or never integrated. Will verify if any other files attempt to import it.

---
### File: `src/components/ui/label.tsx`

*   **Status:** Confirmed Absent (Not on filesystem). This file, typically part of a ShadCN UI setup, could not be located.
*   **Action:** Mark as potentially unused, deleted, or never integrated. Will verify if any other files attempt to import it.

---
### File: `src/components/ui/resizable.tsx`

*   **Status:** Confirmed Absent (Not on filesystem). This file, which often wraps `react-resizable-panels` in a ShadCN UI setup, could not be located.
*   **Action:** Mark as potentially unused, deleted, or never integrated. The `react-resizable-panels` library is used elsewhere, so this specific wrapper might be missing. Will verify if any other files attempt to import it.

---
### File: `src/components/ui/separator.tsx`

*   **Status:** Confirmed Absent (Not on filesystem). This file, typically part of a ShadCN UI setup, could not be located.
*   **Action:** Mark as potentially unused, deleted, or never integrated. Will verify if any other files attempt to import it.

---
### File: `src/components/ui/sheet.tsx`

*   **Status:** Confirmed Absent (Not on filesystem). This file, typically part of a ShadCN UI setup, could not be located.
*   **Action:** Mark as potentially unused, deleted, or never integrated. Will verify if any other files attempt to import it.

---
### File: `src/components/ui/skeleton.tsx`

*   **Status:** Confirmed Absent (Not on filesystem). This file, typically part of a ShadCN UI setup, could not be located.
*   **Action:** Mark as potentially unused, deleted, or never integrated. Will verify if any other files attempt to import it.

---
### File: `src/components/ui/slider.tsx`

*   **Status:** Confirmed Absent (Not on filesystem). This file, typically part of a ShadCN UI setup, could not be located.
*   **Action:** Mark as potentially unused, deleted, or never integrated. Will verify if any other files attempt to import it.

---
### File: `src/components/ui/tabs.tsx`

*   **Current Filename:** `tabs.tsx`
*   **Proposed New Filename:** `tabs.tsx` (Standard ShadCN UI naming.)
*   **Core Functionality Summary:** Provides the standard ShadCN UI `Tabs`, `TabsList`, `TabsTrigger`, and `TabsContent` components, which are styled wrappers around Radix UI's Tabs primitive for creating accessible tabbed interfaces.
*   **Key Components and Responsibilities:**
    *   `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`: Standard components for building tabbed UIs.
*   **Internal Dependencies:**
    *   `@/lib/utils` (for `cn` utility)
*   **Internal Dependents:**
    *   `src/components/CodePane.tsx` (Confirmed by search)
*   **Key External Library Dependencies:**
    *   `react`
    *   `@radix-ui/react-tabs`
*   **Refactoring Notes/Opportunities:**
    *   This is a standard library component.
    *   **Tab Implementation Consolidation:** The project uses these ShadCN Tabs, a custom `TabsPanel.tsx`, and `react-tabs` (via `SecondaryPane.tsx`). Evaluate if these can be consolidated to a single tab solution for consistency and to reduce redundancy, unless the different implementations serve distinct, justified purposes.

---
### File: `src/contexts/EventContext.tsx`

*   **Current Filename:** `EventContext.tsx`
*   **Proposed New Filename:** `EventContext.tsx`
*   **Core Functionality Summary:** Provides a context for logging client-side and server-side events. Events are persisted in `localStorage` (up to 100 events) and can be cleared. Includes functions to log events and toggle their expanded view.
*   **Key Components and Responsibilities:**
    *   `EventProvider`: Manages event state, `localStorage` interaction, and provides logging/utility functions.
    *   `useEvent`: Custom hook for consuming the context.
*   **Internal Dependencies:**
    *   Type: `LoggedEvent` (from `@/types`, extended locally)
*   **Internal Dependents:**
    *   `src/app/page.tsx` (Provider setup)
    *   `src/components/SettingsModal.tsx` (uses `clearLoggedEvents`)
    *   `src/app/App.tsx` (likely uses logging functions)
*   **Key External Library Dependencies:**
    *   `react`
    *   `uuid`
*   **Refactoring Notes/Opportunities:**
    *   The event log limit (100 events) is hardcoded; consider making it configurable if necessary.
    *   The `LoggedEvent` type in `@/types` now includes `timestampMs`, aligning with this context's usage.
    *   Overall, a well-structured context for its purpose.

---
### File: `src/contexts/StatusContext.tsx`

*   **Current Filename:** `StatusContext.tsx`
*   **Proposed New Filename:** `StatusContext.tsx`
*   **Core Functionality Summary:** Provides a context for managing and sharing various application status indicators, including real-time audio stream statuses (user/speaker), chat processing status, AI assistant status, and the success state of the previous chat interaction.
*   **Key Components and Responsibilities:**
    *   `StatusProvider`: Manages and provides the different status states and their setter functions.
    *   `useStatus`: Custom hook for consuming the context.
*   **Internal Dependencies:** None.
*   **Internal Dependents:**
    *   `src/app/layout.tsx` (Provider setup)
    *   `src/components/TopControls.tsx` (consumes `chatStatus`)
    *   `src/components/Dashboard.tsx` (consumes and sets real-time statuses)
    *   `src/app/App.tsx` (consumes and sets chat/assistant statuses)
*   **Key External Library Dependencies:**
    *   `react`
*   **Refactoring Notes/Opportunities:**
    *   **Status Type:** The `Status` type ('idle', 'processing', 'done', 'error') has been moved to the central types file ([`@/types/index.ts`](src/types/index.ts:0)) and is now imported.
    *   The context is well-structured for its purpose of centralizing status management.

---
### File: `src/contexts/ThemeContext.tsx`

*   **Current Filename:** `ThemeContext.tsx`
*   **Proposed New Filename:** `ThemeContext.tsx`
*   **Core Functionality Summary:** Provides a context for managing the application's theme. Currently, it **enforces a permanent dark theme**. It sets 'dark' in `localStorage`, updates DOM classes and attributes, directly styles the body, dispatches a custom 'themechange' event, and attempts Electron main process sync. The `toggleTheme` function is a no-op.
*   **Key Components and Responsibilities:**
    *   `ThemeProvider`: Initializes and applies the (permanent) dark theme.
    *   `useTheme`: Custom hook for consuming the context.
*   **Internal Dependencies:** None.
*   **Internal Dependents:**
    *   `src/app/layout.tsx` (Provider setup)
    *   Widely used by many components for theme-aware styling, including: `SettingsModal.tsx`, `WindowSwitcher.tsx`, `TopControls.tsx`, `ErrorDialog.tsx`, `Transcript.tsx`, `App.tsx`. (`Dashboard.tsx` was removed).
*   **Key External Library Dependencies:**
    *   `react`
*   **Refactoring Notes/Opportunities:**
    *   **Permanent Dark Theme:** If the dark theme is truly permanent and unchangeable, simplify the context. Remove the `toggleTheme` function (or ensure no components call it, like `Dashboard.tsx` currently does). The `theme` state variable could also be removed if it's always 'dark'.
    *   **Electron API:** The global type declaration for `window.themeAPI` should be moved to a global `.d.ts` file.
    *   The context effectively applies a global dark theme, but the "toggle" aspect is misleading in its current state.

---
### File: `src/contexts/TranscriptContext.tsx`

*   **Current Filename:** `TranscriptContext.tsx`
*   **Proposed New Filename:** `TranscriptContext.tsx`
*   **Core Functionality Summary:** Manages the state of the conversation transcript, storing messages and breadcrumbs. Provides functions to add, update, and manage the display (expand/status) of transcript items. The log is capped at 50 items.
*   **Key Components and Responsibilities:**
    *   `TranscriptProvider`: Manages `transcriptItems` state and provides functions for manipulation.
    *   `useTranscript`: Custom hook for consuming the context.
*   **Internal Dependencies:**
    *   Type: `TranscriptItem` (from `@/app/types`)
*   **Internal Dependents:**
    *   `src/app/page.tsx` (Provider setup)
    *   `src/components/Transcript.tsx` (Displays items, uses `toggleTranscriptItemExpand`)
    *   `src/app/App.tsx` (Adds messages/breadcrumbs, updates items)
*   **Key External Library Dependencies:**
    *   `react`
    *   `uuid`
*   **Refactoring Notes/Opportunities:**
    *   **Transcript Item Limit:** The 50-item limit is hardcoded; consider making it configurable.
    *   **Adding Complex Items:** The `addTranscriptMessage` function is for simple text. A more robust `addTranscriptItem` function is needed to properly handle complex messages (e.g., with images, like the screenshot feature in `Transcript.tsx` attempts). The current use of `toggleTranscriptItemExpand` for this purpose in `Transcript.tsx` is a workaround and should be addressed.
    *   The context is crucial for the application's core conversational UI.

---
### File: `src/hooks/useAssistant.ts`

*   **Status:** Confirmed Absent (Not on filesystem). This file could not be located at the specified path.
*   **Action:** Mark as potentially unused or deleted. Will verify if any other files attempt to import it.

---
### File: `src/hooks/useHandleServerEvent.ts`

*   **Status:** Confirmed Absent (Not on filesystem). This file could not be located at the specified path.
*   **Action:** Mark as potentially unused or deleted. Will verify if any other files attempt to import it.

---
### File: `src/app/lib/assistants/legacyAssistantProcessor.ts`

*   **Status:** To be preserved as per user instruction.
*   **Current Filename:** `legacyAssistantProcessor.ts`
*   **Proposed New Filename:** `legacyAssistantProcessor.ts` (Path: `src/app/lib/assistants/legacyAssistantProcessor.ts`)
*   **Core Functionality Summary:** Manages interaction with a "legacy" OpenAI Assistant. It processes transcript turns by sending them to a backend API, then polls for run completion and adds assistant responses to the transcript. Handles associated state updates (run progress, errors) via callbacks.
*   **Key Functions:**
    *   `pollRunStatus`: Polls for Assistant run status.
    *   `processTranscriptTurnInternal`: Initiates Assistant processing for a transcript turn.
    *   `initializeLegacyAssistantProcessor`: Factory function to create a processor instance with UI state setters.
*   **Internal Dependencies:**
    *   **Internal Dependencies:**
        *   `@/types` (for `TranscriptTurn`, `ErrorState`)
    *   **Internal Dependents:**
        *   Intended to be used by a component managing transcript data and UI state (e.g., `App.tsx` or `TopControls.tsx`).
    *   **Key External Library Dependencies:**
        *   `react` (for types only)
    *   **Refactoring Notes/Opportunities (while preserving file):**
        *   **Preserved but Non-Functional:** This processor is preserved as per user instruction. However, it will remain non-functional because its dependent API routes ([`src/app/api/assistants-api/check-run/route.ts`](src/app/api/assistants-api/check-run/route.ts:0) and [`src/app/api/assistants-api/process-transcript/route.ts`](src/app/api/assistants-api/process-transcript/route.ts:0)) will remain commented out, and the required [`threadManager.ts`](src/app/api/assistants-api/threadManager.ts:0) will not be created/restored.
        *   **Type Duplication Resolved:** The file now imports `TranscriptTurn` and `ErrorState` from the central `@/types`.

---
### File: `src/lib/utils.ts` (provides `cn` function)

*   **Current Filename:** `utils.ts` (Note: Initial list mentioned `src/lib/cn.ts`, but `cn` is typically in `utils.ts`)
*   **Proposed New Filename:** `utils.ts`
*   **Core Functionality Summary:** Exports the `cn` utility function, which combines `clsx` and `tailwind-merge` to intelligently merge Tailwind CSS classes, allowing for conditional and conflicting class resolution.
*   **Key Functions:**
    *   `cn`: Merges class inputs into a final string of Tailwind classes.
*   **Internal Dependencies:** None.
*   **Internal Dependents:**
    *   `src/components/ui/tabs.tsx`
    *   Likely any other ShadCN UI components (many of which were not found).
    *   Potentially custom components needing robust class merging.
*   **Key External Library Dependencies:**
    *   `clsx`
    *   `tailwind-merge`
*   **Refactoring Notes/Opportunities:**
    *   Standard utility, no changes needed to its implementation.
    *   Ensure consistent import path (`@/lib/utils`) where used.

---
### File: `src/lib/codeUtils.ts`

*   **Current Filename:** `codeUtils.ts`
*   **Proposed New Filename:** `codeUtils.ts`
*   **Core Functionality Summary:** Provides utility functions for code manipulation. Currently includes `preprocessCode` which moves inline `#` comments to their own line for better readability.
*   **Key Functions:**
    *   `preprocessCode(code: string): string`: Reformats code by moving inline comments.
*   **Internal Dependencies:** None.
*   **Internal Dependents:**
    *   `src/components/EnhancedCodePane.tsx`
    *   `src/components/CodePane.tsx`
*   **Key External Library Dependencies:** None.
*   **Refactoring Notes/Opportunities:**
    *   The `preprocessCode` function is specific to `#` comments (Python-style). If support for other comment types (e.g., `//`, `/* */`) is needed, the function would require enhancements or new related functions.
    *   The module is well-focused on code utilities.

---
### File: `src/lib/logger.ts`

*   **Status:** Confirmed Absent (Not on filesystem). This file could not be located at the specified path.
*   **Notes:** A `logger` instance is defined and exported from `src/app/api/realtime-assistant-webRTC/webRTCConnectionManager.ts`. This might be the primary logger used in the parts of the application that import it from there. If a general-purpose logger was intended for `src/lib/logger.ts`, it was either not created or has been removed.
*   **Action:** Mark as potentially unused or deleted. Verify if any files attempt to import specifically from ` '@/lib/logger'`. If all logger uses trace back to `webRTCConnectionManager.ts`, then this separate file is indeed not used.

---
### File: `src/lib/textUtils.ts`

*   **Current Filename:** `textUtils.ts`
*   **Proposed New Filename:** `textUtils.ts`
*   **Core Functionality Summary:** Provides text manipulation utility functions. Includes `capitalizeFirstLetter` and `getNameInitials`.
*   **Key Functions:**
    *   `capitalizeFirstLetter(text: string): string`: Capitalizes the first letter of a string.
    *   `getNameInitials(name: string): string`: Extracts initials from a name.
*   **Internal Dependencies:** None.
*   **Internal Dependents:**
    *   `capitalizeFirstLetter`: Used in `src/components/Transcript.tsx`.
    *   `getNameInitials`: **Removed.** This function was confirmed as unused and has been deleted from the file.
*   **Key External Library Dependencies:** None.
*   **Refactoring Notes/Opportunities:**
    *   The `getNameInitials` function was confirmed to be already removed.
    *   The module is otherwise well-focused.

---
### File: `src/app/App.tsx`

*   **Current Filename:** `App.tsx`
*   **Proposed New Filename:** `App.tsx`
*   **Core Functionality Summary:** The main application component, orchestrating UI and core logic. It manages application state (connections, mute, tabs, etc.), handles WebRTC events, and processes AI responses (including streaming and function calls) to update the UI (transcript and dynamic tabs). It's structured with an `App` wrapper for logic/state and an `AppContent` inner component for rendering.
*   **Key Functions/Responsibilities:**
    *   `App`: Manages global client-side state, WebRTC triggers, and the complex `handleProcessTurn` callback.
    *   `AppContent`: Renders `TopControls` and `DraggablePanelLayout`, receiving state/handlers from `App`.
    *   `handleProcessTurn`: Critical callback for processing real-time events, making API calls to `/api/responses`, parsing streamed/JSONL responses, handling function calls, and dynamically updating UI tabs and transcript.
*   **Internal Dependencies:**
    *   UI Components: `Transcript.tsx`, `TopControls.tsx`, `DraggablePanelLayout.tsx`
    *   Types: `AgentConfig`, `AppConnectionState`, `TranscriptItem`, `TranscriptTurn`, `TabData` (from `@/types`). Local types: `StarData`, `WebRTCConnectionStatus`, `LocalTabData`.
    *   Contexts: `useTranscript`, `useEvent`, `useStatus`, `useTheme`.
    *   Modules: `logger` (from `@/app/api/realtime-assistant-webRTC/webRTCConnectionManager`).
*   **Internal Dependents:**
    *   Rendered by `src/app/page.tsx`.
*   **Key External Library Dependencies:**
    *   `react`, `next/navigation`, `uuid`, `next/image`, `eventsource-parser` (usage unconfirmed).
*   **Refactoring Notes/Opportunities:**
    *   **Extreme Complexity:** The `App` component, especially `handleProcessTurn`, is overly complex and long. This is the highest priority for refactoring.
        *   **Extract `handleProcessTurn`:** Move its logic into dedicated service modules or custom hooks for API interaction, stream parsing, and tab/transcript state management.
        *   **Tab State Management:** Encapsulate tab-related state (`activeTabKey`, `tabData`, etc.) into a custom hook or context.
        *   **API Service Layer:** Abstract `fetch` calls into a dedicated API service.
    *   **Centralize Types:** Move local type definitions (`StarData`, `WebRTCConnectionStatus`, `LocalTabData`) to `@/app/types/index.ts`.
    *   **`eventsource-parser`:** Confirm usage or remove import.
    *   **Improve Readability & Modularity:** Break down large functions and consider more specialized hooks/components.

---
### File: `src/app/globals.css`

*   **Current Filename:** `globals.css`
*   **Proposed New Filename:** `globals.css`
*   **Core Functionality Summary:** Defines global styles, including Tailwind CSS setup, custom utilities, CSS custom properties for theming (multiple definitions exist), ShadCN UI base theme variables, base body styles, mobile-responsive styles, and custom animations.
*   **Key Features:** Tailwind integration, CSS variable-based theming, responsive design elements.
*   **Internal Dependencies:** None.
*   **Internal Dependents:**
    *   Imported by `src/app/layout.tsx`.
    *   Provides global styling for the entire application.
*   **Key External Library Dependencies:**
    *   Tailwind CSS.
*   **Refactoring Notes/Opportunities:**
    *   **Theme Variable Consolidation:** Critical. Multiple conflicting/redundant definitions of theme variables (custom, `.light`/`.dark` classes, `@media (prefers-color-scheme: dark)`, ShadCN UI `@layer base`). Standardize on one approach, likely ShadCN's CSS variables, especially since the app is locked to dark theme.
    *   **Unused Mobile Styles:** Styles for `.mobile-swipe-container` and related classes might be unused if `MobileSwipeContainer.tsx` is removed.
    *   **Global Transitions:** The `html * { transition: ... }` rule is too broad and may impact performance. Apply transitions selectively.
    *   **Body Background:** The `body` background uses `--background-start-rgb` and `--background-end-rgb` which are not defined. This needs to be fixed or updated to use the current theme's `--background` variable.
    *   **Organization:** Improve organization within the file for better readability.

---
### File: `src/app/layout.tsx`

*   **Current Filename:** `layout.tsx`
*   **Proposed New Filename:** `layout.tsx`
*   **Core Functionality Summary:** The root Next.js layout component. It sets up the HTML document structure, imports global CSS, and wraps children with `ThemeProvider` and `StatusProvider`. Includes an inline `ThemeInitScript` to apply an initial theme (from `localStorage` or system preference) to prevent FOUC, though `ThemeContext` currently overrides this to enforce a permanent dark theme.
*   **Key Components and Responsibilities:**
    *   `metadata`: Application metadata.
    *   `ThemeInitScript`: Inline script for initial theme application.
    *   `RootLayout`: Main layout component, sets up context providers.
*   **Internal Dependencies:**
    *   `./globals.css`
    *   `../contexts/ThemeContext`
    *   `../contexts/StatusContext`
*   **Internal Dependents:**
    *   Root component for all pages.
*   **Key External Library Dependencies:**
    *   `next`
    *   `react`
*   **Refactoring Notes/Opportunities:**
    *   **Theme Logic Discrepancy:** `ThemeInitScript` tries to apply a theme from `localStorage`/system preference, but `ThemeContext` currently forces a permanent dark theme. If dark theme is permanent, simplify `ThemeInitScript` to only apply dark theme.
    *   **Viewport Meta:** Re-evaluate `user-scalable=no` for accessibility.
    *   **Import Paths:** Consider using path aliases for context imports (e.g., `@/contexts/...`) for consistency.

---
### File: `src/app/page.tsx`

*   **Current Filename:** `page.tsx`
*   **Proposed New Filename:** `page.tsx`
*   **Core Functionality Summary:** The main page component for the application. It sets up essential context providers (`ErrorBoundary`, `TranscriptProvider`, `EventProvider`) and uses `React.Suspense` with a `LoadingFallback` to render the main `App` component.
*   **Key Components and Responsibilities:**
    *   `LoadingFallback`: Displays a loading UI.
    *   `Page`: Wraps the `App` component with context providers and Suspense.
*   **Internal Dependencies:**
    *   `./App`
    *   `../components/ErrorBoundary`
    *   `@/contexts/TranscriptContext`
    *   `@/contexts/EventContext`
*   **Internal Dependents:**
    *   Entry point for the root route.
*   **Key External Library Dependencies:**
    *   `react`
*   **Refactoring Notes/Opportunities:**
    *   The provider setup and use of Suspense are standard and appropriate.
    *   Consider using path aliases for the `ErrorBoundary` import for consistency.

---
### File: `src/app/api/assistants-api/check-run/route.ts`

*   **Current Filename:** `route.ts`
*   **Proposed New Filename:** `route.ts`
*   **Status:** **Effectively Unused/Disabled.** The entire functional code is commented out.
*   **Original Core Functionality (Commented Code):** A Next.js API route (`GET`) designed to check the status of an OpenAI Assistant run using `threadId` and `runId`. If complete, it would fetch and return the latest assistant message.
*   **Current Functionality:** None.
*   **Internal Dependencies (Commented Code):**
    *   `next/server`
    *   `checkRunStatus`, `getThreadMessages` (from `../threadManager` - likely `src/app/api/assistants-api/threadManager.ts`)
*   **Internal Dependents:**
    *   The client-side `pollRunStatus` function in `src/app/lib/assistants/legacyAssistantProcessor.ts` (which is to be preserved) relies on this endpoint.
*   **Refactoring Notes/Opportunities:**
    *   **Status Update:** As per user instruction, this route will remain commented out and non-functional to preserve the `legacyAssistantProcessor.ts` in its current (non-functional) state without further code modification to this API.

---
### File: `src/app/api/assistants-api/process-transcript/route.ts`

*   **Current Filename:** `route.ts`
*   **Proposed New Filename:** `route.ts`
*   **Status:** **Effectively Unused/Disabled.** The entire functional code is commented out.
*   **Original Core Functionality (Commented Code):** A Next.js API route (`POST`) designed to receive microphone and speaker transcripts. It would add these to an OpenAI Assistant thread (creating one if necessary) and then create a run with a specified assistant.
*   **Current Functionality:** None.
*   **Internal Dependencies (Commented Code):**
    *   `next/server`
    *   `getOrCreateThread`, `addMessageToThread`, `createRun` (from `../threadManager` - likely `src/app/api/assistants-api/threadManager.ts`)
*   **Internal Dependents:**
    *   The client-side `processTranscriptTurnInternal` function in `src/app/lib/assistants/legacyAssistantProcessor.ts` (which is to be preserved) relies on this endpoint.
*   **Refactoring Notes/Opportunities:**
    *   **Status Update:** As per user instruction, this route will remain commented out and non-functional to preserve the `legacyAssistantProcessor.ts` in its current (non-functional) state without further code modification to this API.

---
### File: `src/app/api/assistants-api/threadManager.ts`

*   **Status:** Confirmed Absent (Not on filesystem). This file, which was expected to provide functions for managing OpenAI Assistant threads (e.g., `checkRunStatus`, `getOrCreateThread`), could not be located.
*   **Notes:** This file is a critical missing dependency for the (currently commented-out) API routes:
    *   `src/app/api/assistants-api/check-run/route.ts`
    *   `src/app/api/assistants-api/process-transcript/route.ts`
*   **Impact:** Its absence means that the `legacyAssistantProcessor.ts` flow, which depends on these API routes, is non-functional.
*   **Action:** As per user instruction, this file will not be created/restored. The `legacyAssistantProcessor.ts` and its dependent API routes will remain preserved but non-functional.

---
### File: `src/app/api/assistants-api/types.ts`

*   **Current Filename:** `types.ts`
*   **Proposed New Filename:** `types.ts` (Consider `openaiAssistantsTypes.ts` for more specificity if this API route group were more active/complex).
*   **Core Functionality Summary:** Defines TypeScript interfaces for data structures related to the OpenAI Assistants API, such as `Thread`, `ThreadMessage`, `MessageContent`, and `Run`.
*   **Key Interfaces:** `Thread`, `ThreadMessage`, `MessageContent`, `Run`.
*   **Internal Dependencies:** None.
*   **Internal Dependents:**
    *   Would be used by the (currently missing) `threadManager.ts` and the (currently commented-out) API routes within `src/app/api/assistants-api/`.
*   **Key External Library Dependencies:** None.
*   **Refactoring Notes/Opportunities:**
    *   The types are specific to the OpenAI Assistants API and are logically placed.
    *   Ensure these types are consistent with the version of the OpenAI API being targeted if the legacy flow is revived.
    *   The use of `any` for some fields is acceptable but could be narrowed if specific structures are known and beneficial for type safety.

---
### File: `src/app/api/code-question/route.ts`

*   **Current Filename:** `route.ts`
*   **Proposed New Filename:** `route.ts`
*   **Core Functionality Summary:** A Next.js API route (`POST`) that accepts a text question and a base64 PNG image (screenshot of code). It sends this data to OpenAI's `gpt-4o-mini` model for analysis and returns the model's textual response.
*   **Key Steps:** Parses input, validates, constructs OpenAI payload, calls the Chat Completions API with vision capability, and returns the response.
*   **Internal Dependencies:**
    *   Type: `ComprehensiveCodeSchema` (from `@/types`)
*   **Internal Dependents:**
    *   Called by `handleScreenCapture` in `src/components/TopControls.tsx`.
*   **Key External Library Dependencies:**
    *   `next/server`
    *   `openai`
*   **Refactoring Notes/Opportunities:**
    *   The route is functional for its purpose.
    *   Consider more structured logging for production instead of direct `console.log`.
    *   For production, implement appropriate security measures (auth, rate limiting) if necessary.
    *   Input validation could be enhanced with a library like Zod if payload complexity increases.

---
### File: `src/app/api/realtime-assistant-webRTC/webRTCConnectionManager.ts`

*   **Current Filename:** `webRTCConnectionManager.ts`
*   **Proposed New Filename:** `webRTCConnectionManager.ts`
*   **Core Functionality Summary:** Manages WebRTC connections for real-time audio streaming and event handling, likely with OpenAI's Realtime API. It includes a logger, fetches ephemeral tokens, establishes peer connections, handles SDP offer/answer, manages data channels, and provides callbacks for messages, state changes, and errors. Implements a basic reconnection mechanism.
*   **Key Exports:**
    *   `logger`: A simple logging utility.
    *   `connectionManager`: The main object for managing WebRTC connections.
*   **Internal Dependencies:** None (relies on browser WebRTC APIs).
*   **Internal Dependents:**
    *   `src/components/TopControls.tsx` (primary consumer for mic/speaker streams).
*   **Key External Library Dependencies:** None.
*   **Refactoring Notes/Opportunities:**
    *   **Remove Placeholder Logic:** The "Frontend Integration Logic Placeholder" (lines 310-354) within the `dc.onmessage` handler is commented-out example code and should be removed to avoid confusion. The actual message handling is done via callbacks.
    *   **Configuration:** Connection parameters (URLs, retry logic) are hardcoded; consider making them configurable if deployment environments vary.
    *   The module is complex due to WebRTC's nature but appears to handle the core aspects of connection lifecycle and data exchange.

---
### File: `src/app/api/realtime-token/route.ts`

*   **Current Filename:** `route.ts`
*   **Proposed New Filename:** `route.ts`
*   **Core Functionality Summary:** A Next.js API route (`POST`) that generates an ephemeral client token (`client_secret`) for OpenAI's Realtime API. It achieves this by creating an OpenAI Realtime Session, using parameters derived from the request's `sessionType` ('mic' or 'speaker') and an optional `sessionConfig` from the client.
*   **Key Steps:** Initializes OpenAI client, parses request, merges session parameters (base, type-specific, client-provided), creates an OpenAI Realtime Session, and returns the `client_secret`.
*   **Internal Dependencies:** None (beyond OpenAI SDK).
*   **Internal Dependents:**
    *   Called by `fetchEphemeralToken` in `src/app/api/realtime-assistant-webRTC/webRTCConnectionManager.ts`.
*   **Key External Library Dependencies:**
    *   `next/server`
    *   `openai`
*   **Refactoring Notes/Opportunities:**
    *   The logic for merging session configurations is robust.
    *   The default fallback to `sessionType = 'mic'` if unspecified should be confirmed as the desired behavior.
    *   Consider structured logging for production.
    *   Ensure appropriate security measures for a production API endpoint.

---
### File: `src/app/api/responses/route.ts`

*   **Current Filename:** `route.ts`
*   **Proposed New Filename:** `route.ts`
*   **Core Functionality Summary:** A highly complex Next.js API route (`POST`) that serves as the primary backend for generating AI responses. It manages conversation context (in-memory), classifies question types, detects follow-ups, dynamically selects OpenAI models and tools (defined via Zod schemas), calls the OpenAI Responses API with streaming, processes the JSONL stream, and saves context.
*   **Key Features:** Zod-based tool schemas, in-memory context, question classification, dynamic model/tool selection, streaming JSONL response.
*   **Internal Dependencies:** None (primarily uses OpenAI SDK and Zod).
*   **Internal Dependents:**
    *   Called by `src/app/App.tsx` (`handleProcessTurn`).
*   **Key External Library Dependencies:**
    *   `next/server`, `zod`, `zod-to-json-schema`, `openai`.
*   **Refactoring Notes/Opportunities:**
    *   **Extreme Complexity & Size:** This file is too large and handles too many concerns. It's the top priority for refactoring into smaller, focused modules/services:
        *   Extract context management (currently in-memory `Map`).
        *   Extract question classification and follow-up detection logic.
        *   Extract OpenAI API interaction logic (prompt engineering, tool/model selection, stream processing).
        *   Move Zod schemas and tool definitions to a separate file (e.g., `src/lib/aiTools.ts` or within this API route's directory).
    *   **In-Memory Context:** For production, replace the in-memory `conversationContextStore` with a persistent solution (e.g., Redis, database).
    *   **Edge Runtime:** Evaluate if edge runtime (currently commented out) is desired and feasible with the current logic (especially context store).
    *   **Configuration:** Centralize or make configurable hardcoded model names.
    *   **Logging:** Replace extensive `console.log` with a structured logger.

---
### File: `src/types/index.ts`

*   **Current Filename:** `index.ts`
*   **Proposed New Filename:** `index.ts`
*   **Core Functionality Summary:** Central type definitions for the application. Includes interfaces for transcript items, UI tabs, AI response structures, agent configurations, event logs, and various status/error states.
*   **Key Interfaces/Types:** `TranscriptTurn`, `TranscriptItem`, `ErrorState`, `AppConnectionState`, `TabData`, `AnalysisResponse`, `BehavioralStarResponse`, `AgentConfig`, `ServerEvent`, `LoggedEvent`, `ComprehensiveCodeSchema`.
*   **Internal Dependencies:** None.
*   **Internal Dependents:** Widely imported across the application by components, contexts, API routes, and utility modules using the `@/types` alias.
*   **Key External Library Dependencies:** None.
*   **Refactoring Notes/Opportunities:**
    *   **`Log` type:** Removed as it was unused.
    *   **`LoggedEvent` update:** The `LoggedEvent` interface now includes `timestampMs: number;` for consistency with `EventContext.tsx`.
    *   **Comment Cleanup:** The comment `// Types from src/app/types.ts` (formerly line 70) has been updated to `// Shared application type definitions`.
    *   Verify the structure of `ServerEvent` against actual server payloads.
    *   This file is crucial for type safety and should be kept accurate and well-organized.

---
### File: `tailwind.config.ts` (Root Directory)

*   **Current Filename:** `tailwind.config.ts`
*   **Proposed New Filename:** `tailwind.config.ts`
*   **Core Functionality Summary:** Configures Tailwind CSS, including content paths for class scanning, dark mode strategy (class-based), theme extensions using CSS custom properties (ShadCN UI style), and plugins (`tailwindcss-animate`, `@tailwindcss/typography`).
*   **Key Configuration:** Content paths, dark mode, theme extensions, plugins.
*   **Internal Dependencies:** None.
*   **Internal Dependents:**
    *   Used by the Tailwind CSS build process.
    *   Defines CSS variable names (e.g., `--background`) whose values are set in `src/app/globals.css`.
*   **Key External Library Dependencies:**
    *   `tailwindcss`, `tailwindcss-animate`, `@tailwindcss/typography`.
*   **Refactoring Notes/Opportunities:**
    *   The configuration is standard for a Tailwind CSS project with ShadCN UI.
    *   The `darkMode` setting has been simplified from `['class', "class"]` to `'class'`.
    *   Ensure content paths are comprehensive.

---
### File: `tsconfig.json` (Root Directory)

*   **Current Filename:** `tsconfig.json`
*   **Proposed New Filename:** `tsconfig.json`
*   **Core Functionality Summary:** TypeScript compiler configuration for the Next.js project. It defines compiler options (target, libraries, module system, strictness, JSX handling, etc.), path aliases (`@/*` for `./src/*`), and include/exclude patterns.
*   **Key Configuration:** Compiler options, path aliases, include/exclude.
*   **Internal Dependencies:** None.
*   **Internal Dependents:**
    *   Used by TypeScript compiler and Next.js build process.
*   **Key External Library Dependencies:**
    *   `typescript`.
*   **Refactoring Notes/Opportunities:**
    *   The configuration is standard for a Next.js project.
    *   **Enforce Path Alias Usage:** The path alias `@/*` is defined. Ensure consistent use of this alias for imports from `src/` throughout the project, replacing relative paths (e.g., `../`) where appropriate. For example, context imports in `src/app/layout.tsx` should use `@/contexts/...`.

---
### Documentation Consolidation Plan

*   **Source Directories:** `docs/`, `project-documentation/`
*   **Target Directory:** `docs/`
*   **Files in `docs/`:**
    *   `codebase_analysis.md`
    *   `Conversation state - OpenAI API.pdf`
    *   `directory_map.md`
    *   `dual-pane-ui-design.md`
    *   `Function calling - OpenAI API.pdf`
    *   `implementation_analysis.md`
    *   `Latency optimization - OpenAI API.pdf`
    *   `MACOS_WRAPPER_PLAN.md`
    *   `README.md` (Assumed to be docs-specific; if it's the main project README, it should be moved to the project root later.)
    *   `realtime-optimization-prd.md`
    *   `realtimeDoc.pdf`
    *   `Reasoning models - OpenAI API.pdf`
    *   `setup_notes.txt`
    *   `Streaming API responses - OpenAI API.pdf`
    *   `streaming_responAPI.pdf`
    *   `streaming_responAPI.txt`
    *   `Structured Outputs - OpenAI API.pdf`
    *   `Text generation and prompting - OpenAI API.pdf`
*   **Subdirectories in `docs/`:**
    *   `docs/guides/connect-webrtc.png` (Will remain as is)
    *   `docs/scripts-documentation/README.md` (Path updated after rename)
*   **Actions:**
    1.  Confirm `docs/` as the single top-level documentation directory.
    2.  Rename `docs/scripts/` to `docs/scripts-documentation/`. (Completed).
    3.  The `project-documentation/` directory was confirmed absent (not on filesystem).

---