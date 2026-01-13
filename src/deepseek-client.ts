/**
 * DeepSeek API Client
 * Wrapper around OpenAI SDK for DeepSeek API
 */

import OpenAI from 'openai';
import type {
  ChatCompletionParams,
  ChatCompletionResponse,
  DeepSeekModel
} from './types.js';

export class DeepSeekClient {
  private client: OpenAI;
  private baseURL = 'https://api.deepseek.com';

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('DeepSeek API key is required');
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: this.baseURL,
    });
  }

  /**
   * Create a chat completion (non-streaming)
   */
  async createChatCompletion(
    params: ChatCompletionParams
  ): Promise<ChatCompletionResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature ?? 1.0,
        max_tokens: params.max_tokens,
        top_p: params.top_p,
        frequency_penalty: params.frequency_penalty,
        presence_penalty: params.presence_penalty,
        stop: params.stop,
        stream: false,
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new Error('No response from DeepSeek API');
      }

      // Extract reasoning content if available (for deepseek-reasoner)
      const reasoning_content =
        'reasoning_content' in choice.message
          ? (choice.message as any).reasoning_content
          : undefined;

      return {
        content: choice.message.content || '',
        reasoning_content,
        model: response.model,
        usage: {
          prompt_tokens: response.usage?.prompt_tokens || 0,
          completion_tokens: response.usage?.completion_tokens || 0,
          total_tokens: response.usage?.total_tokens || 0,
        },
        finish_reason: choice.finish_reason || 'stop',
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
   * Returns the full text after streaming completes
   */
  async createStreamingChatCompletion(
    params: ChatCompletionParams
  ): Promise<ChatCompletionResponse> {
    try {
      const stream = await this.client.chat.completions.create({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature ?? 1.0,
        max_tokens: params.max_tokens,
        top_p: params.top_p,
        frequency_penalty: params.frequency_penalty,
        presence_penalty: params.presence_penalty,
        stop: params.stop,
        stream: true,
      });

      let fullContent = '';
      let reasoningContent = '';
      let modelName = params.model;
      let finishReason = 'stop';
      let usage = {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };

      // Collect all chunks
      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        // Collect content
        if (choice.delta?.content) {
          fullContent += choice.delta.content;
        }

        // Collect reasoning content (for deepseek-reasoner)
        if ('reasoning_content' in choice.delta) {
          reasoningContent += (choice.delta as any).reasoning_content || '';
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

      return {
        content: fullContent,
        reasoning_content: reasoningContent || undefined,
        model: modelName,
        usage,
        finish_reason: finishReason,
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
