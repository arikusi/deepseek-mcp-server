/**
 * MCP Server Factory
 * Creates and exports the McpServer instance with version from package.json
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

export { version };

export function createServer(): McpServer {
  return new McpServer({
    name: 'deepseek-mcp-server',
    version,
  });
}
