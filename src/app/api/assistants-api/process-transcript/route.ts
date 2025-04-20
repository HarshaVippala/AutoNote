import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateThread, addMessageToThread, createRun } from '../threadManager';

export async function POST(req: NextRequest) {
  try {
    // Validate the request has the right content type
    const contentType = req.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Request must be JSON' }, { status: 400 });
    }

    // Get the request body
    const { micTranscript, speakerTranscript, assistantId } = await req.json();

    // Validate required fields
    if (!assistantId) {
      return NextResponse.json({ error: 'assistantId is required' }, { status: 400 });
    }

    // At least one transcript must be provided
    if (!micTranscript && !speakerTranscript) {
      return NextResponse.json({ error: 'At least one transcript must be provided' }, { status: 400 });
    }

    // Get or create a thread
    const thread = await getOrCreateThread();
    
    // Process the transcripts in order (usually speaker then mic)
    if (speakerTranscript) {
      console.log('[API] Adding speaker transcript to thread');
      await addMessageToThread(
        thread.id, 
        'assistant', // Speaker transcript is from the assistant
        `SYSTEM_AUDIO_TRANSCRIPT: ${speakerTranscript}`
      );
    }
    
    if (micTranscript) {
      console.log('[API] Adding user transcript to thread');
      await addMessageToThread(
        thread.id,
        'user',
        micTranscript
      );
    }
    
    // Create a run with the assistant
    console.log('[API] Creating run with assistant');
    const run = await createRun(thread.id, assistantId);
    
    // Return the thread and run IDs so the client can poll for completion
    return NextResponse.json({
      success: true,
      threadId: thread.id,
      runId: run.id
    });
  } catch (error) {
    console.error('[API] Error processing transcript:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 