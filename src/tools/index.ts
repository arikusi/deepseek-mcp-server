/**
 * Tool Registration Aggregator
 * Registers all tools with the MCP server
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DeepSeekClient } from '../deepseek-client.js';
import type { SessionStore } from '../session.js';
import { registerChatTool } from './deepseek-chat.js';
import { registerFimTool } from './deepseek-fim.js';
import { registerSessionsTool } from './deepseek-sessions.js';

export function registerAllTools(
  server: McpServer,
  client: DeepSeekClient,
  sessionStore: SessionStore
): void {
  registerChatTool(server, client, sessionStore);
  registerFimTool(server, client);
  registerSessionsTool(server, sessionStore);
}
