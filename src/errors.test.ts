import { describe, it, expect } from 'vitest';
import {
  BaseError,
  ConfigError,
  ApiError,
  RateLimitError,
  AuthenticationError,
  ValidationError,
  ConnectionError,
} from './errors.js';

describe('errors', () => {
  describe('BaseError', () => {
    it('should set name to class name', () => {
      const error = new BaseError('test');
      expect(error.name).toBe('BaseError');
      expect(error.message).toBe('test');
    });

    it('should support cause chaining', () => {
      const cause = new Error('root cause');
      const error = new BaseError('wrapper', { cause });
      expect(error.cause).toBe(cause);
    });

    it('should be instanceof Error', () => {
      const error = new BaseError('test');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BaseError);
    });
  });

  describe('ConfigError', () => {
    it('should store validation issues', () => {
      const issues = [
        { path: 'apiKey', message: 'DEEPSEEK_API_KEY is required' },
      ];
      const error = new ConfigError('Config failed', issues);
      expect(error.issues).toEqual(issues);
      expect(error.name).toBe('ConfigError');
    });

    it('should default to empty issues', () => {
      const error = new ConfigError('Config failed');
      expect(error.issues).toEqual([]);
    });

    it('should be instanceof BaseError', () => {
      const error = new ConfigError('test');
      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(ConfigError);
    });
  });

  describe('ApiError', () => {
    it('should store statusCode and retryable flag', () => {
      const error = new ApiError('API failed', {
        statusCode: 500,
        retryable: true,
      });
      expect(error.statusCode).toBe(500);
      expect(error.retryable).toBe(true);
      expect(error.name).toBe('ApiError');
    });

    it('should default retryable to false', () => {
      const error = new ApiError('API failed');
      expect(error.retryable).toBe(false);
      expect(error.statusCode).toBeUndefined();
    });

    it('should support cause chaining', () => {
      const cause = new Error('network');
      const error = new ApiError('API failed', { cause });
      expect(error.cause).toBe(cause);
    });
  });

  describe('RateLimitError', () => {
    it('should set statusCode 429 and retryable true', () => {
      const error = new RateLimitError('Too many requests');
      expect(error.statusCode).toBe(429);
      expect(error.retryable).toBe(true);
      expect(error.name).toBe('RateLimitError');
    });

    it('should be instanceof ApiError', () => {
      const error = new RateLimitError('rate limit');
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toBeInstanceOf(BaseError);
    });
  });

  describe('AuthenticationError', () => {
    it('should set statusCode 401 and retryable false', () => {
      const error = new AuthenticationError('Invalid key');
      expect(error.statusCode).toBe(401);
      expect(error.retryable).toBe(false);
      expect(error.name).toBe('AuthenticationError');
    });

    it('should be instanceof ApiError', () => {
      const error = new AuthenticationError('auth');
      expect(error).toBeInstanceOf(ApiError);
    });
  });

  describe('ValidationError', () => {
    it('should store zodErrors', () => {
      const zodErrors = [{ path: 'messages', message: 'Required' }];
      const error = new ValidationError('Invalid input', zodErrors);
      expect(error.zodErrors).toEqual(zodErrors);
      expect(error.name).toBe('ValidationError');
    });

    it('should handle undefined zodErrors', () => {
      const error = new ValidationError('Invalid input');
      expect(error.zodErrors).toBeUndefined();
    });
  });

  describe('ConnectionError', () => {
    it('should default retryable to true', () => {
      const error = new ConnectionError('Connection lost');
      expect(error.retryable).toBe(true);
      expect(error.name).toBe('ConnectionError');
    });

    it('should allow retryable override', () => {
      const error = new ConnectionError('DNS failed', { retryable: false });
      expect(error.retryable).toBe(false);
    });

    it('should be instanceof BaseError', () => {
      const error = new ConnectionError('timeout');
      expect(error).toBeInstanceOf(BaseError);
    });
  });
});
