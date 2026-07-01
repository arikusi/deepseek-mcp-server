/**
 * DeepSeek API Client
 * Wrapper around OpenAI SDK for DeepSeek API
 * Features: circuit breaker protection, automatic model fallback
 */

import OpenAI from 'openai';
import { getConfig } from './config.js';
import {
  ApiError,
  CircuitBreakerOpenError,
  FallbackExhaustedError,
} from './errors.js';
import { CircuitBreaker } from './circuit-breaker.js';
import type {
  ChatCompletionParams,
  ChatCompletionResponse,
  CircuitBreakerStatus,
  DeepSeekRawResponse,
  DeepSeekRawCompletionResponse,
  DeepSeekStreamChunk,
  FallbackInfo,
  FimCompletionParams,
  FimCompletionResponse,
  ToolCall,
} from './types.js';
import { hasReasoningContent, getErrorMessage } from './types.js';

/** Parameters that the API ignores while thinking mode is active */
const THINKING_INCOMPATIBLE_PARAMS = ['temperature', 'top_p'] as const;

/**
 * Fallback order per model. Each model lists fallback candidates in priority order.
 * When a model fails with a retryable error, the first available fallback is tried.
 * v4-flash and v4-pro are genuinely different models, so they back each other up.
 * The chat/reasoner aliases (which resolve to v4-flash) fall back to v4-pro.
 */
const FALLBACK_ORDER: Record<string, string[]> = {
  'deepseek-v4-flash': ['deepseek-v4-pro'],
  'deepseek-v4-pro': ['deepseek-v4-flash'],
  'deepseek-chat': ['deepseek-v4-pro'],
  'deepseek-reasoner': ['deepseek-v4-pro'],
};

/** Extended response with optional fallback info */
export interface ChatCompletionResponseWithFallback extends ChatCompletionResponse {
  fallback?: FallbackInfo;
}

/**
 * Check if an error is retryable / should trigger fallback
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof CircuitBreakerOpenError) return true;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // Rate limit, server errors, timeouts
    if (msg.includes('429') || msg.includes('rate limit')) return true;
    if (msg.includes('503') || msg.includes('service unavailable')) return true;
    if (msg.includes('502') || msg.includes('bad gateway')) return true;
    if (msg.includes('timeout') || msg.includes('timed out')) return true;
    if (msg.includes('econnrefused') || msg.includes('econnreset')) return true;
  }
  // OpenAI SDK errors with status code
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: number }).status;
    if (status === 429 || status === 502 || status === 503) return true;
  }
  return false;
}

/**
 * Resolve a user-facing model to the wire model the API accepts.
 * FIM has no thinking mode, so both compatibility aliases collapse to
 * v4-flash; the live v4 models pass through unchanged.
 */
function resolveFimModel(model: string): string {
  if (model === 'deepseek-chat' || model === 'deepseek-reasoner') {
    return 'deepseek-v4-flash';
  }
  return model;
}

export class DeepSeekClient {
  private client: OpenAI;
  private betaClient: OpenAI | null = null;
  private betaBaseUrl: string;
  private apiKey: string;
  private requestTimeout: number;
  private maxRetries: number;
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private cbThreshold: number;
  private cbResetTimeout: number;

  constructor() {
    const config = getConfig();

    this.apiKey = config.apiKey;
    this.requestTimeout = config.requestTimeout;
    this.maxRetries = config.maxRetries;

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.requestTimeout,
      maxRetries: config.maxRetries,
    });

    // Beta endpoint (FIM lives here). Normalise any trailing slash so we
    // never produce ".../beta" -> ".../beta" duplication or "//beta".
    this.betaBaseUrl = config.baseUrl.replace(/\/+$/, '') + '/beta';

    this.cbThreshold = config.circuitBreakerThreshold;
    this.cbResetTimeout = config.circuitBreakerResetTimeout;
  }

  /**
   * Lazily build the Beta-endpoint client. Only FIM needs it, so most
   * sessions never pay for a second client instance.
   */
  private getBetaClient(): OpenAI {
    if (!this.betaClient) {
      this.betaClient = new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.betaBaseUrl,
        timeout: this.requestTimeout,
        maxRetries: this.maxRetries,
      });
    }
    return this.betaClient;
  }

  /**
   * Get or create a circuit breaker for a specific model
   */
  private getCircuitBreaker(model: string): CircuitBreaker {
    let cb = this.circuitBreakers.get(model);
    if (!cb) {
      cb = new CircuitBreaker(this.cbThreshold, this.cbResetTimeout);
      this.circuitBreakers.set(model, cb);
    }
    return cb;
  }

  /**
   * Get circuit breaker status for all models
   */
  getCircuitBreakerStatus() {
    const status: Record<string, CircuitBreakerStatus> = {};
    for (const [model, cb] of this.circuitBreakers) {
      status[model] = cb.getStatus();
    }
    return status;
  }

  /**
   * Build request params shared between streaming and non-streaming
   */
  private buildRequestParams(
    params: ChatCompletionParams,
    stream: boolean
  ): Record<string, unknown> {
    // Resolve the user-facing model + thinking flag to what the API expects.
    // v4-flash / v4-pro are the live API models. deepseek-chat and
    // deepseek-reasoner are compatibility aliases (the API retires those names
    // on 2026-07-24), so they are translated to v4-flash here. The API defaults
    // thinking to ENABLED, so we always send an explicit flag — including
    // disabled — to keep the historical fast (non-thinking) default.
    let effectiveModel: string;
    let effectiveThinking: { type: 'enabled' | 'disabled' };
    switch (params.model) {
      case 'deepseek-reasoner':
        // "thinking" alias: always reason
        effectiveModel = 'deepseek-v4-flash';
        effectiveThinking = { type: 'enabled' };
        console.error('[DeepSeek MCP] Routing: deepseek-reasoner -> deepseek-v4-flash + thinking');
        break;
      case 'deepseek-chat':
        // "non-thinking" alias: fast by default, but honour an explicit thinking:enabled
        effectiveModel = 'deepseek-v4-flash';
        effectiveThinking = params.thinking ?? { type: 'disabled' };
        console.error('[DeepSeek MCP] Routing: deepseek-chat -> deepseek-v4-flash');
        break;
      default:
        // deepseek-v4-flash / deepseek-v4-pro: pass through, default to non-thinking
        effectiveModel = params.model;
        effectiveThinking = params.thinking ?? { type: 'disabled' };
    }

    const isThinkingEnabled = effectiveThinking.type === 'enabled';

    // Warn when caller-supplied sampling params will be ignored under thinking mode
    if (isThinkingEnabled) {
      const filtered = THINKING_INCOMPATIBLE_PARAMS.filter(
        (key) => params[key] !== undefined
      );
      if (filtered.length > 0) {
        console.error(
          `[DeepSeek MCP] Warning: Thinking mode active, ignoring incompatible params: ${filtered.join(', ')}`
        );
      }
    }

    const requestParams: Record<string, unknown> = {
      model: effectiveModel,
      messages: params.messages as OpenAI.ChatCompletionMessageParam[],
      max_tokens: params.max_tokens,
      stop: params.stop,
      stream,
      // Always explicit: the API's thinking default is enabled
      thinking: effectiveThinking,
    };

    // Sampling params only take effect in non-thinking mode
    if (!isThinkingEnabled) {
      requestParams.temperature = params.temperature ?? 1.0;
      if (params.top_p !== undefined) requestParams.top_p = params.top_p;
    }

    // reasoning_effort only applies while thinking
    if (isThinkingEnabled && params.reasoning_effort) {
      requestParams.reasoning_effort = params.reasoning_effort;
    }

    // Pass response_format for JSON mode
    if (params.response_format) {
      requestParams.response_format = params.response_format;
    }

    if (params.tools?.length) {
      requestParams.tools = params.tools;
    }
    if (params.tool_choice !== undefined) {
      requestParams.tool_choice = params.tool_choice;
    }

    return requestParams;
  }

  /**
   * Wrap caught errors with appropriate custom error class
   */
  private wrapError(error: unknown, context: string): never {
    if (error instanceof ApiError) throw error;
    if (error instanceof FallbackExhaustedError) throw error;
    if (error instanceof CircuitBreakerOpenError) throw error;
    const message = getErrorMessage(error);
    const cause = error instanceof Error ? error : undefined;
    throw new ApiError(`${context}: ${message}`, { cause });
  }

  /**
   * Parse raw API response into ChatCompletionResponse
   */
  private parseResponse(response: DeepSeekRawResponse): ChatCompletionResponse {
    const choice = response.choices[0];
    if (!choice) {
      throw new ApiError('No response from DeepSeek API');
    }

    const reasoning_content = hasReasoningContent(choice.message)
      ? choice.message.reasoning_content
      : undefined;

    const tool_calls: ToolCall[] | undefined = choice.message.tool_calls
      ?.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }));

    return {
      content: choice.message.content || '',
      reasoning_content,
      model: response.model,
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
        prompt_cache_hit_tokens: response.usage?.prompt_cache_hit_tokens,
        prompt_cache_miss_tokens: response.usage?.prompt_cache_miss_tokens,
      },
      finish_reason: choice.finish_reason || 'stop',
      tool_calls: tool_calls?.length ? tool_calls : undefined,
    };
  }

  /**
   * Parse a raw Beta /completions response into FimCompletionResponse.
   */
  private parseCompletionResponse(
    response: DeepSeekRawCompletionResponse
  ): FimCompletionResponse {
    const choice = response.choices[0];
    if (!choice) {
      throw new ApiError('No response from DeepSeek FIM API');
    }

    return {
      text: choice.text || '',
      model: response.model,
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
        prompt_cache_hit_tokens: response.usage?.prompt_cache_hit_tokens,
        prompt_cache_miss_tokens: response.usage?.prompt_cache_miss_tokens,
      },
      finish_reason: choice.finish_reason || 'stop',
    };
  }

  /**
   * Build the wire params for a FIM request.
   */
  private buildFimRequestParams(
    params: FimCompletionParams
  ): Record<string, unknown> {
    const requestParams: Record<string, unknown> = {
      model: resolveFimModel(params.model),
      prompt: params.prompt,
      stream: false,
    };
    if (params.suffix !== undefined) requestParams.suffix = params.suffix;
    if (params.max_tokens !== undefined) requestParams.max_tokens = params.max_tokens;
    if (params.temperature !== undefined) requestParams.temperature = params.temperature;
    if (params.stop !== undefined) requestParams.stop = params.stop;
    return requestParams;
  }

  /**
   * Perform a single FIM call against the Beta endpoint.
   */
  private async fimInternal(
    params: FimCompletionParams
  ): Promise<FimCompletionResponse> {
    const requestParams = this.buildFimRequestParams(params);
    const rawResponse = await this.getBetaClient().completions.create(
      requestParams as unknown as OpenAI.CompletionCreateParams
    );
    return this.parseCompletionResponse(
      rawResponse as unknown as DeepSeekRawCompletionResponse
    );
  }

  /**
   * Create a FIM (Fill-in-the-Middle) completion with circuit breaker and
   * automatic model fallback, mirroring the chat-completion resilience path.
   */
  async createFimCompletion(
    params: FimCompletionParams
  ): Promise<FimCompletionResponse & { fallback?: FallbackInfo }> {
    const config = getConfig();

    try {
      return await this.getCircuitBreaker(params.model).execute(async () => {
        return this.fimInternal(params);
      });
    } catch (error: unknown) {
      const fallbackCandidates = FALLBACK_ORDER[params.model];
      if (config.fallbackEnabled && isRetryableError(error) && fallbackCandidates?.length) {
        const fallbackModel = fallbackCandidates[0];
        const reason = getErrorMessage(error);
        console.error(
          `[DeepSeek MCP] FIM primary ${params.model} failed (${reason}), falling back to ${fallbackModel}`
        );

        try {
          const fallbackParams = {
            ...params,
            model: fallbackModel as FimCompletionParams['model'],
          };
          const result = await this.fimInternal(fallbackParams);
          return {
            ...result,
            fallback: { originalModel: params.model, fallbackModel, reason },
          };
        } catch (fallbackError: unknown) {
          throw new FallbackExhaustedError(
            `All models failed (FIM). Primary (${params.model}): ${reason}. Fallback (${fallbackModel}): ${getErrorMessage(fallbackError)}`,
            [params.model, fallbackModel]
          );
        }
      }

      console.error('DeepSeek FIM API Error:', error);
      this.wrapError(error, 'DeepSeek FIM API Error');
    }
  }

  /**
   * Create a chat completion (non-streaming) with circuit breaker and fallback
   */
  async createChatCompletion(
    params: ChatCompletionParams
  ): Promise<ChatCompletionResponseWithFallback> {
    const config = getConfig();

    try {
      // Primary attempt through per-model circuit breaker
      const result = await this.getCircuitBreaker(params.model).execute(async () => {
        const requestParams = this.buildRequestParams(params, false);
        const rawResponse = await this.client.chat.completions.create(requestParams as unknown as OpenAI.ChatCompletionCreateParams);
        return this.parseResponse(rawResponse as unknown as DeepSeekRawResponse);
      });
      return result;
    } catch (error: unknown) {
      // Try fallback if enabled, error is retryable, and fallback candidates exist
      const fallbackCandidates = FALLBACK_ORDER[params.model];
      if (config.fallbackEnabled && isRetryableError(error) && fallbackCandidates?.length) {
        const fallbackModel = fallbackCandidates[0];
        const reason = getErrorMessage(error);
        console.error(
          `[DeepSeek MCP] Primary model ${params.model} failed (${reason}), falling back to ${fallbackModel}`
        );

        try {
          const fallbackParams = { ...params, model: fallbackModel as ChatCompletionParams['model'] };
          // Fallback bypasses circuit breaker (it's a different attempt)
          const requestParams = this.buildRequestParams(fallbackParams, false);
          const rawResponse = await this.client.chat.completions.create(requestParams as unknown as OpenAI.ChatCompletionCreateParams);
          const result = this.parseResponse(rawResponse as unknown as DeepSeekRawResponse);
          return {
            ...result,
            fallback: {
              originalModel: params.model,
              fallbackModel,
              reason,
            },
          };
        } catch (fallbackError: unknown) {
          console.error(
            `[DeepSeek MCP] Fallback model ${fallbackModel} also failed:`,
            fallbackError
          );
          throw new FallbackExhaustedError(
            `All models failed. Primary (${params.model}): ${reason}. Fallback (${fallbackModel}): ${getErrorMessage(fallbackError)}`,
            [params.model, fallbackModel]
          );
        }
      }

      // Not retryable or fallback disabled
      console.error('DeepSeek API Error:', error);
      this.wrapError(error, 'DeepSeek API Error');
    }
  }

  /**
   * Create a streaming chat completion with circuit breaker and fallback
   * Returns the full text after streaming completes (buffered)
   */
  async createStreamingChatCompletion(
    params: ChatCompletionParams
  ): Promise<ChatCompletionResponseWithFallback> {
    const config = getConfig();

    try {
      const result = await this.getCircuitBreaker(params.model).execute(async () => {
        return this.streamInternal(params);
      });
      return result;
    } catch (error: unknown) {
      const fallbackCandidates = FALLBACK_ORDER[params.model];
      if (config.fallbackEnabled && isRetryableError(error) && fallbackCandidates?.length) {
        const fallbackModel = fallbackCandidates[0];
        const reason = getErrorMessage(error);
        console.error(
          `[DeepSeek MCP] Streaming primary ${params.model} failed (${reason}), falling back to ${fallbackModel}`
        );

        try {
          const fallbackParams = { ...params, model: fallbackModel as ChatCompletionParams['model'] };
          const result = await this.streamInternal(fallbackParams);
          return {
            ...result,
            fallback: {
              originalModel: params.model,
              fallbackModel,
              reason,
            },
          };
        } catch (fallbackError: unknown) {
          throw new FallbackExhaustedError(
            `All models failed (streaming). Primary (${params.model}): ${reason}. Fallback (${fallbackModel}): ${getErrorMessage(fallbackError)}`,
            [params.model, fallbackModel]
          );
        }
      }

      console.error('DeepSeek Streaming API Error:', error);
      this.wrapError(error, 'DeepSeek Streaming API Error');
    }
  }

  /**
   * Internal streaming implementation
   */
  private async streamInternal(params: ChatCompletionParams): Promise<ChatCompletionResponse> {
    const requestParams = this.buildRequestParams(params, true);
    const stream = await this.client.chat.completions.create(requestParams as unknown as OpenAI.ChatCompletionCreateParams);

    let fullContent = '';
    let reasoningContent = '';
    let modelName: string = params.model;
    let finishReason = 'stop';
    let usage: ChatCompletionResponse['usage'] = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

    const toolCallsMap = new Map<
      number,
      {
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }
    >();

    for await (const rawChunk of stream as AsyncIterable<unknown>) {
      const chunk = rawChunk as DeepSeekStreamChunk;
      const choice = chunk.choices[0];
      if (!choice) continue;

      if (choice.delta?.content) {
        fullContent += choice.delta.content;
      }

      if (choice.delta && hasReasoningContent(choice.delta)) {
        reasoningContent += choice.delta.reasoning_content;
      }

      if (choice.delta?.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          const existing = toolCallsMap.get(tc.index);
          if (existing) {
            if (tc.function?.name) existing.function.name += tc.function.name;
            if (tc.function?.arguments)
              existing.function.arguments += tc.function.arguments;
          } else {
            toolCallsMap.set(tc.index, {
              id: tc.id || '',
              type: 'function',
              function: {
                name: tc.function?.name || '',
                arguments: tc.function?.arguments || '',
              },
            });
          }
        }
      }

      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }

      if (chunk.model) {
        modelName = chunk.model;
      }

      if (chunk.usage) {
        usage = {
          prompt_tokens: chunk.usage.prompt_tokens,
          completion_tokens: chunk.usage.completion_tokens,
          total_tokens: chunk.usage.total_tokens,
          prompt_cache_hit_tokens: chunk.usage.prompt_cache_hit_tokens,
          prompt_cache_miss_tokens: chunk.usage.prompt_cache_miss_tokens,
        };
      }
    }

    const toolCalls =
      toolCallsMap.size > 0
        ? Array.from(toolCallsMap.entries())
            .sort(([a], [b]) => a - b)
            .map(([, tc]) => tc)
        : undefined;

    return {
      content: fullContent,
      reasoning_content: reasoningContent || undefined,
      model: modelName,
      usage,
      finish_reason: finishReason,
      tool_calls: toolCalls,
    };
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.createChatCompletion({
        model: 'deepseek-v4-flash',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
      });
      return !!response.content;
    } catch (error: unknown) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
}
