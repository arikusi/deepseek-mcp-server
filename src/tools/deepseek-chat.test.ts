import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadConfig, resetConfig } from '../config.js';
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

  beforeEach(() => {
    resetConfig();
    process.env.DEEPSEEK_API_KEY = 'test-key';
    loadConfig();
    mockCreate.mockReset();
    mockServer = createMockServer();
  });

  it('should register deepseek_chat tool', async () => {
    const { DeepSeekClient } = await import('../deepseek-client.js');
    const client = new DeepSeekClient();
    registerChatTool(mockServer as any, client);
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
    registerChatTool(mockServer as any, client);

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
    registerChatTool(mockServer as any, client);

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
    registerChatTool(mockServer as any, client);

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
    registerChatTool(mockServer as any, client);

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
    registerChatTool(mockServer as any, client);

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
});
