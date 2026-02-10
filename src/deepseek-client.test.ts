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

    it('should throw on API error', async () => {
      mockCreate.mockRejectedValue(new Error('API rate limit exceeded'));

      const client = new DeepSeekClient();
      await expect(
        client.createChatCompletion({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow('DeepSeek API Error: API rate limit exceeded');
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
