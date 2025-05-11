# Backend Migration Plan: Unified OpenAI Responses API

## 1. Introduction

This document outlines the detailed plan for migrating the AgentAssist backend to utilize the unified OpenAI Responses API (`openai.responses.create`) and a new set of specialized tools for handling different types of user questions. The migration aims to streamline response generation, improve maintainability, and leverage the latest OpenAI capabilities.

The backend changes will be implemented in the following order of component updates:
1.  Realtime API Adjustments
2.  Core Responses API Overhaul (`/api/responses`)
3.  Tool-Specific Response Handling & Schema Definition

This plan assumes that the frontend will be adapted separately to handle any changes in API response structures or to provide necessary inputs for the new tool-based flows.

## 2. Phase 1: Realtime API Adjustments

**Objective:** Ensure Realtime API components are compatible with any changes stemming from the new response generation flow and continue to provide transcription services seamlessly.

**Affected Components:**
*   [`src/app/api/realtime-token/route.ts`](src/app/api/realtime-token/route.ts:0): Handles generation of client secrets for the OpenAI Realtime API.
*   [`src/app/api/realtime-assistant-webRTC/webRTCConnectionManager.ts`](src/app/api/realtime-assistant-webRTC/webRTCConnectionManager.ts:0): Manages the WebRTC connection for audio streaming and transcription.

**Tasks:**
1.  **Review OpenAI Realtime API Usage:**
    *   Verify the current usage of `openai.beta.realtime.sessions.create` in [`src/app/api/realtime-token/route.ts`](src/app/api/realtime-token/route.ts:0) against the latest OpenAI documentation for any deprecations, changes in parameters, or best practices.
    *   Ensure the client secret (token) generation remains secure and efficient.
2.  **Verify Transcription Data Flow:**
    *   Confirm that the transcription data received from the OpenAI Realtime API and managed by [`webRTCConnectionManager.ts`](src/app/api/realtime-assistant-webRTC/webRTCConnectionManager.ts:0) is passed to the frontend, and subsequently to the `/api/responses` backend endpoint, in a format that is consistent and usable by the new classification and response generation logic.
    *   No changes are anticipated to the transcription content itself, but the handling or forwarding might need review.
3.  **Update Logging:**
    *   Review and enhance logging within these components if necessary, to provide clear insights into token generation, WebRTC connection status, and transcription events, aiding in debugging the overall flow.

**Testing Criteria:**
*   Successful and secure generation of client secrets for the Realtime API.
*   Stable and performant WebRTC connection for audio streaming.
*   Accurate and timely transcription of user and system audio received by the frontend.
*   Logs provide sufficient detail for monitoring and troubleshooting.

## 3. Phase 2: Core Responses API Overhaul (`/api/responses`)

**Objective:** Refactor the main backend endpoint [`src/app/api/responses/route.ts`](src/app/api/responses/route.ts:0) to integrate the new multi-stage classification and tool-based response generation using `openai.responses.create`.

**Affected Components:**
*   [`src/app/api/responses/route.ts`](src/app/api/responses/route.ts:0): The central backend logic for processing user transcripts, classifying questions, and generating assistant responses.

**Tasks:**
1.  **Integrate Classification Logic (Stage 1):**
    *   Implement the call to the `classify_question` tool using `openai.chat.completions.create` (with `gpt-4o-mini` model) as the first step upon receiving a transcript.
    *   Retrieve `lastQuestionType` from the `conversationContextStore` and use it along with keyword analysis from the current transcript to determine `isFollowUp` status and `followUpFlavor`.
2.  **Implement Tool Selection Logic:**
    *   Based on the `questionType` ('general', 'code', 'behavioral'), `isFollowUp` status, and `followUpFlavor` (e.g., 'code_refine', 'code_explain') obtained from classification, implement a robust mechanism to select:
        *   The correct tool name (e.g., `format_simple_explanation`, `format_comprehensive_code`, etc.).
        *   The appropriate OpenAI model associated with that tool/scenario (e.g., `gpt-4.1-mini-2025-04-14` for general, `gpt-4o-mini` for code and behavioral).
3.  **Prepare Parameters for `openai.responses.create`:**
    *   Dynamically construct the arguments object for the selected tool. This includes:
        *   For `format_simple_explanation`: `prompt` (user's query).
        *   For `format_comprehensive_code`: `prompt` (user's query).
        *   For `refine_comprehensive_code`: `patchInstructions` (from user's follow-up) and `snippet` (last relevant code from `conversationContextStore`).
        *   For `explain_code_snippet`: `lineRef` (from user's follow-up) and `snippet` (last relevant code from `conversationContextStore`).
        *   For `format_behavioral_star_answer`: `prompt` (user's query), potentially with context from `conversationContextStore` for follow-ups.
    *   Ensure the conversation history (messages array) is correctly formatted and passed to `openai.responses.create` to provide context.
4.  **Invoke `openai.responses.create`:**
    *   Replace the existing OpenAI API calls for response generation with a single call to `openai.responses.create`.
    *   Utilize the `tool_choice` parameter to force the selection of the determined tool.
5.  **Update Context Management (`conversationContextStore`):**
    *   After receiving a response from `openai.responses.create`, ensure that the relevant output (specifically, the final function call output which represents the assistant's structured message) is correctly stored in the `conversationContextStore` against the `conversationId`. This is crucial for handling subsequent follow-up questions.
6.  **Verify Response Streaming:**
    *   Ensure that the response from `openai.responses.create` (which can be a stream) is correctly handled and streamed back to the frontend.
7.  **Enhance Logging:**
    *   Implement comprehensive logging throughout [`src/app/api/responses/route.ts`](src/app/api/responses/route.ts:0):
        *   Incoming transcript.
        *   Classification results (`questionType`, `isFollowUp`, `followUpFlavor`).
        *   Selected tool and model.
        *   Parameters being passed to `openai.responses.create`.
        *   Full response received from `openai.responses.create` (or errors).
        *   Data being stored in `conversationContextStore`.

**Testing Criteria:**
*   Accurate classification of diverse user inputs into 'general', 'code', or 'behavioral'.
*   Correct detection of follow-up questions and assignment of `followUpFlavor`.
*   Appropriate tool and model selected for each classified scenario.
*   `openai.responses.create` is invoked with correctly formatted parameters, including tool arguments and conversation history.
*   Valid, relevant, and correctly structured responses are generated by each of the new tools through the unified API.
*   `conversationContextStore` is accurately updated with assistant responses.
*   Responses are successfully streamed to the frontend in the expected format.
*   Detailed logs facilitate easy debugging and tracing of the request-response lifecycle.

## 4. Phase 3: Tool-Specific Response Handling & Schema Definition

**Objective:** Define the JSON schemas for all tools used in the `openai.responses.create` calls and ensure any server-side logic for preparing tool inputs or interpreting their outputs is correctly implemented.

**Affected Components:**
*   Tool definitions and schemas (likely stored as JSON or TypeScript objects/interfaces).
*   Utility functions within [`src/app/api/responses/route.ts`](src/app/api/responses/route.ts:0) or new helper modules if complex parameter manipulation is required.

**Tasks:**
1.  **Define and Validate JSON Schemas:**
    *   Create and rigorously validate the JSON schemas for each tool according to OpenAI's requirements:
        *   `classify_question` (used with `openai.chat.completions.create`)
        *   `format_simple_explanation`
        *   `format_comprehensive_code`
        *   `refine_comprehensive_code`
        *   `explain_code_snippet`
        *   `format_behavioral_star_answer`
    *   Ensure these schemas are correctly referenced or embedded when making API calls.
2.  **Finalize Prompts and Instructions:**
    *   Review and finalize the system prompts or specific instructional text that will be passed as parameters to these tools (e.g., the base "prompt" for `format_comprehensive_code`, the nature of "patchInstructions" for `refine_comprehensive_code`).
    *   Store these prompts in a configurable and maintainable way.
3.  **Implement Input Validation (Recommended):**
    *   Before calling `openai.responses.create`, add validation logic for the arguments being passed to each tool. For example:
        *   Ensure `snippet` is provided and is a non-empty string when `refine_comprehensive_code` or `explain_code_snippet` is selected.
        *   Ensure `patchInstructions` are present for `refine_comprehensive_code`.
    *   This helps in catching errors early and providing more specific feedback if an API call is likely to fail due to missing/invalid tool arguments.
4.  **Output Processing (If Necessary):**
    *   While `openai.responses.create` with forced tool choice should return structured output, review if any minimal server-side processing or reformatting of the tool's output is needed before streaming to the frontend. (Ideally, tools are designed to output directly usable structures).

**Testing Criteria:**
*   All defined tool JSON schemas are valid as per OpenAI specifications and lead to successful tool invocation.
*   The prompts and instructions provided to the tools result in the desired behavior and output quality.
*   Input validation logic (if implemented) correctly identifies and handles missing or invalid tool arguments.
*   Tool outputs are correctly interpreted and require minimal to no server-side transformation before being sent to the frontend.

## 5. Parallel Testing Endpoints

**Objective:** Ensure that new backend functionality can be tested in isolation without disrupting the existing production API.

**Tasks:**
1.  **Maintain Test Endpoints:**
    *   Continue to use and refine the previously established test endpoints for each flow:
        *   `/api/v2/classify` (for Stage 1: Classification)
        *   `/api/v2/classify_and_explain_general` (for Stage 2: General Questions)
        *   `/api/v2/classify_and_handle_code` (for Stage 3: Code Questions)
        *   `/api/v2/classify_and_handle_behavioral` (for Stage 4: Behavioral Questions)
2.  **Comprehensive Testing:**
    *   Develop a suite of test cases (manual or automated) to thoroughly vet each of these V2 endpoints, covering various inputs, edge cases, and follow-up scenarios.
3.  **Staged Rollout Prep:**
    *   Once V2 endpoints are stable and thoroughly tested, plan the switch-over strategy for the main `/api/responses` endpoint to use the new logic. This might involve feature flags or a phased rollout.

**Testing Criteria:**
*   Each V2 endpoint functions correctly and independently for its designated question type and flow.
*   Test suite provides adequate coverage for all new backend logic.
*   A clear plan exists for transitioning from V2 test endpoints to updating the primary `/api/responses` endpoint.

This detailed plan for backend changes should guide the development and testing process for migrating AgentAssist to the new OpenAI Responses API and tool-based architecture.