import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, version, MAX_TOOL_INPUT_ELEMENTS } from './server.js';

/** Connect a client to a fresh server that has one tool taking an array. */
async function connectWithEchoTool() {
  const server = createServer();
  server.registerTool(
    'echo_count',
    { inputSchema: { items: z.array(z.number()) } },
    async ({ items }) => ({ content: [{ type: 'text', text: String(items.length) }] })
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

describe('server', () => {
  it('should create McpServer with correct name', () => {
    const server = createServer();
    expect(server).toBeDefined();
  });

  it('should export version from package.json', () => {
    expect(version).toBeDefined();
    expect(typeof version).toBe('string');
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('should have version matching package.json', async () => {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const pkg = require('../package.json');
    expect(version).toBe(pkg.version);
  });

  describe('tool input element cap (GHSA-46jr-4wx8-v453)', () => {
    it('rejects a tools/call whose arguments exceed the cap', async () => {
      const client = await connectWithEchoTool();
      const items = new Array(MAX_TOOL_INPUT_ELEMENTS + 1).fill(0);
      const result = await client.callTool({ name: 'echo_count', arguments: { items } });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toMatch(/maximum of 20000 elements/);
    });

    it('still accepts a large call under the cap', async () => {
      const client = await connectWithEchoTool();
      const items = new Array(MAX_TOOL_INPUT_ELEMENTS - 10).fill(0);
      const result = await client.callTool({ name: 'echo_count', arguments: { items } });
      expect(result.isError).toBeFalsy();
      expect(result.content).toEqual([{ type: 'text', text: String(items.length) }]);
    });
  });
});
