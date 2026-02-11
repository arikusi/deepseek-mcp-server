/**
 * Tool Registration Aggregator
 * Registers all tools with the MCP server
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DeepSeekClient } from '../deepseek-client.js';
import { registerChatTool } from './deepseek-chat.js';

export function registerAllTools(server: McpServer, client: DeepSeekClient): void {
  registerChatTool(server, client);
}
