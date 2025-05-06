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
    analysis: z.string().describe(
      "Step 1–2: Paraphrase the problem, list inputs/outputs/constraints, and hand-run the sample."
    ),
    tol: z.string().describe(`High-level approach only: 1. Problem understanding 2. Algorithm approach 3. Data structures chosen. Keep short and focused, no code duplication.`),
    lang: z.string().describe("Language (lang) of code (e.g., 'python', 'java', 'javascript'). Required for syntax highlighting."),
    cd: z.string().describe("Well-commented code with implementation details directly in code comments. Include thorough explanations within the code itself."),
    ec: z.string().describe("Edge cases (ec) considered. Only list 2-3 important ones."),
    tc: z.array(z.object({
      in: z.string().describe("Test case input (in)."),
      out: z.string().describe("Test case expected output (out).")
    })).max(3).describe("Exactly 3 test cases with input/output examples."),
    cmplx: z.object({
      t: z.string().describe("Time complexity (t) (e.g., O(n log n)). Include brief explanation of why."),
      s: z.string().describe("Space complexity (s) (e.g., O(n)). Include brief explanation of why.")
    }).describe("Complexity (cmplx) analysis with clear formatting."),
    opt: z.string().optional().describe("Potential optimizations (opt). Keep brief, omit if none.")
  }).describe("Structured code response with well-commented code and high-level explanation. Do not duplicate code in explanation.");
// Schema for simple text explanations
const SimpleExplanationSchema = z.object({
  explanation: z.string().describe("A direct answer or explanation based on the SYSTEM_AUDIO_TRANSCRIPT and any preceding user input.")
}).describe("A simple text explanation or answer. Use for general knowledge, simple clarifications, or when a comprehensive structure is not needed. Base response primarily on the most recent SYSTEM_AUDIO_TRANSCRIPT.");

// Schema for STAR behavioral answers - LPs integrated implicitly
const BehavioralStarSchema = z.object({
  situation: z.string().describe("Describe the specific situation or context based on retrieved resume info. The trigger for this is likely a behavioral question in the SYSTEM_AUDIO_TRANSCRIPT."),
  task: z.string().describe("Describe the technical challenge, goal, or problem you were faced with in detail."),
  action: z.string().describe("Provide a detailed, technically-focused description of the specific actions *you* took. Include technical details."),
  result: z.string().describe("Describe the outcome of your actions, quantifying with specific technical metrics/data where possible.")
}).describe("Structured behavioral answer using STAR, triggered by SYSTEM_AUDIO_TRANSCRIPT containing a behavioral question. Grounds response in user's resume (via file_search). Focus on technical details.");


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

// --- Define Message Interface ---
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | null | any[];
  function_call?: {
    name: string;
    arguments: string;
  };
}


// --- Context Management Functions ---

// Simple in-memory store for conversation context (replace with persistent store later if needed)
const conversationContextStore = new Map<string, { messages: ChatMessage[]; lastQuestionType: string | null }>();

async function getConversationContext(id: string): Promise<{ messages: ChatMessage[]; lastQuestionType: string | null } | null> {
  return conversationContextStore.get(id) || null;
}

async function saveConversationContext(id: string, context: { messages: ChatMessage[]; lastQuestionType: string | null }): Promise<void> {
  // Ensure all messages have valid content format before saving
  const safeMessages = context.messages.map(msg => {
    // If the message has a function_call but null content, provide an empty array
    if (msg.function_call && (msg.content === null || msg.content === undefined)) {
      return {
        ...msg,
        content: [] // Empty array as per OpenAI format for function calls
      };
    }
    return msg;
  });
  
  // Save the sanitized messages
  const contextToSave = {
    ...context,
    messages: safeMessages.filter(msg => msg.role === 'assistant') // Keep only assistant messages in store
  };
  
  conversationContextStore.set(id, contextToSave);
}

// --- Follow-up Detection ---

function detectFollowUp(transcript: string, context: any, hasPreviousResponseId: boolean): boolean {
  // If previousResponseId is provided, it's definitely a follow-up
  if (hasPreviousResponseId) {
    return true;
  }
  
  // No context means no follow-up
  if (!context || !context.messages || context.messages.length === 0) {
    return false;
  }
  
  // Check the most recent assistant message to see if it was a behavioral response
  const lastMessage = context.messages[context.messages.length - 1];
  const lastMessageWasBehavioral = lastMessage?.function_call?.name === 'format_behavioral_star_answer';
  const lastQuestionType = context.lastQuestionType;
  
  // Common follow-up phrase detection
  const followUpKeywords = [
    "what about", "tell me more", "how did you", "explain that", 
    "why did you", "could you explain", "how would you", "what was the",
    "can you elaborate", "how was", "what were", "how were"
  ];
  
  // Check for explicit follow-up patterns
  const hasFollowUpKeyword = followUpKeywords.some(kw => 
    transcript.toLowerCase().startsWith(kw) || 
    transcript.toLowerCase().includes(` ${kw} `)
  );

  // References to previous content
  const referencesPercentage = transcript.toLowerCase().includes("percent") || 
                               transcript.toLowerCase().includes("%") ||
                               /\d+%/.test(transcript);
  
  // References to previous results/outcomes
  const referencesResults = transcript.toLowerCase().includes("result") || 
                           transcript.toLowerCase().includes("outcome") ||
                           transcript.toLowerCase().includes("impact") ||
                           transcript.toLowerCase().includes("effect");
  
  // Checks if the question is very short (likely a follow-up)
  const isShortQuestion = transcript.split(" ").length < 8;
  
  // Determine if it's a follow-up based on multiple signals
  const isFollowUp = 
    // Strong signals
    (lastMessageWasBehavioral && (hasFollowUpKeyword || referencesPercentage || referencesResults)) ||
    // Context-aware signals
    (lastQuestionType === "BEHAVIORAL_QUESTION" && isShortQuestion && 
      (hasFollowUpKeyword || referencesPercentage || referencesResults));
  
  return isFollowUp;
}


export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // **MODIFIED**: Expect speaker's transcript as 'transcript', user's as 'lastUserTranscript'
    const {
        transcript, // Speaker's transcript (the trigger)
        conversationId,
        questionType: initialQuestionType,
        model: initialModel,
        lastUserTranscript, // Optional: Most recent completed user transcript from mic
        previousResponseId // Optional: ID of the previous response for follow-up context
    } = body;

    // Validate required fields
    if (!transcript || typeof transcript !== 'string' || !conversationId) {
        console.warn('[API Route] Invalid request: Missing or invalid speaker transcript/conversationId.', { transcript, conversationId });
        return NextResponse.json({ error: "Valid speaker transcript (string) and conversationId are required" }, { status: 400 });
    }
    // Validate optional lastUserTranscript
    if (lastUserTranscript && typeof lastUserTranscript !== 'string') {
       console.warn('[API Route] Invalid request: lastUserTranscript provided but not a string.', { lastUserTranscript });
       return NextResponse.json({ error: "If provided, lastUserTranscript must be a string" }, { status: 400 });
    }

    // --- Context Management ---
    // Retrieve context first to check for follow-ups
    let context = await getConversationContext(conversationId);
    let assistantHistory: ChatMessage[] = context?.messages || [];

    // Check if this is a follow-up question based on context
    const isFollowUp = detectFollowUp(transcript, context, !!previousResponseId);

    // --- Determine Question Type and Model (based on SPEAKER transcript) ---
    let determinedQuestionType: string | null = null;
    let determinedModel: string | null = null;

    const selectModelBasedOnType = (type: string): string => {
        switch (type) {
            case "CODE_QUESTION":
            case "BEHAVIORAL_QUESTION":
                return "gpt-4o-mini";
            case "GENERAL_QUESTION":
            default:
                return "gpt-4.1-mini-2025-04-14";
        }
    };

    // If it's a follow-up, use the previous question type
    if (isFollowUp && context?.lastQuestionType) {
        determinedQuestionType = context.lastQuestionType;
        determinedModel = selectModelBasedOnType(determinedQuestionType || "BEHAVIORAL_QUESTION");
    }
    // If explicit question type provided and not a follow-up, use it
    else if (initialQuestionType) {
        determinedQuestionType = initialQuestionType;
        determinedModel = initialModel || (typeof determinedQuestionType === 'string' ? selectModelBasedOnType(determinedQuestionType) : selectModelBasedOnType("GENERAL_QUESTION"));
    }
    // Otherwise classify the transcript
    else {
        try {
            // **MODIFIED**: Classify the SPEAKER'S transcript with improved few-shot examples
            const classificationPrompt = `Classify the following system audio transcript into one category: CODE_QUESTION, BEHAVIORAL_QUESTION, or GENERAL_QUESTION.

Examples:
- "Write a function to reverse a linked list" → CODE_QUESTION
- "Tell me about your experience handling a difficult team situation" → BEHAVIORAL_QUESTION
- "What is binary search?" → GENERAL_QUESTION
- "Explain how quicksort works" → GENERAL_QUESTION
- "Implement a binary search tree in Python" → CODE_QUESTION

Classification guidelines:
- CODE_QUESTION: Requests to write, implement, or debug specific code
- BEHAVIORAL_QUESTION: Questions about personal experiences or situational responses
- GENERAL_QUESTION: Requests for explanations, concepts, or information (including algorithm explanations)

Respond ONLY with the category name. Transcript: "${transcript}"`;
            const classificationResponse = await openaiSDK.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: classificationPrompt }],
                max_tokens: 15,
                temperature: 0,
            });
            const classifiedType = classificationResponse.choices[0]?.message?.content?.trim();

            if (classifiedType && ["CODE_QUESTION", "BEHAVIORAL_QUESTION", "GENERAL_QUESTION"].includes(classifiedType)) {
                determinedQuestionType = classifiedType;
                determinedModel = selectModelBasedOnType(determinedQuestionType);
            } else {
                determinedQuestionType = "GENERAL_QUESTION"; // Default
                determinedModel = selectModelBasedOnType(determinedQuestionType);
            }
        } catch (classificationError) {
             console.error('[API Route] Classification error:', classificationError);
             determinedQuestionType = "GENERAL_QUESTION";
             determinedModel = selectModelBasedOnType(determinedQuestionType);
        }
    }

    // Ensure both are non-null after all logic
    if (!determinedQuestionType) {
        determinedQuestionType = "GENERAL_QUESTION";
    }
    if (!determinedModel) {
         // determinedQuestionType is guaranteed to be a string here
         determinedModel = selectModelBasedOnType(determinedQuestionType);
    }

    // --- Prepare Message History for API Call ---
    let messagesForApi: ChatMessage[] = [...assistantHistory]; // Start with assistant history

    // **MODIFIED**: Add last user transcript (if exists) and speaker transcript
    if (lastUserTranscript) {
        messagesForApi.push({
            role: "user", // Denote speaker transcript as system info
            content: [{ type: 'input_text', text: lastUserTranscript }]
        });
    }
    
    messagesForApi.push({
        role: "system", // Denote speaker transcript as system info
        content: [{ type: 'input_text', text: `SYSTEM_AUDIO_TRANSCRIPT: ${transcript}` }]
    });

    // Limit context window (e.g., last 10 effective messages: user, system, assistant)
    const limitedMessagesForApi = messagesForApi.slice(-10);

    // --- Refine System Prompt ---
    // System prompt guides the response based on the *speaker's* transcript being the main trigger
    let systemPromptContent = "";
    switch(determinedQuestionType) {
        case "CODE_QUESTION":
            systemPromptContent = `You are an expert AI code assistant. Respond to the coding question posed in the SYSTEM_AUDIO_TRANSCRIPT.
  Consider any immediately preceding user message for context.

  Important instructions for format_comprehensive_code:
  1. analysis - Paraphrase the problem, enumerate inputs/outputs/constraints, and simulate the sample by hand.
  2. tol - Outline your step-by-step solution in pseudo-code: the algorithmic steps and data structures you'll use.
  3. cd - Provide well-commented code with detailed explanations DIRECTLY IN THE CODE COMMENTS. The comments should thoroughly explain the thinking process and approach.
  4. tc - Provide EXACTLY 3 test cases with clear input/output examples.
  5. ec - Keep edge cases brief with only 2-3 important scenarios identified.
  6. cmplx - Format complexity consistently with both notation (e.g., O(n log n)) and a brief human-style rationale (e.g., "because we sort the array once").
  7. lang - Always specify the correct language (e.g., 'python', 'java', 'javascript') for syntax highlighting.

  The code should be production-quality with descriptive variable names and thorough inline comments explaining the approach.`;
            break;
        case "BEHAVIORAL_QUESTION":
            systemPromptContent = `You are an expert AI behavioral interview assistant. Respond to the behavioral question in the SYSTEM_AUDIO_TRANSCRIPT using the STAR method (format_behavioral_star_answer). Consider preceding user message and resume context (if available in history).`;
            break;
        case "GENERAL_QUESTION":
        default:
            systemPromptContent = `You are an expert AI assistant. Provide a concise answer to the query or statement in the SYSTEM_AUDIO_TRANSCRIPT using format_simple_explanation. Consider any immediately preceding user message for context.`;
            break;
    }
    // Revert back to input_text based on API error
    const systemPromptForApi = { role: "system", content: [{ type: 'input_text', text: systemPromptContent }] };

    // --- Prepare final input for the API call ---
    const apiInput: OpenAI.Responses.ResponseInput = [
      systemPromptForApi as any,
      ...(limitedMessagesForApi.map((msg: ChatMessage) => {
        // Only include role and content, strip function_call
        return {
          role: msg.role,
          content: typeof msg.content === 'string' ? [{ type: 'input_text', text: msg.content }] : msg.content
        };
      }) as any[])
    ];

    // **MODIFIED**: Filter tools based on type and set tool_choice to 'required'
    let finalTool: any;
    let toolChoice: any = 'required'; // Force tool usage

    switch(determinedQuestionType) {
        case "CODE_QUESTION":
            finalTool = comprehensiveTool;
            break;
        case "BEHAVIORAL_QUESTION":
            finalTool = behavioralStarTool;
            break;
        case "GENERAL_QUESTION":
        default:
            finalTool = simpleExplanationTool;
            break;
    }

    const toolsForApiCall = [finalTool]; // Array containing only the chosen tool

    // Call OpenAI Responses API
    const stream = await openaiSDK.responses.create({
            model: determinedModel!,
            input: apiInput,
            tools: toolsForApiCall,
            tool_choice: toolChoice,
            ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
            stream: true
    });

    // --- Stream Processing (Mostly unchanged, but context saving logic simplified) ---
    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const enqueueJsonLine = (data: object) => {
          try { controller.enqueue(encoder.encode(JSON.stringify(data) + '\n')); }
          catch (e) { console.warn("[Stream] Failed to enqueue data:", e); }
        };

        let assistantResponseArgs = "";
        let finalAssistantMessage: any = null; // Stores the completed function call item

        try {
          for await (const event of stream as unknown as AsyncIterable<any>) {
            switch (event.type) {
              case 'response.output_item.added':
                if (event.item?.type === 'function_call') {
                  enqueueJsonLine({ type: 'function_call_start', index: event.output_index, name: event.item.name, id: event.item.id, call_id: event.item.call_id });
                }
                break;
              case 'response.function_call_arguments.delta':
                if (event.delta) {
                  assistantResponseArgs += event.delta;
                  enqueueJsonLine({ type: 'function_call_delta', index: event.output_index, delta: event.delta });
                }
                break;
              case 'response.output_item.done':
                 if (event.item?.type === 'function_call') {
                    finalAssistantMessage = event.item; // Capture final item
                    enqueueJsonLine({ type: 'function_call_done', index: event.output_index, item: event.item });
                 }
                 break;
              case 'response.output_text.delta':
                if (event.text_delta?.value) {
                  enqueueJsonLine({ type: 'text_delta', delta: event.text_delta.value });
                }
                break;
              case 'response.completed':
                enqueueJsonLine({ type: 'completed', response: event.response });
                break;
              case 'error':
                console.error('[API Route] Stream error event:', event.error);
                enqueueJsonLine({ type: 'error', error: { message: event.error?.message, code: event.error?.code } });
                controller.error(new Error(event.error?.message || 'Unknown stream error'));
                return;
              default: break; // Ignore others
            }
          }
        } catch (streamError) {
          console.error('[API Route] Error processing stream:', streamError);
          enqueueJsonLine({ type: 'error', error: { message: (streamError instanceof Error ? streamError.message : String(streamError)) } });
          controller.error(streamError);
        } finally {
          // --- Context Saving (Save only the assistant's response) ---
          try {
            // Re-fetch context to ensure we have the latest before modifying
            let finalContext = await getConversationContext(conversationId) || { messages: [], lastQuestionType: null };

            if (finalAssistantMessage && finalAssistantMessage.type === 'function_call') {
                const assistantMessageToSave: ChatMessage = {
                    role: 'assistant',
                    content: [], // Use empty array instead of null
                    function_call: {
                        name: finalAssistantMessage.name,
                        arguments: assistantResponseArgs // Use accumulated args
                    }
                };
                // Add only the assistant message to the history for saving
                finalContext.messages.push(assistantMessageToSave);
                finalContext.lastQuestionType = determinedQuestionType; // Update last question type
                await saveConversationContext(conversationId, finalContext);
            } else {
               // Optionally save text responses if accumulated
            }
             // Note: We are NOT saving user/system transcripts here, relying on OpenAI's session state.

          } catch (saveError) {
             console.error("[Context] Error saving context:", saveError);
          }

          controller.close();
        }
      },
      cancel(reason) {
        console.warn('[API Route] Stream cancelled:', reason);
      }
    });

    return new Response(readableStream, {
      headers: { 'Content-Type': 'application/jsonl; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
    });

  } catch (error) {
    console.error('[API Route] Top-level error:', error);
    if (error instanceof OpenAI.APIError) {
      return new Response(JSON.stringify({ error: error.message, details: error.code }), { status: error.status, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'Failed request', details: (error instanceof Error ? error.message : String(error)) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}