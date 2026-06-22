import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadConfig, resetConfig } from './config.js';

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: mockCreate,
      },
    };
  },
}));

// Import after mock setup
const { DeepSeekClient } = await import('./deepseek-client.js');

describe('DeepSeekClient', () => {
  beforeEach(() => {
    resetConfig();
    process.env.DEEPSEEK_API_KEY = 'test-key';
    loadConfig();
    mockCreate.mockReset();
  });

  it('should create client successfully', () => {
    const client = new DeepSeekClient();
    expect(client).toBeInstanceOf(DeepSeekClient);
  });

  describe('createChatCompletion', () => {
    it('should return normal chat response', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { content: 'Hello!', tool_calls: undefined },
            finish_reason: 'stop',
          },
        ],
        model: 'deepseek-chat',
        usage: {
          prompt_tokens: 5,
          completion_tokens: 2,
          total_tokens: 7,
        },
      });

      const client = new DeepSeekClient();
      const response = await client.createChatCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(response.content).toBe('Hello!');
      expect(response.model).toBe('deepseek-chat');
      expect(response.usage.total_tokens).toBe(7);
      expect(response.finish_reason).toBe('stop');
      expect(response.tool_calls).toBeUndefined();
    });

    it('should handle reasoning content (R1 model)', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: 'The answer is 42',
              reasoning_content: 'Let me think step by step...',
            },
            finish_reason: 'stop',
          },
        ],
        model: 'deepseek-reasoner',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      });

      const client = new DeepSeekClient();
      const response = await client.createChatCompletion({
        model: 'deepseek-reasoner',
        messages: [{ role: 'user', content: 'What is the meaning of life?' }],
      });

      expect(response.content).toBe('The answer is 42');
      expect(response.reasoning_content).toBe('Let me think step by step...');
      expect(response.model).toBe('deepseek-reasoner');
    });

    it('should return tool_calls from response', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_abc123',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"location":"NYC"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        model: 'deepseek-chat',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      });

      const client = new DeepSeekClient();
      const response = await client.createChatCompletion({
        model: 'deepseek-chat',
        messages: [
          { role: 'user', content: 'What is the weather in NYC?' },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              parameters: {
                type: 'object',
                properties: { location: { type: 'string' } },
              },
            },
          },
        ],
      });

      expect(response.tool_calls).toBeDefined();
      expect(response.tool_calls).toHaveLength(1);
      expect(response.tool_calls![0].function.name).toBe('get_weather');
      expect(response.tool_calls![0].function.arguments).toBe(
        '{"location":"NYC"}'
      );
      expect(response.tool_calls![0].id).toBe('call_abc123');
      expect(response.finish_reason).toBe('tool_calls');
    });

    it('should handle multiple tool_calls', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"location":"NYC"}',
                  },
                },
                {
                  id: 'call_2',
                  type: 'function',
                  function: {
                    name: 'get_time',
                    arguments: '{"timezone":"EST"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        model: 'deepseek-chat',
        usage: {
          prompt_tokens: 15,
          completion_tokens: 10,
          total_tokens: 25,
        },
      });

      const client = new DeepSeekClient();
      const response = await client.createChatCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Weather and time?' }],
        tools: [
          {
            type: 'function',
            function: { name: 'get_weather' },
          },
          {
            type: 'function',
            function: { name: 'get_time' },
          },
        ],
      });

      expect(response.tool_calls).toHaveLength(2);
      expect(response.tool_calls![0].function.name).toBe('get_weather');
      expect(response.tool_calls![1].function.name).toBe('get_time');
    });

    it('should throw FallbackExhaustedError on retryable API error (both models fail)', async () => {
      mockCreate.mockRejectedValue(new Error('API rate limit exceeded'));

      const client = new DeepSeekClient();
      await expect(
        client.createChatCompletion({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow('All models failed');
    });

    it('should throw ApiError on non-retryable error (no fallback)', async () => {
      mockCreate.mockRejectedValue(new Error('Invalid request format'));

      const client = new DeepSeekClient();
      await expect(
        client.createChatCompletion({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow('DeepSeek API Error: Invalid request format');
    });

    it('should throw when no choices returned', async () => {
      mockCreate.mockResolvedValue({
        choices: [],
        model: 'deepseek-chat',
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });

      const client = new DeepSeekClient();
      await expect(
        client.createChatCompletion({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow('No response from DeepSeek API');
    });

    it('should extract cache token fields from usage', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { content: 'Hello!', tool_calls: undefined },
            finish_reason: 'stop',
          },
        ],
        model: 'deepseek-chat',
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          prompt_cache_hit_tokens: 80,
          prompt_cache_miss_tokens: 20,
        },
      });

      const client = new DeepSeekClient();
      const response = await client.createChatCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(response.usage.prompt_cache_hit_tokens).toBe(80);
      expect(response.usage.prompt_cache_miss_tokens).toBe(20);
    });

    it('should pass thinking param as top-level property', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { content: 'Response', tool_calls: undefined },
            finish_reason: 'stop',
          },
        ],
        model: 'deepseek-chat',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const client = new DeepSeekClient();
      await client.createChatCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Think about this' }],
        thinking: { type: 'enabled' },
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          thinking: { type: 'enabled' },
        })
      );
    });

    it('should filter incompatible params when thinking is enabled', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { content: 'Response', tool_calls: undefined },
            finish_reason: 'stop',
          },
        ],
        model: 'deepseek-chat',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const client = new DeepSeekClient();
      await client.createChatCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Think' }],
        thinking: { type: 'enabled' },
        temperature: 0.5,
        top_p: 0.9,
      });

      // temperature and top_p are not sent while thinking mode is active
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.temperature).toBeUndefined();
      expect(callArgs.top_p).toBeUndefined();
      expect(callArgs.thinking).toEqual({ type: 'enabled' });

      mockError.mockRestore();
    });

    it('should pass response_format for JSON mode', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { content: '{"key":"value"}', tool_calls: undefined },
            finish_reason: 'stop',
          },
        ],
        model: 'deepseek-chat',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const client = new DeepSeekClient();
      await client.createChatCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Return JSON' }],
        response_format: { type: 'json_object' },
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          response_format: { type: 'json_object' },
        })
      );
    });
  });

  describe('createStreamingChatCompletion', () => {
    it('should accumulate streamed content', async () => {
      const chunks = [
        {
          choices: [{ delta: { content: 'Hello' }, finish_reason: null }],
          model: 'deepseek-chat',
        },
        {
          choices: [{ delta: { content: ' world' }, finish_reason: null }],
          model: 'deepseek-chat',
        },
        {
          choices: [{ delta: {}, finish_reason: 'stop' }],
          model: 'deepseek-chat',
          usage: {
            prompt_tokens: 5,
            completion_tokens: 3,
            total_tokens: 8,
          },
        },
      ];

      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        },
      });

      const client = new DeepSeekClient();
      const response = await client.createStreamingChatCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(response.content).toBe('Hello world');
      expect(response.finish_reason).toBe('stop');
      expect(response.usage.total_tokens).toBe(8);
    });

    it('should accumulate tool_calls deltas', async () => {
      const chunks = [
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_123',
                    type: 'function',
                    function: { name: 'get_', arguments: '' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
          model: 'deepseek-chat',
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: { name: 'weather', arguments: '{"loc' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
          model: 'deepseek-chat',
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: { arguments: 'ation":"NYC"}' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
          model: 'deepseek-chat',
        },
        {
          choices: [{ delta: {}, finish_reason: 'tool_calls' }],
          model: 'deepseek-chat',
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        },
      ];

      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        },
      });

      const client = new DeepSeekClient();
      const response = await client.createStreamingChatCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Weather?' }],
        tools: [
          {
            type: 'function',
            function: { name: 'get_weather' },
          },
        ],
      });

      expect(response.tool_calls).toBeDefined();
      expect(response.tool_calls).toHaveLength(1);
      expect(response.tool_calls![0].id).toBe('call_123');
      expect(response.tool_calls![0].function.name).toBe('get_weather');
      expect(response.tool_calls![0].function.arguments).toBe(
        '{"location":"NYC"}'
      );
      expect(response.finish_reason).toBe('tool_calls');
    });

    it('should accumulate reasoning content in streaming', async () => {
      const chunks = [
        {
          choices: [
            {
              delta: { reasoning_content: 'Step 1: ' },
              finish_reason: null,
            },
          ],
          model: 'deepseek-reasoner',
        },
        {
          choices: [
            {
              delta: { content: 'Answer', reasoning_content: 'Step 2' },
              finish_reason: null,
            },
          ],
          model: 'deepseek-reasoner',
        },
        {
          choices: [{ delta: {}, finish_reason: 'stop' }],
          model: 'deepseek-reasoner',
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
          },
        },
      ];

      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        },
      });

      const client = new DeepSeekClient();
      const response = await client.createStreamingChatCompletion({
        model: 'deepseek-reasoner',
        messages: [{ role: 'user', content: 'Think about this' }],
      });

      expect(response.content).toBe('Answer');
      expect(response.reasoning_content).toBe('Step 1: Step 2');
      expect(response.model).toBe('deepseek-reasoner');
    });

    it('should extract cache tokens from streaming final chunk', async () => {
      const chunks = [
        {
          choices: [{ delta: { content: 'Hi' }, finish_reason: null }],
          model: 'deepseek-chat',
        },
        {
          choices: [{ delta: {}, finish_reason: 'stop' }],
          model: 'deepseek-chat',
          usage: {
            prompt_tokens: 100,
            completion_tokens: 10,
            total_tokens: 110,
            prompt_cache_hit_tokens: 60,
            prompt_cache_miss_tokens: 40,
          },
        },
      ];

      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        },
      });

      const client = new DeepSeekClient();
      const response = await client.createStreamingChatCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(response.usage.prompt_cache_hit_tokens).toBe(60);
      expect(response.usage.prompt_cache_miss_tokens).toBe(40);
    });

    it('should handle streaming error', async () => {
      mockCreate.mockRejectedValue(new Error('Stream connection lost'));

      const client = new DeepSeekClient();
      await expect(
        client.createStreamingChatCompletion({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow('DeepSeek Streaming API Error: Stream connection lost');
    });

    it('should fallback to other model on streaming retryable error', async () => {
      let callCount = 0;
      mockCreate.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('429 rate limit'));
        }
        return Promise.resolve({
          [Symbol.asyncIterator]: async function* () {
            yield {
              choices: [{ delta: { content: 'Fallback response' }, finish_reason: null }],
              model: 'deepseek-reasoner',
            };
            yield {
              choices: [{ delta: {}, finish_reason: 'stop' }],
              model: 'deepseek-reasoner',
              usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
            };
          },
        });
      });

      const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const client = new DeepSeekClient();
      const response = await client.createStreamingChatCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(response.content).toBe('Fallback response');
      expect(response.fallback).toBeDefined();
      expect(response.fallback!.originalModel).toBe('deepseek-chat');
      expect(response.fallback!.fallbackModel).toBe('deepseek-v4-pro');
      expect(response.fallback!.reason).toContain('429');
      mockError.mockRestore();
    });

    it('should throw FallbackExhaustedError when streaming both models fail', async () => {
      mockCreate.mockRejectedValue(new Error('503 service unavailable'));

      const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const client = new DeepSeekClient();
      await expect(
        client.createStreamingChatCompletion({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow('All models failed (streaming)');
      mockError.mockRestore();
    });

    it('should not fallback on streaming non-retryable error', async () => {
      mockCreate.mockRejectedValue(new Error('Invalid request format'));

      const client = new DeepSeekClient();
      await expect(
        client.createStreamingChatCompletion({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow('DeepSeek Streaming API Error: Invalid request format');

      // mockCreate should only be called once (no fallback attempt)
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should not fallback when streaming fallback is disabled', async () => {
      resetConfig();
      process.env.DEEPSEEK_API_KEY = 'test-key';
      process.env.FALLBACK_ENABLED = 'false';
      loadConfig();

      mockCreate.mockRejectedValue(new Error('429 rate limit'));

      const client = new DeepSeekClient();
      await expect(
        client.createStreamingChatCompletion({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow('DeepSeek Streaming API Error');

      expect(mockCreate).toHaveBeenCalledTimes(1);

      // Clean up
      delete process.env.FALLBACK_ENABLED;
    });
  });

  describe('model alias resolution (V4)', () => {
    it('should resolve deepseek-reasoner to deepseek-v4-flash with thinking enabled', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { content: 'Answer', reasoning_content: 'Thinking...' },
            finish_reason: 'stop',
          },
        ],
        model: 'deepseek-v4-flash',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const client = new DeepSeekClient();
      await client.createChatCompletion({
        model: 'deepseek-reasoner',
        messages: [{ role: 'user', content: 'Think about this' }],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'deepseek-v4-flash',
          thinking: { type: 'enabled' },
        })
      );
      mockError.mockRestore();
    });

    it('should ignore sampling params when reasoner (thinking) is selected', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { content: 'Answer' },
            finish_reason: 'stop',
          },
        ],
        model: 'deepseek-v4-flash',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const client = new DeepSeekClient();
      await client.createChatCompletion({
        model: 'deepseek-reasoner',
        messages: [{ role: 'user', content: 'Think' }],
        temperature: 0.5,
        top_p: 0.9,
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('deepseek-v4-flash');
      expect(callArgs.thinking).toEqual({ type: 'enabled' });
      expect(callArgs.temperature).toBeUndefined();
      expect(callArgs.top_p).toBeUndefined();
      mockError.mockRestore();
    });

    it('should allow function calling with reasoner via routing', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'get_weather', arguments: '{"city":"NYC"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        model: 'deepseek-v4-flash',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const client = new DeepSeekClient();
      const response = await client.createChatCompletion({
        model: 'deepseek-reasoner',
        messages: [{ role: 'user', content: 'Weather?' }],
        tools: [
          {
            type: 'function',
            function: { name: 'get_weather', parameters: { type: 'object' } },
          },
        ],
      });

      // Should route to v4-flash + thinking with tools
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'deepseek-v4-flash',
          thinking: { type: 'enabled' },
          tools: expect.any(Array),
        })
      );
      expect(response.tool_calls).toHaveLength(1);
      expect(response.tool_calls![0].function.name).toBe('get_weather');
      mockError.mockRestore();
    });

    it('should resolve deepseek-chat to v4-flash with thinking disabled by default', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { content: 'Hello!' },
            finish_reason: 'stop',
          },
        ],
        model: 'deepseek-v4-flash',
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
      });

      const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const client = new DeepSeekClient();
      await client.createChatCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      // chat alias -> v4-flash, non-thinking (explicit disabled to override API default)
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'deepseek-v4-flash',
          temperature: 1.0,
          thinking: { type: 'disabled' },
        })
      );
      mockError.mockRestore();
    });

    it('should honour explicit thinking:enabled on deepseek-chat', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { content: 'Response', reasoning_content: 'Thinking...' },
            finish_reason: 'stop',
          },
        ],
        model: 'deepseek-v4-flash',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const client = new DeepSeekClient();
      await client.createChatCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Think' }],
        thinking: { type: 'enabled' },
        temperature: 0.5,
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('deepseek-v4-flash');
      expect(callArgs.thinking).toEqual({ type: 'enabled' });
      expect(callArgs.temperature).toBeUndefined();
      mockError.mockRestore();
    });

    it('should pass deepseek-v4-pro through unchanged, non-thinking by default', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { content: 'Pro answer' },
            finish_reason: 'stop',
          },
        ],
        model: 'deepseek-v4-pro',
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
      });

      const client = new DeepSeekClient();
      await client.createChatCompletion({
        model: 'deepseek-v4-pro',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'deepseek-v4-pro',
          thinking: { type: 'disabled' },
        })
      );
    });

    it('should enable thinking on v4-pro when requested with reasoning_effort', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { content: 'Pro answer', reasoning_content: 'CoT' },
            finish_reason: 'stop',
          },
        ],
        model: 'deepseek-v4-pro',
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
      });

      const client = new DeepSeekClient();
      await client.createChatCompletion({
        model: 'deepseek-v4-pro',
        messages: [{ role: 'user', content: 'Hard problem' }],
        thinking: { type: 'enabled' },
        reasoning_effort: 'max',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'deepseek-v4-pro',
          thinking: { type: 'enabled' },
          reasoning_effort: 'max',
        })
      );
    });
  });

  describe('testConnection', () => {
    it('should return true on successful connection', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { content: 'Hi!' },
            finish_reason: 'stop',
          },
        ],
        model: 'deepseek-chat',
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });

      const client = new DeepSeekClient();
      const result = await client.testConnection();
      expect(result).toBe(true);
    });

    it('should return false on connection failure', async () => {
      mockCreate.mockRejectedValue(new Error('Connection refused'));
      const mockError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const client = new DeepSeekClient();
      const result = await client.testConnection();
      expect(result).toBe(false);

      mockError.mockRestore();
    });
  });
});
