# Strategy for Optimizing Chat Completion API Calls in Real-Time Voice

This document outlines the discussion points and proposed strategies for determining the optimal moment to send requests to the chat completion API, particularly within a real-time voice assistant context.

## 1. Current Process & Problem Identification

*   **Current Trigger:** API call is triggered by `handleProcessTurn` in `App.tsx` when the `onProcessTurn` callback fires from `TopControls.tsx`, signifying the end of a `TranscriptTurn`.
*   **Underlying Mechanism:** `TranscriptTurn` completion likely relies on Voice Activity Detection (VAD) identifying a period of silence.
*   **Potential Issues:**
    *   **Premature API Calls:** Short silence thresholds (e.g., pauses for breath/thought) can trigger the API with incomplete user utterances.
    *   **Interruptions:** User might resume speaking immediately after a perceived turn end, making the ongoing API call's context stale or wrong.
    *   **Awkward Timing:** Fast API responses might arrive while the user is still speaking, leading to interruptions or irrelevant information.

## 2. Proposed Solutions for Smarter Turn Handling & API Triggering

*   **Smarter Endpointing:**
    *   **Increase Silence Threshold:** Use a longer silence duration (e.g., 1.5 - 2 seconds) to define a turn end, reducing premature triggers.
    *   **Debounce the Send:** Upon initial silence detection, start a short timer (~300-500ms). If speech resumes before the timer ends, cancel the send. Only send the API request if the timer completes.
*   **Handling Interruptions (Ongoing Speech):**
    *   **AbortController:** Use `AbortController` with `fetch`. If VAD detects new speech immediately after sending the request (after debounce), call `abortController.abort()` to cancel the potentially stale request.
    *   **Buffer & Append:** If speech continues after a would-be turn end, append the new transcript to the previous segment. Wait for the *next* debounced silence before sending the *combined* message.
*   **Managing Early Responses:**
    *   **Hold Responses:** Before displaying/speaking an incoming LLM response, check VAD. If the user is speaking, hold the response until they finish (proper silence detected).
    *   **(Advanced) Re-evaluate Post-Hold:** Consider checking if new speech significantly changed the query before showing a held response. Might discard the held response and send a new API request with updated context (adds latency).
*   **Embrace Streaming (`stream: true`):** Strongly consider switching the API call to streaming mode for more effective cancellation and better perceived responsiveness, while still applying the "Hold Responses" logic.
*   **Always Send Full Context:** Ensure `handleProcessTurn` constructs the `messages` array with system/developer prompts, relevant conversation history, and the *complete* (potentially appended) user message.

## 3. Integrating Real-Time Question Detection

*   **Goal:** Identify questions *as* the user speaks to potentially enhance responsiveness or processing.
*   **Methods:**
    *   **Simple Heuristics:** Real-time keyword spotting (`who`, `what`, `?`, etc.) in transcript chunks. (Lightweight, fast, but brittle).
    *   **Lightweight NLP:** Use a small, fast model for intent recognition (`question`, `statement`, etc.) on fragments. (More robust, adds complexity/latency).
*   **Recommended Integration Strategy (Patient Observer):**
    1.  Detect potential questions mid-stream using heuristics.
    2.  Set a flag (`questionDetectedInTurn = true`) but **do not send the API call yet**.
    3.  Continue with the standard smart turn handling (silence detection, debounce, buffering).
    4.  When the *full, complete* turn is ready to send (after debounce), check the flag.
    5.  If `true`, consider adding a prompt hint (e.g., "Prioritize answering the user's question") to the LLM request along with the full context.
*   **Benefits:** Balances awareness of questions with the need for complete context, avoids premature/wasted API calls.

## 4. Current Implementation Notes (as of last edit)

*   The `developer` message in `src/app/App.tsx` has been updated to instruct the model on response structure and avoiding conversational filler.
*   The API call in `handleProcessTurn` currently sends only the `developer` message and the latest `speakerSaid` transcript (no history).
*   The API call is currently set to `stream: false`. 