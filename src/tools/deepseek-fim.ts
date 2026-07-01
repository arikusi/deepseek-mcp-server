/**
 * Tool: deepseek_fim
 * Fill-in-the-Middle (FIM) completion with DeepSeek V4 models.
 * The model completes the text between a prefix (prompt) and an optional
 * suffix. Common uses: code completion, content infilling.
 *
 * FIM runs against the DeepSeek Beta completions endpoint in non-thinking
 * mode only, and the API caps output at 4K tokens.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getConfig } from '../config.js';
import { calculateCost, formatCost } from '../cost.js';
import { FimInputSchema, FIM_MAX_TOKENS } from '../schemas.js';
import type { DeepSeekClient } from '../deepseek-client.js';
import type { FimCompletionParams } from '../types.js';
import { getErrorMessage } from '../types.js';
import { UsageTracker } from '../usage-tracker.js';

/** Tool input shape (Zod-inferred at call time; typed loosely for the handler). */
interface DeepSeekFimInput {
  prompt: string;
  suffix?: string;
  model?: 'deepseek-v4-flash' | 'deepseek-v4-pro' | 'deepseek-chat' | 'deepseek-reasoner';
  max_tokens?: number;
  temperature?: number;
  stop?: string | string[];
}

export function registerFimTool(
  server: McpServer,
  client: DeepSeekClient
): void {
  const cfg = getConfig();
  const KNOWN_MODELS = [
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'deepseek-chat',
    'deepseek-reasoner',
  ] as const;
  type KnownModel = (typeof KNOWN_MODELS)[number];
  const modelDefault: KnownModel = (KNOWN_MODELS as readonly string[]).includes(
    cfg.defaultModel
  )
    ? (cfg.defaultModel as KnownModel)
    : 'deepseek-v4-flash';

  server.registerTool(
    'deepseek_fim',
    {
      title: 'DeepSeek FIM Completion',
      description:
        'Fill-in-the-Middle (FIM) completion with DeepSeek V4. Provide a prompt (prefix) and an optional suffix; ' +
        'the model completes the text in between. Ideal for code completion and content infilling. ' +
        'Runs in non-thinking mode on the Beta endpoint; output is capped at 4K tokens. ' +
        'Aliases deepseek-chat and deepseek-reasoner resolve to deepseek-v4-flash (FIM has no thinking mode). ' +
        'Includes automatic cost tracking and model fallback with circuit breaker resilience.',
      inputSchema: {
        prompt: z
          .string()
          .min(1)
          .describe(
            'The prefix text that comes before the content to generate. Required. For code completion, this is the code up to the cursor.'
          ),
        suffix: z
          .string()
          .optional()
          .describe(
            'Optional suffix text that comes after the content to generate. The model fills the gap between prompt and suffix.'
          ),
        model: z
          .enum([
            'deepseek-v4-flash',
            'deepseek-v4-pro',
            'deepseek-chat',
            'deepseek-reasoner',
          ])
          .default(modelDefault)
          .describe(
            'Model to use. deepseek-v4-flash (default, fast/economical) or deepseek-v4-pro (most capable). ' +
            'Aliases deepseek-chat / deepseek-reasoner resolve to v4-flash. FIM is always non-thinking.'
          ),
        max_tokens: z
          .number()
          .min(1)
          .max(FIM_MAX_TOKENS)
          .optional()
          .describe(
            `Maximum tokens to generate. FIM completions are capped at ${FIM_MAX_TOKENS} tokens by the API.`
          ),
        temperature: z
          .number()
          .min(0)
          .max(2)
          .optional()
          .describe('Sampling temperature (0-2). Higher = more random. Default: 1.0.'),
        stop: z
          .union([z.string(), z.array(z.string()).max(16)])
          .optional()
          .describe(
            'Optional stop sequence(s). Generation stops when any is produced. A single string or an array of up to 16 strings.'
          ),
      },
      outputSchema: {
        text: z.string(),
        model: z.string(),
        usage: z.object({
          prompt_tokens: z.number(),
          completion_tokens: z.number(),
          total_tokens: z.number(),
          prompt_cache_hit_tokens: z.number().optional(),
          prompt_cache_miss_tokens: z.number().optional(),
        }),
        finish_reason: z.string(),
        cost_usd: z.number().optional(),
        routed_from: z.string().optional(),
      },
    },
    async (input: DeepSeekFimInput) => {
      try {
        // Enforce the same content-length guard as chat, across prompt + suffix.
        const maxLen = getConfig().maxMessageLength;
        const combinedLen = input.prompt.length + (input.suffix?.length ?? 0);
        if (combinedLen > maxLen) {
          throw new Error(
            `FIM prompt+suffix exceeds maximum length of ${maxLen} characters`
          );
        }

        const validated = FimInputSchema.parse(input);

        // Track whether an alias was requested, for transparency in the output.
        const routedFrom =
          validated.model === 'deepseek-chat' ||
          validated.model === 'deepseek-reasoner'
            ? validated.model
            : undefined;

        console.error(
          `[DeepSeek MCP] FIM request: model=${validated.model}, prompt_len=${validated.prompt.length}${validated.suffix ? `, suffix_len=${validated.suffix.length}` : ''}`
        );

        const params: FimCompletionParams = {
          model: validated.model,
          prompt: validated.prompt,
          suffix: validated.suffix,
          max_tokens: validated.max_tokens,
          temperature: validated.temperature,
          stop: validated.stop,
        };

        const response = await client.createFimCompletion(params);

        console.error(
          `[DeepSeek MCP] FIM response: tokens=${response.usage.total_tokens}, finish_reason=${response.finish_reason}`
        );

        const costBreakdown = calculateCost(response.usage, response.model);

        // Track usage globally
        UsageTracker.getInstance().trackRequest(
          response.usage,
          costBreakdown.totalCost
        );

        let responseText = response.text;

        if (getConfig().showCostInfo) {
          responseText += `\n---\n**Request Information:**\n`;
          responseText += `- **Tokens:** ${response.usage.total_tokens} (${response.usage.prompt_tokens} prompt + ${response.usage.completion_tokens} completion)\n`;
          responseText += `- **Model:** ${response.model}\n`;
          responseText += `- **Cost:** ${formatCost(costBreakdown)}`;
          if (routedFrom) {
            responseText += `\n- **Routed:** ${routedFrom} -> deepseek-v4-flash`;
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: responseText,
            },
          ],
          structuredContent: {
            text: response.text,
            model: response.model,
            usage: response.usage,
            finish_reason: response.finish_reason,
            cost_usd: parseFloat(costBreakdown.totalCost.toFixed(6)),
            ...(routedFrom ? { routed_from: routedFrom } : {}),
          } as unknown as Record<string, unknown>,
        };
      } catch (error: unknown) {
        console.error('[DeepSeek MCP] FIM Error:', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: ${getErrorMessage(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
