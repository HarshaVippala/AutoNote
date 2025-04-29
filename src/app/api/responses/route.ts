import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod'; // Import zod for schema definition and validation
import { zodToJsonSchema } from 'zod-to-json-schema'; // Helper to convert Zod schema to JSON schema
import OpenAI from "openai"; // Use the standard import for value
import type { ChatCompletionTool } from 'openai/resources/chat/completions'; // Keep for type safety if needed elsewhere
// Removed Vercel AI SDK imports

// Initialize OpenAI client using environment variables
// Ensure your OPENAI_API_KEY is set in your .env file
const openaiSDK = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// export const runtime = 'edge'; // Keep edge runtime commented out for now
// --- Define Zod Schemas for Structured Outputs ---

// Using shorter keys for token optimization
const ComprehensiveCodeSchema = z.object({
    cq: z.array(z.string()).optional().describe("Clarifying questions (cq) if request is ambiguous."),
    tol: z.string().describe(`Think out loud (tol): 1. Ask, 2. Approach, 3. Data Structures, 4. Algorithm/Logic.`),
    lang: z.string().describe("Language (lang) of code (e.g., 'python'). Empty if none."),
    cd: z.string().describe("Code (cd) snippet. Empty if none."),
    ec: z.string().describe("Edge cases (ec) considered."),
    tc: z.array(z.object({
      in: z.string().describe("Test case input (in)."),
      out: z.string().describe("Test case expected output (out).")
    })).describe("Test cases (tc): 2-3 examples (in/out)."),
    cmplx: z.object({
      t: z.string().describe("Time complexity (t) (e.g., O(n log n))."),
      s: z.string().describe("Space complexity (s) (e.g., O(n)).")
    }).describe("Complexity (cmplx) analysis (t/s)."),
    opt: z.string().optional().describe("Potential optimizations (opt). Omit if none.")
  }).describe("Comprehensive structured response for coding/analysis requests using short keys (cq, tol, lang, cd, ec, tc, cmplx, opt).");
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
// Define the tools for Responses API (Using non-nested structure based on PDF example 1 and prior success)
const comprehensiveTool: any = {
    type: 'function',
    name: 'format_comprehensive_code',
    description: ComprehensiveCodeSchema.description ?? "Comprehensive structured response for coding/analysis.",
    parameters: comprehensiveJsonSchema
};

const simpleExplanationTool: any = {
    type: 'function',
    name: 'format_simple_explanation',
    description: SimpleExplanationSchema.description ?? "Simple explanation generator.",
    parameters: simpleExplanationJsonSchema
};

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
    a.  Confirm it's asking the user to speak about a particular experience or situation. **Crucially, use the 'file_search' tool** to find relevant context, examples, and details from the user's attached resume or files within the provided vector store. Base the response *firmly* on this retrieved information.
    b.  Then, use the 'format_behavioral_star_answer' tool to structure the response.
    c.  **Elaborate extensively** on each STAR component (Situation, Task, Action, Result). Aim for **detailed, wordy, and explanatory descriptions**. Use a narrative style, making the response comprehensive and easy to follow.
    d.  For the **Action** section: Provide a highly detailed, technical narrative. Explain *how* technologies were used, going beyond simple listing. Include specific programming languages (e.g., Python 3.9, Java 11), frameworks (e.g., React 18, Spring Boot 2.5), design patterns (e.g., Singleton, Factory, Observer), architectural choices (e.g., microservices deployment on Kubernetes, serverless functions on AWS Lambda), database interactions (e.g., complex SQL joins, NoSQL data modeling strategies), API designs (e.g., RESTful principles, GraphQL schema design), and specific methodologies (e.g., Agile sprints with daily stand-ups, TDD implementation details).
    e.  Demonstrate significant technical depth by **explaining in detail** specific implementation steps, algorithms chosen (and why), relevant code logic (describe, don't just show snippets unless essential), technical trade-offs analyzed, performance optimizations implemented (explaining the 'before' and 'after'), and how specific engineering challenges or bugs were diagnosed (mentioning debugging tools/techniques) and resolved. Be highly specific, technical, and **explanatory**.
    f.  Implicitly weave relevant leadership principles (like Bias for Action, Ownership, Dive Deep, Deliver Results) naturally into the 'action' and 'result' descriptions, **explaining how** these principles guided your technical decisions and execution.
    g.  Be factual and avoid exaggeration. Quantify results using specific metrics and technical KPIs found via file search whenever possible, and **explain the significance** of these results.
2.  **Code Request:**  a. If the user asks to write, explain, analyze, or debug code, YOU MUST use the 'format_comprehensive_code' tool. **Do NOT use the 'file_search' tool for these requests.** When generating code, keep it concise and remove unnecessary blank lines. Use simple, Structure the response using these exact fields: 'clarifying_questions' (optional), 'think_out_loud', 'language', 'code', 'edge_cases', 'test_cases' (2-3 examples), 'complexity', and 'potential_optimizations' (optional).
      b. use a mix of programming paradigms (e.g., OOP and functional), varied syntax (e.g., both ternary and if/else), inconsistent variable naming styles, and one legacy syntax element. Make the code appear as if written and revised by a human.
3.  **Follow-up to Behavioral?** If the user's message is clearly a follow-up question *directly related* to the immediately preceding behavioral (STAR) answer you just provided, use the 'format_simple_explanation' tool to give a concise answer addressing the follow-up. Do NOT generate a new STAR response for a follow-up. Reference the context of the previous STAR answer implicitly.
4.  **Follow-up to Code?** If the user's message is clearly a follow-up question *directly related* to the immediately preceding code/analysis response (\`format_comprehensive_code\`) you just provided (e.g., asking to explain a part of the code, modify it slightly, clarify complexity), use the 'format_simple_explanation' tool to give a concise answer addressing the specific follow-up. Do NOT generate a new comprehensive code response unless the request is substantially different. Reference the context of the previous code/analysis implicitly.
5.  **Simple Question?** For other simpler questions needing only a direct explanation or answer (and not a follow-up to a STAR or code answer), use the 'format_simple_explanation' tool.

Structure your entire response using ONLY the chosen tool based on the analysis above.` // Ensure closing backtick is inside the content property
    }); // Ensure closing parenthesis and brace for unshift are correct

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
            vector_store_ids: [vector_store_id]
        });
        // Removed duplicated lines from here
        console.log('[API Route] Added file_search tool with vector store ID:', vector_store_id);
    } // Correctly closes the first if (vector_store_id) block
    // Removed duplicate closing brace and duplicate if block

    // 2. Call OpenAI Responses API with streaming enabled (Correctly placed after if block)
    const stream = await openaiSDK.responses.create({
        model: "gpt-4.1",
        input: apiMessages, // Use 'input'
        ...(previous_response_id && { previous_response_id: previous_response_id }),
        tools: toolsForApiCall, // Use the potentially modified array
        tool_choice: 'auto',
        stream: true, // Enable streaming
    });

    console.log(`[API Route] OpenAI Responses stream initiated.`);

    // Create a custom ReadableStream to process and forward structured events
    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        // Helper function to enqueue JSON lines
        const enqueueJsonLine = (data: object) => {
          controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
        };

        try {
          // Use type assertion as workaround for potential SDK typing issue
          for await (const event of stream as unknown as AsyncIterable<any>) {
            switch (event.type) {
              case 'response.output_item.added':
                // Check if it's a function call item being added
                if (event.item?.type === 'function_call') {
                  console.log(`[Stream] Function call started: ${event.item.name}`);
                  enqueueJsonLine({
                    type: 'function_call_start',
                    index: event.output_index,
                    name: event.item.name,
                    id: event.item.id, // Include id if needed by frontend
                    call_id: event.item.call_id // Include call_id if needed
                  });
                }
                break;

              case 'response.function_call_arguments.delta':
                if (event.delta) {
                  // console.log(`[Stream] Function args delta (index ${event.output_index}):`, event.delta);
                  enqueueJsonLine({
                    type: 'function_call_delta',
                    index: event.output_index,
                    delta: event.delta
                  });
                }
                break;
              
              case 'response.output_item.done':
                 if (event.item?.type === 'function_call') {
                    console.log(`[Stream] Function call done (index ${event.output_index})`);
                    enqueueJsonLine({ type: 'function_call_done', index: event.output_index, item: event.item });
                 } else if (event.item?.type === 'message') {
                    // Potentially signal end of a text message part if needed
                 }
                 break;

              case 'response.output_text.delta':
                if (event.text_delta?.value) {
                  // console.log("[Stream] Text delta:", event.text_delta.value);
                  enqueueJsonLine({ type: 'text_delta', delta: event.text_delta.value });
                }
                break;

              case 'response.completed':
                console.log('[API Route] OpenAI Responses stream completed event received.');
                enqueueJsonLine({ type: 'completed', response: event.response }); // Send final response object
                break;

              case 'error':
                console.error('[API Route] Error event in stream:', event.error);
                enqueueJsonLine({ type: 'error', error: { message: event.error?.message, code: event.error?.code } });
                controller.error(new Error(event.error?.message || 'Unknown stream error'));
                return; // Stop processing on error

              // Add cases for other event types if needed (e.g., file_search, refusal)
              
              default:
                // console.log("[Stream] Unhandled event type:", event.type);
                break;
            }
          }
        } catch (streamError) {
          console.error('[API Route] Error processing OpenAI stream:', streamError);
          try {
             enqueueJsonLine({ type: 'error', error: { message: (streamError as Error).message || 'Stream processing error' } });
          } catch (e) { /* Ignore enqueue error if controller is already closed */ }
          controller.error(streamError);
        } finally {
          console.log('[API Route] Closing custom readable stream.');
          controller.close();
        }
      },
    });

    // Return the custom stream as a Response with appropriate content type
    return new Response(readableStream, {
      headers: {
        'Content-Type': 'application/jsonl; charset=utf-8', // Use JSON Lines format
        'X-Content-Type-Options': 'nosniff',
      },
    });

  } catch (error) { // This is the main catch block for the try starting at line 75
    console.error('[API Route] Error initiating responses request:', error);
    // Correctly check for OpenAI APIError using the static member
    if (error instanceof OpenAI.APIError) {
      console.error('[API Route] OpenAI API Error:', error.status, error.message, error.code, error.type);
      // Correct Response constructor usage
      return new Response(
        JSON.stringify({ error: error.message, details: error.code }),
        { // Options object is the second argument
          status: error.status,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    // Handle other potential errors
    return new Response(
      JSON.stringify({ error: 'Failed to process responses request', details: (error instanceof Error ? error.message : String(error)) }),
      { // Options object is the second argument
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } // Closes the main catch block
} // Closes the POST function