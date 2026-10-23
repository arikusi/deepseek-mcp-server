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

/**
 * Cap on array elements plus object members in one tools/call payload.
 * The SDK leaves this off by default, and without it a single request inside
 * the body size limit can exhaust the heap during argument validation
 * (GHSA-46jr-4wx8-v453). 20k leaves room for a long conversation history with
 * tool definitions and a response_schema, while staying far below what it
 * takes to hurt the process.
 */
export const MAX_TOOL_INPUT_ELEMENTS = 20_000;

export function createServer(): McpServer {
  return new McpServer(
    {
      name: 'deepseek-mcp-server',
      version,
    },
    { maxToolInputElements: MAX_TOOL_INPUT_ELEMENTS }
  );
}
