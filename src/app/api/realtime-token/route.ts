import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { logger } from '../../../lib/logger';

let openai: OpenAI;
try {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
} catch (error) {
  logger.error("Failed to initialize OpenAI client:", error);
}

/**
 * Handles POST requests to generate an ephemeral client token for Realtime API.
 */
export async function POST(request: Request) {
  logger.info('POST /api/realtime-token called');

  if (!openai) {
     return NextResponse.json(
      { error: 'Server configuration error: OpenAI client not initialized.' },
      { status: 500 }
    );
  }

  let sessionType: 'mic' | 'speaker' | undefined;
  let sessionConfigFromClient: Record<string, any> | undefined;
  try {
    const body = await request.json();
    sessionType = body.sessionType;
    sessionConfigFromClient = body.sessionConfig;

    if (!sessionType || (sessionType !== 'mic' && sessionType !== 'speaker')) {
      logger.warn('Invalid or missing sessionType in request body:', sessionType);
      sessionType = 'mic';
    }
    logger.info(`Requested sessionType: ${sessionType}`);
  } catch (e) {
     logger.error('Failed to parse request body:', e);
     return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }


  const baseSessionParams: Omit<OpenAI.Beta.Realtime.Sessions.SessionCreateParams, 'model' | 'modalities'> = {
     input_audio_transcription: {
      model: 'whisper-1',
      language: 'en',
    },
  };

  let specificSessionParams: Partial<OpenAI.Beta.Realtime.Sessions.SessionCreateParams> = {};
  if (sessionType === 'mic') {
    specificSessionParams = {
      turn_detection: {
        type: "server_vad",
        silence_duration_ms: 600,
        create_response: false,
        interrupt_response: false,
      },
      model: 'gpt-4o-mini-realtime-preview-2024-12-17',
      modalities: ['text'],
      instructions: `You are an auxiliary assistant providing immediate, concise information based ONLY on the user's conversation history . The history may include messages labeled 'SYSTEM_AUDIO_TRANSCRIPT' representing what the system/speaker just said.
DO NOT engage in lengthy conversation (no greetings, apologies, or excessive filler).DO NOT ask clarifying questions.
FOCUS on providing relevant factual snippets or definitions related to the user's topic or the preceding SYSTEM_AUDIO_TRANSCRIPT.`,
    };
    logger.info("Configuring for 'mic' session with transcription/classification instructions and server VAD turn detection.");
  } else { // sessionType === 'speaker'
    specificSessionParams = {
      model: 'gpt-4o-mini-realtime-preview-2024-12-17',
      modalities: ['text'],
    };
    logger.info("Configuring for 'speaker' session.");
  }

  const finalSessionParams: OpenAI.Beta.Realtime.Sessions.SessionCreateParams = {
    ...baseSessionParams,
    ...specificSessionParams,
    ...(sessionConfigFromClient || {}),
    model: sessionConfigFromClient?.model || specificSessionParams.model || 'gpt-4o-mini-realtime-preview-2024-12-17',
    modalities: sessionConfigFromClient?.modalities || specificSessionParams.modalities || ['text'],
  } as OpenAI.Beta.Realtime.Sessions.SessionCreateParams;


  try {
    logger.info('Attempting to create realtime transcription session and get ephemeral token...');

    const transcriptionParams: any = {
      input_audio_format: sessionConfigFromClient?.input_audio_format || 'pcm16',
      input_audio_noise_reduction: sessionConfigFromClient?.input_audio_noise_reduction,
      input_audio_transcription: {
        model: sessionConfigFromClient?.input_audio_transcription?.model || 'whisper-1',
        language: sessionConfigFromClient?.input_audio_transcription?.language || 'en',
        prompt: sessionConfigFromClient?.input_audio_transcription?.prompt
      },
      turn_detection: (() => {
        if (!sessionConfigFromClient?.turn_detection) return undefined;
        const { type, silence_duration_ms, threshold, prefix_padding_ms, eagerness } = sessionConfigFromClient.turn_detection;
        const td: any = {};
        if (type) td.type = type;
        if (silence_duration_ms !== undefined) td.silence_duration_ms = silence_duration_ms;
        if (threshold !== undefined) td.threshold = threshold;
        if (prefix_padding_ms !== undefined) td.prefix_padding_ms = prefix_padding_ms;
        if (eagerness !== undefined) td.eagerness = eagerness;
        return Object.keys(td).length > 0 ? td : undefined;
      })()
    };

    Object.keys(transcriptionParams).forEach(
      (k) => transcriptionParams[k] === undefined && delete transcriptionParams[k]
    );
    Object.keys(transcriptionParams.input_audio_transcription).forEach(
      (k) => transcriptionParams.input_audio_transcription[k] === undefined && delete transcriptionParams.input_audio_transcription[k]
    );

    logger.info('Final transcription session params:', JSON.stringify(transcriptionParams));

    const session = await openai.beta.realtime.transcriptionSessions.create(transcriptionParams);

    if (!session.client_secret) {
      logger.error('Failed to retrieve client_secret from session response');
      throw new Error('Client secret not found in OpenAI response.');
    }
    logger.info("Client secret received from OpenAI."); // Potentially sensitive, consider removing or logging only a part of it in production
    logger.info('Successfully created transcription session and got ephemeral token (client_secret).');

    return NextResponse.json({ token: session.client_secret });

  } catch (error) {
    logger.error('Error creating ephemeral client token via transcription session creation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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