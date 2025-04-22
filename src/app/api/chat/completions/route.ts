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
    const { messages } = body;

    if (!messages) {
      return NextResponse.json({ error: "Messages are required" }, { status: 400 });
    }

    console.log('[API Route] Received messages:', messages);

    // Call the actual OpenAI API
    const completion = await openaiSDK.chat.completions.create({
      model: "gpt-4.1-mini", // Or your preferred model
      messages: messages,
      // Add any other parameters like temperature, max_tokens, etc.
      stream: false, // Assuming non-streaming for now
    });

    console.log('[API Route] OpenAI completion received:', completion);

    // Send the response from OpenAI back to the frontend
    return NextResponse.json(completion);

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
