/**
 * DeepSeek MCP Server — Cloudflare Worker
 * Stateless Streamable HTTP transport with BYOK (Bring Your Own Key)
 *
 * Users send their own DeepSeek API key as Bearer token.
 * The worker proxies MCP requests to DeepSeek API.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';

const VERSION = '2.1.0';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_FIM_URL = 'https://api.deepseek.com/beta/completions';
const FIM_MAX_TOKENS = 4096;

// Pricing per 1M tokens (DeepSeek V4). chat/reasoner aliases resolve to v4-flash.
interface ModelPricing {
  cacheHit: number;
  cacheMiss: number;
  output: number;
}
const MODEL_PRICING: Record<string, ModelPricing> = {
  'deepseek-v4-flash': { cacheHit: 0.0028, cacheMiss: 0.14, output: 0.28 },
  'deepseek-v4-pro': { cacheHit: 0.003625, cacheMiss: 0.435, output: 0.87 },
};
const DEFAULT_PRICING: ModelPricing = MODEL_PRICING['deepseek-v4-flash'];
function getPricing(model: string): ModelPricing {
  return MODEL_PRICING[model] || DEFAULT_PRICING;
}

interface Env {}

function extractApiKey(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

function calculateCost(usage: Record<string, number>, model: string): { totalCost: number; formatted: string } {
  const pricing = getPricing(model);
  const cacheHit = usage.prompt_cache_hit_tokens || 0;
  const cacheMiss = usage.prompt_cache_miss_tokens || usage.prompt_tokens || 0;
  const output = usage.completion_tokens || 0;

  const totalCost =
    (cacheHit * pricing.cacheHit) / 1_000_000 +
    (cacheMiss * pricing.cacheMiss) / 1_000_000 +
    (output * pricing.output) / 1_000_000;

  let formatted = `$${totalCost.toFixed(6)}`;
  if (cacheHit > 0) {
    const ratio = ((cacheHit / (cacheHit + cacheMiss)) * 100).toFixed(0);
    formatted += ` (cache hit: ${ratio}%)`;
  }
  return { totalCost, formatted };
}

function createMcpServer(apiKey: string): McpServer {
  const server = new McpServer({ name: 'deepseek-mcp-server', version: VERSION });

  server.tool(
    'deepseek_chat',
    'Chat with DeepSeek V4 models (deepseek-v4-flash, deepseek-v4-pro; chat/reasoner accepted as aliases). Supports function calling, thinking mode, JSON output, cost tracking.',
    {
      messages: z
        .array(
          z.object({
            role: z.enum(['system', 'user', 'assistant', 'tool']),
            content: z.string(),
            tool_call_id: z.string().optional(),
          })
        )
        .min(1)
        .describe('Conversation messages'),
      model: z
        .enum(['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'])
        .default('deepseek-v4-flash')
        .describe('Model to use. v4-flash (default) or v4-pro, both 1M context. Non-thinking by default; aliases: deepseek-chat -> v4-flash non-thinking, deepseek-reasoner -> v4-flash thinking'),
      temperature: z.number().min(0).max(2).optional().describe('Sampling temperature (0-2). Ignored in thinking mode'),
      max_tokens: z.number().min(1).max(384000).optional().describe('Max tokens to generate (up to 384000)'),
      stream: z.boolean().default(false).describe('Enable streaming (accumulated response returned)'),
      tools: z
        .array(
          z.object({
            type: z.literal('function'),
            function: z.object({
              name: z.string().min(1),
              description: z.string().optional(),
              parameters: z.record(z.string(), z.unknown()).optional(),
            }),
          })
        )
        .max(128)
        .optional()
        .describe('Tool definitions for function calling'),
      tool_choice: z
        .union([
          z.enum(['auto', 'none', 'required']),
          z.object({
            type: z.literal('function'),
            function: z.object({ name: z.string().min(1) }),
          }),
        ])
        .optional()
        .describe('Tool choice control'),
      thinking: z
        .object({ type: z.enum(['enabled', 'disabled']) })
        .optional()
        .describe('Toggle thinking mode. {type:"enabled"} to reason, {type:"disabled"} for a fast answer (default)'),
      reasoning_effort: z
        .enum(['high', 'max'])
        .optional()
        .describe('Reasoning effort while thinking is active: high (default) or max'),
      json_mode: z.boolean().optional().describe('Enable JSON output mode'),
    },
    {
      title: 'DeepSeek Chat',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async (params) => {
      try {
        // Resolve the user-facing model + thinking flag for the V4 API.
        // v4-flash/v4-pro are the live models; chat/reasoner are compatibility
        // aliases (retired by the API on 2026-07-24) that resolve to v4-flash.
        // The API defaults thinking to enabled, so we always send an explicit flag.
        let model: string;
        let thinking: { type: 'enabled' | 'disabled' };
        const isReasonerRouted = params.model === 'deepseek-reasoner';
        if (isReasonerRouted) {
          model = 'deepseek-v4-flash';
          thinking = { type: 'enabled' };
        } else if (params.model === 'deepseek-chat') {
          model = 'deepseek-v4-flash';
          thinking = params.thinking ?? { type: 'disabled' };
        } else {
          model = params.model;
          thinking = params.thinking ?? { type: 'disabled' };
        }

        const isThinkingMode = thinking.type === 'enabled';

        // Build DeepSeek API request body — always stream to avoid CF timeout
        const body: Record<string, unknown> = {
          model,
          messages: params.messages,
          stream: true,
          thinking,
        };
        // Sampling params are ignored by thinking mode - don't send them
        if (params.temperature !== undefined && !isThinkingMode) body.temperature = params.temperature;
        if (params.max_tokens !== undefined) body.max_tokens = params.max_tokens;
        if (params.tools) body.tools = params.tools;
        if (params.tool_choice) body.tool_choice = params.tool_choice;
        if (isThinkingMode && params.reasoning_effort) body.reasoning_effort = params.reasoning_effort;
        if (params.json_mode) body.response_format = { type: 'json_object' };

        const apiResponse = await fetch(DEEPSEEK_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });

        if (!apiResponse.ok) {
          const errText = await apiResponse.text();
          return {
            content: [{ type: 'text' as const, text: `DeepSeek API Error (${apiResponse.status}): ${errText}` }],
            isError: true,
          };
        }

        // Read SSE stream and accumulate chunks
        let content = '';
        let reasoningContent = '';
        let responseModel = '';
        let finishReason = '';
        let usage: Record<string, number> = {};
        const toolCalls: Record<number, { id: string; type: string; function: { name: string; arguments: string } }> = {};

        const reader = apiResponse.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const chunk = JSON.parse(data);
              if (chunk.model) responseModel = chunk.model;
              if (chunk.usage) usage = chunk.usage;

              const delta = chunk.choices?.[0]?.delta;
              if (!delta) {
                if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
                continue;
              }

              if (delta.content) content += delta.content;
              if (delta.reasoning_content) reasoningContent += delta.reasoning_content;
              if (delta.finish_reason) finishReason = delta.finish_reason;

              // Accumulate tool calls
              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!toolCalls[idx]) {
                    toolCalls[idx] = { id: tc.id || '', type: 'function', function: { name: '', arguments: '' } };
                  }
                  if (tc.id) toolCalls[idx].id = tc.id;
                  if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
                  if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
                }
              }
            } catch {
              // skip malformed chunks
            }
          }
        }

        const toolCallsArray = Object.values(toolCalls);
        const cost = calculateCost(usage, responseModel || model);

        // Format response text
        let text = '';
        if (reasoningContent) {
          text += `<thinking>\n${reasoningContent}\n</thinking>\n\n`;
        }
        text += content;

        if (toolCallsArray.length > 0) {
          text += '\n\n**Function Calls:**\n';
          for (const tc of toolCallsArray) {
            text += `\`${tc.function.name}\`\n`;
            text += `- Call ID: ${tc.id}\n`;
            text += `- Arguments: ${tc.function.arguments}\n\n`;
          }
        }

        text += `\n---\n**Request Info:**\n`;
        text += `- **Tokens:** ${usage.total_tokens || 0} (${usage.prompt_tokens || 0} prompt + ${usage.completion_tokens || 0} completion)\n`;
        text += `- **Model:** ${responseModel || model}\n`;
        text += `- **Cost:** ${cost.formatted}`;
        if (isReasonerRouted) {
          text += `\n- **Routed:** deepseek-reasoner -> deepseek-v4-flash + thinking`;
        }

        return {
          content: [{ type: 'text' as const, text }],
          structuredContent: {
            content,
            reasoning_content: reasoningContent || undefined,
            model: responseModel || model,
            usage,
            finish_reason: finishReason,
            tool_calls: toolCallsArray.length > 0 ? toolCallsArray : undefined,
            ...(isReasonerRouted ? { routed_from: 'deepseek-reasoner' } : {}),
            cost_usd: parseFloat(cost.totalCost.toFixed(6)),
          } as unknown as Record<string, unknown>,
        };
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'deepseek_fim',
    'Fill-in-the-Middle (FIM) completion with DeepSeek V4. Provide a prompt (prefix) and an optional suffix; the model completes the text in between. Ideal for code completion and content infilling. Runs in non-thinking mode on the Beta endpoint; output is capped at 4096 tokens. Aliases deepseek-chat / deepseek-reasoner resolve to deepseek-v4-flash. Includes cost tracking.',
    {
      prompt: z
        .string()
        .min(1)
        .describe('The prefix text before the content to generate. For code completion, this is the code up to the cursor.'),
      suffix: z
        .string()
        .optional()
        .describe('Optional suffix text after the content to generate. The model fills the gap between prompt and suffix.'),
      model: z
        .enum(['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'])
        .default('deepseek-v4-flash')
        .describe('Model to use. v4-flash (default) or v4-pro. Aliases deepseek-chat / deepseek-reasoner resolve to v4-flash. FIM is always non-thinking.'),
      max_tokens: z
        .number()
        .min(1)
        .max(FIM_MAX_TOKENS)
        .optional()
        .describe(`Max tokens to generate. FIM is capped at ${FIM_MAX_TOKENS} tokens.`),
      temperature: z.number().min(0).max(2).optional().describe('Sampling temperature (0-2)'),
      stop: z
        .union([z.string(), z.array(z.string()).max(16)])
        .optional()
        .describe('Optional stop sequence(s): a single string or an array of up to 16 strings.'),
    },
    {
      title: 'DeepSeek FIM',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async (params) => {
      try {
        // Aliases collapse to v4-flash; FIM has no thinking mode.
        const routedFrom =
          params.model === 'deepseek-chat' || params.model === 'deepseek-reasoner'
            ? params.model
            : undefined;
        const model = routedFrom ? 'deepseek-v4-flash' : params.model;

        const body: Record<string, unknown> = {
          model,
          prompt: params.prompt,
          stream: false,
        };
        if (params.suffix !== undefined) body.suffix = params.suffix;
        if (params.max_tokens !== undefined) body.max_tokens = params.max_tokens;
        if (params.temperature !== undefined) body.temperature = params.temperature;
        if (params.stop !== undefined) body.stop = params.stop;

        const apiResponse = await fetch(DEEPSEEK_FIM_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });

        if (!apiResponse.ok) {
          const errText = await apiResponse.text();
          return {
            content: [{ type: 'text' as const, text: `DeepSeek FIM API Error (${apiResponse.status}): ${errText}` }],
            isError: true,
          };
        }

        const json = (await apiResponse.json()) as {
          model?: string;
          choices?: Array<{ text?: string; finish_reason?: string }>;
          usage?: Record<string, number>;
        };
        const choice = json.choices?.[0];
        const completion = choice?.text || '';
        const usage = json.usage || {};
        const responseModel = json.model || model;
        const cost = calculateCost(usage, responseModel);

        let text = completion;
        text += `\n---\n**Request Info:**\n`;
        text += `- **Tokens:** ${usage.total_tokens || 0} (${usage.prompt_tokens || 0} prompt + ${usage.completion_tokens || 0} completion)\n`;
        text += `- **Model:** ${responseModel}\n`;
        text += `- **Cost:** ${cost.formatted}`;
        if (routedFrom) {
          text += `\n- **Routed:** ${routedFrom} -> deepseek-v4-flash`;
        }

        return {
          content: [{ type: 'text' as const, text }],
          structuredContent: {
            text: completion,
            model: responseModel,
            usage,
            finish_reason: choice?.finish_reason || 'stop',
            cost_usd: parseFloat(cost.totalCost.toFixed(6)),
            ...(routedFrom ? { routed_from: routedFrom } : {}),
          } as unknown as Record<string, unknown>,
        };
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
        },
      });
    }

    // MCP Server Card — allows Smithery and other registries to discover capabilities without scanning
    if (url.pathname === '/.well-known/mcp/server-card.json') {
      return Response.json({
        name: 'deepseek-mcp-server',
        version: VERSION,
        description: 'MCP server for DeepSeek V4 AI — chat, reasoning, function calling, JSON mode, fill-in-the-middle (FIM), cost tracking',
        transport: { type: 'streamable-http', url: 'https://deepseek-mcp.tahirl.com/mcp' },
        capabilities: { tools: true, prompts: false, resources: false },
        tools: [
          {
            name: 'deepseek_chat',
            description: 'Chat with DeepSeek V4 models (deepseek-v4-flash, deepseek-v4-pro; chat/reasoner accepted as aliases). Supports function calling, thinking mode, JSON output, cost tracking.',
            annotations: {
              title: 'DeepSeek Chat',
              readOnlyHint: true,
              destructiveHint: false,
              idempotentHint: false,
              openWorldHint: true,
            },
            inputSchema: {
              type: 'object',
              required: ['messages'],
              properties: {
                messages: { type: 'array', description: 'Conversation messages', items: { type: 'object' } },
                model: { type: 'string', enum: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'], default: 'deepseek-v4-flash' },
                temperature: { type: 'number', description: 'Sampling temperature (0-2)' },
                max_tokens: { type: 'number', description: 'Max tokens to generate (up to 384000)' },
                stream: { type: 'boolean', default: false },
                tools: { type: 'array', description: 'Tool definitions for function calling' },
                tool_choice: { description: 'Tool choice control' },
                thinking: { type: 'object', description: 'Toggle thinking mode' },
                reasoning_effort: { type: 'string', enum: ['high', 'max'], description: 'Reasoning effort while thinking' },
                json_mode: { type: 'boolean', description: 'Enable JSON output mode' },
              },
            },
          },
          {
            name: 'deepseek_fim',
            description: 'Fill-in-the-Middle (FIM) completion with DeepSeek V4. Provide a prompt (prefix) and an optional suffix; the model completes the text in between. Ideal for code completion and content infilling. Non-thinking, Beta endpoint, output capped at 4096 tokens.',
            annotations: {
              title: 'DeepSeek FIM',
              readOnlyHint: true,
              destructiveHint: false,
              idempotentHint: false,
              openWorldHint: true,
            },
            inputSchema: {
              type: 'object',
              required: ['prompt'],
              properties: {
                prompt: { type: 'string', description: 'Prefix text before the content to generate' },
                suffix: { type: 'string', description: 'Optional suffix text after the content to generate' },
                model: { type: 'string', enum: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'], default: 'deepseek-v4-flash' },
                max_tokens: { type: 'number', description: 'Max tokens to generate (up to 4096)' },
                temperature: { type: 'number', description: 'Sampling temperature (0-2)' },
                stop: { description: 'Stop sequence(s): a string or an array of up to 16 strings' },
              },
            },
          },
        ],
        auth: { type: 'bearer', description: 'DeepSeek API key as Bearer token' },
        icon: 'https://raw.githubusercontent.com/arikusi/deepseek-mcp-server/main/icon.png',
        docs: 'https://github.com/arikusi/deepseek-mcp-server',
      }, {
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Health check
    if (url.pathname === '/health') {
      return Response.json({
        status: 'ok',
        version: VERSION,
        transport: 'cloudflare-workers',
        timestamp: new Date().toISOString(),
      }, {
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Root — info page
    if (url.pathname === '/' && request.method === 'GET') {
      return Response.json({
        name: 'deepseek-mcp-server',
        version: VERSION,
        description: 'MCP server for DeepSeek AI models — BYOK (Bring Your Own Key)',
        endpoints: { mcp: '/mcp', health: '/health' },
        auth: 'Send your DeepSeek API key as Authorization: Bearer <key>',
        docs: 'https://github.com/arikusi/deepseek-mcp-server',
      }, {
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    // MCP endpoint
    if (url.pathname === '/mcp') {
      // Stateless mode: only POST is supported (no SSE via GET/DELETE)
      if (request.method !== 'POST') {
        return Response.json(
          { error: 'Method not allowed. Use POST for MCP requests.' },
          { status: 405, headers: { 'Access-Control-Allow-Origin': '*' } }
        );
      }

      // BYOK: require API key
      const apiKey = extractApiKey(request);
      if (!apiKey) {
        return Response.json(
          { error: 'Authorization required. Send your DeepSeek API key as: Authorization: Bearer <key>' },
          { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } }
        );
      }

      // Stateless: create fresh server + transport per request
      const server = createMcpServer(apiKey);
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);

      const response = await transport.handleRequest(request);

      // Add CORS headers
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Expose-Headers', 'Mcp-Session-Id');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return Response.json({ error: 'Not Found' }, { status: 404 });
  },
};
