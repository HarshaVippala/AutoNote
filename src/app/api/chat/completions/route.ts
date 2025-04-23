import { NextRequest, NextResponse } from 'next/server';
// Use streamText and the OpenAI provider from the Vercel AI SDK
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import OpenAI from "openai";

// Assuming OpenAI client from 'openai' package is no longer needed here
// if OPENAI_API_KEY is set as an env var, @ai-sdk/openai should pick it up.

// Initialize OpenAI client using environment variables
// Ensure your OPENAI_API_KEY is set in your .env file
const openaiSDK = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const runtime = 'edge'; // Optional: Use edge runtime for lower latency

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, stream = false } = body;

    if (!messages) {
      return NextResponse.json({ error: "Messages are required" }, { status: 400 });
    }

    console.log('[API Route] Received messages:', messages);
    console.log('[API Route] Streaming mode:', stream);

    // Handle streaming mode
    if (stream) {
      const streamingResponse = await openaiSDK.chat.completions.create({
        model: "gpt-4.1-mini", // Or your preferred model
        messages: messages,
        stream: true,
      });

      // Return a streaming response
      return new Response(
        new ReadableStream({
          async start(controller) {
            // Send each chunk as it comes
            for await (const chunk of streamingResponse) {
              const text = chunk.choices[0]?.delta?.content || '';
              if (text) {
                // Format as SSE (Server-Sent Events)
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
              }
            }
            // Send the [DONE] message to signal completion
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          },
        }),
        {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        }
      );
    } else {
      // Non-streaming mode (original behavior)
      const completion = await openaiSDK.chat.completions.create({
        model: "gpt-4.1-mini", // Or your preferred model
        messages: messages,
        stream: false,
      });

      console.log('[API Route] OpenAI completion received:', completion);
      return NextResponse.json(completion);
    }
  } catch (error) {
    console.error('[API Route] Error processing chat completion:', error);
    // Check if it's an OpenAI API error
    if (error instanceof OpenAI.APIError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    // Generic server error
    return NextResponse.json({ error: 'Failed to process chat completion' }, { status: 500 });
  }
}
