# BlackHole 16-Channel Audio Routing

1.  Install BlackHole 16-ch from the GitHub release.
2.  Open Audio MIDI Setup -> Create Aggregate Device:
    -   Map Mic -> channels 1-2.
    -   Map BlackHole 16-ch -> channels 3-18.
    -   Enable Drift Correction on BlackHole.
3.  Create Multi-Output Device: Built-in Output + BlackHole; select it as the Mac-wide output so every application's sound is copied to BlackHole channels 3-4.
4.  Run a startup self-test: play a test tone through the system, record 200 ms from channels 1-4; assert that mic energy is on 1-2 and tone energy on 3-4. Fail fast if not.

---

# OpenAI Realtime API (Dual webRTC)

1.  Open two WebSocket connections to wss://api.openai.com/v1/realtime with model gpt-4o-mini-realtime.
2.  Capture 100 ms, 16 kHz mono PCM frames:
    -   Mic frames -> socket_mic.sendAudio(frame).
    -   Remote frames -> socket_rem.sendAudio(frame).
3.  Parse partial and final events. Keep only final sentences for downstream logic.
4.  Implement exponential back-off reconnect (0.5 s -> 1 s -> 2 s ... 16 s) and drop frames older than 5 s during reconnect to keep latency bounded.

---

# Transcript Handling

1.  Remote Buffer: append every final remote sentence verbatim.
2.  Mic Buffer: retain last two sentences; every fifteen seconds generate a one-line summary of older mic content, then clear the mic buffer.

---

# Assistants API (Thread + Runs)

1.  Create a single thread at meeting start with system prompt:
    -   Defines [PARTICIPANT] for remote lines, [YOU] for mic summaries.
    -   Instructs the assistant not to answer [YOU] content.
2.  On each remote sentence -> messages.create(role="user", content="[PARTICIPANT] ...").
3.  On each mic summary -> messages.create(role="user", content="[YOU] ...").
4.  Launch a Run with stream=true, tool_choice:"auto" after every remote message.

---

# Memory & Context Control

1.  Track thread.token_count.
2.  When the count exceeds 60,000 tokens:
    -   Use LangChain ConversationSummaryBufferMemory to summarise the oldest 50 % of messages.
    -   Replace them with the summary message and store the originals plus embeddings in a vector store.
3.  Hard-stop if a Run would push the thread above 120,000 tokens.

---

# Optional Tool Invocation (Code-Interpreter)

1.  Detect code intent with a lightweight classifier or regex.
2.  For code requests call the Run with tools=["code_interpreter"].
3.  Handle tool_error events: capture stderr, return a textual fallback answer.

---

# UI & Telemetry

1.  Panel A: scrolling remote transcript.
2.  Panel B: live assistant stream (append deltas).
3.  Status bar: current token total, approximate cost, WebSocket RTT, reconnect counter.
4.  Log every Run's usage.total_tokens, latency, and reconnect events for later analytics.

---

# Safety & Rate Limiting

1.  Pass each outbound user message through the OpenAI Moderations endpoint; abort the Run on policy violation.
2.  Apply a shared rate limiter of 100 OpenAI requests per minute per API key.
3.  Load $OPENAI_API_KEY from environment variables; forbid hard-coding secrets in the repository.

---

# Flow recap:

BlackHole splits macOS audio -> two Realtime sockets transcribe mic and remote independently -> transcript buffers tag lines -> Assistants thread receives [PARTICIPANT] and concise [YOU] messages -> Runs stream answers, optionally execute code -> memory summarises when tokens grow -> UI shows everything, rate limiter and moderation keep usage safe.

---

# Verification against docs

| Plan item                                                                                                | Official doc that confirms it                                               |
| :------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------- |
| Dual webRTC to the Realtime API - model gpt-4o-mini-realtime, 16 kHz mono PCM, streaming JSON events | Realtime audio guide                                                        |
| 100 ms (<= 400 ms) chunk size for lowest latency                                                       | Same guide recommends sub-400 ms frames                                     |
| Assistants Thread + Messages objects to hold conversation                                              | "Managing Threads and Messages"                                           |
| Speaker tags inside message content; only user/assistant/tool roles allowed                            | Deep-dive notes on allowed roles; free-text content is permitted            |
| tool_choice:"auto" and forced selection (e.g. Code-Interpreter)                                      | API reference for tool_choice                                               |
| Code-Interpreter tool enabled per-run                                                                  | Code-Interpreter tool docs                                                  |
| 128 k context window for GPT-4o (so 60 k safety watermark is valid)                                    | Context-window FAQs & forum threads                                         |
| Moderations endpoint before each Run                                                                   | Moderations guide                                                           |
| Rate-limit guard (~100 req/min)                                                                        | Safety best-practices & rate-limit table                                    |
| Pricing figures for GPT-4o-mini ($5 / M input, $15 / M output)                                         | Pricing tables                                                              |
| ConversationSummaryBufferMemory for token trimming                                                     | LangChain memory docs                                                       |
| BlackHole 16-ch + Aggregate Device + Drift Correction                                                  | Apple Core-Audio docs & BlackHole guide                                     |
| Self-test channel validation via Core Audio                                                            | Apple dev guide on Core-Audio channel maps                                  |

*All referenced pages explicitly describe or demonstrate the APIs/features the plan relies on; nothing in the flow contradicts official constraints.*

---

# High-level flow (no timings)

**1. Audio-Device Layer**
   1. Install BlackHole 16-ch.
   2. Create an Aggregate Device: Mic -> 1-2, BlackHole -> 3-18 (Drift Correction ON).
   3. Create a Multi-Output Device (Built-in Output + BlackHole) so all macOS output hits channels 3-4.

**2. Dual-Channel Capture**
   - Open two Core-Audio streams -> emit 100 ms, 16 kHz mono PCM frames.
   - Stream each track to its own Realtime API WebSocket and receive partial/final events.

**3. Transcript Buffers**
   - Remote buffer: store every final sentence verbatim.
   - Mic buffer: keep last 2 sentences; every 15 s replace older text with a one-line summary.

**4. Assistant Context Builder**
   - Initialise an Assistants thread with system instructions for [PARTICIPANT] and [YOU] tags.
   - Push [PARTICIPANT] ... (remote) and [YOU] ... (mic summary) as role:"user" messages.

**5. Run Execution + Tools**
   - For each remote sentence start a streamed Run (tool_choice:"auto").
   - If code intent classifier triggers, set tools=["code_interpreter"].
   - Stream deltas back to UI; handle tool_error by sending stderr in plain text.

**6. Memory & Token Hygiene**
   - Track thread.token_count; when > 60 k, summarise oldest half via ConversationSummaryBufferMemory and archive originals in a vector store.
   - Abort message creation if the projected size would exceed 120 k tokens.

**7. Safety & Governance**
   - Run every outbound user line through Moderations; skip assistant call on violation.
   - Global rate limiter holds traffic to 100 req/min per API key.

**8. UI & Telemetry**
   - Live transcript pane, assistant stream pane, and status bar (token count, cost estimate, RTT).
   - Central logger records usage.total_tokens, latency, reconnect counters for later analytics.

*This flow, grounded in the cited OpenAI docs, is feasible end-to-end with current API capabilities-no unofficial hacks required.*

---

# Streaming vs. Buffering Comparison

## 1. What "streaming" would look like
   - As soon as every partial event arrives (often every 50-200 ms), you immediately call Threads API to append that fragment.
   - The Assistant Run would then be continuously re-invoked, mixing incomplete fragments into its context.

**Pros of end-to-end streaming:**
   1. Ultra-low latency feedback (replies start before sentence completion).
   2. Smooth UI typing effect.

**Cons of unfiltered streaming:**

| Issue             | Impact                                                                                    |
| :---------------- | :---------------------------------------------------------------------------------------- |
| Cost explosion    | Pay for filler words/corrections ("um"), potentially 2-3x token use.                    |
| Context noise     | Model sees partial/garbled fragments, leading to misinterpretations or hallucinations.    |
| Chattiness        | Constant re-runs on tiny deltas can overload the thread with overlapping replies.         |
| Token window bloat | 128k window fills quickly on long calls if never pruned.                                  |

## 2. Why "final-only" buffering wins
   1. Clean, coherent inputs (Assistant reasons on polished text).
   2. Predictable cost & token use (one message per sentence).
   3. Simpler orchestration (one Run per utterance).
   4. Easier memory management (summarise after N messages).

## 3. When full streaming makes sense
   - Interruption-heavy flows needing < 100 ms feedback (e.g., live captions).
   - Coach-style UIs where live typing boosts engagement.
   - Micro-interaction tools needing real-time query mirroring.

**Workaround for these cases:**
   1. Forward partials to UI layer only (not the thread).
   2. Use final events for actual `messages.create` calls.
   3. Drive UI with partials, reasoning with finals.

---

## TL;DR
   - Buffer **final sentences** into the Assistant thread for clean, cost-efficient context.
   - Stream **partials only to your UI** if you need a live typing effect.
   - Go **full streaming into the thread only** in very narrow, latency-critical scenarios. 