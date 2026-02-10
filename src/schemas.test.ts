import { describe, it, expect } from 'vitest';
import {
  MessageSchema,
  ChatInputSchema,
  ExtendedMessageSchema,
  ToolDefinitionSchema,
  ToolChoiceSchema,
  ChatInputWithToolsSchema,
  FunctionDefinitionSchema,
} from './schemas.js';

describe('schemas', () => {
  describe('MessageSchema', () => {
    it('should accept valid user message', () => {
      const result = MessageSchema.safeParse({
        role: 'user',
        content: 'Hello',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid system message', () => {
      const result = MessageSchema.safeParse({
        role: 'system',
        content: 'You are helpful',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid assistant message', () => {
      const result = MessageSchema.safeParse({
        role: 'assistant',
        content: 'Hi there',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid role', () => {
      const result = MessageSchema.safeParse({
        role: 'invalid',
        content: 'Hello',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing content', () => {
      const result = MessageSchema.safeParse({ role: 'user' });
      expect(result.success).toBe(false);
    });
  });

  describe('ChatInputSchema', () => {
    it('should accept valid input with defaults', () => {
      const result = ChatInputSchema.parse({
        messages: [{ role: 'user', content: 'Hi' }],
      });
      expect(result.model).toBe('deepseek-chat');
      expect(result.stream).toBe(false);
    });

    it('should accept all parameters', () => {
      const result = ChatInputSchema.parse({
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'deepseek-reasoner',
        temperature: 0.5,
        max_tokens: 1000,
        stream: true,
      });
      expect(result.model).toBe('deepseek-reasoner');
      expect(result.temperature).toBe(0.5);
      expect(result.max_tokens).toBe(1000);
      expect(result.stream).toBe(true);
    });

    it('should reject empty messages array', () => {
      const result = ChatInputSchema.safeParse({ messages: [] });
      expect(result.success).toBe(false);
    });

    it('should reject temperature above 2', () => {
      const result = ChatInputSchema.safeParse({
        messages: [{ role: 'user', content: 'Hi' }],
        temperature: 3,
      });
      expect(result.success).toBe(false);
    });

    it('should reject temperature below 0', () => {
      const result = ChatInputSchema.safeParse({
        messages: [{ role: 'user', content: 'Hi' }],
        temperature: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should reject max_tokens of 0', () => {
      const result = ChatInputSchema.safeParse({
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid model', () => {
      const result = ChatInputSchema.safeParse({
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'gpt-4',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ExtendedMessageSchema', () => {
    it('should accept tool role with tool_call_id', () => {
      const result = ExtendedMessageSchema.safeParse({
        role: 'tool',
        content: '{"result": "ok"}',
        tool_call_id: 'call_123',
      });
      expect(result.success).toBe(true);
    });

    it('should accept user role without tool_call_id', () => {
      const result = ExtendedMessageSchema.safeParse({
        role: 'user',
        content: 'Hello',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all original roles', () => {
      for (const role of ['system', 'user', 'assistant', 'tool']) {
        const result = ExtendedMessageSchema.safeParse({
          role,
          content: 'test',
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('FunctionDefinitionSchema', () => {
    it('should accept minimal definition', () => {
      const result = FunctionDefinitionSchema.safeParse({
        name: 'test_fn',
      });
      expect(result.success).toBe(true);
    });

    it('should accept full definition', () => {
      const result = FunctionDefinitionSchema.safeParse({
        name: 'get_weather',
        description: 'Get current weather',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string' },
          },
          required: ['location'],
        },
        strict: true,
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty name', () => {
      const result = FunctionDefinitionSchema.safeParse({
        name: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing name', () => {
      const result = FunctionDefinitionSchema.safeParse({
        description: 'test',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ToolDefinitionSchema', () => {
    it('should accept valid tool definition', () => {
      const result = ToolDefinitionSchema.safeParse({
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather info',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string' },
            },
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject wrong type', () => {
      const result = ToolDefinitionSchema.safeParse({
        type: 'other',
        function: { name: 'test' },
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing function', () => {
      const result = ToolDefinitionSchema.safeParse({
        type: 'function',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ToolChoiceSchema', () => {
    it('should accept "auto"', () => {
      expect(ToolChoiceSchema.safeParse('auto').success).toBe(true);
    });

    it('should accept "none"', () => {
      expect(ToolChoiceSchema.safeParse('none').success).toBe(true);
    });

    it('should accept "required"', () => {
      expect(ToolChoiceSchema.safeParse('required').success).toBe(true);
    });

    it('should accept specific function choice', () => {
      const result = ToolChoiceSchema.safeParse({
        type: 'function',
        function: { name: 'get_weather' },
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid string', () => {
      expect(ToolChoiceSchema.safeParse('always').success).toBe(false);
    });

    it('should reject object with empty function name', () => {
      const result = ToolChoiceSchema.safeParse({
        type: 'function',
        function: { name: '' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ChatInputWithToolsSchema', () => {
    it('should accept input without tools (backward compat)', () => {
      const result = ChatInputWithToolsSchema.safeParse({
        messages: [{ role: 'user', content: 'Hi' }],
      });
      expect(result.success).toBe(true);
    });

    it('should apply defaults correctly', () => {
      const result = ChatInputWithToolsSchema.parse({
        messages: [{ role: 'user', content: 'Hi' }],
      });
      expect(result.model).toBe('deepseek-chat');
      expect(result.stream).toBe(false);
      expect(result.tools).toBeUndefined();
      expect(result.tool_choice).toBeUndefined();
    });

    it('should accept input with tools and tool_choice', () => {
      const result = ChatInputWithToolsSchema.safeParse({
        messages: [{ role: 'user', content: 'What is the weather?' }],
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
        tool_choice: 'auto',
      });
      expect(result.success).toBe(true);
    });

    it('should accept tool role messages', () => {
      const result = ChatInputWithToolsSchema.safeParse({
        messages: [
          { role: 'user', content: 'What is the weather?' },
          {
            role: 'tool',
            content: '{"temp": 72}',
            tool_call_id: 'call_123',
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject more than 128 tools', () => {
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

    it('should accept exactly 128 tools', () => {
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
});
