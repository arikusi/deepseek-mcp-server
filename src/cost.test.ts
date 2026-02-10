import { describe, it, expect } from 'vitest';
import { calculateCost, formatCost, PRICING } from './cost.js';

describe('cost', () => {
  describe('PRICING', () => {
    it('should have pricing for deepseek-chat', () => {
      expect(PRICING['deepseek-chat']).toBeDefined();
      expect(PRICING['deepseek-chat'].prompt).toBe(0.14);
      expect(PRICING['deepseek-chat'].completion).toBe(0.28);
    });

    it('should have pricing for deepseek-reasoner', () => {
      expect(PRICING['deepseek-reasoner']).toBeDefined();
      expect(PRICING['deepseek-reasoner'].prompt).toBe(0.55);
      expect(PRICING['deepseek-reasoner'].completion).toBe(2.19);
    });
  });

  describe('calculateCost', () => {
    it('should calculate deepseek-chat cost correctly', () => {
      const cost = calculateCost(1_000_000, 1_000_000, 'deepseek-chat');
      // 1M prompt * $0.14/1M + 1M completion * $0.28/1M = $0.42
      expect(cost).toBeCloseTo(0.42);
    });

    it('should calculate deepseek-reasoner cost correctly', () => {
      const cost = calculateCost(1_000_000, 1_000_000, 'deepseek-reasoner');
      // 1M prompt * $0.55/1M + 1M completion * $2.19/1M = $2.74
      expect(cost).toBeCloseTo(2.74);
    });

    it('should calculate cost for smaller token counts', () => {
      const cost = calculateCost(1000, 500, 'deepseek-chat');
      const expected =
        (1000 / 1_000_000) * 0.14 + (500 / 1_000_000) * 0.28;
      expect(cost).toBeCloseTo(expected);
    });

    it('should fallback to deepseek-chat for unknown model', () => {
      const cost = calculateCost(1000, 500, 'unknown-model');
      const expected =
        (1000 / 1_000_000) * 0.14 + (500 / 1_000_000) * 0.28;
      expect(cost).toBeCloseTo(expected);
    });

    it('should return 0 for zero tokens', () => {
      expect(calculateCost(0, 0, 'deepseek-chat')).toBe(0);
    });

    it('should handle only prompt tokens', () => {
      const cost = calculateCost(1_000_000, 0, 'deepseek-chat');
      expect(cost).toBeCloseTo(0.14);
    });

    it('should handle only completion tokens', () => {
      const cost = calculateCost(0, 1_000_000, 'deepseek-chat');
      expect(cost).toBeCloseTo(0.28);
    });
  });

  describe('formatCost', () => {
    it('should format small values with 4 decimal places', () => {
      expect(formatCost(0.001)).toBe('$0.0010');
      expect(formatCost(0.0001)).toBe('$0.0001');
    });

    it('should format large values with 2 decimal places', () => {
      expect(formatCost(1.5)).toBe('$1.50');
      expect(formatCost(0.42)).toBe('$0.42');
    });

    it('should format zero as small value', () => {
      expect(formatCost(0)).toBe('$0.0000');
    });

    it('should format boundary value (0.01) with 2 decimals', () => {
      expect(formatCost(0.01)).toBe('$0.01');
    });

    it('should format values just below boundary with 4 decimals', () => {
      expect(formatCost(0.0099)).toBe('$0.0099');
    });
  });
});
