/**
 * Cost Calculation Module
 * Handles pricing and cost formatting for DeepSeek API requests
 */

/** DeepSeek pricing per 1M tokens (USD) */
export const PRICING = {
  'deepseek-chat': {
    prompt: 0.14,
    completion: 0.28,
  },
  'deepseek-reasoner': {
    prompt: 0.55,
    completion: 2.19,
  },
} as const;

/**
 * Calculate cost for a request based on token usage
 */
export function calculateCost(
  promptTokens: number,
  completionTokens: number,
  model: string
): number {
  const modelPricing =
    PRICING[model as keyof typeof PRICING] || PRICING['deepseek-chat'];

  const promptCost = (promptTokens / 1_000_000) * modelPricing.prompt;
  const completionCost =
    (completionTokens / 1_000_000) * modelPricing.completion;

  return promptCost + completionCost;
}

/**
 * Format cost as readable USD string
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}
