import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadConfig, resetConfig } from '../config.js';
import { SessionStore } from '../session.js';
import { registerChatTool } from './deepseek-chat.js';

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

function createMockServer() {
  const tools = new Map<string, { config: unknown; handler: Function }>();
  return {
    registerTool: vi.fn((name: string, config: unknown, handler: Function) => {
      tools.set(name, { config, handler });
    }),
    tools,
  };
}

describe('tools/deepseek-chat', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let store: SessionStore;

  beforeEach(() => {
    resetConfig();
    process.env.DEEPSEEK_API_KEY = 'test-key';
    loadConfig();
    mockCreate.mockReset();
    mockServer = createMockServer();
    store = new SessionStore();
  });

  it('should register deepseek_chat tool', async () => {
    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'deepseek_chat',
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('should return formatted response with cost info', async () => {
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

    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const result = await handler({
      messages: [{ role: 'user', content: 'Hi' }],
      model: 'deepseek-chat',
    });

    expect(result.content[0].text).toContain('Hello!');
    expect(result.content[0].text).toContain('Tokens:');
    expect(result.structuredContent.content).toBe('Hello!');
    expect(result.structuredContent.cost_usd).toBeDefined();
  });

  it('should format reasoning content with thinking tags', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: 'Answer is 42',
            reasoning_content: 'Step by step...',
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

    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const result = await handler({
      messages: [{ role: 'user', content: 'Think' }],
      model: 'deepseek-reasoner',
    });

    expect(result.content[0].text).toContain('<thinking>');
    expect(result.content[0].text).toContain('Step by step...');
    expect(result.content[0].text).toContain('</thinking>');
  });

  it('should format tool calls in response', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: '',
            tool_calls: [
              {
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"city":"NYC"}',
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      model: 'deepseek-chat',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const result = await handler({
      messages: [{ role: 'user', content: 'Weather?' }],
      model: 'deepseek-chat',
      tools: [
        { type: 'function', function: { name: 'get_weather' } },
      ],
    });

    expect(result.content[0].text).toContain('Function Calls');
    expect(result.content[0].text).toContain('get_weather');
    expect(result.content[0].text).toContain('call_123');
  });

  it('should return error response on failure', async () => {
    mockCreate.mockRejectedValue(new Error('API down'));
    const mockError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const result = await handler({
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error:');

    mockError.mockRestore();
  });

  it('should reject message content exceeding max length', async () => {
    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const longContent = 'x'.repeat(100_001);
    const mockError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const result = await handler({
      messages: [{ role: 'user', content: longContent }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('maximum length');

    mockError.mockRestore();
  });

  it('should accept json_mode with deepseek-reasoner', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: { content: '{"result": true}', tool_calls: undefined },
          finish_reason: 'stop',
        },
      ],
      model: 'deepseek-reasoner',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const result = await handler({
      messages: [{ role: 'user', content: 'Return json output' }],
      model: 'deepseek-reasoner',
      json_mode: true,
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('{"result": true}');
  });

  it('should pass thinking param to client', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: { content: 'Thought result', tool_calls: undefined },
          finish_reason: 'stop',
        },
      ],
      model: 'deepseek-chat',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const result = await handler({
      messages: [{ role: 'user', content: 'Think about this' }],
      model: 'deepseek-chat',
      thinking: { type: 'enabled' },
    });

    expect(result.content[0].text).toContain('Thought result');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        thinking: { type: 'enabled' },
      })
    );
  });

  it('should pass json_mode as response_format to client', async () => {
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

    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const result = await handler({
      messages: [{ role: 'user', content: 'Return json output' }],
      model: 'deepseek-chat',
      json_mode: true,
    });

    expect(result.content[0].text).toContain('{"key":"value"}');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: { type: 'json_object' },
      })
    );
  });

  it('should reject multimodal content when ENABLE_MULTIMODAL is false', async () => {
    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await handler({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this' },
            { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
          ],
        },
      ],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Multimodal content');
    expect(result.content[0].text).toContain('ENABLE_MULTIMODAL');
    mockError.mockRestore();
  });

  it('should accept multimodal content when ENABLE_MULTIMODAL is true', async () => {
    resetConfig();
    process.env.DEEPSEEK_API_KEY = 'test-key';
    process.env.ENABLE_MULTIMODAL = 'true';
    loadConfig();

    mockCreate.mockResolvedValue({
      choices: [
        {
          message: { content: 'I see a cat', tool_calls: undefined },
          finish_reason: 'stop',
        },
      ],
      model: 'deepseek-chat',
      usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
    });

    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const result = await handler({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            { type: 'image_url', image_url: { url: 'https://example.com/cat.jpg' } },
          ],
        },
      ],
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('I see a cat');

    // Clean up
    delete process.env.ENABLE_MULTIMODAL;
  });

  it('should validate message length for multimodal array content', async () => {
    resetConfig();
    process.env.DEEPSEEK_API_KEY = 'test-key';
    process.env.ENABLE_MULTIMODAL = 'true';
    loadConfig();

    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await handler({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'x'.repeat(100_001) },
          ],
        },
      ],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('maximum length');

    mockError.mockRestore();
    delete process.env.ENABLE_MULTIMODAL;
  });

  it('should strip code fences from json_mode content', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: 'Here is the result:\n```json\n{"role":"core"}\n```',
            tool_calls: undefined,
          },
          finish_reason: 'stop',
        },
      ],
      model: 'deepseek-v4-pro',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const result = await handler({
      messages: [{ role: 'user', content: 'Return json output' }],
      model: 'deepseek-v4-pro',
      json_mode: true,
    });

    // structuredContent.content is the recovered, directly-parseable JSON
    expect(result.structuredContent.content).toBe('{"role":"core"}');
    expect(JSON.parse(result.structuredContent.content)).toEqual({ role: 'core' });
    expect(result.structuredContent.json_parse_error).toBeUndefined();
  });

  it('should surface json_parse_error when json_mode content has no JSON', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: { content: 'I could not comply, sorry.', tool_calls: undefined },
          finish_reason: 'stop',
        },
      ],
      model: 'deepseek-v4-pro',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const result = await handler({
      messages: [{ role: 'user', content: 'Return json output' }],
      model: 'deepseek-v4-pro',
      json_mode: true,
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent.json_parse_error).toBeDefined();
    // Raw content is preserved so the caller can inspect the refusal
    expect(result.structuredContent.content).toContain('could not comply');
    mockError.mockRestore();
  });

  it('should leave non-json_mode content untouched', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: { content: '```json\n{"x":1}\n```', tool_calls: undefined },
          finish_reason: 'stop',
        },
      ],
      model: 'deepseek-v4-pro',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const result = await handler({
      messages: [{ role: 'user', content: 'Show me json' }],
      model: 'deepseek-v4-pro',
      // json_mode NOT set — content must pass through verbatim
    });

    expect(result.structuredContent.content).toBe('```json\n{"x":1}\n```');
    expect(result.structuredContent.json_parse_error).toBeUndefined();
  });

  it('should return a self-contained request usage object', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: { content: 'Hi', tool_calls: undefined },
          finish_reason: 'stop',
        },
      ],
      model: 'deepseek-v4-pro',
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
        prompt_cache_hit_tokens: 800,
        prompt_cache_miss_tokens: 200,
      },
    });

    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const result = await handler({
      messages: [{ role: 'user', content: 'Hi' }],
      model: 'deepseek-v4-pro',
    });

    const req = result.structuredContent.request;
    expect(req).toBeDefined();
    expect(req.model).toBe('deepseek-v4-pro');
    expect(req.finish_reason).toBe('stop');
    expect(req.prompt_tokens).toBe(1000);
    expect(req.completion_tokens).toBe(500);
    expect(req.total_tokens).toBe(1500);
    expect(req.cache_hit_tokens).toBe(800);
    expect(req.cache_miss_tokens).toBe(200);
    expect(typeof req.cost_usd).toBe('number');
    expect(req.cost_usd).toBeGreaterThan(0);
  });

  it('should derive cache split when API omits cache fields', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: { content: 'Hi', tool_calls: undefined },
          finish_reason: 'stop',
        },
      ],
      model: 'deepseek-v4-flash',
      usage: { prompt_tokens: 300, completion_tokens: 50, total_tokens: 350 },
    });

    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const result = await handler({
      messages: [{ role: 'user', content: 'Hi' }],
      model: 'deepseek-v4-flash',
    });

    const req = result.structuredContent.request;
    // No cache fields from API -> whole prompt billed as miss, matching cost.ts
    expect(req.cache_hit_tokens).toBe(0);
    expect(req.cache_miss_tokens).toBe(300);
  });

  it('should report audit fields for a plain request', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        { message: { content: 'Hi', tool_calls: undefined }, finish_reason: 'stop' },
      ],
      model: 'deepseek-v4-pro',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const result = await handler({
      messages: [{ role: 'user', content: 'Hi' }],
      model: 'deepseek-v4-pro',
    });

    const req = result.structuredContent.request;
    expect(req.wire_model).toBe('deepseek-v4-pro');
    expect(req.thinking).toBe(false);
    expect(req.temperature).toBe(1.0); // default sampling temp in non-thinking mode
    expect(req.fallback_used).toBe(false);
    expect(result.structuredContent.fallback).toBeUndefined();
  });

  it('should report thinking=true and drop temperature under thinking mode', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        { message: { content: 'Reasoned', tool_calls: undefined }, finish_reason: 'stop' },
      ],
      model: 'deepseek-v4-pro',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const result = await handler({
      messages: [{ role: 'user', content: 'Think' }],
      model: 'deepseek-v4-pro',
      thinking: { type: 'enabled' },
      temperature: 0.5,
    });

    const req = result.structuredContent.request;
    expect(req.thinking).toBe(true);
    expect(req.temperature).toBeUndefined(); // ignored while thinking
    mockError.mockRestore();
  });

  it('should surface a silent model fallback', async () => {
    let call = 0;
    mockCreate.mockImplementation(() => {
      call++;
      if (call === 1) return Promise.reject(new Error('429 rate limit'));
      return Promise.resolve({
        choices: [
          { message: { content: 'from backup', tool_calls: undefined }, finish_reason: 'stop' },
        ],
        model: 'deepseek-v4-pro',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });
    });
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const result = await handler({
      messages: [{ role: 'user', content: 'Hi' }],
      model: 'deepseek-v4-flash',
    });

    const req = result.structuredContent.request;
    expect(req.fallback_used).toBe(true);
    expect(req.wire_model).toBe('deepseek-v4-pro');
    expect(result.structuredContent.fallback.originalModel).toBe('deepseek-v4-flash');
    expect(result.structuredContent.fallback.fallbackModel).toBe('deepseek-v4-pro');
    expect(result.content[0].text).toContain('Fallback:');
    mockError.mockRestore();
  });

  const CLASSIFY_SCHEMA = {
    type: 'object',
    properties: {
      role: { type: 'string', enum: ['core', 'face', 'scaffold'] },
      confidence: { type: 'number' },
    },
    required: ['role', 'confidence'],
    additionalProperties: false,
  };

  function chatResult(content: string, model = 'deepseek-v4-pro') {
    return {
      choices: [{ message: { content, tool_calls: undefined }, finish_reason: 'stop' }],
      model,
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    };
  }

  it('should validate response_schema and pass on first try', async () => {
    mockCreate.mockResolvedValue(chatResult('{"role":"core","confidence":0.9}'));

    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const result = await handler({
      messages: [{ role: 'user', content: 'Classify as json' }],
      model: 'deepseek-v4-pro',
      response_schema: CLASSIFY_SCHEMA,
    });

    expect(result.structuredContent.schema).toEqual({ valid: true, attempts: 0 });
    expect(JSON.parse(result.structuredContent.content)).toEqual({
      role: 'core',
      confidence: 0.9,
    });
    // response_schema implies JSON output even though json_mode was not set
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ response_format: { type: 'json_object' } })
    );
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('should repair-retry until the output satisfies the schema', async () => {
    mockCreate
      .mockResolvedValueOnce(chatResult('{"role":"core"}')) // missing confidence
      .mockResolvedValueOnce(chatResult('{"role":"core","confidence":0.8}'));
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const result = await handler({
      messages: [{ role: 'user', content: 'Classify as json' }],
      model: 'deepseek-v4-pro',
      response_schema: CLASSIFY_SCHEMA,
    });

    expect(result.structuredContent.schema).toEqual({ valid: true, attempts: 1 });
    expect(JSON.parse(result.structuredContent.content).confidence).toBe(0.8);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    // request aggregates across both attempts and reconciles internally:
    // each attempt used 100 prompt + 20 completion (120 total) tokens.
    const req = result.structuredContent.request;
    expect(req.prompt_tokens).toBe(200);
    expect(req.completion_tokens).toBe(40);
    expect(req.total_tokens).toBe(240);
    expect(req.cost_usd).toBeGreaterThan(0);
    // top-level usage still reflects the final API response only
    expect(result.structuredContent.usage.total_tokens).toBe(120);
    mockError.mockRestore();
  });

  it('should give up after RESPONSE_SCHEMA_MAX_RETRIES and report invalid', async () => {
    mockCreate.mockResolvedValue(chatResult('{"role":"core"}')); // always missing confidence
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const result = await handler({
      messages: [{ role: 'user', content: 'Classify as json' }],
      model: 'deepseek-v4-pro',
      response_schema: CLASSIFY_SCHEMA,
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent.schema.valid).toBe(false);
    expect(result.structuredContent.schema.attempts).toBe(2); // default max retries
    expect(result.structuredContent.schema.error).toContain('confidence');
    expect(mockCreate).toHaveBeenCalledTimes(3); // initial + 2 retries
    mockError.mockRestore();
  });

  it('should not retry when response_schema is absent (json_mode only)', async () => {
    mockCreate.mockResolvedValue(chatResult('```json\n{"role":"core"}\n```'));

    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const result = await handler({
      messages: [{ role: 'user', content: 'Return json' }],
      model: 'deepseek-v4-pro',
      json_mode: true,
    });

    expect(result.structuredContent.schema).toBeUndefined();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('should show cache info in cost display', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: { content: 'Hello!', tool_calls: undefined },
          finish_reason: 'stop',
        },
      ],
      model: 'deepseek-chat',
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
        prompt_cache_hit_tokens: 800,
        prompt_cache_miss_tokens: 200,
      },
    });

    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client, store);

    const handler = mockServer.tools.get('deepseek_chat')!.handler;
    const result = await handler({
      messages: [{ role: 'user', content: 'Hi' }],
      model: 'deepseek-chat',
    });

    expect(result.content[0].text).toContain('cache hit: 80%');
  });
});
