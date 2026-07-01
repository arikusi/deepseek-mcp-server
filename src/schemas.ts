/**
 * Zod Schemas Module
 * Input validation schemas for DeepSeek MCP Server
 */

import { z } from 'zod';

// ─── Multimodal Content Schemas ─────────────────────────────────

export const TextContentPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

export const ImageContentPartSchema = z.object({
  type: z.literal('image_url'),
  image_url: z.object({
    url: z.string(),
    detail: z.enum(['auto', 'low', 'high']).optional(),
  }),
});

export const ContentPartSchema = z.discriminatedUnion('type', [
  TextContentPartSchema,
  ImageContentPartSchema,
]);

export const ContentSchema = z.union([
  z.string(),
  z.array(ContentPartSchema).min(1),
]);

// ─── Base Schemas ───────────────────────────────────────────────

export const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

export const ThinkingSchema = z
  .object({ type: z.enum(['enabled', 'disabled']) })
  .optional();

export const ReasoningEffortSchema = z.enum(['high', 'max']).optional();

/** Accepted model identifiers. v4-flash/v4-pro are the live API models;
 *  deepseek-chat/deepseek-reasoner are compatibility aliases resolved internally. */
export const ModelSchema = z
  .enum([
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'deepseek-chat',
    'deepseek-reasoner',
  ])
  .default('deepseek-v4-flash');

export const ChatInputSchema = z.object({
  messages: z.array(MessageSchema).min(1),
  model: ModelSchema,
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().min(1).max(384000).optional(),
  stream: z.boolean().optional().default(false),
  thinking: ThinkingSchema,
  reasoning_effort: ReasoningEffortSchema,
  json_mode: z.boolean().optional(),
});

// ─── Function Calling Schemas ───────────────────────────────────

export const FunctionDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
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
  content: ContentSchema,
  tool_call_id: z.string().optional(),
});

export const ChatInputWithToolsSchema = z.object({
  messages: z.array(ExtendedMessageSchema).min(1),
  model: ModelSchema,
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().min(1).max(384000).optional(),
  stream: z.boolean().optional().default(false),
  tools: z.array(ToolDefinitionSchema).max(128).optional(),
  tool_choice: ToolChoiceSchema.optional(),
  thinking: ThinkingSchema,
  reasoning_effort: ReasoningEffortSchema,
  json_mode: z.boolean().optional(),
  session_id: z.string().optional(),
});

// ─── FIM (Fill-in-the-Middle) Schemas ──────────────────────────

/** Max output tokens for a FIM completion (DeepSeek Beta endpoint cap). */
export const FIM_MAX_TOKENS = 4096;

export const FimInputSchema = z.object({
  prompt: z.string().min(1),
  suffix: z.string().optional(),
  model: ModelSchema,
  max_tokens: z.number().min(1).max(FIM_MAX_TOKENS).optional(),
  temperature: z.number().min(0).max(2).optional(),
  stop: z.union([z.string(), z.array(z.string()).max(16)]).optional(),
});

// ─── Session Management Schemas ────────────────────────────────

export const SessionActionSchema = z.object({
  action: z.enum(['list', 'clear', 'delete']),
  session_id: z.string().optional(),
});
