/**
 * Tool: deepseek_chat
 * Chat completion with DeepSeek models
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getConfig } from '../config.js';
import { calculateCost, formatCost } from '../cost.js';
import {
  ExtendedMessageSchema,
  ChatInputWithToolsSchema,
  ToolDefinitionSchema,
  ToolChoiceSchema,
} from '../schemas.js';
import type { DeepSeekClient } from '../deepseek-client.js';
import type { DeepSeekChatInput } from '../types.js';
import { getErrorMessage } from '../types.js';

/** Maximum allowed message content length (from config) */
function validateMessageLength(input: DeepSeekChatInput): void {
  const maxLen = getConfig().maxMessageLength;
  for (const msg of input.messages) {
    if (msg.content.length > maxLen) {
      throw new Error(
        `Message content exceeds maximum length of ${maxLen} characters`
      );
    }
  }
}

export function registerChatTool(server: McpServer, client: DeepSeekClient): void {
  server.registerTool(
    'deepseek_chat',
    {
      title: 'DeepSeek Chat Completion',
      description:
        'Chat with DeepSeek AI models. Supports deepseek-chat for general conversations and ' +
        'deepseek-reasoner (R1) for complex reasoning tasks with chain-of-thought explanations. ' +
        'Supports function calling via the tools parameter for structured tool use. ' +
        'The reasoner model provides both reasoning_content (thinking process) and content (final answer).',
      inputSchema: {
        messages: z
          .array(ExtendedMessageSchema)
          .min(1)
          .describe(
            'Array of conversation messages. Each message has role (system/user/assistant/tool) and content. Tool messages require tool_call_id.'
          ),
        model: z
          .enum(['deepseek-chat', 'deepseek-reasoner'])
          .default('deepseek-chat')
          .describe(
            'Model to use. deepseek-chat for general tasks, deepseek-reasoner for complex reasoning'
          ),
        temperature: z
          .number()
          .min(0)
          .max(2)
          .optional()
          .describe('Sampling temperature (0-2). Higher = more random. Default: 1.0'),
        max_tokens: z
          .number()
          .min(1)
          .max(32768)
          .optional()
          .describe('Maximum tokens to generate. Default: model maximum'),
        stream: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            'Enable streaming mode. Returns full response after streaming completes.'
          ),
        tools: z
          .array(ToolDefinitionSchema)
          .max(128)
          .optional()
          .describe(
            'Array of tool definitions for function calling. Each tool has type "function" and a function object with name, description, and parameters (JSON Schema).'
          ),
        tool_choice: ToolChoiceSchema.optional().describe(
          'Controls which tool the model calls. "auto" (default), "none", "required", or {type:"function",function:{name:"..."}}'
        ),
      },
      outputSchema: {
        content: z.string(),
        reasoning_content: z.string().optional(),
        model: z.string(),
        usage: z.object({
          prompt_tokens: z.number(),
          completion_tokens: z.number(),
          total_tokens: z.number(),
        }),
        finish_reason: z.string(),
        tool_calls: z
          .array(
            z.object({
              id: z.string(),
              type: z.literal('function'),
              function: z.object({
                name: z.string(),
                arguments: z.string(),
              }),
            })
          )
          .optional(),
      },
    },
    async (input: DeepSeekChatInput) => {
      try {
        // Validate message content length
        validateMessageLength(input);

        // Validate input with extended schema (supports tools)
        const validated = ChatInputWithToolsSchema.parse(input);

        console.error(
          `[DeepSeek MCP] Request: model=${validated.model}, messages=${validated.messages.length}, stream=${validated.stream}${validated.tools ? `, tools=${validated.tools.length}` : ''}`
        );

        // Call appropriate method based on stream parameter
        const response = validated.stream
          ? await client.createStreamingChatCompletion({
              model: validated.model,
              messages: validated.messages,
              temperature: validated.temperature,
              max_tokens: validated.max_tokens,
              tools: validated.tools,
              tool_choice: validated.tool_choice,
            })
          : await client.createChatCompletion({
              model: validated.model,
              messages: validated.messages,
              temperature: validated.temperature,
              max_tokens: validated.max_tokens,
              tools: validated.tools,
              tool_choice: validated.tool_choice,
            });

        console.error(
          `[DeepSeek MCP] Response: tokens=${response.usage.total_tokens}, finish_reason=${response.finish_reason}${response.tool_calls ? `, tool_calls=${response.tool_calls.length}` : ''}`
        );

        // Format response
        let responseText = '';

        // Add reasoning content if available (for deepseek-reasoner)
        if (response.reasoning_content) {
          responseText += `<thinking>\n${response.reasoning_content}\n</thinking>\n\n`;
        }

        responseText += response.content;

        // Format tool calls if present
        if (response.tool_calls?.length) {
          responseText += '\n\n**Function Calls:**\n';
          for (const tc of response.tool_calls) {
            responseText += `\`${tc.function.name}\`\n`;
            responseText += `- Call ID: ${tc.id}\n`;
            responseText += `- Arguments: ${tc.function.arguments}\n\n`;
          }
        }

        // Calculate cost
        const cost = calculateCost(
          response.usage.prompt_tokens,
          response.usage.completion_tokens,
          response.model
        );

        // Add usage stats with cost information (controlled by config)
        if (getConfig().showCostInfo) {
          responseText += `\n---\n**Request Information:**\n`;
          responseText += `- **Tokens:** ${response.usage.total_tokens} (${response.usage.prompt_tokens} prompt + ${response.usage.completion_tokens} completion)\n`;
          responseText += `- **Model:** ${response.model}\n`;
          responseText += `- **Cost:** ${formatCost(cost)}`;
          if (response.tool_calls?.length) {
            responseText += `\n- **Tool Calls:** ${response.tool_calls.length}`;
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
            ...response,
            cost_usd: parseFloat(cost.toFixed(6)),
          } as unknown as Record<string, unknown>,
        };
      } catch (error: unknown) {
        console.error('[DeepSeek MCP] Error:', error);
        const errorMessage = getErrorMessage(error);

        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
