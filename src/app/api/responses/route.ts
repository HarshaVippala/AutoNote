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
  code: z.string().describe("The generated code snippet. Empty string if no code generated."),
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
  situation: z.string().describe("Describe the specific situation or context based on retrieved resume info."),
  task: z.string().describe("Describe the task, challenge, or goal you were faced with, based on retrieved resume info."),
  action: z.string().describe("Describe the specific actions *you* took. Weave in relevant leadership principles (e.g., showing bias for action, diving deep) naturally within the description. Base this on retrieved resume info."),
  result: z.string().describe("Describe the outcome of your actions, quantifying with metrics/data from the resume where possible. Mention the impact and implicitly link to relevant leadership principles.")
}).describe("Structured behavioral answer using STAR. Grounds response in user's resume (via file_search) and implicitly references leadership principles. Use ONLY for behavioral questions AFTER searching the resume.");


// --- Convert Zod schemas to JSON Schemas for Tool Parameters ---
const comprehensiveJsonSchema = zodToJsonSchema(ComprehensiveCodeSchema);
const simpleExplanationJsonSchema = zodToJsonSchema(SimpleExplanationSchema);
const behavioralStarJsonSchema = zodToJsonSchema(BehavioralStarSchema);

// Define the tools for Responses API
const comprehensiveTool: any = {
    type: 'function',
    name: 'format_comprehensive_code',
    description: ComprehensiveCodeSchema.description ?? "Comprehensive structured response generator.",
    parameters: comprehensiveJsonSchema.definitions?.ComprehensiveCodeSchema ?? {type: "object", properties: {}}
};

const simpleExplanationTool: any = {
    type: 'function',
    name: 'format_simple_explanation',
    description: SimpleExplanationSchema.description ?? "Simple explanation generator.",
    parameters: simpleExplanationJsonSchema.definitions?.SimpleExplanationSchema ?? {type: "object", properties: {}}
};

// Define the behavioral tool
const behavioralStarTool: any = {
    type: 'function',
    name: 'format_behavioral_star_answer',
    description: BehavioralStarSchema.description ?? "Formats behavioral answers using STAR.",
    parameters: behavioralStarJsonSchema.definitions?.BehavioralStarSchema ?? {type: "object", properties: {}}
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
    c.  Implicitly weave relevant leadership principles (like Bias for Action, Ownership, Dive Deep) into the 'action' and 'result' fields. 
    d.  Be factual and avoid exaggeration. Quantify results using data from the resume if possible.
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
    // --- TEMPORARILY DISABLED FOR DEBUGGING 500 ERRORS ---
    /*
    if (vector_store_id) {
        toolsForApiCall.push({
            type: "file_search",
            vector_store_ids: [vector_store_id] // Correct placement inside the tool definition
        });
        console.log('[API Route] Added file_search tool with vector store ID:', vector_store_id);
    } else {
        console.log('[API Route] No vector_store_id provided, file_search tool omitted.');
    }
    */
    // --- END TEMPORARY DISABLE ---
    console.log('[API Route] file_search tool TEMPORARILY DISABLED for debugging.');

    // 2. Call OpenAI Responses API with streaming and configured tools
    const response = await openaiSDK.responses.create({
        model: "gpt-4o-mini",
        input: apiMessages,
        ...(previous_response_id && { previous_response_id: previous_response_id }),
        tools: toolsForApiCall,
        tool_choice: 'auto',
        stream: true,
    });

    console.log(`[API Route] OpenAI Responses API stream initiated.`);

    // 3. Process the stream and forward data to client
    const stream = new ReadableStream({
        async start(controller) {
            let responseId: string | null = null;
            let chosenToolName: string | null = null; // Track which tool (if any) is chosen

            try {
                for await (const chunk of response as any) {
                    if (chunk.id) {
                        responseId = chunk.id;
                    }

                    // Handle output array if present
                    if (chunk.output && Array.isArray(chunk.output)) {
                        for (const outputItem of chunk.output) {
                            if (outputItem.type === 'function_call') {
                                // Track function name if this is first time seeing it
                                if (outputItem.name && !chosenToolName) {
                                    chosenToolName = outputItem.name;
                                    console.log("[API Route] Model chose tool:", chosenToolName);
                                    // Send tool choice marker to client
                                    const toolChoicePayload = JSON.stringify({ type: 'tool_choice', name: chosenToolName });
                                    controller.enqueue(new TextEncoder().encode(`data: ${toolChoicePayload}\n\n`));
                                }
                                // If arguments are present, stream them
                                if (outputItem.arguments) {
                                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'tool_arguments', chunk: outputItem.arguments })}\n\n`));
                                }
                            } else if (outputItem.type === 'text' && outputItem.text) {
                                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'text', chunk: outputItem.text })}\n\n`));
                            }
                        }
                    } else if (chunk.text && typeof chunk.text === 'string') {
                        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'text', chunk: chunk.text })}\n\n`));
                    }
                }

                if (responseId) {
                    console.log(`[API Route] Stream finished. Response ID: ${responseId}`);
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'response_id', id: responseId })}\n\n`));
                }
                controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));
            } catch (error) {
                console.error('[API Route] Error processing stream:', error);
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'error', message: (error as Error).message })}\n\n`));
            } finally {
                controller.close();
            }
        }
    });

    // Return the stream directly to the client with proper SSE headers
    return new Response(stream, {
        headers: { 
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    });

  } catch (error) {
    console.error('[API Route] Error initiating responses stream:', error);
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