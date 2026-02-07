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

/**
 * Calculate cost for a request based on token usage
 */
function calculateCost(
  promptTokens: number,
  completionTokens: number,
  model: string
): number {
  // DeepSeek pricing (per 1M tokens)
  const pricing = {
    'deepseek-chat': {
      prompt: 0.14,      // $0.14 per 1M tokens
      completion: 0.28,  // $0.28 per 1M tokens
    },
    'deepseek-reasoner': {
      prompt: 0.55,      // $0.55 per 1M tokens (updated pricing)
      completion: 2.19,  // $2.19 per 1M tokens (updated pricing)
    },
  };

  const modelPricing = pricing[model as keyof typeof pricing] || pricing['deepseek-chat'];

  const promptCost = (promptTokens / 1_000_000) * modelPricing.prompt;
  const completionCost = (completionTokens / 1_000_000) * modelPricing.completion;

  return promptCost + completionCost;
}

/**
 * Format cost as readable string
 */
function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

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

      // Calculate cost
      const cost = calculateCost(
        response.usage.prompt_tokens,
        response.usage.completion_tokens,
        response.model
      );

      // Add usage stats with cost information
      responseText += `\n\n---\n📊 **Request Information:**\n`;
      responseText += `- **Tokens:** ${response.usage.total_tokens} (${response.usage.prompt_tokens} prompt + ${response.usage.completion_tokens} completion)\n`;
      responseText += `- **Model:** ${response.model}\n`;
      responseText += `- **Cost:** ${formatCost(cost)}`;

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
    } catch (error: any) {
      console.error('[DeepSeek MCP] Error:', error);
      const errorMessage = error?.message || 'Unknown error occurred';

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

/**
 * Register MCP Prompts
 * Pre-built prompt templates for common reasoning tasks
 */

// Core Reasoning Prompts
server.registerPrompt(
  'debug_with_reasoning',
  {
    title: 'Debug Code with Reasoning',
    description: 'Debug code issues using DeepSeek R1 reasoning model with step-by-step analysis',
    argsSchema: {
      code: z.string().describe('Code to debug'),
      error: z.string().optional().describe('Error message or description of the issue'),
      language: z.string().optional().describe('Programming language'),
    },
  },
  ({ code, error, language }, _extra) => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are an expert debugging assistant. Analyze this code using deep reasoning.

${language ? `Language: ${language}` : ''}
${error ? `Error/Issue: ${error}` : ''}

Code:
\`\`\`
${code}
\`\`\`

Please:
1. Identify the bug or issue
2. Explain your reasoning process step-by-step
3. Suggest a fix with explanation
4. Provide the corrected code

Use the deepseek_chat tool with model: "deepseek-reasoner" for detailed reasoning.`,
        },
      },
    ],
  })
);

server.registerPrompt(
  'code_review_deep',
  {
    title: 'Deep Code Review',
    description: 'Comprehensive code review analyzing quality, security, performance, and best practices',
    argsSchema: {
      code: z.string().describe('Code to review'),
      language: z.string().optional().describe('Programming language'),
      focus: z.enum(['security', 'performance', 'quality', 'all']).default('all').describe('Review focus area'),
    },
  },
  ({ code, language, focus }, _extra) => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are an expert code reviewer. Perform a comprehensive code review.

${language ? `Language: ${language}` : ''}
Focus: ${focus === 'all' ? 'Security, Performance, Code Quality, Best Practices' : focus}

Code:
\`\`\`
${code}
\`\`\`

For each issue found, provide:
1. **Issue**: What's wrong
2. **Reasoning**: Why it's a problem
3. **Severity**: Critical/High/Medium/Low
4. **Fix**: How to resolve it

Use the deepseek_chat tool with model: "deepseek-reasoner" for thorough analysis.`,
        },
      },
    ],
  })
);

server.registerPrompt(
  'research_synthesis',
  {
    title: 'Research & Synthesis',
    description: 'Research a topic and synthesize information into a structured report',
    argsSchema: {
      topic: z.string().describe('Topic to research'),
      context: z.string().optional().describe('Additional context or specific questions'),
      depth: z.enum(['brief', 'moderate', 'comprehensive']).default('moderate').describe('Research depth'),
    },
  },
  ({ topic, context, depth }, _extra) => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are a research assistant. Research and synthesize information about this topic.

Topic: ${topic}
${context ? `Context: ${context}` : ''}
Depth: ${depth}

Please provide:
1. **Overview**: Brief summary
2. **Key Findings**: Main points with reasoning
3. **Analysis**: Deep dive with reasoning process
4. **Conclusion**: Synthesis and implications
5. **Sources**: Cite reasoning steps

Use the deepseek_chat tool with model: "deepseek-reasoner" for comprehensive analysis.`,
        },
      },
    ],
  })
);

server.registerPrompt(
  'strategic_planning',
  {
    title: 'Strategic Planning',
    description: 'Analyze options and create strategic plans with reasoning for each decision',
    argsSchema: {
      goal: z.string().describe('Goal or objective'),
      context: z.string().optional().describe('Situational context'),
      constraints: z.string().optional().describe('Constraints or limitations'),
    },
  },
  ({ goal, context, constraints }, _extra) => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are a strategic planning expert. Create a detailed plan with reasoning.

Goal: ${goal}
${context ? `Context: ${context}` : ''}
${constraints ? `Constraints: ${constraints}` : ''}

Please provide:
1. **Situation Analysis**: Current state with reasoning
2. **Options**: List possible approaches
3. **Evaluation**: Pros/cons of each option with reasoning
4. **Recommendation**: Best approach with detailed reasoning
5. **Action Plan**: Step-by-step plan with rationale

Use the deepseek_chat tool with model: "deepseek-reasoner" for thorough strategic thinking.`,
        },
      },
    ],
  })
);

server.registerPrompt(
  'explain_like_im_five',
  {
    title: 'Explain Like I\'m Five',
    description: 'Explain complex topics in simple terms using analogies and reasoning',
    argsSchema: {
      topic: z.string().describe('Complex topic to explain'),
      audience: z.enum(['child', 'beginner', 'intermediate']).default('beginner').describe('Target audience level'),
    },
  },
  ({ topic, audience }, _extra) => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are an expert explainer. Make complex topics simple and understandable.

Topic: ${topic}
Audience: ${audience}

Please:
1. Start with a simple analogy or metaphor
2. Break down the concept step-by-step
3. Use everyday examples
4. Show your reasoning for why this explanation works
5. Build up complexity gradually if needed

Use the deepseek_chat tool with model: "deepseek-reasoner" to ensure logical explanations.`,
        },
      },
    ],
  })
);

// Advanced Prompts
server.registerPrompt(
  'mathematical_proof',
  {
    title: 'Mathematical Proof',
    description: 'Prove mathematical statements with rigorous step-by-step reasoning',
    argsSchema: {
      statement: z.string().describe('Mathematical statement to prove'),
      context: z.string().optional().describe('Mathematical context or axioms'),
    },
  },
  ({ statement, context }, _extra) => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are a mathematician. Provide a rigorous proof.

Statement to prove: ${statement}
${context ? `Context/Axioms: ${context}` : ''}

Provide:
1. **Given**: What we know
2. **To Prove**: What we're proving
3. **Proof**: Step-by-step logical reasoning
4. **Conclusion**: QED statement

Use the deepseek_chat tool with model: "deepseek-reasoner" for strict logical reasoning.`,
        },
      },
    ],
  })
);

server.registerPrompt(
  'argument_validation',
  {
    title: 'Argument Validation',
    description: 'Analyze arguments for logical fallacies and reasoning errors',
    argsSchema: {
      argument: z.string().describe('Argument to validate'),
      type: z.enum(['informal', 'formal', 'both']).default('informal').describe('Analysis type'),
    },
  },
  ({ argument, type }, _extra) => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are a logic expert. Analyze this argument for validity.

Argument:
${argument}

Analysis type: ${type}

Please identify:
1. **Structure**: Break down the argument's structure
2. **Premises**: List all premises and assumptions
3. **Conclusion**: What's being claimed
4. **Reasoning**: Analyze the logical flow
5. **Fallacies**: Any logical fallacies or errors
6. **Validity**: Is the reasoning sound?
7. **Improvements**: How to strengthen the argument

Use the deepseek_chat tool with model: "deepseek-reasoner" for thorough logical analysis.`,
        },
      },
    ],
  })
);

server.registerPrompt(
  'creative_ideation',
  {
    title: 'Creative Ideation',
    description: 'Generate creative ideas with reasoning for feasibility and value',
    argsSchema: {
      challenge: z.string().describe('Problem or challenge to solve'),
      constraints: z.string().optional().describe('Constraints or requirements'),
      quantity: z.number().min(1).max(20).default(5).describe('Number of ideas to generate'),
    },
  },
  ({ challenge, constraints, quantity }, _extra) => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are a creative problem solver. Generate innovative ideas with reasoning.

Challenge: ${challenge}
${constraints ? `Constraints: ${constraints}` : ''}
Ideas needed: ${quantity}

For each idea, provide:
1. **Idea**: The concept
2. **Reasoning**: Why this could work
3. **Feasibility**: How realistic it is (High/Medium/Low)
4. **Value**: Potential impact
5. **Next Steps**: How to validate/implement

Use the deepseek_chat tool with model: "deepseek-reasoner" for reasoned creativity.`,
        },
      },
    ],
  })
);

server.registerPrompt(
  'cost_comparison',
  {
    title: 'LLM Cost Comparison',
    description: 'Compare costs of different LLMs for a task and show savings with DeepSeek',
    argsSchema: {
      task: z.string().describe('Task description'),
      estimated_tokens: z.number().min(100).describe('Estimated token count (prompt + completion)'),
    },
  },
  ({ task, estimated_tokens }, _extra) => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are a cost analysis expert. Compare LLM costs for this task.

Task: ${task}
Estimated tokens: ${estimated_tokens} (prompt + completion)

Calculate costs for:
1. **DeepSeek Chat**: $0.14/1M prompt + $0.28/1M completion
2. **DeepSeek Reasoner**: $0.42/1M prompt + $0.42/1M completion
3. **Claude Sonnet**: $3/1M prompt + $15/1M completion
4. **GPT-4**: $2.50/1M prompt + $10/1M completion

Show:
- Cost breakdown per model
- Savings percentage with DeepSeek
- When to use which model (cost vs quality)

Use the deepseek_chat tool with model: "deepseek-chat" for this analysis.`,
        },
      },
    ],
  })
);

server.registerPrompt(
  'pair_programming',
  {
    title: 'Pair Programming',
    description: 'Interactive coding assistant that explains reasoning for code decisions',
    argsSchema: {
      task: z.string().describe('Coding task'),
      language: z.string().describe('Programming language'),
      style: z.enum(['beginner', 'intermediate', 'expert']).default('intermediate').describe('Code complexity level'),
    },
  },
  ({ task, language, style }, _extra) => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are a pair programming partner. Help me write code with clear reasoning.

Task: ${task}
Language: ${language}
Level: ${style}

Please:
1. **Plan**: Break down the task with reasoning
2. **Code**: Write clean, commented code
3. **Explain**: Explain each major decision
4. **Test**: Suggest test cases with reasoning
5. **Optimize**: Mention potential improvements

Use the deepseek_chat tool with model: "deepseek-reasoner" for thoughtful code generation.`,
        },
      },
    ],
  })
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
  console.error('[DeepSeek MCP] Available prompts: 10 reasoning templates');
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
