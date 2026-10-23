/**
 * Cost Calculation Module
 * Handles pricing and cost formatting for DeepSeek API requests
 *
 * Model-aware, time-aware pricing per 1M tokens (USD), from DeepSeek's pricing
 * page (api-docs.deepseek.com/quick_start/pricing, checked 2026-10-23):
 *
 *                       off-peak                     peak
 * deepseek-flash       hit 0.003 miss 0.15 out 0.60  hit 0.006 miss 0.30 out 1.20
 * deepseek-v4-pro      hit 0.022 miss 0.66 out 1.98  hit 0.044 miss 1.32 out 3.96
 *
 * Peak is 01:00-04:00 and 06:00-10:00 UTC, Monday to Friday, which is 35 of
 * the week's 168 hours. Everything else, weekends included, is off-peak. The
 * English and Chinese pages agree on this now. DeepSeek also bills Chinese
 * public holidays as off-peak all day; we do not keep a holiday calendar, so on
 * those days a request inside the weekday window is reported at the peak rate.
 *
 * deepseek-v4-flash, deepseek-chat and deepseek-reasoner are legacy names that
 * DeepSeek serves with deepseek-flash and bills at the Flash price.
 */

/**
 * Pricing structure for a model
 */
export interface ModelPricing {
  cache_hit: number;
  cache_miss: number;
  output: number;
}

export type PricingTier = 'peak' | 'off-peak';

/** Rates for both billing tiers of one model */
export interface TieredPricing {
  'off-peak': ModelPricing;
  peak: ModelPricing;
}

const FLASH_PRICING: TieredPricing = {
  'off-peak': { cache_hit: 0.003, cache_miss: 0.15, output: 0.6 },
  peak: { cache_hit: 0.006, cache_miss: 0.3, output: 1.2 },
};

const PRO_PRICING: TieredPricing = {
  'off-peak': { cache_hit: 0.022, cache_miss: 0.66, output: 1.98 },
  peak: { cache_hit: 0.044, cache_miss: 1.32, output: 3.96 },
};

/** Flash pricing is also the default for unknown models (cheapest, most common) */
export const DEFAULT_PRICING: TieredPricing = FLASH_PRICING;

/** Per-model pricing map. Add new models here as they become available. */
export const MODEL_PRICING: Record<string, TieredPricing> = {
  'deepseek-flash': FLASH_PRICING,
  'deepseek-v4-pro': PRO_PRICING,
  // Legacy names, served by deepseek-flash at the Flash price
  'deepseek-v4-flash': FLASH_PRICING,
  'deepseek-chat': FLASH_PRICING,
  'deepseek-reasoner': FLASH_PRICING,
};

/** UTC hour ranges [start, end) that bill at the peak rate on weekdays */
const PEAK_WINDOWS_UTC: ReadonlyArray<readonly [number, number]> = [
  [1, 4],
  [6, 10],
];

/**
 * Which billing tier applies at a given instant. Takes the instant as a
 * parameter so callers and tests can pin it instead of reading the clock.
 */
export function getPricingTier(at: Date = new Date()): PricingTier {
  const day = at.getUTCDay();
  if (day === 0 || day === 6) return 'off-peak';
  const hour = at.getUTCHours();
  return PEAK_WINDOWS_UTC.some(([start, end]) => hour >= start && hour < end)
    ? 'peak'
    : 'off-peak';
}

/** Both tiers for a model. Falls back to DEFAULT_PRICING for unknown models. */
export function getTieredPricing(model?: string): TieredPricing {
  if (model && model in MODEL_PRICING) {
    return MODEL_PRICING[model];
  }
  return DEFAULT_PRICING;
}

/**
 * Rates for a model at a given instant (defaults to now).
 * Falls back to DEFAULT_PRICING for unknown models.
 */
export function getPricing(model?: string, at: Date = new Date()): ModelPricing {
  return getTieredPricing(model)[getPricingTier(at)];
}

/**
 * Cost breakdown for a request
 */
export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  cacheHitRatio?: number;
  cacheSavings?: number;
  /** Billing tier the rates were taken from */
  tier?: PricingTier;
}

/**
 * Calculate cost for a request based on token usage.
 * Supports cache hit/miss pricing. If cache fields are absent,
 * treats all input tokens as cache miss (backward compatible).
 */
export function calculateCost(usage: {
  prompt_tokens: number;
  completion_tokens: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}, model?: string, at: Date = new Date()): CostBreakdown {
  const {
    prompt_tokens,
    completion_tokens,
    prompt_cache_hit_tokens,
    prompt_cache_miss_tokens,
  } = usage;

  const tier = getPricingTier(at);
  const pricing = getTieredPricing(model)[tier];

  let inputCost: number;
  let cacheHitRatio: number | undefined;
  let cacheSavings: number | undefined;

  if (
    prompt_cache_hit_tokens !== undefined &&
    prompt_cache_miss_tokens !== undefined
  ) {
    // Cache-aware pricing
    const hitCost =
      (prompt_cache_hit_tokens / 1_000_000) * pricing.cache_hit;
    const missCost =
      (prompt_cache_miss_tokens / 1_000_000) * pricing.cache_miss;
    inputCost = hitCost + missCost;

    if (prompt_tokens > 0) {
      cacheHitRatio = prompt_cache_hit_tokens / prompt_tokens;
    }

    // Savings = what all-miss would cost minus actual cost
    const allMissCost = (prompt_tokens / 1_000_000) * pricing.cache_miss;
    cacheSavings = allMissCost - inputCost;
  } else {
    // Backward compatible: treat all input as cache miss
    inputCost = (prompt_tokens / 1_000_000) * pricing.cache_miss;
  }

  const outputCost = (completion_tokens / 1_000_000) * pricing.output;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    cacheHitRatio,
    cacheSavings,
    tier,
  };
}

/**
 * Format cost as readable USD string with optional cache savings info
 */
export function formatCost(breakdown: CostBreakdown): string {
  const cost = breakdown.totalCost;
  let formatted: string;

  if (cost < 0.01) {
    formatted = `$${cost.toFixed(4)}`;
  } else {
    formatted = `$${cost.toFixed(2)}`;
  }

  if (breakdown.tier) {
    formatted += ` at ${breakdown.tier} rates`;
  }

  if (
    breakdown.cacheHitRatio !== undefined &&
    breakdown.cacheHitRatio > 0 &&
    breakdown.cacheSavings !== undefined &&
    breakdown.cacheSavings > 0
  ) {
    const pct = Math.round(breakdown.cacheHitRatio * 100);
    formatted += ` (cache hit: ${pct}%, saved ~$${breakdown.cacheSavings.toFixed(4)})`;
  }

  return formatted;
}
