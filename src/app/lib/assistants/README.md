# Legacy OpenAI Assistants API Processor

This directory contains the code previously used in `TopControls.tsx` to interact with the OpenAI Assistants API (`process-transcript` and `check-run` endpoints).

It processes completed `TranscriptTurn` objects (containing user mic input and/or system speaker output) by sending them to the backend API, creating an assistant run, and polling for its completion.

## Status

**Disconnected:** This logic is currently not active in the application.

## Reconnecting This Logic

To re-enable this Assistants API processing:

1.  **Uncomment State in `TopControls.tsx`:**
    *   Find the `useState` calls for `assistantRunInProgress` and `currentRunInfo` (around lines 208-209) and uncomment them.

2.  **Initialize the Processor in `TopControls.tsx`:**
    *   Import the initializer: `import { initializeLegacyAssistantProcessor } from '../lib/assistants/legacyAssistantProcessor';`
    *   Inside the `TopControls` component, likely near the top or before the `useEffect` hook, initialize it by passing the required state setters and callbacks:
        ```typescript
        const legacyAssistantProcessor = useMemo(() => {
          return initializeLegacyAssistantProcessor({
            addTranscriptMessage,
            setErrorState, // Ensure setErrorState is available in scope
            setAssistantRunInProgress, // The state setter you just uncommented
            setCurrentRunInfo,       // The state setter you just uncommented
          });
          // Add necessary dependencies to useMemo, e.g., [addTranscriptMessage, setErrorState]
        }, [addTranscriptMessage, setErrorState]);
        ```

3.  **Uncomment and Update the `useEffect` Hook in `TopControls.tsx`:**
    *   Find the commented-out `useEffect` hook responsible for processing transcript turns (around line 732).
    *   Uncomment the entire block.
    *   Replace the placeholder line `processTranscriptTurn(transcriptTurn)` with a call to the initialized processor: `legacyAssistantProcessor.processTranscriptTurn(transcriptTurn)`.
    *   Ensure the dependencies array for the `useEffect` includes `legacyAssistantProcessor`, `transcriptTurn`, and `assistantRunInProgress`:
        ```typescript
        }, [transcriptTurn, assistantRunInProgress, legacyAssistantProcessor]);
        ```

4.  **Verify API Endpoints:** Ensure the backend API routes (`/api/assistants-api/process-transcript` and `/api/assistants-api/check-run`) are still deployed and functional.

**Note:** If type definitions for `TranscriptTurn` or `ErrorState` were successfully moved to a central file (`src/app/types/index.ts`) later, you might need to adjust imports in both `TopControls.tsx` and `legacyAssistantProcessor.ts` accordingly. 