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
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Chat message structure
 */
export interface ChatMessage {
  role: MessageRole;
  content: string;
  tool_call_id?: string;
}

// ─── Function Calling Types ─────────────────────────────────────

/**
 * Function definition within a tool
 */
export interface FunctionDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  strict?: boolean;
}

/**
 * Tool definition for function calling
 */
export interface ToolDefinition {
  type: 'function';
  function: FunctionDefinition;
}

/**
 * Controls which tool the model calls
 */
export type ToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } };

/**
 * Tool call returned by the model
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// ─── Request/Response Types ─────────────────────────────────────

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
  tools?: ToolDefinition[];
  tool_choice?: ToolChoice;
}

/**
 * Response from DeepSeek chat completion
 */
export interface ChatCompletionResponse {
  content: string;
  reasoning_content?: string;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  finish_reason: string;
  tool_calls?: ToolCall[];
}

/**
 * Tool input schema for deepseek_chat tool
 */
export interface DeepSeekChatInput {
  messages: Array<{
    role: string;
    content: string;
    tool_call_id?: string;
  }>;
  model?: 'deepseek-chat' | 'deepseek-reasoner';
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
      strict?: boolean;
    };
  }>;
  tool_choice?:
    | 'auto'
    | 'none'
    | 'required'
    | { type: 'function'; function: { name: string } };
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
