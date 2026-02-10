/**
 * DeepSeek API Client
 * Wrapper around OpenAI SDK for DeepSeek API
 */

import OpenAI from 'openai';
import { getConfig } from './config.js';
import type {
  ChatCompletionParams,
  ChatCompletionResponse,
  DeepSeekModel,
} from './types.js';

export class DeepSeekClient {
  private client: OpenAI;

  constructor() {
    const config = getConfig();

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.requestTimeout,
      maxRetries: config.maxRetries,
    });
  }

  /**
   * Create a chat completion (non-streaming)
   */
  async createChatCompletion(
    params: ChatCompletionParams
  ): Promise<ChatCompletionResponse> {
    try {
      // Build request params - using 'any' for OpenAI SDK compatibility
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requestParams: any = {
        model: params.model,
        messages: params.messages,
        temperature: params.temperature ?? 1.0,
        max_tokens: params.max_tokens,
        top_p: params.top_p,
        frequency_penalty: params.frequency_penalty,
        presence_penalty: params.presence_penalty,
        stop: params.stop,
        stream: false,
      };

      if (params.tools?.length) {
        requestParams.tools = params.tools;
      }
      if (params.tool_choice !== undefined) {
        requestParams.tool_choice = params.tool_choice;
      }

      const response = await this.client.chat.completions.create(requestParams);

      const choice = (response as any).choices[0];
      if (!choice) {
        throw new Error('No response from DeepSeek API');
      }

      // Extract reasoning content if available (for deepseek-reasoner)
      const reasoning_content =
        'reasoning_content' in choice.message
          ? (choice.message as any).reasoning_content
          : undefined;

      // Extract tool_calls if present
      const tool_calls = choice.message.tool_calls?.map((tc: any) => ({
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
        model: (response as any).model,
        usage: {
          prompt_tokens: (response as any).usage?.prompt_tokens || 0,
          completion_tokens: (response as any).usage?.completion_tokens || 0,
          total_tokens: (response as any).usage?.total_tokens || 0,
        },
        finish_reason: choice.finish_reason || 'stop',
        tool_calls: tool_calls?.length ? tool_calls : undefined,
      };
    } catch (error: any) {
      console.error('DeepSeek API Error:', error);
      throw new Error(
        `DeepSeek API Error: ${error?.message || 'Unknown error'}`
      );
    }
  }

  /**
   * Create a streaming chat completion
   * Returns the full text after streaming completes (buffered)
   */
  async createStreamingChatCompletion(
    params: ChatCompletionParams
  ): Promise<ChatCompletionResponse> {
    try {
      // Build request params - using 'any' for OpenAI SDK compatibility
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requestParams: any = {
        model: params.model,
        messages: params.messages,
        temperature: params.temperature ?? 1.0,
        max_tokens: params.max_tokens,
        top_p: params.top_p,
        frequency_penalty: params.frequency_penalty,
        presence_penalty: params.presence_penalty,
        stop: params.stop,
        stream: true,
      };

      if (params.tools?.length) {
        requestParams.tools = params.tools;
      }
      if (params.tool_choice !== undefined) {
        requestParams.tool_choice = params.tool_choice;
      }

      const stream = await this.client.chat.completions.create(requestParams);

      let fullContent = '';
      let reasoningContent = '';
      let modelName = params.model;
      let finishReason = 'stop';
      let usage = {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };

      // Tool calls accumulation (index-based)
      const toolCallsMap = new Map<
        number,
        {
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }
      >();

      // Collect all chunks
      for await (const chunk of stream as any) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        // Collect content
        if (choice.delta?.content) {
          fullContent += choice.delta.content;
        }

        // Collect reasoning content (for deepseek-reasoner)
        if ('reasoning_content' in (choice.delta || {})) {
          reasoningContent += (choice.delta as any).reasoning_content || '';
        }

        // Accumulate tool_calls deltas
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

        // Get finish reason
        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }

        // Get model name
        if (chunk.model) {
          modelName = chunk.model as DeepSeekModel;
        }

        // Get usage info (usually in last chunk)
        if ((chunk as any).usage) {
          usage = (chunk as any).usage;
        }
      }

      // Convert tool calls map to sorted array
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
    } catch (error: any) {
      console.error('DeepSeek Streaming API Error:', error);
      throw new Error(
        `DeepSeek Streaming API Error: ${error?.message || 'Unknown error'}`
      );
    }
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.createChatCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
      });
      return !!response.content;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
}
