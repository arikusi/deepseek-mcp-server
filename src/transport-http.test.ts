import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import {
  createHttpApp,
  assertBindProtected,
  isUnprotectedBind,
  isWildcardHost,
} from './transport-http.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

let server: Server;
let baseUrl: string;
let factoryCallCount = 0;

function testServerFactory(): McpServer {
  factoryCallCount++;
  return new McpServer({ name: 'test-server', version: '0.0.0' });
}

beforeAll(async () => {
  const app = createHttpApp(testServerFactory);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

describe('HTTP Transport', () => {
  describe('GET /health', () => {
    it('should return 200 with health info', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.transport).toBe('http');
      expect(body.version).toBeDefined();
      expect(body.uptime).toBeGreaterThan(0);
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('POST /mcp', () => {
    it('should handle initialize request and return session ID', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0' },
          },
          id: 1,
        }),
      });
      expect(res.status).toBe(200);
      const sessionId = res.headers.get('mcp-session-id');
      expect(sessionId).toBeTruthy();
    });

    it('should return 400 for non-initialize request without session', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          params: {},
          id: 2,
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should call server factory for each new session', async () => {
      const before = factoryCallCount;
      await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test2', version: '1.0' },
          },
          id: 1,
        }),
      });
      expect(factoryCallCount).toBeGreaterThan(before);
    });
  });

  describe('GET /mcp', () => {
    it('should return 400 without session ID', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        headers: { 'Accept': 'text/event-stream' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /mcp', () => {
    it('should return 400 without session ID', async () => {
      const res = await fetch(`${baseUrl}/mcp`, { method: 'DELETE' });
      expect(res.status).toBe(400);
    });

    it('should terminate an existing session', async () => {
      // First create a session
      const initRes = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test-delete', version: '1.0' },
          },
          id: 1,
        }),
      });
      const sessionId = initRes.headers.get('mcp-session-id');
      expect(sessionId).toBeTruthy();

      // Delete the session
      const deleteRes = await fetch(`${baseUrl}/mcp`, {
        method: 'DELETE',
        headers: { 'mcp-session-id': sessionId! },
      });
      expect(deleteRes.status).toBe(200);
      const body = await deleteRes.json();
      expect(body.status).toBe('session terminated');
    });
  });
});

describe('bind protection', () => {
  it('treats 0.0.0.0 and :: as wildcard binds, loopback as not', () => {
    expect(isWildcardHost('0.0.0.0')).toBe(true);
    expect(isWildcardHost('::')).toBe(true);
    expect(isWildcardHost('127.0.0.1')).toBe(false);
    expect(isWildcardHost('localhost')).toBe(false);
  });

  it('refuses a wildcard bind with no allowlist and no token', () => {
    // The shipped Docker packaging used to land exactly here: HTTP_HOST=0.0.0.0
    // with neither HTTP_ALLOWED_HOSTS nor HTTP_AUTH_TOKEN, which left the SDK's
    // Host-header check uninstalled and /mcp open to DNS rebinding.
    expect(() => assertBindProtected('0.0.0.0')).toThrow(/Refusing to bind/);
    expect(() => assertBindProtected('::')).toThrow(/Refusing to bind/);
  });

  it('names both remedies in the refusal', () => {
    expect(() => assertBindProtected('0.0.0.0')).toThrow(/HTTP_ALLOWED_HOSTS/);
    expect(() => assertBindProtected('0.0.0.0')).toThrow(/HTTP_AUTH_TOKEN/);
  });

  it('allows a wildcard bind once a Host allowlist is set', () => {
    expect(() =>
      assertBindProtected('0.0.0.0', { allowedHosts: ['localhost', '127.0.0.1'] })
    ).not.toThrow();
  });

  it('allows a wildcard bind once a bearer token is set', () => {
    expect(() => assertBindProtected('0.0.0.0', { authToken: 'secret' })).not.toThrow();
  });

  it('does not treat an empty allowlist as protection', () => {
    expect(() => assertBindProtected('0.0.0.0', { allowedHosts: [] })).toThrow(
      /Refusing to bind/
    );
    expect(isUnprotectedBind('0.0.0.0', { allowedHosts: [] })).toBe(true);
  });

  it('never blocks a loopback bind', () => {
    expect(() => assertBindProtected('127.0.0.1')).not.toThrow();
    expect(isUnprotectedBind('127.0.0.1')).toBe(false);
  });

  it('honours the explicit opt-out but still reports the bind as unprotected', () => {
    expect(() =>
      assertBindProtected('0.0.0.0', { allowUnprotectedBind: true })
    ).not.toThrow();
    expect(isUnprotectedBind('0.0.0.0', { allowUnprotectedBind: true })).toBe(true);
  });
});
