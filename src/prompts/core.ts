/**
 * Core Reasoning Prompts
 * debug_with_reasoning, code_review_deep, research_synthesis,
 * strategic_planning, explain_like_im_five
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerCorePrompts(server: McpServer): void {
  server.registerPrompt(
    'debug_with_reasoning',
    {
      title: 'Debug Code with Reasoning',
      description:
        'Debug code issues using DeepSeek R1 reasoning model with step-by-step analysis',
      argsSchema: {
        code: z.string().describe('Code to debug'),
        error: z
          .string()
          .optional()
          .describe('Error message or description of the issue'),
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
      description:
        'Comprehensive code review analyzing quality, security, performance, and best practices',
      argsSchema: {
        code: z.string().describe('Code to review'),
        language: z.string().optional().describe('Programming language'),
        focus: z
          .enum(['security', 'performance', 'quality', 'all'])
          .default('all')
          .describe('Review focus area'),
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
      description:
        'Research a topic and synthesize information into a structured report',
      argsSchema: {
        topic: z.string().describe('Topic to research'),
        context: z
          .string()
          .optional()
          .describe('Additional context or specific questions'),
        depth: z
          .enum(['brief', 'moderate', 'comprehensive'])
          .default('moderate')
          .describe('Research depth'),
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
      description:
        'Analyze options and create strategic plans with reasoning for each decision',
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
      title: "Explain Like I'm Five",
      description:
        'Explain complex topics in simple terms using analogies and reasoning',
      argsSchema: {
        topic: z.string().describe('Complex topic to explain'),
        audience: z
          .enum(['child', 'beginner', 'intermediate'])
          .default('beginner')
          .describe('Target audience level'),
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
}
