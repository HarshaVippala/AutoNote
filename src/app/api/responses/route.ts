import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod'; // Import zod for schema definition and validation
import { zodToJsonSchema } from 'zod-to-json-schema'; // Helper to convert Zod schema to JSON schema
import OpenAI from "openai"; // Use the standard import for value
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

// Initialize OpenAI client using environment variables
// Ensure your OPENAI_API_KEY is set in your .env file
const openaiSDK = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const runtime = 'edge'; // Optional: Use edge runtime for lower latency

// --- Define Zod Schemas for Structured Outputs ---

const ComprehensiveCodeSchema = z.object({
  planning_steps: z.array(z.string()).describe("Step-by-step plan or thought process for solving the problem."),
  language: z.string().describe("The programming language of the generated code (e.g., 'python', 'java'). Null if no code generated."),
  code: z.string().describe("The generated code snippet. Empty string if no code generated. use a mix of simple  variable names of variable lengths. Don't provide overly complex solutions to simple problems. try to use the most simple and efficient solution."),
  complexity: z.object({
    time: z.string().describe("Time complexity analysis (e.g., O(n log n))."),
    space: z.string().describe("Space complexity analysis (e.g., O(n)).")
  }).describe("Computational complexity analysis."),
  explanation: z.string().describe("A concise explanation of the approach, code, and complexity.")
}).describe("Comprehensive structured response including planning, code, complexity, and explanation. Use ONLY for complex coding or analysis requests.");

// Schema for simple text explanations
const SimpleExplanationSchema = z.object({
  explanation: z.string().describe("A direct answer or explanation to the user's query.")
}).describe("A simple text explanation or answer. Use for general knowledge questions, simple clarifications, or when a comprehensive structure is not needed.");

// Schema for STAR behavioral answers - LPs integrated implicitly
const BehavioralStarSchema = z.object({
  situation: z.string().describe("Describe the specific situation or context based on retrieved resume info. Include relevant company name, project scope, and technical environment."),
  task: z.string().describe("Describe the technical challenge, goal, or problem you were faced with in detail. Include technical specifications, requirements, constraints, and stakeholder expectations."),
  action: z.string().describe("Provide a detailed, technically-focused description of the specific actions *you* took. Include technical frameworks, languages, methodologies, and tools used. Describe your technical decision-making process, architecture choices, implementation details, code optimizations, and how you overcame technical obstacles. Clearly demonstrate deep technical expertise and ownership of the solution. Weave in relevant leadership principles (e.g., bias for action, diving deep, ownership) naturally within the description."),
  result: z.string().describe("Describe the outcome of your actions, quantifying with specific technical metrics/data from the resume where possible (e.g., performance improvements, scalability gains, latency reduction, user adoption metrics). Include technical impact on systems, processes, or business outcomes. Explain how your technical implementation created lasting value.")
}).describe("Structured behavioral answer using STAR. Grounds response in user's resume (via file_search) and implicitly references leadership principles. Focus on technical details and implementation specifics. Use ONLY for behavioral questions AFTER searching the resume.");


// --- Convert Zod schemas to JSON Schemas for Tool Parameters ---
const comprehensiveJsonSchema = zodToJsonSchema(ComprehensiveCodeSchema);
const simpleExplanationJsonSchema = zodToJsonSchema(SimpleExplanationSchema);
const behavioralStarJsonSchema = zodToJsonSchema(BehavioralStarSchema);

// Define the tools for Responses API
const comprehensiveTool: any = {
    type: 'function',
    name: 'format_comprehensive_code',
    description: ComprehensiveCodeSchema.description ?? "Comprehensive structured response generator.",
    parameters: comprehensiveJsonSchema
};

const simpleExplanationTool: any = {
    type: 'function',
    name: 'format_simple_explanation',
    description: SimpleExplanationSchema.description ?? "Simple explanation generator.",
    parameters: simpleExplanationJsonSchema
};

// Define the behavioral tool
const behavioralStarTool: any = {
    type: 'function',
    name: 'format_behavioral_star_answer',
    description: BehavioralStarSchema.description ?? "Formats behavioral answers using STAR.",
    parameters: behavioralStarJsonSchema
};


export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Destructure vector_store_id from the request body
    const { messages, previous_response_id, vector_store_id } = body;

    if (!messages) {
      return NextResponse.json({ error: "Messages are required" }, { status: 400 });
    }

    console.log('[API Route] Received messages:', messages);
    console.log('[API Route] Previous Response ID:', previous_response_id);

    // 1. Prepare messages (update system prompt to guide tool selection)
    // Clean the "Speaker: " prefix from user messages
    const cleanedMessages = messages.map((msg: any) => {
        if (msg.role === 'user' && typeof msg.content === 'string' && msg.content.startsWith('Speaker: ')) {
            return { ...msg, content: msg.content.substring('Speaker: '.length) };
        }
        return msg;
    });

    let apiMessages = [...cleanedMessages]; // Use cleaned messages
    // Revised system prompt for multi-tool guidance including behavioral questions and file search
    apiMessages.unshift({ 
        role: 'system', 
        content: `You are an expert AI assistant. Analyze the user's request:
1.  **Behavioral Question?** If it looks like a behavioral interview question (e.g., starts with 'Tell me about a time...', 'Describe a situation...', asks about failures, leadership, teamwork): 
    a.  First, use the 'file_search' tool to find relevant experiences in the user's attached resume/vector store. 
    b.  Then, use the 'format_behavioral_star_answer' tool to structure the response based *only* on the information retrieved from the file search. 
    c.  Emphasize technical details, especially in the Action section - include specific programming languages, frameworks, design patterns, architectures, and methodologies used.
    d.  Demonstrate technical depth by explaining implementation details, technical decisions, and engineering challenges overcome.
    e.  Implicitly weave relevant leadership principles (like Bias for Action, Ownership, Dive Deep) into the 'action' and 'result' fields.
    f.  Be factual and avoid exaggeration. Quantify results using specific metrics and technical KPIs from the resume if possible.
2.  **Complex Code/Analysis Request?** If it requires detailed planning, code generation, and complexity analysis, use the 'format_comprehensive_code' tool.
3.  **Simple Question?** For simpler questions needing only a direct explanation or answer, use the 'format_simple_explanation' tool.

Structure your entire response using the chosen tool based on the analysis above.` 
    });

    console.log('[API Route] Prepared messages for OpenAI (prefix cleaned):', apiMessages);

    // Define the base tools
    let toolsForApiCall: any[] = [ 
        comprehensiveTool, 
        simpleExplanationTool, 
        behavioralStarTool
    ];

    // Conditionally add the file_search tool if vector_store_id is provided
    if (vector_store_id) {
        toolsForApiCall.push({
            type: "file_search",
            vector_store_ids: [vector_store_id] // Correct placement inside the tool definition
        });
        console.log('[API Route] Added file_search tool with vector store ID:', vector_store_id);
    } else {
        console.log('[API Route] No vector_store_id provided, file_search tool omitted.');
    }

    // 2. Call OpenAI Responses API with streaming and configured tools
    const response = await openaiSDK.responses.create({
        model: "gpt-4o-mini",
        input: apiMessages,
        ...(previous_response_id && { previous_response_id: previous_response_id }),
        tools: toolsForApiCall,
        tool_choice: 'auto',
        stream: false, // Set stream to false
    });

    console.log(`[API Route] OpenAI Responses API call completed.`);

    // Return the complete response as JSON
    return NextResponse.json(response);

  } catch (error) {
    console.error('[API Route] Error processing responses request:', error);
    if (error instanceof OpenAI.APIError) {
      console.error('[API Route] OpenAI API Error:', error.status, error.message, error.code, error.type);
      return new Response(
        JSON.stringify({ error: error.message, details: error.code }),
        {
          status: error.status,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    return new Response(
      JSON.stringify({ error: 'Failed to process responses request', details: (error as Error).message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}