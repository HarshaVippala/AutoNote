# Realtime API WebRTC Connection Progress

## Goal
Connect to OpenAI Realtime API using WebRTC from a client-side application (browser/Electron) securely, handling dual audio streams (user microphone and system/speaker output).

## Progress So Far

1.  **Problem Identified:** Initial attempts using WebSockets directly from the client with a standard API key failed (403 Unauthorized).
2.  **Approach Decided:** Switched to using **WebRTC** for the connection, authenticated via **ephemeral tokens** generated securely on the backend.
3.  **Backend Implemented:** Created a **Next.js API route (`/api/realtime-token/route.ts`)** to securely generate ephemeral tokens using the main `OPENAI_API_KEY` from environment variables.
4.  **Connection Manager Created:** Refactored client-side WebRTC logic into a `connectionManager` object within `src/app/api/realtime-assistant-webRTC/webRTCConnection-webRTC.ts` capable of handling multiple named connections (e.g., 'mic', 'speaker'). Handles token fetching, `RTCPeerConnection` setup, data channels, SDP exchange, state tracking, and callbacks.
5.  **UI Integration (`TopControls.tsx`):**
    *   Added 'I' (Input/Mic) and 'O' (Output/Speaker) buttons.
    *   Wired buttons to use `connectionManager.connect()` and `connectionManager.disconnect()` via `App.tsx` triggers.
    *   Added Mute/Unmute button controlling the mic track's enabled state.
6.  **Centralized Connection Control (`App.tsx`):**
    *   `App.tsx` uses triggers (`connectTrigger`, `disconnectTrigger`) to tell `TopControls.tsx` when to initiate/terminate connections via the `connectionManager`.
    *   `App.tsx` derives its main `connectionState` from the status reported by the mic connection.
7.  **Debugging:** Resolved issues related to callback handling, incorrect token usage (401 errors), infinite render loops (`Maximum update depth exceeded` by using `useCallback` in `TranscriptContext`), and button click handlers.
8.  **Identified Sample Rate Mismatch:** Required OpenAI Realtime API **24kHz** sample rate identified as potential issue.
9.  **Implemented Audio Resampling:** Created an `AudioWorkletProcessor` (`resampling-processor.ts`) using linear interpolation to resample input audio streams (mic and speaker) to the required 24kHz. Integrated into `TopControls.tsx` using the Web Audio API.
10. **Speaker Audio Capture:** Updated 'speaker' connection to use `navigator.mediaDevices.getDisplayMedia({ audio: true })`.
11. **Mic Transcription Issue:** Observed that while speaker transcripts were received, mic transcripts were not, despite the connection establishing successfully.
12. **Root Cause Identified:** Issue traced to using a macOS Aggregate Audio Device ("Mixed Input") as the default mic source. This likely interfered with OpenAI's VAD or audio processing.
13. **FIXED Mic Transcription:** Modified `TopControls.tsx` to explicitly enumerate audio input devices and request the specific `deviceId` for the physical "MacBook Pro Microphone", bypassing the aggregate device. This successfully enabled mic transcription.
14. **Confirmed Dual Transcripts:** Verified via logging that both 'mic' and 'speaker' connections now successfully receive transcript messages (`response.audio_transcript.delta`, `response.audio_transcript.done`) over their respective data channels.
15. **Implemented Session Config Passing:** Updated `connectionManager.connect` to accept and properly pass session configuration objects to the Realtime API, using different configs for 'mic' and 'speaker' connections.
16. **Implemented Speaker->Mic Context Injection:** Enhanced `handleSpeakerMessage` in `TopControls.tsx` to capture the final speaker transcript and inject it into the mic session's context via a `conversation.item.create` event.
17. **Implemented Auxiliary Assistant Response Handling:** Updated `handleMicMessage` in `TopControls.tsx` to process and display text responses (`response.text.delta`) from the auxiliary assistant.
18. **Assistants API Integration:**
    * Created a `threadManager.ts` module to handle Thread creation, message addition, run creation, and status polling.
    * Implemented API routes (`/api/assistants-api/process-transcript`, `/api/assistants-api/check-run`) to handle transcript processing and run status checking.
    * Added transcript collection and processing in `TopControls.tsx` to send completed 'mic' and 'speaker' transcripts to the Assistants API.
    * Implemented polling for run completion and displaying the main assistant's response.
19. **Refined Turn Detection:**
    * Optimized the `silence_duration_ms` in the mic session config from 700ms to 600ms for faster response.
    * Improved handling of turn detection to provide better user experience.
20. **Enhanced UI Integration:**
    * Improved visual differentiation between auxiliary ("Aux") and main ("Assistant") responses.
    * Added color coding and labels to make the source of each response immediately clear.
    * Added a visual indicator for Assistant API run status with an animated "Processing..." badge.
21. **Improved Error Handling and Resilience:**
    * Implemented reconnection logic in the `connectionManager` to handle dropped WebRTC connections.
    * Added automatic retry mechanism with configurable retry attempts and delay.
    * Enhanced error reporting and state management during connection failures.
22. **UX Improvements:**
    * Added visual feedback for microphone levels with an `AudioLevelMeter` component.
    * Enhanced visibility of connection status with clearer indicators.
    * Improved response visualization to clearly distinguish between quick auxiliary responses and more comprehensive main assistant responses.

## Key Decisions

*   Use WebRTC, not WebSockets, for client-side Realtime API connection.
*   Use ephemeral tokens for authentication, generated via a secure backend proxy.
*   Leverage Next.js API routes for the backend proxy.
*   Use a centralized `connectionManager` to handle multiple WebRTC streams.
*   Drive connection initiation from `App.tsx` via triggers passed to `TopControls.tsx`.
*   Resample all audio input to 24kHz using an AudioWorklet.
*   **Explicitly request the physical microphone device ID** in `getUserMedia` to avoid issues with aggregate/virtual devices.
*   Use `getDisplayMedia` for speaker audio capture.
*   Use different session configurations for 'mic' and 'speaker' connections:
    * 'Mic' uses `gpt-4o-mini` with text responses enabled for auxiliary assistance.
    * 'Speaker' is transcription-only with no assistant responses.
*   Implement speaker-to-mic context injection using `conversation.item.create` to inform the auxiliary assistant about the speaker transcript.
*   Use the Assistants API for the main, context-aware responses while the Realtime API provides immediate, auxiliary responses.
*   Implement automated reconnection logic with configurable retry attempts for resilience.
*   Provide visual differentiation between auxiliary and main assistant responses to improve user understanding.

## Updated Architecture Overview

*   **'Mic' Stream Role (Realtime):**
    *   Transcribes user speech (`response.audio_transcript.delta`).
    *   Uses `gpt-4o-mini` (via `micSessionConfig_AuxAssistant`) to provide **immediate, auxiliary** text responses (`response.text.delta`) based on the *ongoing* user utterance and injected speaker context.
    *   Its responses are fast but contextually limited compared to the main Assistant.

*   **'Speaker' Stream Role (Realtime):**
    *   Functions primarily as a transcriber for system audio output (`speakerSessionConfig_Transcription`). Does *not* generate responses.

*   **Context Injection (Realtime):**
    *   Captures the **final** transcript from the 'speaker' stream (`response.audio_transcript.done`).
    *   Injects it into the 'mic' stream's conversation context using the `conversation.item.create` client event.
    *   This ensures the auxiliary assistant is aware of recent speaker audio when responding to the user.

*   **Main Assistant API Role (Asynchronous):**
    *   Provides the primary, detailed, context-aware responses.
    *   Uses an **Assistants API Thread** to maintain conversation history.
    *   Process:
        1.  Captures *finalized* transcripts from both 'mic' and 'speaker' realtime sessions.
        2.  Adds these transcripts as messages to the Assistant thread.
        3.  Creates a Run on the thread.
        4.  Retrieves and displays the Assistant's response *after* the Run completes.

## Next Steps

1. **Further UI Refinements:**
   * Consider adding keyboard shortcuts for common actions (connect, disconnect, mute).
   * Implement a clearer visual distinction for the connection state (connecting, connected, disconnected).
   * Add tooltips and help text for new users.

2. **Performance Optimization:**
   * Further optimize the resampling worklet performance.
   * Implement token caching to reduce backend calls.
   * Add debouncing for transcript processing to avoid unnecessary API calls.

3. **Robust Error Handling:**
   * Add more detailed error messages and recovery options.
   * Implement user-facing error notifications with retry options.
   * Add logging and telemetry to track and analyze connection issues.

4. **Feature Enhancements:**
   * Consider adding support for interrupt capability when the auxiliary assistant is responding.
   * Explore options for text-based input as an alternative to voice.
   * Add support for additional audio sources beyond microphone and system audio.
   * Implement a queue system for handling multiple concurrent requests.
   * Consider adding support for multimedia responses from the assistant.

## Session Configurations (Clarified Roles)

**'Mic' Stream Config (`micSessionConfig_AuxAssistant`):**
```javascript
{
  model: "gpt-4o-mini-realtime-preview-2024-12-17", // Use Mini for fast, auxiliary responses
  modalities: ["text"],                           // Disable audio output cost, only text response needed
  instructions: `You are an auxiliary assistant providing immediate, concise information based ONLY on the user's LATEST utterance and the conversation history. The history may include messages labeled 'SYSTEM_AUDIO_TRANSCRIPT' representing what the system/speaker just said.
DO NOT engage in lengthy conversation (no greetings, apologies, or excessive filler).
DO NOT ask clarifying questions.
FOCUS on providing relevant factual snippets or definitions related to the user's topic or the preceding SYSTEM_AUDIO_TRANSCRIPT.
If the user sounds hesitant (umm, hmm, uh), proactively offer a brief, relevant suggestion based on the preceding topic.
Keep responses very short. Your response comes BEFORE the main assistant has a chance to reply.`,
  temperature: 0.5, // Lower temp for more factual responses

  input_audio_transcription: {
    model: "gpt-4o-transcribe",
    language: "en",
    prompt: "This is a technical discussion about software development, system design, data structures, algorithms, and related technologies. Expect technical jargon. Include filler words like umm, uh, hmm.",
  },

  turn_detection: { // Server VAD triggers auxiliary response generation
    type: "server_vad",
    silence_duration_ms: 600, // Optimized from 700ms for faster response
    create_response: true,   // Enable response generation
    interrupt_response: false // Keep false unless interruption is desired
  },
  // Other params default
}
```

**'Speaker' Stream Config (`speakerSessionConfig_Transcription`):**
```javascript
{
  // NO 'model' specified - this session does NOT generate LLM responses.
  modalities: ["text"], // Only need text transcription modality enabled.
  instructions: null, // No instructions needed for transcription-only.

  input_audio_transcription: {
    model: "gpt-4o-transcribe", // Use transcription model
    language: "en", // Or null for auto-detect
    prompt: "This is system audio output, likely questions or statements in a technical discussion. Transcribe verbatim.",
  },

  turn_detection: null, // Disable VAD for continuous transcription

  // Other params default
}
``` 