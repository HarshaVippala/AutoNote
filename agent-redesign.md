BlackHole 16‑Channel Audio Routing
	1.	Install BlackHole 16‑ch from the GitHub release.
	2.	Open Audio MIDI Setup → Create Aggregate Device:
	•	Map Mic ➜ channels 1‑2.
	•	Map BlackHole 16‑ch ➜ channels 3-18.
	•	Enable Drift Correction on BlackHole.
	3.	Create Multi‑Output Device: Built‑in Output + BlackHole; select it as the Mac‑wide output so every application’s sound is copied to BlackHole channels 3‑4.
	4.	Run a startup self‑test: play a test tone through the system, record 200 ms from channels 1‑4; assert that mic energy is on 1‑2 and tone energy on 3‑4. Fail fast if not.

⸻

OpenAI Realtime API (Dual WebRTC)
	1.	Open two WebSocket connections to wss://api.openai.com/v1/realtime with model gpt‑4o‑mini‑realtime.
	2.	Capture 100 ms, 16 kHz mono PCM frames:
	•	Mic frames ➜ socket_mic.sendAudio(frame).
	•	Remote frames ➜ socket_rem.sendAudio(frame).
	3.	Parse partial and final events. Keep only final sentences for downstream logic.
	4.	Implement exponential back‑off reconnect (0.5 s → 1 s → 2 s … 16 s) and drop frames older than 5 s during reconnect to keep latency bounded.

⸻

Transcript Handling
	1.	Remote Buffer: append every final remote sentence verbatim.
	2.	Mic Buffer: retain last two sentences; every fifteen seconds generate a one‑line summary of older mic content, then clear the mic buffer.

⸻

Assistants API (Thread + Runs)
	1.	Create a single thread at meeting start with system prompt:
	•	Defines [PARTICIPANT] for remote lines, [YOU] for mic summaries.
	•	Instructs the assistant not to answer [YOU] content.
	2.	On each remote sentence → messages.create(role="user", content="[PARTICIPANT] …").
	3.	On each mic summary → messages.create(role="user", content="[YOU] …").
	4.	Launch a Run with stream=true, tool_choice:"auto" after every remote message.

⸻

Memory & Context Control
	1.	Track thread.token_count.
	2.	When the count exceeds 60 000 tokens:
	•	Use LangChain ConversationSummaryBufferMemory to summarise the oldest 50 % of messages.
	•	Replace them with the summary message and store the originals plus embeddings in a vector store.
	3.	Hard‑stop if a Run would push the thread above 120 000 tokens.

⸻

Optional Tool Invocation (Code‑Interpreter)
	1.	Detect code intent with a lightweight classifier or regex.
	2.	For code requests call the Run with tools=["code_interpreter"].
	3.	Handle tool_error events: capture stderr, return a textual fallback answer.

⸻

UI & Telemetry
	1.	Panel A: scrolling remote transcript.
	2.	Panel B: live assistant stream (append deltas).
	3.	Status bar: current token total, approximate cost, WebSocket RTT, reconnect counter.
	4.	Log every Run’s usage.total_tokens, latency, and reconnect events for later analytics.

⸻

Safety & Rate Limiting
	1.	Pass each outbound user message through the OpenAI Moderations endpoint; abort the Run on policy violation.
	2.	Apply a shared rate limiter of 100 OpenAI requests per minute per API key.
	3.	Load $OPENAI_API_KEY from environment variables; forbid hard‑coding secrets in the repository.

⸻

Flow recap:
BlackHole splits macOS audio → two Realtime sockets transcribe mic and remote independently → transcript buffers tag lines → Assistants thread receives [PARTICIPANT] and concise [YOU] messages → Runs stream answers, optionally execute code → memory summarises when tokens grow → UI shows everything, rate limiter and moderation keep usage safe.

Below is a brief validation of every major step against the official OpenAI (and Apple) documentation, followed by a concise component‑by‑component flow you can hand your team.  The citations show the doc pages where each behaviour is explicitly supported.

⸻

✅ Verification against docs

Plan item	Official doc that confirms it
Dual WebRTC to the Realtime API – model gpt‑4o‑mini‑realtime, 16 kHz mono PCM, streaming JSON partial / final events	Realtime audio guide  ￼
100 ms (≤ 400 ms) chunk size for lowest latency	Same guide recommends sub‑400 ms frames  ￼
Assistants Thread + Messages objects to hold conversation	“Managing Threads and Messages”  ￼
Speaker tags inside message content; only user/assistant/tool roles are allowed	Deep‑dive notes on allowed roles; free‑text content is permitted  ￼
tool_choice:"auto" and forced selection (e.g. Code‑Interpreter)	API reference for tool_choice  ￼
Code‑Interpreter tool enabled per‑run	Code‑Interpreter tool docs  ￼
128 k context window for GPT‑4o (so 60 k safety watermark is valid)	Context‑window FAQs & forum threads  ￼
Moderations endpoint before each Run	Moderations guide  ￼
Rate‑limit guard (≈100 req/min)	Safety best‑practices & rate‑limit table  ￼
Pricing figures for GPT‑4o‑mini ($5 / M input, $15 / M output)	Pricing tables  ￼
ConversationSummaryBufferMemory for token trimming	LangChain memory docs  [oai_citation_attribution:10‡Introduction
BlackHole 16‑ch + Aggregate Device + Drift Correction	Apple Core‑Audio docs & BlackHole guide  ￼
Self‑test channel validation via Core Audio	Apple dev guide on Core‑Audio channel maps  ￼

All referenced pages explicitly describe or demonstrate the APIs/features the plan relies on; nothing in the flow contradicts official constraints.

⸻

🗂️ High‑level flow (no timings)

1 Audio‑Device Layer
	1.	Install BlackHole 16‑ch.
	2.	Create an Aggregate Device: Mic → 1‑2, BlackHole → 3‑18 (Drift Correction ON).
	3.	Create a Multi‑Output Device (Built‑in Output + BlackHole) so all macOS output hits channels 3‑4.

2 Dual‑Channel Capture
	•	Open two Core‑Audio streams → emit 100 ms, 16 kHz mono PCM frames.
	•	Stream each track to its own Realtime API WebSocket and receive partial/final events.

3 Transcript Buffers
	•	Remote buffer: store every final sentence verbatim.
	•	Mic buffer: keep last 2 sentences; every 15 s replace older text with a one‑line summary.

4 Assistant Context Builder
	•	Initialise an Assistants thread with system instructions for [PARTICIPANT] and [YOU] tags.
	•	Push [PARTICIPANT] … (remote) and [YOU] … (mic summary) as role:"user" messages.

5 Run Execution + Tools
	•	For each remote sentence start a streamed Run (tool_choice:"auto").
	•	If code intent classifier triggers, set tools=["code_interpreter"].
	•	Stream deltas back to UI; handle tool_error by sending stderr in plain text.

6 Memory & Token Hygiene
	•	Track thread.token_count; when > 60 k, summarise oldest half via ConversationSummaryBufferMemory and archive originals in a vector store.
	•	Abort message creation if the projected size would exceed 120 k tokens.

7 Safety & Governance
	•	Run every outbound user line through Moderations; skip assistant call on violation.
	•	Global rate limiter holds traffic to 100 req/min per API key.

8 UI & Telemetry
	•	Live transcript pane, assistant stream pane, and status bar (token count, cost estimate, RTT).
	•	Central logger records usage.total_tokens, latency, reconnect counters for later analytics.

This flow, grounded in the cited OpenAI docs, is feasible end‑to‑end with current API capabilities—no unofficial hacks required.

Streaming raw ASR text directly into your Assistant thread could feel more “live,” but it comes with real trade‑offs. Here’s why a buffered, final‑only approach is usually preferable—and when you might do full streaming instead:

⸻

1 · What “streaming” would look like
	•	As soon as every partial event arrives (often every 50–200 ms), you immediately call Threads API to append that fragment.
	•	The Assistant Run would then be continuously re‑invoked, mixing incomplete fragments into its context.

Pros of end‑to‑end streaming
	1.	Ultra‑low latency feedback
You’d see suggested replies start before somebody even finishes their sentence.
	2.	Smooth UI typing effect
The Assistant could respond in near‑real‑time to each new word.

Cons of unfiltered streaming

Issue	Impact
Cost explosion	You’d pay for every filler word and correction (“um,” repeated fragments), easily doubling or tripling token consumption.
Context noise	The model would see partial, sometimes garbled fragments, leading to mis‑interpretations or hallucinations.
Chattiness	Constant re‑runs of the Assistant on tiny deltas can overload the thread with overlapping replies.
Token window bloat	Even GPT‑4o’s 128 k window can fill quickly on a 90 min call if you never prune.



⸻

2 · Why “final‑only” buffering wins
	1.	Clean, coherent inputs
You forward only complete sentences (final events), so the Assistant always reasons on polished text .
	2.	Predictable cost & token use
Every sentence becomes exactly one message—no redundant fragments inflate your bill.
	3.	Simpler orchestration
One Run per user utterance avoids the complexity of aborting and restarting runs on every micro‑update.
	4.	Easier memory management
You know exactly when to summarise (after N messages) rather than chasing a flood of tiny ones.

⸻

3 · When full streaming makes sense
	•	Interruption‑heavy flows, where “barge‑in” feedback (< 100 ms) is mission‑critical (e.g., live captioning for accessibility).
	•	Tight coach‑style UIs, where seeing the assistant type word‑by‑word can boost engagement.
	•	Micro‑interaction tools, like Chrome‑extension pop‑ups, where you expect the Assistant to mirror your partial query in real time.

In those edge cases, you could:
	1.	Forward every partial to the UI layer only (not the thread).
	2.	Still use final events for the actual messages.create calls to the Assistants API.
	3.	Drive your UI with the partials and your assistant reasoning with the finals.

⸻

TL;DR
	•	Buffer final sentences into the Assistant thread for clean, cost‑efficient context.
	•	Stream partials only to your UI if you need a live typing effect.
	•	Go full streaming into the thread only in very narrow, latency‑critical scenarios.
