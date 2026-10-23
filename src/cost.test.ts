import { describe, it, expect } from 'vitest';
import {
  calculateCost,
  formatCost,
  MODEL_PRICING,
  DEFAULT_PRICING,
  getPricing,
  getPricingTier,
  getTieredPricing,
} from './cost.js';

// Pinned instants so no test depends on when it runs.
const OFF_PEAK = new Date('2026-10-22T12:00:00Z'); // Thursday, outside both windows
const PEAK = new Date('2026-10-22T02:00:00Z'); // Thursday, inside 01:00-04:00

describe('cost', () => {
  describe('MODEL_PRICING', () => {
    it('has the published deepseek-flash rates for both tiers', () => {
      expect(MODEL_PRICING['deepseek-flash']['off-peak']).toEqual({ cache_hit: 0.003, cache_miss: 0.15, output: 0.6 });
      expect(MODEL_PRICING['deepseek-flash'].peak).toEqual({ cache_hit: 0.006, cache_miss: 0.3, output: 1.2 });
    });

    it('has the published deepseek-v4-pro rates for both tiers', () => {
      expect(MODEL_PRICING['deepseek-v4-pro']['off-peak']).toEqual({ cache_hit: 0.022, cache_miss: 0.66, output: 1.98 });
      expect(MODEL_PRICING['deepseek-v4-pro'].peak).toEqual({ cache_hit: 0.044, cache_miss: 1.32, output: 3.96 });
    });

    it('bills every peak rate at exactly twice off-peak', () => {
      for (const tiers of Object.values(MODEL_PRICING)) {
        for (const key of ['cache_hit', 'cache_miss', 'output'] as const) {
          expect(tiers.peak[key]).toBeCloseTo(tiers['off-peak'][key] * 2, 10);
        }
      }
    });

    it('prices the legacy names as deepseek-flash', () => {
      for (const legacy of ['deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner']) {
        expect(MODEL_PRICING[legacy]).toBe(MODEL_PRICING['deepseek-flash']);
      }
    });

    it('defaults to flash pricing', () => {
      expect(DEFAULT_PRICING).toBe(MODEL_PRICING['deepseek-flash']);
    });
  });

  describe('getPricingTier', () => {
    it.each([
      ['2026-10-22T00:59:59Z', 'off-peak'],
      ['2026-10-22T01:00:00Z', 'peak'],
      ['2026-10-22T03:59:59Z', 'peak'],
      ['2026-10-22T04:00:00Z', 'off-peak'],
      ['2026-10-22T05:59:59Z', 'off-peak'],
      ['2026-10-22T06:00:00Z', 'peak'],
      ['2026-10-22T09:59:59Z', 'peak'],
      ['2026-10-22T10:00:00Z', 'off-peak'],
      ['2026-10-22T23:00:00Z', 'off-peak'],
    ])('treats %s (Thursday) as %s', (iso, tier) => {
      expect(getPricingTier(new Date(iso))).toBe(tier);
    });

    it('bills Monday and Friday windows as peak', () => {
      expect(getPricingTier(new Date('2026-10-19T02:00:00Z'))).toBe('peak');
      expect(getPricingTier(new Date('2026-10-23T07:00:00Z'))).toBe('peak');
    });

    it('bills the whole weekend off-peak, windows included', () => {
      expect(getPricingTier(new Date('2026-10-24T02:00:00Z'))).toBe('off-peak');
      expect(getPricingTier(new Date('2026-10-25T07:00:00Z'))).toBe('off-peak');
    });

    it('reads the clock when no instant is given', () => {
      expect(['peak', 'off-peak']).toContain(getPricingTier());
    });
  });

  describe('getPricing', () => {
    it('returns the tier that applies at the given instant', () => {
      expect(getPricing('deepseek-v4-pro', OFF_PEAK)).toBe(MODEL_PRICING['deepseek-v4-pro']['off-peak']);
      expect(getPricing('deepseek-v4-pro', PEAK)).toBe(MODEL_PRICING['deepseek-v4-pro'].peak);
    });

    it('falls back to flash pricing for unknown or missing models', () => {
      expect(getPricing('some-future-model', OFF_PEAK)).toBe(DEFAULT_PRICING['off-peak']);
      expect(getPricing(undefined, PEAK)).toBe(DEFAULT_PRICING.peak);
      expect(getTieredPricing('some-future-model')).toBe(DEFAULT_PRICING);
    });
  });

  describe('calculateCost', () => {
    it('treats all input as cache miss when the cache fields are absent', () => {
      const result = calculateCost({ prompt_tokens: 1_000_000, completion_tokens: 1_000_000 }, 'deepseek-flash', OFF_PEAK);
      // 1M * $0.15 + 1M * $0.60
      expect(result.inputCost).toBeCloseTo(0.15);
      expect(result.outputCost).toBeCloseTo(0.6);
      expect(result.totalCost).toBeCloseTo(0.75);
      expect(result.cacheHitRatio).toBeUndefined();
      expect(result.cacheSavings).toBeUndefined();
      expect(result.tier).toBe('off-peak');
    });

    it('doubles the bill inside the peak window', () => {
      const usage = { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 };
      const off = calculateCost(usage, 'deepseek-flash', OFF_PEAK);
      const peak = calculateCost(usage, 'deepseek-flash', PEAK);
      expect(peak.totalCost).toBeCloseTo(off.totalCost * 2);
      expect(peak.tier).toBe('peak');
    });

    it('splits input by cache hit and miss', () => {
      const result = calculateCost({
        prompt_tokens: 1_000_000,
        completion_tokens: 1_000_000,
        prompt_cache_hit_tokens: 800_000,
        prompt_cache_miss_tokens: 200_000,
      }, 'deepseek-flash', OFF_PEAK);
      // Hit 800K * $0.003 = $0.0024, miss 200K * $0.15 = $0.03
      expect(result.inputCost).toBeCloseTo(0.0324);
      expect(result.outputCost).toBeCloseTo(0.6);
      expect(result.totalCost).toBeCloseTo(0.6324);
      expect(result.cacheHitRatio).toBeCloseTo(0.8);
      // All-miss $0.15 minus actual $0.0324
      expect(result.cacheSavings).toBeCloseTo(0.1176);
    });

    it('returns 0 for zero tokens', () => {
      expect(calculateCost({ prompt_tokens: 0, completion_tokens: 0 }).totalCost).toBe(0);
    });

    it('handles a full cache hit', () => {
      const result = calculateCost({
        prompt_tokens: 1_000_000,
        completion_tokens: 0,
        prompt_cache_hit_tokens: 1_000_000,
        prompt_cache_miss_tokens: 0,
      }, 'deepseek-flash', OFF_PEAK);
      expect(result.inputCost).toBeCloseTo(0.003);
      expect(result.cacheHitRatio).toBeCloseTo(1.0);
      expect(result.cacheSavings).toBeCloseTo(0.147);
    });

    it('handles zero prompt tokens with cache fields', () => {
      const result = calculateCost({
        prompt_tokens: 0,
        completion_tokens: 500,
        prompt_cache_hit_tokens: 0,
        prompt_cache_miss_tokens: 0,
      });
      expect(result.inputCost).toBe(0);
      expect(result.cacheHitRatio).toBeUndefined();
    });

    it('prices v4-pro on its own card', () => {
      const result = calculateCost({ prompt_tokens: 1_000_000, completion_tokens: 1_000_000 }, 'deepseek-v4-pro', OFF_PEAK);
      // 1M * $0.66 + 1M * $1.98
      expect(result.totalCost).toBeCloseTo(2.64);
    });

    it('prices what the API reports back for legacy requests at the flash rate', () => {
      // The API answers deepseek-v4-flash / deepseek-chat requests with
      // model: "deepseek-flash", and that is what calculateCost receives.
      const usage = { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 };
      expect(calculateCost(usage, 'deepseek-flash', OFF_PEAK).totalCost)
        .toBeCloseTo(calculateCost(usage, 'deepseek-v4-flash', OFF_PEAK).totalCost);
    });

    it('uses flash pricing for an unknown model', () => {
      const result = calculateCost({ prompt_tokens: 1_000_000, completion_tokens: 1_000_000 }, 'unknown-model', OFF_PEAK);
      expect(result.totalCost).toBeCloseTo(0.75);
    });
  });

  describe('formatCost', () => {
    it('names the billing tier when the breakdown carries one', () => {
      expect(formatCost({ inputCost: 0, outputCost: 0.5, totalCost: 0.5, tier: 'peak' })).toBe('$0.50 at peak rates');
      expect(formatCost({ inputCost: 0, outputCost: 0.001, totalCost: 0.001, tier: 'off-peak' })).toBe('$0.0010 at off-peak rates');
    });

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
