/*
import { NextRequest, NextResponse } from 'next/server';
import { checkRunStatus, getThreadMessages } from '../threadManager';

export async function GET(req: NextRequest) {
  try {
    // Get the threadId and runId from the query parameters
    const url = new URL(req.url);
    const threadId = url.searchParams.get('threadId');
    const runId = url.searchParams.get('runId');
    
    // Validate required parameters
    if (!threadId || !runId) {
      return NextResponse.json({ 
        error: 'threadId and runId are required query parameters' 
      }, { status: 400 });
    }
    
    // Check the run status
    const run = await checkRunStatus(threadId, runId);
    
    // If the run is complete, get the latest messages
    if (run.status === 'completed') {
      // Get the most recent messages (limit to 1 for the latest assistant response)
      const messages = await getThreadMessages(threadId, 1);
      
      // Find the assistant message in the response
      const assistantMessage = messages.find(msg => msg.role === 'assistant');
      
      if (assistantMessage) {
        // Extract the message content
        const messageContent = assistantMessage.content[0]?.text?.value || '';
        
        return NextResponse.json({
          status: run.status,
          runId: run.id,
          threadId: run.thread_id,
          complete: true,
          message: messageContent
        });
      } else {
        // Handle case where no assistant message was found
        return NextResponse.json({
          status: run.status,
          runId: run.id,
          threadId: run.thread_id,
          complete: true,
          message: '',
          error: 'No assistant message found after run completion'
        });
      }
    } else {
      // If the run is not complete, just return the status
      return NextResponse.json({
        status: run.status,
        runId: run.id,
        threadId: run.thread_id,
        complete: false
      });
    }
  } catch (error) {
    console.error('[API] Error checking run status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 
*/

// Add empty export to satisfy module requirement
export {};