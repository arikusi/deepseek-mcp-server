import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ToolDefinitionSchema,
  ToolChoiceSchema,
  ChatInputWithToolsSchema,
  ExtendedMessageSchema,
} from './schemas.js';
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

const { DeepSeekClient } = await import('./deepseek-client.js');

describe('Function Calling', () => {
  describe('ToolDefinitionSchema validation', () => {
    it('should validate a complete tool definition', () => {
      const tool = {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get the weather for a location',
          parameters: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'City name',
              },
              unit: {
                type: 'string',
                enum: ['celsius', 'fahrenheit'],
              },
            },
            required: ['location'],
          },
        },
      };
      expect(ToolDefinitionSchema.safeParse(tool).success).toBe(true);
    });

    it('should validate minimal tool definition', () => {
      const tool = {
        type: 'function',
        function: { name: 'do_something' },
      };
      expect(ToolDefinitionSchema.safeParse(tool).success).toBe(true);
    });

    it('should validate tool with strict mode', () => {
      const tool = {
        type: 'function',
        function: {
          name: 'strict_fn',
          strict: true,
          parameters: { type: 'object', properties: {} },
        },
      };
      expect(ToolDefinitionSchema.safeParse(tool).success).toBe(true);
    });

    it('should reject tool with empty name', () => {
      const tool = {
        type: 'function',
        function: { name: '' },
      };
      expect(ToolDefinitionSchema.safeParse(tool).success).toBe(false);
    });

    it('should reject invalid type', () => {
      const tool = {
        type: 'webhook',
        function: { name: 'test' },
      };
      expect(ToolDefinitionSchema.safeParse(tool).success).toBe(false);
    });
  });

  describe('ToolChoiceSchema variants', () => {
    it('should accept all string variants', () => {
      expect(ToolChoiceSchema.safeParse('auto').success).toBe(true);
      expect(ToolChoiceSchema.safeParse('none').success).toBe(true);
      expect(ToolChoiceSchema.safeParse('required').success).toBe(true);
    });

    it('should accept specific function choice', () => {
      const choice = {
        type: 'function',
        function: { name: 'get_weather' },
      };
      expect(ToolChoiceSchema.safeParse(choice).success).toBe(true);
    });

    it('should reject invalid string values', () => {
      expect(ToolChoiceSchema.safeParse('always').success).toBe(false);
      expect(ToolChoiceSchema.safeParse('force').success).toBe(false);
      expect(ToolChoiceSchema.safeParse('').success).toBe(false);
    });

    it('should reject malformed object', () => {
      expect(
        ToolChoiceSchema.safeParse({ type: 'function' }).success
      ).toBe(false);
      expect(
        ToolChoiceSchema.safeParse({ function: { name: 'test' } }).success
      ).toBe(false);
    });
  });

  describe('ChatInputWithToolsSchema backward compatibility', () => {
    it('should work exactly like ChatInputSchema without tools', () => {
      const input = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'deepseek-chat',
        temperature: 0.7,
        max_tokens: 1000,
      };
      const result = ChatInputWithToolsSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tools).toBeUndefined();
        expect(result.data.tool_choice).toBeUndefined();
      }
    });

    it('should accept deepseek-reasoner model', () => {
      const result = ChatInputWithToolsSchema.safeParse({
        messages: [{ role: 'user', content: 'Think about this' }],
        model: 'deepseek-reasoner',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('128+ tools rejection', () => {
    it('should reject 129 tools', () => {
      const tools = Array.from({ length: 129 }, (_, i) => ({
        type: 'function' as const,
        function: { name: `tool_${i}` },
      }));
      const result = ChatInputWithToolsSchema.safeParse({
        messages: [{ role: 'user', content: 'Hi' }],
        tools,
      });
      expect(result.success).toBe(false);
    });

    it('should accept 128 tools', () => {
      const tools = Array.from({ length: 128 }, (_, i) => ({
        type: 'function' as const,
        function: { name: `tool_${i}` },
      }));
      const result = ChatInputWithToolsSchema.safeParse({
        messages: [{ role: 'user', content: 'Hi' }],
        tools,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Tool role messages', () => {
    it('should accept tool role in messages', () => {
      const result = ExtendedMessageSchema.safeParse({
        role: 'tool',
        content: '{"temperature": 72}',
        tool_call_id: 'call_abc123',
      });
      expect(result.success).toBe(true);
    });

    it('should accept mixed message roles including tool', () => {
      const result = ChatInputWithToolsSchema.safeParse({
        messages: [
          { role: 'user', content: 'What is the weather?' },
          { role: 'assistant', content: '' },
          {
            role: 'tool',
            content: '{"temp": 72}',
            tool_call_id: 'call_123',
          },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Client tool_calls response handling', () => {
    beforeEach(() => {
      resetConfig();
      process.env.DEEPSEEK_API_KEY = 'test-key';
      loadConfig();
      mockCreate.mockReset();
    });

    it('should pass tools to API request', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { content: 'I will check the weather', tool_calls: undefined },
            finish_reason: 'stop',
          },
        ],
        model: 'deepseek-chat',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const client = new DeepSeekClient();
      const tools = [
        {
          type: 'function' as const,
          function: {
            name: 'get_weather',
            description: 'Get weather',
            parameters: {
              type: 'object',
              properties: { location: { type: 'string' } },
            },
          },
        },
      ];

      await client.createChatCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Weather?' }],
        tools,
        tool_choice: 'auto',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools,
          tool_choice: 'auto',
        })
      );
    });

    it('should not include tools when not provided', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { content: 'Hello!' },
            finish_reason: 'stop',
          },
        ],
        model: 'deepseek-chat',
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
      });

      const client = new DeepSeekClient();
      await client.createChatCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.tools).toBeUndefined();
      expect(callArgs.tool_choice).toBeUndefined();
    });

    it('should handle response with tool_calls and content', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: 'Let me check that for you.',
              tool_calls: [
                {
                  id: 'call_xyz',
                  type: 'function',
                  function: {
                    name: 'search',
                    arguments: '{"query":"weather NYC"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        model: 'deepseek-chat',
        usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 },
      });

      const client = new DeepSeekClient();
      const response = await client.createChatCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Search weather' }],
        tools: [
          {
            type: 'function',
            function: { name: 'search' },
          },
        ],
      });

      expect(response.content).toBe('Let me check that for you.');
      expect(response.tool_calls).toHaveLength(1);
      expect(response.tool_calls![0].function.name).toBe('search');
    });
  });
});
