/**
 * Prompt Registration Aggregator
 * Registers all prompt templates with the MCP server
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCorePrompts } from './core.js';
import { registerAdvancedPrompts } from './advanced.js';
import { registerFunctionCallingPrompts } from './function-calling.js';

export function registerAllPrompts(server: McpServer): void {
  registerCorePrompts(server);
  registerAdvancedPrompts(server);
  registerFunctionCallingPrompts(server);
}
