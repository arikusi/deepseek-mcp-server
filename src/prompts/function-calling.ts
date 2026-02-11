/**
 * Function Calling Prompts
 * function_call_debug, create_function_schema
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerFunctionCallingPrompts(server: McpServer): void {
  server.registerPrompt(
    'function_call_debug',
    {
      title: 'Function Calling Debug',
      description:
        'Debug function calling issues with DeepSeek models',
      argsSchema: {
        tools_json: z.string().describe('JSON string of tool definitions'),
        messages_json: z
          .string()
          .describe('JSON string of conversation messages'),
        error: z
          .string()
          .optional()
          .describe('Error message or unexpected behavior'),
      },
    },
    ({ tools_json, messages_json, error }, _extra) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `You are a function calling expert. Debug this function calling setup.

Tool Definitions:
\`\`\`json
${tools_json}
\`\`\`

Messages:
\`\`\`json
${messages_json}
\`\`\`

${error ? `Error/Issue: ${error}` : 'The model is not calling the expected function.'}

Please analyze:
1. **Tool Schema**: Are the tool definitions valid and well-structured?
2. **Messages**: Are messages properly formatted for function calling?
3. **Issue**: What might be causing the problem?
4. **Fix**: Suggest corrected tool definitions and/or messages
5. **Best Practices**: Tips for reliable function calling

Use the deepseek_chat tool with model: "deepseek-reasoner" for thorough analysis.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    'create_function_schema',
    {
      title: 'Create Function Schema',
      description:
        'Generate JSON Schema for function calling from natural language description',
      argsSchema: {
        description: z
          .string()
          .describe('Natural language description of the function'),
        examples: z.string().optional().describe('Example inputs/outputs'),
      },
    },
    ({ description, examples }, _extra) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `You are an expert at creating JSON Schemas for function calling. Create a tool definition from this description.

Function Description: ${description}
${examples ? `\nExamples:\n${examples}` : ''}

Generate:
1. **Tool Definition**: Complete JSON tool definition with type, function name, description, and parameters schema
2. **Parameters**: Well-typed JSON Schema with descriptions for each parameter
3. **Required Fields**: Which parameters are required
4. **Example Call**: Show an example of how the model would call this function
5. **Usage**: How to use this with the deepseek_chat tool's \`tools\` parameter

Output the tool definition as a JSON code block ready to use.

Use the deepseek_chat tool with model: "deepseek-reasoner" for precise schema generation.`,
          },
        },
      ],
    })
  );
}
