import { AgentConfig } from "@/app/types";
import { injectTransferTools } from "./utils";

/**
 * Naming Convention:
 * - "User": the individual directly interacting with the system.
 * - "Call Participant": the other person present on the call.
 *
 * Use these terms consistently to ensure clarity in all agent instructions and prompt communications.
 */

// Define agents
const cuaAgent: AgentConfig = {
  name: "cuaAgent",
  publicDescription: "Agent that performs a CUA action", // Context for the agent_transfer tool
  instructions:
    "Perform a CUA (Custom User Action) when triggered by a recognized intent from the ongoing conversation. Use available context to determine the exact action needed.",
  tools: [],
};

const conversationAgent: AgentConfig = {
  name: "conversationAgent",
  publicDescription: "Agent that listens to the conversation between the user and other person in the call.", // Context for the agent_transfer tool
  instructions:
    "Continuously listen to the live conversation between the user and the Call Participant. Store all relevant context. When the Call Participant asks a question, delegate the query to the responseAgent. While the responseAgent is active, continue listening and storing new context. Trigger again only when a new question is detected. This agent should run in parallel with the responseAgent.",
  tools: [],
};

const responseAgent: AgentConfig = {
  name: "responseAgent",
  publicDescription: "Agent that responds to the user's question.",
  instructions: "Respond to the Call Participant's questions using the full context gathered from the conversation. Ensure that responses are concise, relevant, and informed by prior messages.",
  tools: [],
  downstreamAgents: [conversationAgent, cuaAgent],
};

const greeterAgent: AgentConfig = {
  name: "greeterAgent",
  publicDescription: "Agent that initiates the conversation with the user.",
  instructions:
    "Initiate the conversation with the user. Greet them and request their resume, job description, and any other context that might help in the conversation. Ensure the collected information is available to other agents.",
  tools: [],
  downstreamAgents: [responseAgent, conversationAgent, cuaAgent],
};

// add the transfer tool to point to downstreamAgents
const agents = injectTransferTools([greeterAgent, responseAgent, conversationAgent, cuaAgent]);

export default agents;
