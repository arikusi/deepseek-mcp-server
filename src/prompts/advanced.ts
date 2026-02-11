/**
 * Advanced Prompts
 * mathematical_proof, argument_validation, creative_ideation,
 * cost_comparison, pair_programming
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerAdvancedPrompts(server: McpServer): void {
  server.registerPrompt(
    'mathematical_proof',
    {
      title: 'Mathematical Proof',
      description:
        'Prove mathematical statements with rigorous step-by-step reasoning',
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
      description:
        'Analyze arguments for logical fallacies and reasoning errors',
      argsSchema: {
        argument: z.string().describe('Argument to validate'),
        type: z
          .enum(['informal', 'formal', 'both'])
          .default('informal')
          .describe('Analysis type'),
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
      description:
        'Generate creative ideas with reasoning for feasibility and value',
      argsSchema: {
        challenge: z.string().describe('Problem or challenge to solve'),
        constraints: z
          .string()
          .optional()
          .describe('Constraints or requirements'),
        quantity: z
          .number()
          .min(1)
          .max(20)
          .default(5)
          .describe('Number of ideas to generate'),
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
      description:
        'Compare costs of different LLMs for a task and show savings with DeepSeek',
      argsSchema: {
        task: z.string().describe('Task description'),
        estimated_tokens: z
          .number()
          .min(100)
          .describe('Estimated token count (prompt + completion)'),
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
      description:
        'Interactive coding assistant that explains reasoning for code decisions',
      argsSchema: {
        task: z.string().describe('Coding task'),
        language: z.string().describe('Programming language'),
        style: z
          .enum(['beginner', 'intermediate', 'expert'])
          .default('intermediate')
          .describe('Code complexity level'),
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
}
