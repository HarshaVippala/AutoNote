# Architecture Overview: Backend API (`/api/chat/completions`)

This document provides a high-level overview of the backend API endpoint responsible for handling chat completions, specifically focusing on generating **comprehensive** code, analysis, and planning using the OpenAI **Responses API with streaming**.

## 1. Purpose & Goals

- **Receive User Prompts:** Accept conversational prompts originating from user speech.
- **Generate Comprehensive Structured Responses:** Interact with the OpenAI Responses API using the **`o4-mini`** model to generate planning steps, code implementation, complexity analysis, and explanations in a single turn.
- **Enforce Structure:** Utilize OpenAI's Tool Calling feature within the Responses API to ensure responses adhere to **structured JSON schemas** (`ComprehensiveCodeSchema` or `SimpleExplanationSchema`).
- **Maintain Context:** Leverage the OpenAI Responses API (`/v1/responses`) and `previous_response_id` to manage conversational state across multiple turns reliably with a **consistent model**.
- **Stream Processed Data:** Send structured JSON payloads back to the frontend **incrementally via streaming** containing the generated data and a `response_id`. Improve perceived performance by reducing Time-To-First-Token (TTFT).

## 2. Endpoint

- **Route:** `POST /api/chat/completions`
- **Runtime:** Edge (`next/server`)

## 3. Request Flow

1.  **Receive Request:** The Next.js Edge Function receives a POST request.
2.  **Parse Body:** Extracts `messages` (conversation history) and optionally `previous_response_id` from the JSON body.
3.  **Validation:** Checks for the presence of `messages`.
4.  **Prepare Messages:**
    - Creates a copy of the incoming `messages`.
    - Prepends a `system` message instructing the AI to analyze the request and select the appropriate tool based on complexity.
5.  **Define Tool Definitions:**
    - Defines two OpenAI Tool objects: 
      - `format_comprehensive_code`: For complex coding problems requiring detailed planning, code, and analysis
      - `format_simple_explanation`: For simpler queries requiring only explanations
    - Each tool's parameters use a JSON schema derived from their respective Zod schemas.
6.  **Call OpenAI Responses API (Streaming):**
    - Initializes the `openai` SDK client.
    - Calls `openaiSDK.responses.create` with:
        - `model`: **`o4-mini`** (chosen for its strong reasoning and coding capabilities).
        - `messages`: The prepared message list.
        - `previous_response_id`: Passed if provided, maintaining context with the chosen model.
        - `tools`: An array containing both tool definitions.
        - `tool_choice`: Set to 'auto', allowing the model to select the appropriate tool based on query complexity.
        - **`stream: true`**: Enables streaming responses.
7.  **Process Streamed Response:**
    - Iterates through the streamed response chunks.
    - Tracks the chosen tool name and accumulates arguments as they arrive.
    - Forwards the tool argument chunks directly to the client.
    - Extracts the final `response_id` once the stream completes.
8.  **Parse & Validate JSON (Post-Stream):**
    - Once the stream is finished, validates the accumulated JSON against the appropriate schema based on which tool was chosen.
9.  **Error Handling:** Includes comprehensive error handling throughout the streaming process, propagating errors to the client when necessary.

## 4. Key Technologies & Libraries

- **Next.js:** Framework (including Edge Functions)
- **TypeScript:** Language
- **OpenAI Node SDK (`openai`):** For interacting with the OpenAI API (`responses.create` with streaming). Version: `^4.77.3`. **Model: `o4-mini`**.
- **Zod:** Schema definition and validation (`ComprehensiveCodeSchema` and `SimpleExplanationSchema`).
- **`zod-to-json-schema`:** For converting Zod schemas to JSON Schema format for tool parameters.

## 5. Data Structures

- **`ComprehensiveCodeSchema` (Zod):** Defines structure for the combined output (planning steps, language, code snippet, explanation, time/space complexity) for complex queries.
- **`SimpleExplanationSchema` (Zod):** Defines a lightweight structure for simpler queries that only require explanatory text.
- **Tools:** Two tool definitions passed to OpenAI API, each containing the JSON schema from its corresponding Zod schema in `parameters`.
- **Frontend Payload (Streamed):** Incremental chunks containing parts of the tool call arguments. The frontend reconstructs the full JSON from the streamed arguments.

## 6. Latency Optimization Strategy

The implementation leverages several optimizations:
- **Streaming (`stream: true`):** Dramatically improves perceived latency by reducing Time-To-First-Token (TTFT), allowing the UI to display initial parts of the response much faster.
- **Dynamic Schema Selection:** Using `tool_choice: 'auto'` allows the model to select the appropriate schema based on query complexity, avoiding overhead for simple queries.
- **Appropriate Model (`o4-mini`):** Model selection balances token generation speed with reasoning capability.
- **Consistent Model for State:** Using the same model (`o4-mini`) for the entire conversation (managed via `previous_response_id`) ensures reliable state management.

## 7. Implementation Status

- **✅ Backend Route:** Implemented the `/api/chat/completions` route with streaming support for tool arguments
- **✅ Schema Design:** Created both comprehensive and simple schemas to accommodate different query types
- **✅ Tool Selection:** Implemented adaptive tool selection based on query complexity
- **✅ Streaming:** Successfully implemented streaming of structured data via tool arguments
- **⏳ Frontend Integration:** Frontend needs to be updated to consume the streamed JSON chunks
- **⏳ Testing:** Need comprehensive testing with various query types

## 8. References

- [OpenAI Responses API Reference](https://platform.openai.com/docs/api-reference/responses/create)
- [OpenAI Structured Outputs Guide](https://platform.openai.com/docs/guides/structured-outputs?api-mode=responses)
- [OpenAI Conversation State Guide](https://platform.openai.com/docs/guides/conversation-state?api-mode=responses)
- **[OpenAI Latency Optimization Guide](https://platform.openai.com/docs/guides/latency-optimization)**
  - **[Process Tokens Faster (Streaming, Models)](https://platform.openai.com/docs/guides/latency-optimization#process-tokens-faster)**
  - **[Make Fewer Requests](https://platform.openai.com/docs/guides/latency-optimization#make-fewer-requests)**
- [Structured Outputs: Function Calling vs Response Format](https://platform.openai.com/docs/guides/structured-outputs#function-calling-vs-response-format)
- [Structured Outputs vs JSON Mode](https://platform.openai.com/docs/guides/structured-outputs#structured-outputs-vs-json-mode) 
- [OpenAI Reasoning Guide](https://platform.openai.com/docs/guides/reasoning) 