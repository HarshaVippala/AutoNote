<h1 align="center">Realtime API Agents Demo - Conversation Assistant</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Next-black?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js"/>
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React"/>
  <img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white" alt="OpenAI"/>
  <img src="https://img.shields.io/badge/Blackhole-000000?style=for-the-badge&logoColor=white" alt="Blackhole.ai"/>
</p>

This repository demonstrates advanced, agentic patterns built on top of the Realtime API, currently focusing on the implementation of a **Conversation Assistant**. The goal of this project is to help users participate more effectively in conversations. See the [Product Requirements Document (PRD.md)](PRD.md) for full details.

The core framework demonstrates:
- Sequential agent handoffs according to a defined agent graph (taking inspiration from [OpenAI Swarm](https://github.com/openai/swarm))
- Background escalation to more intelligent models like o1-mini for high-stakes decisions

You can use this repo to understand how to build complex, multi-agent realtime voice applications.

![Screenshot of the Realtime API Agents Demo](/public/screenshot.png)
*Note: The screenshot may reflect an earlier version of the UI.*

## Setup

- This is a Next.js typescript app
- Install dependencies with `npm i`
- Add your `OPENAI_API_KEY` to your env
- Start the server with `npm run dev` or `npm run build-check`
- Open your browser to [http://localhost:3000](http://localhost:3000) to see the app. It should automatically connect to the `adhdAssistant` Agent Set.

## Configuring Agents
The primary agent configuration is now focused on the ADHD Assistant, located in `src/app/agentConfigs/adhdAssistant/index.ts`.

Previous examples like `simpleExample`, `customerServiceRetail`, and `frontDeskAuthentication` have been removed to streamline focus on the current project goal.

```typescript
// Example snippet from src/app/agentConfigs/adhdAssistant/index.ts
import { AgentConfig } from "@/app/types";
import { injectTransferTools } from "../utils";

// Define agents for ADHD Assistant workflow
const monitorAgent: AgentConfig = {
    // ... configuration ...
};

const responseAgent: AgentConfig = {
    // ... configuration ...
};

// ... other agents ...

const agents = injectTransferTools([/* ...adhd agents... */]);

export default agents;

```

### Defining your own agents
- While the current focus is the ADHD assistant, the underlying framework is reusable. You can adapt the structure in `src/app/agentConfigs/` to create new agent sets. Add your new config to `src/app/agentConfigs/index.ts` to make it selectable in the UI's "Scenario" dropdown.
- For help creating prompts, refer to the metaprompt [here](src/app/agentConfigs/voiceAgentMetaprompt.txt) or the [Voice Agent Metaprompter GPT](https://chatgpt.com/g/g-678865c9fb5c81918fa28699735dd08e-voice-agent-metaprompt-gpt).

## UI
- **Scenario/Agent Selection:** Select the `adhdAssistant` scenario (or others you add) and specific agents using the dropdowns.
- **Transcript:** Located on the left, showing the conversation flow, including user/assistant messages, tool calls, and agent changes. Click to expand details.
- **Agent Answers:** A dedicated panel (center-right) now displays responses specifically from the `responseAgent` for clarity. This panel can be collapsed/expanded.
- **Dashboard:** The right panel, formerly "Logs", now serves as a Dashboard, displaying detailed client/server events, potentially including token usage, agent steps, and timing information in the future. Click events to see the full payload. This panel can be collapsed/expanded.
- **Bottom Toolbar:** Controls for connecting/disconnecting, muting/unmuting the microphone (Push-to-talk has been removed), and toggling the visibility of the Agent Answers and Dashboard panels.

## Project Status: Conversation Assistant

This section tracks the progress towards implementing the features outlined in the [PRD.md](PRD.md).

| Feature Category           | Feature                                      | PRD Phase | Status         | Notes                                                                     |
| :------------------------- | :------------------------------------------- | :-------- | :------------- | :------------------------------------------------------------------------ |
| **Core Infrastructure**    | Base Project Setup (Next.js, Deps)         | -         | Done           | Existing framework reused. `react-draggable` added.                     |
|                            | Agent Configuration Framework                | 1         | Done           | `AgentConfig` structure exists, ADHD config scaffolded.                 |
|                            | Basic UI Shell                               | 1         | Done           | Transcript, Events panel structure exists.                                |
|                            | Audio Processing (Basic Input)               | 1         | In Progress    | Basic connection (`realtimeConnection`) exists, returns `audioTrack`.     |
|                            | Speaker Identification Pipeline              | 1         | To Do          | Implementing via dual-microphone input channels as per PRD `AudioConfig`. |
|                            | Context Management (Basic Storage)           | 1         | In Progress    | `TranscriptContext` exists, `agentName` added. Needs speaker separation.   |
|                            | Question Detection System                    | 1         | To Do          | Not yet implemented.                                                      |
|                            | Basic Response Generation Logic              | 1         | To Do          | Agent structure exists, but specific ADHD response logic TBD.             |
| **Response Enhancement**   | Advanced Response Generation (LLM)         | 2         | To Do          | Requires LLM integration beyond basic agent calls for context/history use. |
|                            | Interruption Handling                        | 2         | To Do          | Not yet implemented.                                                      |
|                            | Context Relevance Scoring                    | 2         | To Do          | Not yet implemented.                                                      |
| **UI & UX**                | Configuration Interface                      | -         | To Do          | Audio source selection, etc., not built.                                  |
|                            | Conversation View (Speaker Differentiation)  | 1/2       | To Do          | Basic transcript exists, needs speaker labels/styling per PRD.            |
|                            | Response Display (`AgentAnswers` panel)      | 2         | Done           | New `AgentAnswers.tsx` component added and integrated.                    |
|                            | Dashboard Panel (`Dashboard` component)      | -         | Done           | New `Dashboard.tsx` component added, replacing Logs panel.                |
|                            | Bottom Toolbar Enhancements                  | -         | Done           | Mic mute, panel toggles added. PTT removed.                               |
| **Project Management**     | Removal of Old Scenarios                     | -         | Done           | `customerServiceRetail`, `frontDeskAuthentication` removed.               |
|                            | PRD Definition                               | -         | Done           | `PRD.md` created.                                                         |
| **Optimization & Testing** | Performance Optimization                     | 3         | To Do          |                                                                           |
|                            | User Testing                                 | 2/3       | To Do          |                                                                           |


## Core Contributors
- Noah MacCallum - [noahmacca](https://x.com/noahmacca)
- Ilan Bigio - [ibigio](https://github.com/ibigio)
