#!/usr/bin/env node

/**
 * DeepSeek MCP Server
 * Model Context Protocol server for DeepSeek API integration
 *
 * This server exposes DeepSeek's chat and reasoning models as MCP tools
 * that can be used by Claude Code and other MCP clients.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { DeepSeekClient } from './deepseek-client.js';
import type { DeepSeekChatInput } from './types.js';

// Get API key from environment variable
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

if (!DEEPSEEK_API_KEY) {
  console.error('Error: DEEPSEEK_API_KEY environment variable is not set');
  console.error('Please set your DeepSeek API key:');
  console.error('  export DEEPSEEK_API_KEY="your-api-key-here"');
  process.exit(1);
}

// Initialize DeepSeek client
const deepseek = new DeepSeekClient(DEEPSEEK_API_KEY);

// Create MCP server
const server = new McpServer({
  name: 'deepseek-mcp-server',
  version: '1.0.0',
});

// Define Zod schemas for input validation
const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

const ChatInputSchema = z.object({
  messages: z.array(MessageSchema).min(1),
  model: z.enum(['deepseek-chat', 'deepseek-reasoner']).default('deepseek-chat'),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().min(1).max(32768).optional(),
  stream: z.boolean().optional().default(false),
});

/**
 * Tool: deepseek_chat
 *
 * Chat completion with DeepSeek models.
 * Supports both deepseek-chat and deepseek-reasoner (R1) models.
 */
server.registerTool(
  'deepseek_chat',
  {
    title: 'DeepSeek Chat Completion',
    description:
      'Chat with DeepSeek AI models. Supports deepseek-chat for general conversations and ' +
      'deepseek-reasoner (R1) for complex reasoning tasks with chain-of-thought explanations. ' +
      'The reasoner model provides both reasoning_content (thinking process) and content (final answer).',
    inputSchema: {
      messages: z.array(MessageSchema).min(1).describe('Array of conversation messages'),
      model: z.enum(['deepseek-chat', 'deepseek-reasoner'])
        .default('deepseek-chat')
        .describe('Model to use. deepseek-chat for general tasks, deepseek-reasoner for complex reasoning'),
      temperature: z.number()
        .min(0)
        .max(2)
        .optional()
        .describe('Sampling temperature (0-2). Higher = more random. Default: 1.0'),
      max_tokens: z.number()
        .min(1)
        .max(32768)
        .optional()
        .describe('Maximum tokens to generate. Default: model maximum'),
      stream: z.boolean()
        .optional()
        .default(false)
        .describe('Enable streaming mode. Returns full response after streaming completes.'),
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
    },
  },
  async (input: DeepSeekChatInput) => {
    try {
      // Validate input
      const validated = ChatInputSchema.parse(input);

      console.error(
        `[DeepSeek MCP] Request: model=${validated.model}, messages=${validated.messages.length}, stream=${validated.stream}`
      );

      // Call appropriate method based on stream parameter
      const response = validated.stream
        ? await deepseek.createStreamingChatCompletion({
            model: validated.model,
            messages: validated.messages,
            temperature: validated.temperature,
            max_tokens: validated.max_tokens,
          })
        : await deepseek.createChatCompletion({
            model: validated.model,
            messages: validated.messages,
            temperature: validated.temperature,
            max_tokens: validated.max_tokens,
          });

      console.error(
        `[DeepSeek MCP] Response: tokens=${response.usage.total_tokens}, finish_reason=${response.finish_reason}`
      );

      // Format response
      let responseText = '';

      // Add reasoning content if available (for deepseek-reasoner)
      if (response.reasoning_content) {
        responseText += `<thinking>\n${response.reasoning_content}\n</thinking>\n\n`;
      }

      responseText += response.content;

      // Add usage stats
      responseText += `\n\n---\n**Model:** ${response.model}\n`;
      responseText += `**Tokens:** ${response.usage.prompt_tokens} prompt + ${response.usage.completion_tokens} completion = ${response.usage.total_tokens} total`;

      return {
        content: [
          {
            type: 'text',
            text: responseText,
          },
        ],
        structuredContent: response as unknown as Record<string, unknown>,
      };
    } catch (error: any) {
      console.error('[DeepSeek MCP] Error:', error);
      const errorMessage = error?.message || 'Unknown error occurred';

      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Start server with stdio transport
async function main() {
  console.error('[DeepSeek MCP] Starting server...');

  // Test connection
  console.error('[DeepSeek MCP] Testing API connection...');
  const isConnected = await deepseek.testConnection();

  if (!isConnected) {
    console.error('[DeepSeek MCP] Warning: Failed to connect to DeepSeek API');
    console.error('[DeepSeek MCP] Please check your API key and internet connection');
  } else {
    console.error('[DeepSeek MCP] API connection successful');
  }

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[DeepSeek MCP] Server running on stdio');
  console.error('[DeepSeek MCP] Available tools: deepseek_chat');
}

// Error handling
process.on('uncaughtException', (error) => {
  console.error('[DeepSeek MCP] Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[DeepSeek MCP] Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
main().catch((error) => {
  console.error('[DeepSeek MCP] Fatal error:', error);
  process.exit(1);
});
