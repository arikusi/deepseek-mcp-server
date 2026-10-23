/**
 * Resource: deepseek://models
 * Static resource listing available DeepSeek models with capabilities and pricing
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getTieredPricing, type TieredPricing } from '../cost.js';

const CAPABILITIES = [
  'chat',
  'reasoning',
  'chain_of_thought',
  'function_calling',
  'json_mode',
  'thinking_mode',
  'fim',
];

function pricingBlock(tiers: TieredPricing) {
  const toRow = (t: keyof TieredPricing) => ({
    input_cache_hit: tiers[t].cache_hit,
    input_cache_miss: tiers[t].cache_miss,
    output: tiers[t].output,
  });
  return { off_peak: toRow('off-peak'), peak: toRow('peak') };
}

function buildModelsData() {
  return {
    models: [
      {
        id: 'deepseek-flash',
        name: 'DeepSeek V4.1 Flash',
        description:
          'Current Flash model (served by DeepSeek-V4.1-Flash-1017). Fast and economical. Thinking mode supported (defaults to non-thinking here for speed; pass thinking:{type:"enabled"} to reason).',
        context_length: 1048576,
        max_output_tokens: 384000,
        capabilities: CAPABILITIES,
        pricing_per_million_tokens: pricingBlock(getTieredPricing('deepseek-flash')),
      },
      {
        id: 'deepseek-v4-pro',
        name: 'DeepSeek V4 Pro',
        description:
          'Larger V4 model (served by DeepSeek-V4-Pro-0813), at roughly 3x to 7x the Flash price. Thinking mode supported (non-thinking by default here; enable explicitly to reason).',
        context_length: 1048576,
        max_output_tokens: 384000,
        capabilities: CAPABILITIES,
        pricing_per_million_tokens: pricingBlock(getTieredPricing('deepseek-v4-pro')),
      },
    ],
    pricing_note:
      'Prices in USD. Peak is 01:00-04:00 and 06:00-10:00 UTC, Monday to Friday; all other hours, weekends and Chinese public holidays bill off-peak at half the peak rate.',
    aliases: {
      'deepseek-v4-flash': 'deepseek-flash',
      'deepseek-chat': 'deepseek-flash (non-thinking)',
      'deepseek-reasoner': 'deepseek-flash (thinking)',
      note: 'These are legacy names. They are still accepted for backward compatibility and resolve to deepseek-flash, which is also what DeepSeek serves them with. deepseek-chat and deepseek-reasoner will be removed in the next major release; prefer deepseek-flash or deepseek-v4-pro.',
    },
  };
}

export function registerModelsResource(server: McpServer): void {
  server.registerResource(
    'models',
    'deepseek://models',
    {
      title: 'DeepSeek Models',
      description:
        'List of available DeepSeek models with capabilities, context limits, and pricing information',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(buildModelsData(), null, 2),
        },
      ],
    })
  );
}
