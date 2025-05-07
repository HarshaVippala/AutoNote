import React from 'react'; // Import React for types like Dispatch, SetStateAction
import { TranscriptTurn, ErrorState } from "@/types"; // Use central types file

const ASSISTANT_ID = process.env.NEXT_PUBLIC_OPENAI_ASSISTANT_ID || '';

interface LegacyAssistantProcessorProps {
  addTranscriptMessage: (itemId: string, role: 'user' | 'assistant', text: string, hidden?: boolean, agentName?: string) => void;
  setErrorState: React.Dispatch<React.SetStateAction<ErrorState>>;
  setAssistantRunInProgress: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentRunInfo: React.Dispatch<React.SetStateAction<{ threadId?: string; runId?: string }>>;
}

// Define pollRunStatus function (moved from TopControls)
const pollRunStatus = async (
  threadId: string,
  runId: string,
  props: LegacyAssistantProcessorProps
) => {
  const { addTranscriptMessage, setErrorState, setAssistantRunInProgress, setCurrentRunInfo } = props;
  try {
    const response = await fetch(`/api/assistants-api/check-run?threadId=${threadId}&runId=${runId}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to check run status: ${response.status} - ${errorData.error || 'Unknown error'}`);
    }

    const data = await response.json();
    console.log('[Assistant Processing] Run status:', data);

    if (data.complete) {
      console.log('[Assistant Processing] Run complete, message:', data.message);
      setAssistantRunInProgress(false);

      if (data.message) {
        addTranscriptMessage(
          `main-${Date.now()}`,
          'assistant',
          data.message,
          false,
          'Assistant'
        );
      }
      setCurrentRunInfo({});
    } else {
      setTimeout(() => pollRunStatus(threadId, runId, props), 1000);
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[Assistant Processing] Error polling run status:', err);
    setAssistantRunInProgress(false);
    setErrorState({
      isOpen: true,
      title: 'Run Status Error',
      message: 'There was an error checking the run status. The system will continue to work but some responses may be missing.',
      details: err.message,
      retryAction: null
    });
  }
};

// Define processTranscriptTurn function (moved from TopControls)
const processTranscriptTurnInternal = async (
  turn: TranscriptTurn,
  props: LegacyAssistantProcessorProps
) => {
  const { setErrorState, setAssistantRunInProgress, setCurrentRunInfo } = props;
  if (!turn.micTranscript && !turn.speakerTranscript) {
    console.log('[Assistant Processing] No transcripts to process');
    return;
  }

  if (!ASSISTANT_ID) {
    console.error('[Assistant Processing] No assistant ID configured');
    // Maybe set an error state here?
    setErrorState({
        isOpen: true,
        title: 'Configuration Error',
        message: 'OpenAI Assistant ID is not configured. Cannot process transcript.',
        details: 'Please check NEXT_PUBLIC_OPENAI_ASSISTANT_ID environment variable.',
        retryAction: null
      });
    return;
  }

  try {
    setAssistantRunInProgress(true);
    console.log('[Assistant Processing] Sending transcripts to API:', turn);

    const response = await fetch('/api/assistants-api/process-transcript', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        micTranscript: turn.micTranscript,
        speakerTranscript: turn.speakerTranscript,
        assistantId: ASSISTANT_ID
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to process transcripts: ${response.status} - ${errorData.error || 'Unknown error'}`);
    }

    const data = await response.json();
    console.log('[Assistant Processing] Run created:', data);

    setCurrentRunInfo({
      threadId: data.threadId,
      runId: data.runId
    });

    pollRunStatus(data.threadId, data.runId, props);

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[Assistant Processing] Error processing transcripts:', err);
    setAssistantRunInProgress(false);
    setErrorState({
      isOpen: true,
      title: 'Processing Error',
      message: 'There was an error processing your conversation. The system will continue to work but some responses may be missing.',
      details: err.message,
      retryAction: null
    });
  }
};

// Export a function to initialize the processor with necessary callbacks/state setters
export const initializeLegacyAssistantProcessor = (props: LegacyAssistantProcessorProps) => {
  return {
    processTranscriptTurn: (turn: TranscriptTurn) => processTranscriptTurnInternal(turn, props)
  };
}; 