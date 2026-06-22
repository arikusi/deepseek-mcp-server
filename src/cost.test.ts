import { describe, it, expect } from 'vitest';
import { calculateCost, formatCost, PRICING, MODEL_PRICING, DEFAULT_PRICING, getPricing } from './cost.js';

describe('cost', () => {
  describe('PRICING', () => {
    it('should have v4-flash default pricing', () => {
      expect(PRICING.cache_hit).toBe(0.0028);
      expect(PRICING.cache_miss).toBe(0.14);
      expect(PRICING.output).toBe(0.28);
    });

    it('should have PRICING as alias for DEFAULT_PRICING', () => {
      expect(PRICING).toBe(DEFAULT_PRICING);
    });
  });

  describe('MODEL_PRICING', () => {
    it('should have pricing for deepseek-v4-flash', () => {
      expect(MODEL_PRICING['deepseek-v4-flash']).toBeDefined();
      expect(MODEL_PRICING['deepseek-v4-flash'].cache_hit).toBe(0.0028);
      expect(MODEL_PRICING['deepseek-v4-flash'].cache_miss).toBe(0.14);
      expect(MODEL_PRICING['deepseek-v4-flash'].output).toBe(0.28);
    });

    it('should have pricing for deepseek-v4-pro', () => {
      expect(MODEL_PRICING['deepseek-v4-pro']).toBeDefined();
      expect(MODEL_PRICING['deepseek-v4-pro'].cache_hit).toBe(0.003625);
      expect(MODEL_PRICING['deepseek-v4-pro'].cache_miss).toBe(0.435);
      expect(MODEL_PRICING['deepseek-v4-pro'].output).toBe(0.87);
    });

    it('should map deepseek-chat alias to v4-flash pricing', () => {
      expect(MODEL_PRICING['deepseek-chat'].cache_hit).toBe(0.0028);
      expect(MODEL_PRICING['deepseek-chat'].output).toBe(0.28);
    });

    it('should map deepseek-reasoner alias to v4-flash pricing', () => {
      expect(MODEL_PRICING['deepseek-reasoner'].output).toBe(0.28);
    });
  });

  describe('getPricing', () => {
    it('should return model-specific pricing for known models', () => {
      const pricing = getPricing('deepseek-v4-pro');
      expect(pricing).toBe(MODEL_PRICING['deepseek-v4-pro']);
    });

    it('should return DEFAULT_PRICING for unknown models', () => {
      const pricing = getPricing('some-future-model');
      expect(pricing).toBe(DEFAULT_PRICING);
    });

    it('should return DEFAULT_PRICING when model is undefined', () => {
      const pricing = getPricing();
      expect(pricing).toBe(DEFAULT_PRICING);
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost without cache fields (backward compat)', () => {
      const result = calculateCost({
        prompt_tokens: 1_000_000,
        completion_tokens: 1_000_000,
      });
      // 1M input * $0.14/1M + 1M output * $0.28/1M = $0.42 (v4-flash default)
      expect(result.inputCost).toBeCloseTo(0.14);
      expect(result.outputCost).toBeCloseTo(0.28);
      expect(result.totalCost).toBeCloseTo(0.42);
      expect(result.cacheHitRatio).toBeUndefined();
      expect(result.cacheSavings).toBeUndefined();
    });

    it('should calculate cost with cache hit/miss fields', () => {
      const result = calculateCost({
        prompt_tokens: 1_000_000,
        completion_tokens: 1_000_000,
        prompt_cache_hit_tokens: 800_000,
        prompt_cache_miss_tokens: 200_000,
      });
      // Hit: 800K * $0.0028/1M = $0.00224
      // Miss: 200K * $0.14/1M = $0.028
      // Input: $0.03024
      // Output: 1M * $0.28/1M = $0.28
      expect(result.inputCost).toBeCloseTo(0.03024);
      expect(result.outputCost).toBeCloseTo(0.28);
      expect(result.totalCost).toBeCloseTo(0.31024);
      expect(result.cacheHitRatio).toBeCloseTo(0.8);
      // Savings: all-miss ($0.14) - actual ($0.03024) = $0.10976
      expect(result.cacheSavings).toBeCloseTo(0.10976);
    });

    it('should calculate cost for smaller token counts', () => {
      const result = calculateCost({
        prompt_tokens: 1000,
        completion_tokens: 500,
      });
      const expectedInput = (1000 / 1_000_000) * 0.14;
      const expectedOutput = (500 / 1_000_000) * 0.28;
      expect(result.totalCost).toBeCloseTo(expectedInput + expectedOutput);
    });

    it('should return 0 for zero tokens', () => {
      const result = calculateCost({
        prompt_tokens: 0,
        completion_tokens: 0,
      });
      expect(result.totalCost).toBe(0);
    });

    it('should handle only prompt tokens', () => {
      const result = calculateCost({
        prompt_tokens: 1_000_000,
        completion_tokens: 0,
      });
      expect(result.totalCost).toBeCloseTo(0.14);
    });

    it('should handle only completion tokens', () => {
      const result = calculateCost({
        prompt_tokens: 0,
        completion_tokens: 1_000_000,
      });
      expect(result.totalCost).toBeCloseTo(0.28);
    });

    it('should handle 100% cache hit', () => {
      const result = calculateCost({
        prompt_tokens: 1_000_000,
        completion_tokens: 0,
        prompt_cache_hit_tokens: 1_000_000,
        prompt_cache_miss_tokens: 0,
      });
      // All cache hit: 1M * $0.0028/1M = $0.0028
      expect(result.inputCost).toBeCloseTo(0.0028);
      expect(result.cacheHitRatio).toBeCloseTo(1.0);
      // Savings: $0.14 - $0.0028 = $0.1372
      expect(result.cacheSavings).toBeCloseTo(0.1372);
    });

    it('should handle 0% cache hit', () => {
      const result = calculateCost({
        prompt_tokens: 1_000_000,
        completion_tokens: 0,
        prompt_cache_hit_tokens: 0,
        prompt_cache_miss_tokens: 1_000_000,
      });
      // All cache miss: 1M * $0.14/1M = $0.14
      expect(result.inputCost).toBeCloseTo(0.14);
      expect(result.cacheHitRatio).toBeCloseTo(0);
      expect(result.cacheSavings).toBeCloseTo(0);
    });

    it('should handle zero prompt tokens with cache fields', () => {
      const result = calculateCost({
        prompt_tokens: 0,
        completion_tokens: 500,
        prompt_cache_hit_tokens: 0,
        prompt_cache_miss_tokens: 0,
      });
      expect(result.inputCost).toBe(0);
      expect(result.cacheHitRatio).toBeUndefined();
    });

    it('should accept model parameter for model-aware pricing (v4-pro)', () => {
      const result = calculateCost({
        prompt_tokens: 1_000_000,
        completion_tokens: 1_000_000,
      }, 'deepseek-v4-pro');
      // v4-pro: 1M * $0.435 + 1M * $0.87 = $1.305
      expect(result.totalCost).toBeCloseTo(1.305);
    });

    it('should use DEFAULT_PRICING (v4-flash) for unknown model', () => {
      const result = calculateCost({
        prompt_tokens: 1_000_000,
        completion_tokens: 1_000_000,
      }, 'unknown-model');
      expect(result.totalCost).toBeCloseTo(0.42);
    });

    it('should work without model parameter (backward compat)', () => {
      const result = calculateCost({
        prompt_tokens: 1_000_000,
        completion_tokens: 1_000_000,
      });
      expect(result.totalCost).toBeCloseTo(0.42);
    });
  });

  describe('formatCost', () => {
    it('should format small values with 4 decimal places', () => {
      expect(formatCost({ inputCost: 0, outputCost: 0.001, totalCost: 0.001 })).toBe('$0.0010');
      expect(formatCost({ inputCost: 0, outputCost: 0.0001, totalCost: 0.0001 })).toBe('$0.0001');
    });

    it('should format large values with 2 decimal places', () => {
      expect(formatCost({ inputCost: 0.5, outputCost: 1.0, totalCost: 1.5 })).toBe('$1.50');
      expect(formatCost({ inputCost: 0.14, outputCost: 0.28, totalCost: 0.42 })).toBe('$0.42');
    });

    it('should format zero as small value', () => {
      expect(formatCost({ inputCost: 0, outputCost: 0, totalCost: 0 })).toBe('$0.0000');
    });

    it('should format boundary value (0.01) with 2 decimals', () => {
      expect(formatCost({ inputCost: 0, outputCost: 0.01, totalCost: 0.01 })).toBe('$0.01');
    });

    it('should format values just below boundary with 4 decimals', () => {
      expect(formatCost({ inputCost: 0, outputCost: 0.0099, totalCost: 0.0099 })).toBe('$0.0099');
    });

    it('should show cache savings when available', () => {
      const result = formatCost({
        inputCost: 0.03024,
        outputCost: 0.28,
        totalCost: 0.31024,
        cacheHitRatio: 0.8,
        cacheSavings: 0.10976,
      });
      expect(result).toBe('$0.31 (cache hit: 80%, saved ~$0.1098)');
    });

    it('should not show cache info when ratio is 0', () => {
      const result = formatCost({
        inputCost: 0.14,
        outputCost: 0.28,
        totalCost: 0.42,
        cacheHitRatio: 0,
        cacheSavings: 0,
      });
      expect(result).toBe('$0.42');
    });

    it('should not show cache info when fields are undefined', () => {
      const result = formatCost({
        inputCost: 0.14,
        outputCost: 0.28,
        totalCost: 0.42,
      });
      expect(result).toBe('$0.42');
    });
  });
});
