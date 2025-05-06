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

  // Read the sessionType from the request body
  let sessionType: 'mic' | 'speaker' | undefined;
  let sessionConfigFromClient: Record<string, any> | undefined;
  try {
    const body = await request.json();
    sessionType = body.sessionType;
    sessionConfigFromClient = body.sessionConfig; // Extract sessionConfig too

    if (!sessionType || (sessionType !== 'mic' && sessionType !== 'speaker')) {
      console.warn('Invalid or missing sessionType in request body:', sessionType);
      // Default to 'mic' or return an error, depending on desired behavior
      // For now, let's default to 'mic' if unspecified/invalid for broader compatibility initially
      sessionType = 'mic'; 
      // Alternatively, return an error:
      // return NextResponse.json({ error: "Invalid or missing 'sessionType'. Must be 'mic' or 'speaker'." }, { status: 400 });
    }
    console.log(`Requested sessionType: ${sessionType}`);
  } catch (e) {
     console.error('Failed to parse request body:', e);
     return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }


  // Define base session parameters
  const baseSessionParams: Omit<OpenAI.Beta.Realtime.Sessions.SessionCreateParams, 'model' | 'modalities'> = {
     input_audio_transcription: {
      model: 'whisper-1', // Use whisper-1 for transcription
      language: 'en',   // Set language to English
      // Timeout settings moved to turn_detection below
    },
     // Common parameters can go here
  };

  // Customize parameters based on sessionType (these act as defaults)
  let specificSessionParams: Partial<OpenAI.Beta.Realtime.Sessions.SessionCreateParams> = {};
  if (sessionType === 'mic') {
    // Parameters specific to the user's microphone session
    specificSessionParams = {
      // Default configuration for user microphone sessions
      // Configure turn detection based on documentation
      turn_detection: {
        type: "server_vad", // Use server-side VAD
        silence_duration_ms: 600, // Equivalent to end_silence_timeout from PRD
        create_response: false,
        interrupt_response: false,
      },
      model: 'gpt-4o-mini-realtime-preview-2024-12-17', // Default model
      modalities: ['text'], // Text modality for user mic input processing
      instructions: `You are an auxiliary assistant providing immediate, concise information based ONLY on the user's conversation history . The history may include messages labeled 'SYSTEM_AUDIO_TRANSCRIPT' representing what the system/speaker just said.
DO NOT engage in lengthy conversation (no greetings, apologies, or excessive filler).DO NOT ask clarifying questions.
FOCUS on providing relevant factual snippets or definitions related to the user's topic or the preceding SYSTEM_AUDIO_TRANSCRIPT.`,
    };
    console.log("Configuring for 'mic' session with transcription/classification instructions and server VAD turn detection.");
  } else { // sessionType === 'speaker'
     // Parameters specific to the speaker's audio session
    specificSessionParams = {
      // Example: Add specific instructions or slightly different config if needed later
      // instructions: "Focus on transcribing the other participant's speech accurately.",
      model: 'gpt-4o-mini-realtime-preview-2024-12-17', // Keep the main model (or use transcription-focused if preferred)
      modalities: ['text'], // Text modality for speaker transcription processing
      // Potentially disable VAD or use different settings if speaker audio is continuous?
      // turn_detection: { type: "none" } // Example: disable server VAD if not needed for pure transcription
    };
    console.log("Configuring for 'speaker' session.");
  }

  // Merge base, type-specific defaults, and client-provided config
  // Client config takes precedence over type-specific defaults
  const finalSessionParams: OpenAI.Beta.Realtime.Sessions.SessionCreateParams = {
    ...baseSessionParams,             // Start with base
    ...specificSessionParams,         // Add/override with type-specific defaults
    ...(sessionConfigFromClient || {}), // Override with client config if provided
    // Ensure required fields like model and modalities are present after merge
    model: sessionConfigFromClient?.model || specificSessionParams.model || 'gpt-4o-mini-realtime-preview-2024-12-17',
    modalities: sessionConfigFromClient?.modalities || specificSessionParams.modalities || ['text'],
  } as OpenAI.Beta.Realtime.Sessions.SessionCreateParams;


  try {
    console.log('Attempting to create realtime session and get ephemeral token...');
    console.log(`Using final params for ${sessionType}:`, JSON.stringify(finalSessionParams));

    const session = await openai.beta.realtime.sessions.create(finalSessionParams);

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