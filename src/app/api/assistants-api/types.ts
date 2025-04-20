/**
 * Types for the OpenAI Assistants API
 */

export interface Thread {
  id: string;
  object: string;
  created_at: number;
  metadata?: Record<string, any>;
}

export interface ThreadMessage {
  id: string;
  object: string;
  created_at: number;
  thread_id: string;
  role: 'user' | 'assistant';
  content: MessageContent[];
  assistant_id?: string;
  run_id?: string;
  metadata?: Record<string, any>;
}

export interface MessageContent {
  type: string;
  text?: {
    value: string;
    annotations?: any[];
  };
  image_url?: {
    url: string;
  };
}

export interface Run {
  id: string;
  object: string;
  created_at: number;
  thread_id: string;
  assistant_id: string;
  status: 'queued' | 'in_progress' | 'requires_action' | 'cancelling' | 'cancelled' | 'failed' | 'completed' | 'expired';
  required_action?: any;
  last_error?: {
    code: string;
    message: string;
  };
  model: string;
  instructions?: string;
  tools?: any[];
  metadata?: Record<string, any>;
} 