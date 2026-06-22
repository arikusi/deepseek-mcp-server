import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig, resetConfig } from '../config.js';
import { UsageTracker } from '../usage-tracker.js';
import { registerModelsResource } from './models.js';
import { registerConfigResource } from './config.js';
import { registerUsageResource } from './usage.js';
import { registerAllResources } from './index.js';

function createMockServer() {
  const resources = new Map<string, { uri: string; metadata: unknown; handler: Function }>();
  return {
    registerResource: vi.fn(
      (name: string, uri: string, metadata: unknown, handler: Function) => {
        resources.set(name, { uri, metadata, handler });
      }
    ),
    resources,
  };
}

describe('MCP Resources', () => {
  let mockServer: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    resetConfig();
    process.env.DEEPSEEK_API_KEY = 'sk-test1234567890abcdef';
    loadConfig();
    mockServer = createMockServer();
    UsageTracker.resetInstance();
  });

  afterEach(() => {
    resetConfig();
    UsageTracker.resetInstance();
  });

  describe('registerAllResources', () => {
    it('should register all 3 resources', () => {
      registerAllResources(mockServer as any);
      expect(mockServer.registerResource).toHaveBeenCalledTimes(3);
      expect(mockServer.resources.has('models')).toBe(true);
      expect(mockServer.resources.has('config')).toBe(true);
      expect(mockServer.resources.has('usage')).toBe(true);
    });
  });

  describe('deepseek://models', () => {
    it('should register with correct URI', () => {
      registerModelsResource(mockServer as any);
      expect(mockServer.resources.get('models')?.uri).toBe('deepseek://models');
    });

    it('should return model list as JSON', async () => {
      registerModelsResource(mockServer as any);
      const handler = mockServer.resources.get('models')!.handler;
      const result = await handler({ href: 'deepseek://models' });

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].mimeType).toBe('application/json');

      const data = JSON.parse(result.contents[0].text);
      expect(data.models).toHaveLength(2);
      expect(data.models[0].id).toBe('deepseek-v4-flash');
      expect(data.models[1].id).toBe('deepseek-v4-pro');
    });

    it('should include capabilities for each model', async () => {
      registerModelsResource(mockServer as any);
      const handler = mockServer.resources.get('models')!.handler;
      const result = await handler({ href: 'deepseek://models' });
      const data = JSON.parse(result.contents[0].text);

      expect(data.models[0].capabilities).toContain('function_calling');
      expect(data.models[1].capabilities).toContain('reasoning');
    });

    it('should include pricing information', async () => {
      registerModelsResource(mockServer as any);
      const handler = mockServer.resources.get('models')!.handler;
      const result = await handler({ href: 'deepseek://models' });
      const data = JSON.parse(result.contents[0].text);

      expect(data.models[0].pricing_per_million_tokens).toBeDefined();
      expect(data.models[0].pricing_per_million_tokens.output).toBe(0.28);
    });
  });

  describe('deepseek://config', () => {
    it('should register with correct URI', () => {
      registerConfigResource(mockServer as any);
      expect(mockServer.resources.get('config')?.uri).toBe('deepseek://config');
    });

    it('should return masked API key', async () => {
      registerConfigResource(mockServer as any);
      const handler = mockServer.resources.get('config')!.handler;
      const result = await handler({ href: 'deepseek://config' });
      const data = JSON.parse(result.contents[0].text);

      expect(data.apiKey).toBe('sk-****cdef');
      expect(data.apiKey).not.toContain('test1234567890ab');
    });

    it('should include session and fallback config', async () => {
      registerConfigResource(mockServer as any);
      const handler = mockServer.resources.get('config')!.handler;
      const result = await handler({ href: 'deepseek://config' });
      const data = JSON.parse(result.contents[0].text);

      expect(data.sessionTtlMinutes).toBe(30);
      expect(data.maxSessions).toBe(100);
      expect(data.fallbackEnabled).toBe(true);
    });

    it('should include base URL and timeout', async () => {
      registerConfigResource(mockServer as any);
      const handler = mockServer.resources.get('config')!.handler;
      const result = await handler({ href: 'deepseek://config' });
      const data = JSON.parse(result.contents[0].text);

      expect(data.baseUrl).toBe('https://api.deepseek.com');
      expect(data.requestTimeout).toBe(60000);
    });
  });

  describe('deepseek://usage', () => {
    it('should register with correct URI', () => {
      registerUsageResource(mockServer as any);
      expect(mockServer.resources.get('usage')?.uri).toBe('deepseek://usage');
    });

    it('should return zero stats initially', async () => {
      registerUsageResource(mockServer as any);
      const handler = mockServer.resources.get('usage')!.handler;
      const result = await handler({ href: 'deepseek://usage' });
      const data = JSON.parse(result.contents[0].text);

      expect(data.totalRequests).toBe(0);
      expect(data.totalTokens).toBe(0);
      expect(data.totalCost).toBe(0);
      expect(data.cacheHitRatio).toBe(0);
    });

    it('should reflect tracked usage', async () => {
      const tracker = UsageTracker.getInstance();
      tracker.trackRequest(
        {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          prompt_cache_hit_tokens: 80,
          prompt_cache_miss_tokens: 20,
        },
        0.0035
      );

      registerUsageResource(mockServer as any);
      const handler = mockServer.resources.get('usage')!.handler;
      const result = await handler({ href: 'deepseek://usage' });
      const data = JSON.parse(result.contents[0].text);

      expect(data.totalRequests).toBe(1);
      expect(data.totalTokens).toBe(150);
      expect(data.totalPromptTokens).toBe(100);
      expect(data.totalCompletionTokens).toBe(50);
      expect(data.cacheHitTokens).toBe(80);
      expect(data.cacheMissTokens).toBe(20);
      expect(data.totalCost).toBe(0.0035);
    });

    it('should compute cache hit ratio', async () => {
      const tracker = UsageTracker.getInstance();
      tracker.trackRequest(
        {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          prompt_cache_hit_tokens: 75,
          prompt_cache_miss_tokens: 25,
        },
        0.001
      );

      registerUsageResource(mockServer as any);
      const handler = mockServer.resources.get('usage')!.handler;
      const result = await handler({ href: 'deepseek://usage' });
      const data = JSON.parse(result.contents[0].text);

      expect(data.cacheHitRatio).toBe(0.75);
    });
  });
});
