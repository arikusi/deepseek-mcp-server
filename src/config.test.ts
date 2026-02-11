import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, getConfig, resetConfig } from './config.js';
import { ConfigError } from './errors.js';

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
    delete process.env.SKIP_CONNECTION_TEST;
    delete process.env.MAX_MESSAGE_LENGTH;
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

    it('should throw ConfigError if API key is missing', () => {
      expect(() => loadConfig()).toThrow(ConfigError);
      expect(() => loadConfig()).toThrow('Configuration validation failed');
    });

    it('should include issues in ConfigError', () => {
      try {
        loadConfig();
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        expect((error as ConfigError).issues.length).toBeGreaterThan(0);
      }
    });

    it('should load skipConnectionTest from env', () => {
      process.env.DEEPSEEK_API_KEY = 'test-key';
      process.env.SKIP_CONNECTION_TEST = 'true';
      const config = loadConfig();
      expect(config.skipConnectionTest).toBe(true);
    });

    it('should load maxMessageLength from env', () => {
      process.env.DEEPSEEK_API_KEY = 'test-key';
      process.env.MAX_MESSAGE_LENGTH = '50000';
      const config = loadConfig();
      expect(config.maxMessageLength).toBe(50000);
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
