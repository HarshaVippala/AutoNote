# Realtime API Agents Demo - Architecture Overview

This document outlines the architecture of the Realtime API Agents Demo project, a Next.js application demonstrating advanced agentic patterns for voice applications.

## Core Concepts

The project showcases several key concepts:

1.  **Sequential Agent Handoffs**: Agents can transfer control to other agents based on predefined configurations and conversation flow, inspired by patterns like OpenAI Swarm.
2.  **Background LLM Escalation**: For complex decisions or tasks requiring higher reasoning capabilities (e.g., checking return eligibility against policies), the system can escalate to more powerful models like `o1-mini`.
3.  **State Machine Prompts**: Agents can be prompted to follow specific state machines to guide conversations, ensuring accurate data collection (e.g., confirming details character-by-character during authentication).
4.  **Realtime Interaction**: Built on the Realtime API, enabling low-latency voice and event handling.

## Components

The application is structured into distinct frontend and backend components within the Next.js framework.

### Frontend (Next.js UI - `src/app/page.tsx` and related components)

*   **Responsibilities**:
    *   Renders the user interface for interaction.
    *   Manages client-side state (e.g., connection status, selected scenario/agent).
    *   Provides controls for connecting/disconnecting, audio input/output, and log toggling.
    *   Displays the conversation transcript, including messages, tool calls/responses, and agent changes.
    *   Shows a detailed log of client and server events.
    *   Allows users to select different pre-configured agent scenarios (`Scenario` dropdown) and manually switch to specific agents within that scenario (`Agent` dropdown).
    *   Communicates with the backend via the Realtime API for sending user input and receiving updates.
*   **Key UI Elements**:
    *   Scenario Dropdown
    *   Agent Dropdown
    *   Conversation Transcript Panel
    *   Event Log Panel
    *   Connection/Audio Controls

### Backend (Next.js Server/API Routes)

*   **Responsibilities**:
    *   Manages the WebSocket connection via the Realtime API.
    *   Loads and manages Agent configurations (`AgentConfig` from `src/app/agentConfigs/*`).
    *   Instantiates and runs the selected agent based on the chosen scenario.
    *   Processes user input received from the frontend.
    *   Executes agent logic based on their instructions and configured state machines.
    *   Handles tool calls defined within agent configurations (e.g., authentication checks, order lookups, policy lookups).
    *   Manages agent handoffs using utility functions like `injectTransferTools`.
    *   Performs background escalations to other LLM models (`o1-mini`) when necessary.
    *   Sends events (messages, agent changes, tool results) back to the frontend for display.
*   **Key Modules/Directories**:
    *   `src/app/agentConfigs/`: Contains definitions for agent sets (scenarios) like `simpleExample`. Each scenario defines its agents, their configurations (`AgentConfig`), and how they connect.
    *   `src/app/agentConfigs/utils.ts`: Provides helper functions, notably `injectTransferTools` which adds the necessary transfer capabilities to agents based on their `downstreamAgents` configuration.
    *   `src/app/types.ts`: Defines core data structures like `AgentConfig`.
    *   (Implicit) API routes or server-side logic handling the Realtime API connection and agent execution.

## Interaction Flow Diagram

```mermaid
sequenceDiagram
    participant User
    participant Frontend UI (Next.js)
    participant Backend Server (Next.js)
    participant Agent Logic
    participant Tools/LLM (e.g., o1-mini)

    User->>Frontend UI: Interacts (e.g., selects scenario, speaks)
    Frontend UI->>Backend Server: Connects via Realtime API, Sends User Input/Events
    Backend Server->>Agent Logic: Loads Config, Instantiates Agent, Passes Input
    Agent Logic->>Agent Logic: Executes Instructions/State Machine
    alt Tool Call Required
        Agent Logic->>Tools/LLM: Executes Tool (e.g., transfer, auth, lookup, escalate)
        Tools/LLM-->>Agent Logic: Returns Tool Result
    end
    Agent Logic-->>Backend Server: Generates Response/Events (Message, Agent Change)
    Backend Server-->>Frontend UI: Sends Events via Realtime API
    Frontend UI-->>User: Updates UI (Transcript, Logs), Plays Audio

```

## Key Functionalities

*   Prototype multi-agent realtime voice applications.
*   Define agents with specific names, descriptions, instructions, tools, and personalities.
*   Configure sequential handoffs between agents within a set.
*   Implement step-by-step interaction flows using state machine prompting.
*   Integrate external tools and background LLM calls for complex tasks.
*   Provide a user interface for:
    *   Selecting predefined agent scenarios.
    *   Manually switching between agents in a scenario.
    *   Viewing the conversation transcript, including tool interactions.
    *   Monitoring detailed client/server events.
    *   Controlling audio input/output and connection status.
*   Includes example agent set:
    *   `simpleExample`: Example of agent interaction with multiple specialized agents.
*   Offers resources for creating custom agents (metaprompt, GPT).

## Directory Structure Highlights

*   `public/`: Contains static assets like the screenshot.
*   `src/app/agentConfigs/`: Core location for defining agent behaviors and scenarios.
*   `src/app/page.tsx`: Main entry point for the frontend UI.
*   `src/app/types.ts`: TypeScript type definitions. 