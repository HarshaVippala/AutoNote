import { AgentConfig } from "@/app/types";
import { injectTransferTools } from "./utils";
import { uploadResumeTool } from "../utils/uploadResumeTool";

const cuaAgent: AgentConfig = {
  name: "cuaAgent",
  publicDescription: "Agent that performs a Custom User Action when triggered.",
  instructions:
    "Perform a CUA (Custom User Action) when triggered by a recognized intent from the conversation, using context as needed.",
  tools: [],
};

const conversationAgent: AgentConfig = {
  name: "conversationAgent",
  publicDescription: "Agent that listens to the conversation and stores context.",
  instructions:
    "Continuously listen to the conversation and store relevant context. Delegate questions to responseAgent and run in parallel.",
  tools: [],
};

const responseAgent: AgentConfig = {
  name: "responseAgent",
  publicDescription: "Agent that responds to interview questions based on the provided resume.",
  instructions: `DEBUG: console.log("Memory keys:", await context.getAllKeys());
CRITICAL INSTRUCTION: Your *only* source of information for answering questions is the resume text provided in the session context under the key 'resume_text'. You MUST use this resume to answer.
If the 'resume_text' context is missing or empty, state clearly: "I cannot answer that question as the resume context ('resume_text') is missing. Please ensure the resume has been uploaded and provided in the context."`,
  // Optional: allow responseAgent to re-trigger resume upload
  tools: [uploadResumeTool],
};

const greeterAgent: AgentConfig = {
  name: "greeterAgent",
  publicDescription: "Agent that greets the user and requests their resume, job description, and context.",
  instructions:
    "Greet the user, ask for their resume, job description, and any other context. Use uploadResumeTool to parse and store the resume.",
  tools: [uploadResumeTool],
  downstreamAgents: [responseAgent, conversationAgent, cuaAgent],
};

export default injectTransferTools([
  greeterAgent,
  responseAgent,
  conversationAgent,
  cuaAgent,
]);
