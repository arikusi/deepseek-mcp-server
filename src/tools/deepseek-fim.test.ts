import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadConfig, resetConfig } from '../config.js';
import { registerFimTool } from './deepseek-fim.js';

const { mockCompletionsCreate } = vi.hoisted(() => ({
  mockCompletionsCreate: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn(),
      },
    };
    completions = {
      create: mockCompletionsCreate,
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

function fimRaw(text: string, model = 'deepseek-v4-flash') {
  return {
    id: 'cmpl-1',
    model,
    choices: [{ text, finish_reason: 'stop', index: 0 }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

describe('tools/deepseek-fim', () => {
  let mockServer: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    resetConfig();
    process.env.DEEPSEEK_API_KEY = 'test-key';
    loadConfig();
    mockCompletionsCreate.mockReset();
    mockServer = createMockServer();
  });

  async function makeClient() {
    const { DeepSeekClient } = await import('../deepseek-client.js');
    return new DeepSeekClient();
  }

  it('should register deepseek_fim tool', async () => {
    const client = await makeClient();
    registerFimTool(mockServer as any, client);
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'deepseek_fim',
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('should complete prompt and return text + cost info', async () => {
    mockCompletionsCreate.mockResolvedValue(fimRaw('    return a * b'));
    const client = await makeClient();
    registerFimTool(mockServer as any, client);
    const { handler } = mockServer.tools.get('deepseek_fim')!;

    const result: any = await handler({
      prompt: 'def multiply(a, b):\n',
      suffix: '\n',
      model: 'deepseek-v4-flash',
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent.text).toBe('    return a * b');
    expect(result.structuredContent.finish_reason).toBe('stop');
    expect(result.structuredContent.usage.total_tokens).toBe(15);
    expect(result.structuredContent.cost_usd).toBeGreaterThan(0);
    // Beta endpoint receives prompt + suffix, no messages
    const sent = mockCompletionsCreate.mock.calls[0][0];
    expect(sent.prompt).toBe('def multiply(a, b):\n');
    expect(sent.suffix).toBe('\n');
    expect(sent.model).toBe('deepseek-v4-flash');
  });

  it('should resolve deepseek-reasoner alias to v4-flash and report routing', async () => {
    mockCompletionsCreate.mockResolvedValue(fimRaw('x', 'deepseek-v4-flash'));
    const client = await makeClient();
    registerFimTool(mockServer as any, client);
    const { handler } = mockServer.tools.get('deepseek_fim')!;

    const result: any = await handler({
      prompt: 'hello',
      model: 'deepseek-reasoner',
    });

    expect(result.structuredContent.routed_from).toBe('deepseek-reasoner');
    const sent = mockCompletionsCreate.mock.calls[0][0];
    expect(sent.model).toBe('deepseek-v4-flash');
  });

  it('should reject max_tokens above the FIM cap (4096)', async () => {
    const client = await makeClient();
    registerFimTool(mockServer as any, client);
    const { handler } = mockServer.tools.get('deepseek_fim')!;

    const result: any = await handler({ prompt: 'x', max_tokens: 5000 });

    expect(result.isError).toBe(true);
    expect(mockCompletionsCreate).not.toHaveBeenCalled();
  });

  it('should reject empty prompt', async () => {
    const client = await makeClient();
    registerFimTool(mockServer as any, client);
    const { handler } = mockServer.tools.get('deepseek_fim')!;

    const result: any = await handler({ prompt: '' });

    expect(result.isError).toBe(true);
    expect(mockCompletionsCreate).not.toHaveBeenCalled();
  });

  it('should surface API errors as isError', async () => {
    mockCompletionsCreate.mockRejectedValue(new Error('boom'));
    const client = await makeClient();
    registerFimTool(mockServer as any, client);
    const { handler } = mockServer.tools.get('deepseek_fim')!;

    const result: any = await handler({ prompt: 'x' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error:');
  });
});
