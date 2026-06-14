/**
 * MCP Server Factory
 * Creates and exports the McpServer instance with version from package.json
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

let version = '1.8.0';
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
  version = pkg.version;
} catch {
  // CJS bundler fallback (e.g., Smithery) — uses hardcoded version
}

export { version };

export function createServer(): McpServer {
  return new McpServer({
    name: 'deepseek-mcp-server',
    version,
  });
}
