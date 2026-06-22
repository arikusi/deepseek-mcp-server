/**
 * Cost Calculation Module
 * Handles pricing and cost formatting for DeepSeek API requests
 *
 * Model-aware pricing per 1M tokens (USD), from the DeepSeek V4 pricing page:
 * - deepseek-v4-flash: cache hit $0.0028, cache miss $0.14, output $0.28
 * - deepseek-v4-pro:   cache hit $0.003625, cache miss $0.435, output $0.87
 * The deepseek-chat / deepseek-reasoner aliases resolve to deepseek-v4-flash,
 * so they carry v4-flash pricing. New models can be added to MODEL_PRICING.
 */

/**
 * Pricing structure for a model
 */
export interface ModelPricing {
  cache_hit: number;
  cache_miss: number;
  output: number;
}

/** v4-flash pricing — also the default for unknown models (cheapest, most common) */
export const DEFAULT_PRICING: ModelPricing = {
  cache_hit: 0.0028,
  cache_miss: 0.14,
  output: 0.28,
};

/** Backward-compatible alias */
export const PRICING = DEFAULT_PRICING;

/** Per-model pricing map. Add new models here as they become available. */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'deepseek-v4-flash': { cache_hit: 0.0028, cache_miss: 0.14, output: 0.28 },
  'deepseek-v4-pro': { cache_hit: 0.003625, cache_miss: 0.435, output: 0.87 },
  // Compatibility aliases (resolve to v4-flash on the wire)
  'deepseek-chat': { cache_hit: 0.0028, cache_miss: 0.14, output: 0.28 },
  'deepseek-reasoner': { cache_hit: 0.0028, cache_miss: 0.14, output: 0.28 },
};

/**
 * Get pricing for a specific model. Falls back to DEFAULT_PRICING for unknown models.
 */
export function getPricing(model?: string): ModelPricing {
  if (model && model in MODEL_PRICING) {
    return MODEL_PRICING[model];
  }
  return DEFAULT_PRICING;
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
}, model?: string): CostBreakdown {
  const {
    prompt_tokens,
    completion_tokens,
    prompt_cache_hit_tokens,
    prompt_cache_miss_tokens,
  } = usage;

  const pricing = getPricing(model);

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
