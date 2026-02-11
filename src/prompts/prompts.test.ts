import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerCorePrompts } from './core.js';
import { registerAdvancedPrompts } from './advanced.js';
import { registerFunctionCallingPrompts } from './function-calling.js';
import { registerAllPrompts } from './index.js';

function createMockServer() {
  const prompts = new Map<string, { config: unknown; handler: Function }>();
  return {
    registerPrompt: vi.fn((name: string, config: unknown, handler: Function) => {
      prompts.set(name, { config, handler });
    }),
    prompts,
  };
}

describe('prompts', () => {
  let mockServer: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    mockServer = createMockServer();
  });

  describe('registerCorePrompts', () => {
    it('should register 5 core prompts', () => {
      registerCorePrompts(mockServer as any);
      expect(mockServer.registerPrompt).toHaveBeenCalledTimes(5);
    });

    it('should register expected prompt names', () => {
      registerCorePrompts(mockServer as any);
      const names = mockServer.registerPrompt.mock.calls.map(
        (call) => call[0]
      );
      expect(names).toContain('debug_with_reasoning');
      expect(names).toContain('code_review_deep');
      expect(names).toContain('research_synthesis');
      expect(names).toContain('strategic_planning');
      expect(names).toContain('explain_like_im_five');
    });

    it('debug_with_reasoning handler should return messages', () => {
      registerCorePrompts(mockServer as any);
      const handler = mockServer.prompts.get('debug_with_reasoning')!.handler;
      const result = handler(
        { code: 'console.log(x)', error: 'x is undefined', language: 'js' },
        {}
      );
      expect(result.messages).toBeDefined();
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.text).toContain('console.log(x)');
      expect(result.messages[0].content.text).toContain('x is undefined');
      expect(result.messages[0].content.text).toContain('js');
    });

    it('code_review_deep handler should format focus', () => {
      registerCorePrompts(mockServer as any);
      const handler = mockServer.prompts.get('code_review_deep')!.handler;
      const result = handler(
        { code: 'const x = 1', focus: 'security' },
        {}
      );
      expect(result.messages[0].content.text).toContain('security');
    });
  });

  describe('registerAdvancedPrompts', () => {
    it('should register 5 advanced prompts', () => {
      registerAdvancedPrompts(mockServer as any);
      expect(mockServer.registerPrompt).toHaveBeenCalledTimes(5);
    });

    it('should register expected prompt names', () => {
      registerAdvancedPrompts(mockServer as any);
      const names = mockServer.registerPrompt.mock.calls.map(
        (call) => call[0]
      );
      expect(names).toContain('mathematical_proof');
      expect(names).toContain('argument_validation');
      expect(names).toContain('creative_ideation');
      expect(names).toContain('cost_comparison');
      expect(names).toContain('pair_programming');
    });

    it('cost_comparison handler should include token info', () => {
      registerAdvancedPrompts(mockServer as any);
      const handler = mockServer.prompts.get('cost_comparison')!.handler;
      const result = handler(
        { task: 'Summarize text', estimated_tokens: 5000 },
        {}
      );
      expect(result.messages[0].content.text).toContain('5000');
      expect(result.messages[0].content.text).toContain('DeepSeek Chat');
    });
  });

  describe('registerFunctionCallingPrompts', () => {
    it('should register 2 function calling prompts', () => {
      registerFunctionCallingPrompts(mockServer as any);
      expect(mockServer.registerPrompt).toHaveBeenCalledTimes(2);
    });

    it('should register expected prompt names', () => {
      registerFunctionCallingPrompts(mockServer as any);
      const names = mockServer.registerPrompt.mock.calls.map(
        (call) => call[0]
      );
      expect(names).toContain('function_call_debug');
      expect(names).toContain('create_function_schema');
    });

    it('function_call_debug handler should include tools_json', () => {
      registerFunctionCallingPrompts(mockServer as any);
      const handler = mockServer.prompts.get('function_call_debug')!.handler;
      const result = handler(
        {
          tools_json: '[{"type":"function"}]',
          messages_json: '[{"role":"user"}]',
          error: 'No function called',
        },
        {}
      );
      expect(result.messages[0].content.text).toContain('[{"type":"function"}]');
      expect(result.messages[0].content.text).toContain('No function called');
    });
  });

  describe('registerAllPrompts', () => {
    it('should register all 12 prompts', () => {
      registerAllPrompts(mockServer as any);
      expect(mockServer.registerPrompt).toHaveBeenCalledTimes(12);
    });
  });
});
