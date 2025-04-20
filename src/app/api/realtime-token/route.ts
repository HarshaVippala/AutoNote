import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Ensure the API key is loaded from environment variables
// Handle potential missing key during initialization for clearer startup error
let openai: OpenAI;
try {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
} catch (error) {
  console.error("Failed to initialize OpenAI client:", error);
  // Optionally handle this case differently, maybe throw to prevent server start
}

/**
 * Handles POST requests to generate an ephemeral client token for Realtime API.
 */
export async function POST(request: Request) {
  console.log('POST /api/realtime-token called');

  if (!openai) {
     return NextResponse.json(
      { error: 'Server configuration error: OpenAI client not initialized.' },
      { status: 500 }
    );
  }

  // Later, we might pass parameters from the client if needed,
  // like user ID or specific session requirements.
  // const body = await request.json();

  // Define desired session parameters
  // TODO: Make model configurable or read from env vars
  const sessionParams: OpenAI.Beta.Realtime.Sessions.SessionCreateParams = {
    model: 'gpt-4o-mini-realtime-preview-2024-12-17', // Use a specific, available realtime model
    modalities: ['text'], // Default to text-only output
    // Add other parameters as needed, e.g.:
    // instructions: "You are a helpful assistant.",
    // voice: "alloy",
    // input_audio_format: "pcm16",
    // output_audio_format: "pcm16",
    // turn_detection: { type: "server_vad" }
  };

  try {
    console.log('Attempting to create realtime session and get ephemeral token...');
    console.log('Using params:', JSON.stringify(sessionParams));

    const session = await openai.beta.realtime.sessions.create(sessionParams);

    if (!session.client_secret) {
      console.error('Failed to retrieve client_secret from session response');
      throw new Error('Client secret not found in OpenAI response.');
    }

    console.log('Successfully created session and got ephemeral token (client_secret).');
    // Avoid logging the actual token unless debugging
    // console.log('Token:', session.client_secret);

    // Return the ephemeral token (client_secret)
    return NextResponse.json({ token: session.client_secret });

  } catch (error) {
    console.error('Error creating ephemeral client token via session creation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Check for specific OpenAI API errors if possible
    let statusCode = 500;
    if (error instanceof OpenAI.APIError) {
      statusCode = error.status || 500;
    }

    return NextResponse.json(
      { error: `Failed to generate token: ${errorMessage}` },
      { status: statusCode }
    );
  }
} 