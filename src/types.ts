/**
 * DeepSeek MCP Server Types
 * Type definitions for DeepSeek API integration with Model Context Protocol
 */

/**
 * Supported DeepSeek models.
 * deepseek-v4-flash / deepseek-v4-pro are the current API models.
 * deepseek-chat / deepseek-reasoner are accepted as compatibility aliases
 * (resolved internally to deepseek-v4-flash); the DeepSeek API retires those
 * two names on 2026-07-24, so they are translated before the request is sent.
 */
export type DeepSeekModel =
  | 'deepseek-v4-flash'
  | 'deepseek-v4-pro'
  | 'deepseek-chat'
  | 'deepseek-reasoner';

/**
 * Message role in conversation
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

// ─── Multimodal Content Types ───────────────────────────────────

/**
 * Text content part (standard message content)
 */
export interface TextContentPart {
  type: 'text';
  text: string;
}

/**
 * Image content part (multimodal input)
 */
export interface ImageContentPart {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

/**
 * Content part for multimodal messages
 */
export type ContentPart = TextContentPart | ImageContentPart;

/**
 * Chat message structure
 */
export interface ChatMessage {
  role: MessageRole;
  content: string | ContentPart[];
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

/**
 * Extract text from content (string or ContentPart array).
 * For array content, concatenates all text parts.
 */
export function getTextContent(content: string | ContentPart[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((p): p is TextContentPart => p.type === 'text')
    .map((p) => p.text)
    .join('');
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
  thinking?: { type: 'enabled' | 'disabled' };
  reasoning_effort?: 'high' | 'max';
  response_format?: { type: 'json_object' };
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
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
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
    content: string | ContentPart[];
    tool_call_id?: string;
  }>;
  model?: 'deepseek-v4-flash' | 'deepseek-v4-pro' | 'deepseek-chat' | 'deepseek-reasoner';
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
  thinking?: { type: 'enabled' | 'disabled' };
  reasoning_effort?: 'high' | 'max';
  json_mode?: boolean;
  response_schema?: Record<string, unknown>;
}

// ─── FIM (Fill-in-the-Middle) Types ────────────────────────────

/**
 * Parameters for a FIM (Fill-in-the-Middle) completion request.
 * FIM runs against the Beta completions endpoint (base_url + /beta) in
 * non-thinking mode only. The model completes the text between prompt and
 * suffix; output is capped at 4K tokens by the API.
 */
export interface FimCompletionParams {
  model: DeepSeekModel;
  prompt: string;
  suffix?: string;
  max_tokens?: number;
  temperature?: number;
  stop?: string | string[];
}

/**
 * Response from a FIM completion.
 */
export interface FimCompletionResponse {
  text: string;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
  };
  finish_reason: string;
}

/**
 * Raw response from the DeepSeek Beta /completions endpoint (OpenAI legacy
 * completions shape: choices carry `text`, not `message`).
 */
export interface DeepSeekRawCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    text: string;
    finish_reason: string | null;
    index: number;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
  };
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

// ─── OpenAI SDK Extension Types (DeepSeek-specific) ────────────

/**
 * DeepSeek chat completion message (extends OpenAI with reasoning_content)
 */
export interface DeepSeekChatCompletionMessage {
  content: string | null;
  role: 'assistant';
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  reasoning_content?: string;
}

/**
 * DeepSeek chat completion choice
 */
export interface DeepSeekChatCompletionChoice {
  message: DeepSeekChatCompletionMessage;
  finish_reason: string;
  index: number;
}

/**
 * DeepSeek chat completion response (extends OpenAI response)
 */
export interface DeepSeekRawResponse {
  id: string;
  choices: DeepSeekChatCompletionChoice[];
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
  };
}

/**
 * DeepSeek stream delta
 */
export interface DeepSeekStreamDelta {
  content?: string;
  reasoning_content?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: 'function';
    function?: { name?: string; arguments?: string };
  }>;
}

/**
 * DeepSeek stream chunk
 */
export interface DeepSeekStreamChunk {
  choices: Array<{
    delta: DeepSeekStreamDelta;
    finish_reason: string | null;
  }>;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
  };
}

// ─── Session Types ─────────────────────────────────────────────

/**
 * Session data for multi-turn conversations
 */
export interface Session {
  id: string;
  messages: ChatMessage[];
  createdAt: number;
  lastAccessedAt: number;
  totalCost: number;
  requestCount: number;
}

/**
 * Session info for listing (without full message history)
 */
export interface SessionInfo {
  id: string;
  messageCount: number;
  createdAt: number;
  lastAccessedAt: number;
  totalCost: number;
  requestCount: number;
}

// ─── Circuit Breaker Types ─────────────────────────────────────

/**
 * Circuit breaker states
 */
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Circuit breaker status info
 */
export interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureTime: number;
}

// ─── Usage Tracking Types ──────────────────────────────────────

/**
 * Aggregated usage statistics
 */
export interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCost: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  activeSessions: number;
}

// ─── Fallback Types ────────────────────────────────────────────

/**
 * Fallback information attached to responses
 */
export interface FallbackInfo {
  originalModel: string;
  fallbackModel: string;
  reason: string;
}

/**
 * The effective request parameters actually sent to the API for an attempt,
 * after alias routing and thinking-mode resolution. Used for audit fields
 * so a caller can record exactly what answered — not just the requested alias.
 */
export interface EffectiveRequest {
  /** Wire model actually called (aliases resolved, e.g. deepseek-reasoner -> deepseek-v4-flash) */
  model: string;
  /** Whether thinking/chain-of-thought was enabled for this attempt */
  thinking: boolean;
  /** Effective sampling temperature; undefined when thinking mode ignores it */
  temperature?: number;
}

// ─── Type Guards ───────────────────────────────────────────────

/**
 * Check if a message has reasoning_content (DeepSeek Reasoner)
 */
export function hasReasoningContent(
  message: unknown
): message is { reasoning_content: string } {
  return (
    typeof message === 'object' &&
    message !== null &&
    'reasoning_content' in message &&
    typeof (message as Record<string, unknown>).reasoning_content === 'string'
  );
}

/**
 * Extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}
