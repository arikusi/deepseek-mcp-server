/**
 * Zod Schemas Module
 * Input validation schemas for DeepSeek MCP Server
 */

import { z } from 'zod';

// ─── Base Schemas ───────────────────────────────────────────────

export const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

export const ChatInputSchema = z.object({
  messages: z.array(MessageSchema).min(1),
  model: z
    .enum(['deepseek-chat', 'deepseek-reasoner'])
    .default('deepseek-chat'),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().min(1).max(32768).optional(),
  stream: z.boolean().optional().default(false),
});

// ─── Function Calling Schemas ───────────────────────────────────

export const FunctionDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
  strict: z.boolean().optional(),
});

export const ToolDefinitionSchema = z.object({
  type: z.literal('function'),
  function: FunctionDefinitionSchema,
});

export const ToolChoiceSchema = z.union([
  z.enum(['auto', 'none', 'required']),
  z.object({
    type: z.literal('function'),
    function: z.object({
      name: z.string().min(1),
    }),
  }),
]);

export const ExtendedMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  tool_call_id: z.string().optional(),
});

export const ChatInputWithToolsSchema = z.object({
  messages: z.array(ExtendedMessageSchema).min(1),
  model: z
    .enum(['deepseek-chat', 'deepseek-reasoner'])
    .default('deepseek-chat'),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().min(1).max(32768).optional(),
  stream: z.boolean().optional().default(false),
  tools: z.array(ToolDefinitionSchema).max(128).optional(),
  tool_choice: ToolChoiceSchema.optional(),
});
