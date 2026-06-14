/**
 * Auth + host-binding tests for HTTP transport.
 *
 * Guards GHSA-72f3-6w86-7rv3: self-hosted HTTP mode exposed /mcp with no
 * authentication. The fix makes 127.0.0.1 the default bind (DNS rebinding
 * protection on) and adds optional bearer-token auth on /mcp, while leaving
 * /health open for orchestrator probes.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import http from 'node:http';
import { createHttpApp } from './transport-http.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Raw HTTP request helper — fetch/undici treats `Host` as a forbidden header and
 * silently rewrites it, so a forged-Host test must go through node:http directly.
 */
function rawRequest(
  port: number,
  options: { path: string; method: string; headers: Record<string, string>; body?: string }
): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: options.path, method: options.method, headers: options.headers },
      (res) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
      }
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

const TOKEN = 'super-secret-token';

function testServerFactory(): McpServer {
  return new McpServer({ name: 'auth-test', version: '0.0.0' });
}

function initBody(name: string) {
  return JSON.stringify({
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name, version: '1.0' },
    },
    id: 1,
  });
}

describe('HTTP transport — bearer-token auth', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createHttpApp(testServerFactory, { authToken: TOKEN });
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

  it('leaves /health open without credentials', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('rejects /mcp with no Authorization header (401)', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: initBody('no-auth'),
    });
    expect(res.status).toBe(401);
  });

  it('rejects /mcp with a wrong token (401)', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer wrong-token',
      },
      body: initBody('wrong-auth'),
    });
    expect(res.status).toBe(401);
  });

  it('accepts /mcp with the correct bearer token', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${TOKEN}`,
      },
      body: initBody('good-auth'),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('mcp-session-id')).toBeTruthy();
  });
});

describe('HTTP transport — no auth configured (default)', () => {
  let server: Server;
  let baseUrl: string;

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

  it('allows /mcp initialize without a token when auth is not configured', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: initBody('default-open'),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('mcp-session-id')).toBeTruthy();
  });

  it('rejects a forged Host header via DNS rebinding protection (403)', async () => {
    const port = Number(new URL(baseUrl).port);
    const res = await rawRequest(port, {
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Host: 'attacker.example',
      },
      body: initBody('bad-host'),
    });
    expect(res.status).toBe(403);
  });
});
