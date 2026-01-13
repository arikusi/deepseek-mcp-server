/**
 * DeepSeek MCP Server Types
 * Type definitions for DeepSeek API integration with Model Context Protocol
 */

/**
 * Supported DeepSeek models
 */
export type DeepSeekModel = 'deepseek-chat' | 'deepseek-reasoner';

/**
 * Message role in conversation
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * Chat message structure
 */
export interface ChatMessage {
  role: MessageRole;
  content: string;
}

/**
 * Parameters for chat completion request
 */
export interface ChatCompletionParams {
  model: DeepSeekModel;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
}

/**
 * Response from DeepSeek chat completion
 */
export interface ChatCompletionResponse {
  content: string;
  reasoning_content?: string; // Only for deepseek-reasoner model
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  finish_reason: string;
}

/**
 * Tool input schema for deepseek_chat tool
 */
export interface DeepSeekChatInput {
  messages: Array<{
    role: string;
    content: string;
  }>;
  model?: 'deepseek-chat' | 'deepseek-reasoner';
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

/**
 * Error response structure
 */
export interface DeepSeekError {
  error: {
    message: string;
    type: string;
    code: string;
  };
}
