/**
 * Resource: deepseek://models
 * Static resource listing available DeepSeek models with capabilities and pricing
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getPricing } from '../cost.js';

function buildModelsData() {
  const flashPricing = getPricing('deepseek-v4-flash');
  const proPricing = getPricing('deepseek-v4-pro');

  return {
    models: [
      {
        id: 'deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        description:
          'Fast, economical V4 model. Thinking mode supported (defaults to non-thinking here for speed; pass thinking:{type:"enabled"} to reason).',
        context_length: 1048576,
        max_output_tokens: 384000,
        capabilities: [
          'chat',
          'reasoning',
          'chain_of_thought',
          'function_calling',
          'json_mode',
          'thinking_mode',
        ],
        pricing_per_million_tokens: {
          input_cache_hit: flashPricing.cache_hit,
          input_cache_miss: flashPricing.cache_miss,
          output: flashPricing.output,
        },
      },
      {
        id: 'deepseek-v4-pro',
        name: 'DeepSeek V4 Pro',
        description:
          'Most capable V4 model, performance rivaling top closed-source models. Thinking mode supported (non-thinking by default here; enable explicitly to reason).',
        context_length: 1048576,
        max_output_tokens: 384000,
        capabilities: [
          'chat',
          'reasoning',
          'chain_of_thought',
          'function_calling',
          'json_mode',
          'thinking_mode',
        ],
        pricing_per_million_tokens: {
          input_cache_hit: proPricing.cache_hit,
          input_cache_miss: proPricing.cache_miss,
          output: proPricing.output,
        },
      },
    ],
    aliases: {
      'deepseek-chat': 'deepseek-v4-flash (non-thinking)',
      'deepseek-reasoner': 'deepseek-v4-flash (thinking)',
      note: 'The deepseek-chat and deepseek-reasoner names are accepted for backward compatibility and resolve to deepseek-v4-flash. The DeepSeek API retires these names on 2026-07-24.',
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
