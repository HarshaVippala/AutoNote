import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod'; // Import zod for schema definition and validation
import { zodToJsonSchema } from 'zod-to-json-schema'; // Helper to convert Zod schema to JSON schema
import OpenAI from "openai";
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { logger } from '../../../lib/logger'; // Import the shared logger

// Initialize OpenAI client using environment variables
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

    logger.info('[API /api/responses] Request body:', body); // Log incoming request body

    // Validate required fields
    if (!transcript || typeof transcript !== 'string' || !conversationId) {
            logger.warn('[API Route] Invalid request: Missing or invalid speaker transcript/conversationId.', { transcript, conversationId });
            return NextResponse.json({ error: "Valid speaker transcript (string) and conversationId are required" }, { status: 400 });
        }
        // Validate optional lastUserTranscript
        if (lastUserTranscript && typeof lastUserTranscript !== 'string') {
           logger.warn('[API Route] Invalid request: lastUserTranscript provided but not a string.', { lastUserTranscript });
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
    let classifiedTypeFromCurrentTranscript: string | null = null;

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

    // Step 1: Initial Classification of the current transcript
    try {
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
            model: "gpt-4o-mini", // Using a fast model for classification
            messages: [{ role: "user", content: classificationPrompt }],
            max_tokens: 15,
            temperature: 0,
        });
        const ct = classificationResponse.choices[0]?.message?.content?.trim();
        if (ct && ["CODE_QUESTION", "BEHAVIORAL_QUESTION", "GENERAL_QUESTION"].includes(ct)) {
            classifiedTypeFromCurrentTranscript = ct;
        } else {
            classifiedTypeFromCurrentTranscript = "GENERAL_QUESTION"; // Default if classification is not one of the expected
        }
        logger.info(`[API Route] Initial classification of current transcript: "${transcript}" -> ${classifiedTypeFromCurrentTranscript}`);
    } catch (classificationError) {
        logger.error('[API Route] Classification error:', classificationError);
        classifiedTypeFromCurrentTranscript = "GENERAL_QUESTION"; // Default on error
    }

    // Step 2: Determine determinedQuestionType based on initial input, follow-up status, and classification
    if (initialQuestionType) {
        determinedQuestionType = initialQuestionType;
        logger.info(`[API Route] Using initialQuestionType from request: ${determinedQuestionType}`);
    } else if (isFollowUp && context?.lastQuestionType) {
        if (classifiedTypeFromCurrentTranscript &&
            classifiedTypeFromCurrentTranscript !== "GENERAL_QUESTION" &&
            classifiedTypeFromCurrentTranscript !== context.lastQuestionType) {
            determinedQuestionType = classifiedTypeFromCurrentTranscript;
            logger.info(`[API Route] Follow-up: Current classification (${determinedQuestionType}) overrides lastQuestionType (${context.lastQuestionType}).`);
        } else if (classifiedTypeFromCurrentTranscript && classifiedTypeFromCurrentTranscript === "GENERAL_QUESTION" && context.lastQuestionType !== "GENERAL_QUESTION" && transcript.length < 30) {
            determinedQuestionType = context.lastQuestionType;
            logger.info(`[API Route] Follow-up: Short general query, sticking with last specific QuestionType: ${determinedQuestionType}`);
        } else {
            determinedQuestionType = context.lastQuestionType;
            logger.info(`[API Route] Follow-up: Using lastQuestionType: ${determinedQuestionType}. Current classification was: ${classifiedTypeFromCurrentTranscript}`);
        }
    } else {
        determinedQuestionType = classifiedTypeFromCurrentTranscript; // Will be "GENERAL_QUESTION" if null
        logger.info(`[API Route] Not a follow-up or no lastQuestionType. Using current classification: ${determinedQuestionType}`);
    }
let questionTypeForContext = determinedQuestionType; // Store the type before potential override for context

// Override: any follow-up after a behavioral STAR should be treated as general, unless this is a new code question
if (isFollowUp && context?.lastQuestionType === "BEHAVIORAL_QUESTION" && classifiedTypeFromCurrentTranscript !== "CODE_QUESTION") {
    determinedQuestionType = "GENERAL_QUESTION";
    logger.info('[API Route] Overriding behavioral follow-up to GENERAL_QUESTION (non-code).');
}

// Step 3: Apply Override for Explanations (modifies determinedQuestionType for current call)
if (body.tool_outputs && Array.isArray(body.tool_outputs) && body.tool_outputs.length > 0) {
    const explanationKeywords = ["explain", "time complexity", "what is this", "how does this work", "can you clarify", "what's the complexity", "what does this do"];
    const lowerTranscript = transcript.toLowerCase();
    if (explanationKeywords.some(kw => lowerTranscript.includes(kw))) {
        if (determinedQuestionType === "CODE_QUESTION" || determinedQuestionType === "BEHAVIORAL_QUESTION") {
            logger.info(`[API Route] Overriding ${determinedQuestionType} for current call to GENERAL_QUESTION for explanation with tool_outputs.`);
            determinedQuestionType = "GENERAL_QUESTION"; // This is for the current API call's tool selection
        }
    }
}

// Step 4: Final Fallback for determinedQuestionType (for current call)
if (!determinedQuestionType) {
    logger.warn("[API Route] determinedQuestionType for current call was unexpectedly null, defaulting to GENERAL_QUESTION.");
    determinedQuestionType = "GENERAL_QUESTION";
}
// Ensure questionTypeForContext also has a fallback if it was initially null
if (!questionTypeForContext) {
    questionTypeForContext = "GENERAL_QUESTION";
}


// Step 5: Set determinedModel ONCE based on the final determinedQuestionType (for current call)
const determinedModel = selectModelBasedOnType(determinedQuestionType);
logger.info(`[API Route] Final determinedQuestionType (for API call): ${determinedQuestionType}, questionTypeForContext: ${questionTypeForContext}, Final determinedModel: ${determinedModel}`);

// --- Prepare Message History for API Call ---
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

    // --- Logging: Classification and Tool/Model Selection ---
    logger.info(`[API Route] Classification result:`, {
        determinedQuestionType,
        determinedModel,
        isFollowUp
    });

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
            systemPromptContent = `You are an expert AI behavioral interview assistant. Respond using the STAR method (format_behavioral_star_answer) to the behavioral question in the SYSTEM_AUDIO_TRANSCRIPT. Use first-person "I" to emphasize your individual contributions. Structure your response as follows:

- **Situation (~50 words)**: Clearly outline the context.
- **Task (~50 words)**: Define the objectives or challenges faced.
- **Action (~150 words)**: Detail the specific technical steps you took, incorporating relevant industry-specific terminology and explaining them as needed.
- **Result (~50 words)**: Quantify and clearly convey the outcomes of your actions with realistic metrics.
- **Reflection (~50 words)**: Briefly discuss the lessons learned and how you applied them in subsequent scenarios.

Ensure the entire response is concise, around 350 words, and technically accurate without exaggeration. Consider preceding user messages and resume context.`;
            break;
        case "GENERAL_QUESTION":
            if (isFollowUp && questionTypeForContext === "BEHAVIORAL_QUESTION") {
                systemPromptContent = `You are an expert AI assistant. This is a follow-up to a previous behavioral STAR scenario provided in context. Using that prior scenario context, precisely answer the user's question in the SYSTEM_AUDIO_TRANSCRIPT with clear, specific technical details and references. Clarify any vague points from the original scenario and focus on providing the exact issue details.`;
            } else {
                systemPromptContent = `You are an expert AI assistant. Provide a concise answer to the query or statement in the SYSTEM_AUDIO_TRANSCRIPT using format_simple_explanation. Consider any immediately preceding user message for context.`;
            }
            break;
        default:
            systemPromptContent = `You are an expert AI assistant. Provide a concise answer to the query or statement in the SYSTEM_AUDIO_TRANSCRIPT using format_simple_explanation. Consider any immediately preceding user message for context.`;
            break;
    }
    // Revert back to input_text based on API error
    const systemPromptForApi = { role: "system", content: [{ type: 'input_text', text: systemPromptContent }] };

    // --- Prepare final input for the API call ---
    let apiInput: OpenAI.Responses.ResponseInput = [
      systemPromptForApi as any,
      ...(limitedMessagesForApi.map((msg: ChatMessage) => {
        // Only include role and content, strip function_call
        return {
          role: msg.role,
          content: typeof msg.content === 'string' ? [{ type: 'input_text', text: msg.content }] : msg.content
        };
      }) as any[])
    ];

    // If tool_outputs were sent by the client, format them and append to apiInput
    if (body.tool_outputs && Array.isArray(body.tool_outputs) && body.tool_outputs.length > 0) {
      const formattedToolOutputs = body.tool_outputs.map((toolOut: any) => ({
        type: "function_call_output",
        call_id: toolOut.id, // Client sends 'id' which contains the call_id
        output: typeof toolOut.output === 'string' ? toolOut.output : JSON.stringify(toolOut.output)
      }));
      apiInput = [...apiInput, ...formattedToolOutputs as any[]]; // Append to the input messages
      logger.info('[API Route] Appended formatted tool_outputs to apiInput:', formattedToolOutputs);
    }

    // --- Logging: Tool and API Call Parameters ---
    let finalTool: any;
    let toolChoice: any = 'required'; // Default to force tool usage
    let toolsForApiCall: any[] = []; // Declare toolsForApiCall here

    switch(determinedQuestionType) {
        case "CODE_QUESTION":
            finalTool = comprehensiveTool;
            // toolChoice remains 'required' which will pick the only tool.
            break;
        case "BEHAVIORAL_QUESTION":
            finalTool = behavioralStarTool;
            // For behavioral, we want to provide file_search AND force the behavioralStarTool.
            toolsForApiCall = [
                finalTool,
                {
                    type: "file_search",
                    vector_store_ids: ['vs_6806911f19a081918abcc7bbb8410f5f']
                }
            ];
            // Specifically choose the function tool by name.
            toolChoice = { type: "function", name: finalTool.name };
            logger.info('[API Route] Added file_search to tools and set tool_choice for BEHAVIORAL_QUESTION.');
            // No need to return here, toolsForApiCall is set, loop will assign it later if not behavioral.
            break;
        case "GENERAL_QUESTION":
        default:
            finalTool = simpleExplanationTool;
            // toolChoice remains 'required'
            break;
    }

    // If toolsForApiCall wasn't set in the BEHAVIORAL_QUESTION case, set it now.
    // This ensures toolsForApiCall is always an array.
    if (!Array.isArray(toolsForApiCall) || toolsForApiCall.length === 0) {
        toolsForApiCall = [finalTool];
    }

    logger.info(`[API Route] Tool/model selection:`, {
        tool: finalTool?.name,
        model: determinedModel,
        toolChoice,
        previousResponseId
    });
    logger.info(`[API Route] API input preview:`, {
        systemPrompt: systemPromptContent,
        messages: limitedMessagesForApi.map(m => ({ role: m.role, content: m.content }))
    });

    // build params for Responses API call
    const openAiApiParams: any = {
        model: determinedModel!,
        store: true,
        input: apiInput, // apiInput now contains tool_outputs if they were provided
        tools: toolsForApiCall,
        stream: true
    };
    // only force tool_choice for non-behavioral; let model choose when using file_search for behavioral
    if (determinedQuestionType !== "BEHAVIORAL_QUESTION") {
        openAiApiParams.tool_choice = toolChoice;
    }

    if (previousResponseId) {
        openAiApiParams.previous_response_id = previousResponseId;
    }
    // tool_outputs are now part of apiInput, so no separate top-level parameter needed here.
    logger.info('[API Route] Calling openai.responses.create with params:', JSON.stringify(openAiApiParams, null, 2));

    // Call OpenAI Responses API
    const stream = await openaiSDK.responses.create(openAiApiParams);

    // --- Stream Processing (Mostly unchanged, but context saving logic simplified) ---
    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const enqueueJsonLine = (data: object) => {
          try { controller.enqueue(encoder.encode(JSON.stringify(data) + '\n')); }
          catch (e) { logger.warn("[Stream] Failed to enqueue data:", e); }
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
                case 'response.output_item.done':
                   case 'response.output_item.done':
                      if (event.item?.type === 'function_call') {
                         logger.info(`[API Stream] Function call done for tool: ${event.item.name}, Args: ${event.item.arguments}`, event.item);
                         finalAssistantMessage = event.item;
                         enqueueJsonLine({ type: 'function_call_done', index: event.output_index, item: event.item });
                      }
                      break;
                   case 'response.output_text.delta':
                     // This case might be relevant if the explanation comes as plain text
                     logger.info('[API Stream] Text delta:', event.text_delta?.value);
                     if (event.text_delta?.value) {
                       enqueueJsonLine({ type: 'text_delta', delta: event.text_delta.value });
                     }
                     break;
                   case 'response.completed':
                    logger.info('[API Stream] Response completed. Final response object:', JSON.stringify(event.response, null, 2));
                    // Include questionTypeForContext in the completed event payload
                    enqueueJsonLine({ type: 'completed', response: event.response, questionTypeForContext: questionTypeForContext });
               break;
             case 'error':
                case 'error':
                    logger.error('[API Route] Stream error event:', event.error);
                    enqueueJsonLine({ type: 'error', error: { message: event.error?.message, code: event.error?.code } });
                    controller.error(new Error(event.error?.message || 'Unknown stream error'));
            controller.error(new Error(event.error?.message || 'Unknown stream error'));
            return; // Exit on stream error
        // default: break; // Removed duplicate default
    }
  }
} catch (streamError) { // This catch is for the for-await loop
  logger.error('[API Route] Error processing stream (outer catch):', streamError);
  // Do not try to enqueue here if the controller might already be errored from an inner 'case error'
  controller.error(streamError); // Ensure controller is errored
} finally { // This finally is for the for-await loop's try
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
        finalContext.lastQuestionType = questionTypeForContext; // Use pre-override type for context
        logger.info(`[API Route] Saving context with lastQuestionType: ${questionTypeForContext}`);
        await saveConversationContext(conversationId, finalContext);
    } else {
       // Optionally save text responses if accumulated
    }
     // Note: We are NOT saving user/system transcripts here, relying on OpenAI's session state.
  } catch (saveError) {
     logger.error("[Context] Error saving context:", saveError);
  }
  controller.close();
} // End of finally for stream processing try
}, // End of start(controller) method
cancel(reason) {
logger.warn('[API Route] Stream cancelled:', reason);
}
}); // End of ReadableStream constructor
  return new Response(readableStream, {
    headers: { 'Content-Type': 'application/jsonl; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
  });

} catch (error) {
    logger.error('[API Route] Top-level error:', error);
    if (error instanceof OpenAI.APIError) {
      return new Response(JSON.stringify({ error: error.message, details: error.code }), { status: error.status, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'Failed request', details: (error instanceof Error ? error.message : String(error)) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  } // Closes main try-catch of POST
} // Closes POST function