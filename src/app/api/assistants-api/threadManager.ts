import { Thread, ThreadMessage, Run } from './types';

// Constants
const POLLING_INTERVAL_MS = 1000; // 1 second between polls
const MAX_POLLING_ATTEMPTS = 30; // Maximum 30 seconds of polling
const API_BASE_URL = 'https://api.openai.com/v1';

/**
 * Creates a new thread or retrieves an existing one from storage
 */
export async function getOrCreateThread(): Promise<Thread> {
  try {
    // SERVER-SAFE: Always create a new thread per session/request (no localStorage)
    console.log('[ThreadManager] Creating new thread...');
    const response = await fetch(`${API_BASE_URL}/threads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({}) // Empty body for default thread
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to create thread: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
    }
    
    const thread = await response.json();
    console.log(`[ThreadManager] Created new thread with ID: ${thread.id}`);
    return thread;
  } catch (error) {
    console.error('[ThreadManager] Error in getOrCreateThread:', error);
    throw error;
  }
}

/**
 * Fetches an existing thread by ID
 */
async function fetchThread(threadId: string): Promise<Thread> {
  console.log(`[ThreadManager] Fetching thread ${threadId}...`);
  const response = await fetch(`${API_BASE_URL}/threads/${threadId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'OpenAI-Beta': 'assistants=v2'
    }
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Failed to fetch thread: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
  }
  
  return response.json();
}

/**
 * Adds a message to a thread
 */
export async function addMessageToThread(
  threadId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<ThreadMessage> {
  console.log(`[ThreadManager] Adding ${role} message to thread ${threadId}...`);
  
  const response = await fetch(`${API_BASE_URL}/threads/${threadId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'OpenAI-Beta': 'assistants=v2'
    },
    body: JSON.stringify({
      role,
      content
    })
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Failed to add message: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
  }
  
  const message = await response.json();
  console.log(`[ThreadManager] Added message with ID: ${message.id}`);
  return message;
}

/**
 * Creates a run on a thread using the specified assistant
 */
export async function createRun(
  threadId: string,
  assistantId: string,
  instructions?: string
): Promise<Run> {
  console.log(`[ThreadManager] Creating run on thread ${threadId} with assistant ${assistantId}...`);
  
  const body: Record<string, any> = {
    assistant_id: assistantId
  };
  
  if (instructions) {
    body.instructions = instructions;
  }
  
  const response = await fetch(`${API_BASE_URL}/threads/${threadId}/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'OpenAI-Beta': 'assistants=v2'
    },
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Failed to create run: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
  }
  
  const run = await response.json();
  console.log(`[ThreadManager] Created run with ID: ${run.id}`);
  return run;
}

/**
 * Checks the status of a run
 */
export async function checkRunStatus(threadId: string, runId: string): Promise<Run> {
  const response = await fetch(`${API_BASE_URL}/threads/${threadId}/runs/${runId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'OpenAI-Beta': 'assistants=v2'
    }
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Failed to check run status: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
  }
  
  return response.json();
}

/**
 * Waits for a run to complete, polling the status at regular intervals
 */
export async function waitForRunCompletion(
  threadId: string,
  runId: string,
  onUpdate?: (status: string) => void
): Promise<Run> {
  let attempts = 0;
  
  while (attempts < MAX_POLLING_ATTEMPTS) {
    const run = await checkRunStatus(threadId, runId);
    console.log(`[ThreadManager] Run status: ${run.status}`);
    
    if (onUpdate) {
      onUpdate(run.status);
    }
    
    if (run.status === 'completed') {
      return run;
    }
    
    if (run.status === 'failed' || run.status === 'cancelled' || run.status === 'expired') {
      throw new Error(`Run failed with status: ${run.status}`);
    }
    
    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL_MS));
    attempts++;
  }
  
  throw new Error('Run timed out - exceeded maximum polling attempts');
}

/**
 * Gets the messages from a thread after a run completes
 */
export async function getThreadMessages(threadId: string, limit: number = 10): Promise<ThreadMessage[]> {
  console.log(`[ThreadManager] Fetching messages for thread ${threadId}...`);
  
  const response = await fetch(`${API_BASE_URL}/threads/${threadId}/messages?limit=${limit}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'OpenAI-Beta': 'assistants=v2'
    }
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Failed to fetch thread messages: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
  }
  
  const result = await response.json();
  return result.data;
}

/**
 * Process a complete conversation turn: add user message, run assistant, get response
 */
export async function processConversationTurn(
  assistantId: string,
  userMessage: string,
  onRunUpdate?: (status: string) => void
): Promise<string> {
  try {
    // 1. Get or create a thread
    const thread = await getOrCreateThread();
    
    // 2. Add the user message to the thread
    await addMessageToThread(thread.id, 'user', userMessage);
    
    // 3. Create a run with the assistant
    const run = await createRun(thread.id, assistantId);
    
    // 4. Wait for the run to complete
    await waitForRunCompletion(thread.id, run.id, onRunUpdate);
    
    // 5. Fetch the latest messages to get the assistant's response
    const messages = await getThreadMessages(thread.id, 1);
    
    // The most recent message should be the assistant's response
    const assistantMessage = messages.find(msg => msg.role === 'assistant');
    
    if (!assistantMessage) {
      throw new Error('No assistant response found after run completion');
    }
    
    // Extract the content from the message
    const messageContent = assistantMessage.content[0]?.text?.value || '';
    
    return messageContent;
  } catch (error) {
    console.error('[ThreadManager] Error in processConversationTurn:', error);
    throw error;
  }
} 