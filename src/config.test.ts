import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig, getConfig, resetConfig } from './config.js';

describe('config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetConfig();
    // Clean env vars we use
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_BASE_URL;
    delete process.env.SHOW_COST_INFO;
    delete process.env.REQUEST_TIMEOUT;
    delete process.env.MAX_RETRIES;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetConfig();
  });

  describe('loadConfig', () => {
    it('should load default config with API key', () => {
      process.env.DEEPSEEK_API_KEY = 'test-key';
      const config = loadConfig();
      expect(config.apiKey).toBe('test-key');
      expect(config.baseUrl).toBe('https://api.deepseek.com');
      expect(config.showCostInfo).toBe(true);
      expect(config.requestTimeout).toBe(60000);
      expect(config.maxRetries).toBe(2);
    });

    it('should load custom env values', () => {
      process.env.DEEPSEEK_API_KEY = 'test-key';
      process.env.DEEPSEEK_BASE_URL = 'https://custom.deepseek.com';
      process.env.SHOW_COST_INFO = 'false';
      process.env.REQUEST_TIMEOUT = '30000';
      process.env.MAX_RETRIES = '5';

      const config = loadConfig();
      expect(config.baseUrl).toBe('https://custom.deepseek.com');
      expect(config.showCostInfo).toBe(false);
      expect(config.requestTimeout).toBe(30000);
      expect(config.maxRetries).toBe(5);
    });

    it('should cache config (singleton)', () => {
      process.env.DEEPSEEK_API_KEY = 'test-key';
      const config1 = loadConfig();
      const config2 = getConfig();
      expect(config1).toBe(config2);
    });

    it('should exit if API key is missing', () => {
      const mockExit = vi
        .spyOn(process, 'exit')
        .mockImplementation(() => undefined as never);
      const mockError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      loadConfig();

      expect(mockExit).toHaveBeenCalledWith(1);
      mockExit.mockRestore();
      mockError.mockRestore();
    });
  });

  describe('getConfig', () => {
    it('should throw if config not loaded', () => {
      expect(() => getConfig()).toThrow('Config not loaded');
    });
  });

  describe('resetConfig', () => {
    it('should clear cached config', () => {
      process.env.DEEPSEEK_API_KEY = 'test-key';
      loadConfig();
      resetConfig();
      expect(() => getConfig()).toThrow('Config not loaded');
    });
  });
});
