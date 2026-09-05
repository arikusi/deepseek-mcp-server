/**
 * HTTP Transport for DeepSeek MCP Server
 * Implements Streamable HTTP transport using the MCP SDK's Express middleware.
 * Each MCP session gets its own McpServer instance; DeepSeekClient is shared.
 */

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { version } from './server.js';

const transports: Record<string, StreamableHTTPServerTransport> = {};

export interface HttpAppOptions {
  /**
   * Hostname for DNS rebinding protection. Defaults to '127.0.0.1', which makes
   * the SDK auto-enable host-header validation. Set to '0.0.0.0' only when the
   * deployment is meant to be reachable from other hosts (e.g. inside a
   * container) — pair it with authToken and/or allowedHosts.
   */
  host?: string;
  /** When set, '/mcp' requires `Authorization: Bearer <token>`. '/health' stays open. */
  authToken?: string;
  /** Explicit allowed Host headers — keeps DNS rebinding protection on when binding to 0.0.0.0. */
  allowedHosts?: string[];
  /**
   * Bind a wildcard address anyway when neither authToken nor allowedHosts is
   * set. Off by default; see the refusal in startHttpTransport for why.
   */
  allowUnprotectedBind?: boolean;
}

/** Constant-time string comparison to avoid leaking the token via response timing. */
function timingSafeStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function createHttpApp(serverFactory: () => McpServer, opts: HttpAppOptions = {}) {
  const { host = '127.0.0.1', authToken, allowedHosts } = opts;
  const app = createMcpExpressApp(allowedHosts ? { host, allowedHosts } : { host });

  // Optional bearer-token auth guarding the MCP endpoint. Registered before the
  // /mcp route handlers so it runs first. /health is intentionally left open so
  // container/orchestrator health probes work without credentials.
  if (authToken) {
    const expected = `Bearer ${authToken}`;
    app.use('/mcp', (req, res, next) => {
      const provided = req.headers['authorization'];
      if (typeof provided === 'string' && timingSafeStringEqual(provided, expected)) {
        next();
        return;
      }
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized: missing or invalid bearer token' },
        id: null,
      });
    });
  }

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version,
      uptime: process.uptime(),
      transport: 'http',
      timestamp: new Date().toISOString(),
    });
  });

  // POST /mcp — handle JSON-RPC requests
  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Existing session — reuse transport
    if (sessionId && transports[sessionId]) {
      await transports[sessionId].handleRequest(req, res, req.body);
      return;
    }

    // New initialize request — create session
    if (!sessionId && isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports[id] = transport;
          console.error(`[DeepSeek MCP] HTTP session initialized: ${id}`);
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports[transport.sessionId];
          console.error(`[DeepSeek MCP] HTTP session closed: ${transport.sessionId}`);
        }
      };

      const server = serverFactory();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // Invalid request
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Invalid request: no valid session or not an initialize request' },
      id: null,
    });
  });

  // GET /mcp — SSE stream for existing session
  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && transports[sessionId]) {
      await transports[sessionId].handleRequest(req, res);
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Invalid or missing session ID' },
        id: null,
      });
    }
  });

  // DELETE /mcp — terminate session
  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && transports[sessionId]) {
      await transports[sessionId].close();
      delete transports[sessionId];
      res.status(200).json({ status: 'session terminated' });
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Invalid or missing session ID' },
        id: null,
      });
    }
  });

  return app;
}

/** True for a bind address that reaches every interface. */
export function isWildcardHost(host: string): boolean {
  return host === '0.0.0.0' || host === '::';
}

/**
 * True when the bind would leave /mcp with neither DNS rebinding protection
 * nor a credential. The SDK installs Host-header validation only for loopback
 * hosts or when allowedHosts is passed, so a wildcard bind with neither that
 * list nor a bearer token is reachable by any web page the operator visits.
 */
export function isUnprotectedBind(host: string, opts: HttpAppOptions = {}): boolean {
  return isWildcardHost(host) && !opts.authToken && !opts.allowedHosts?.length;
}

/**
 * Refuse an unprotected wildcard bind unless the operator opted in explicitly.
 *
 * Publishing the port on loopback does not make this safe: DNS rebinding
 * targets the loopback address the victim's own browser already reaches. We
 * refuse rather than auto-installing a guessed allowlist, because a guess would
 * start cleanly and then 403 every request from a legitimate reverse proxy,
 * turning a startup error into a runtime mystery.
 */
export function assertBindProtected(host: string, opts: HttpAppOptions = {}): void {
  if (!isUnprotectedBind(host, opts) || opts.allowUnprotectedBind) return;

  throw new Error(
    `[DeepSeek MCP] Refusing to bind ${host} without DNS rebinding protection. ` +
      'The /mcp endpoint holds your DEEPSEEK_API_KEY and would be reachable, ' +
      'unauthenticated, by any web page the operator visits. Set one of:\n' +
      '  HTTP_ALLOWED_HOSTS  a comma-separated Host allowlist, e.g. ' +
      '"localhost,127.0.0.1,[::1]" for a container published on loopback\n' +
      '  HTTP_AUTH_TOKEN     require `Authorization: Bearer <token>` on /mcp\n' +
      'or bind loopback directly with HTTP_HOST=127.0.0.1. ' +
      'HTTP_ALLOW_UNPROTECTED_BIND=true overrides this if you genuinely want an ' +
      'open endpoint.'
  );
}

export async function startHttpTransport(
  serverFactory: () => McpServer,
  port: number,
  opts: HttpAppOptions = {},
): Promise<void> {
  const host = opts.host ?? '127.0.0.1';
  const app = createHttpApp(serverFactory, opts);

  assertBindProtected(host, opts);

  if (isUnprotectedBind(host, opts)) {
    console.error(
      `[DeepSeek MCP] SECURITY WARNING: binding ${host} with no Host allowlist and no ` +
        'bearer token, because HTTP_ALLOW_UNPROTECTED_BIND=true. The /mcp endpoint is ' +
        'unauthenticated and open to DNS rebinding; anyone who reaches it can invoke ' +
        'tools and spend your DEEPSEEK_API_KEY.'
    );
  } else if (isWildcardHost(host) && !opts.authToken) {
    console.error(
      `[DeepSeek MCP] Note: binding ${host} with a Host allowlist but no HTTP_AUTH_TOKEN. ` +
        'Host validation stops DNS rebinding, but any client that can reach this port ' +
        'and send an allowed Host header can still invoke tools. Set HTTP_AUTH_TOKEN if ' +
        'the port is reachable beyond this host.'
    );
  }

  const httpServer = app.listen(port, host, () => {
    console.error(`[DeepSeek MCP] HTTP transport listening on http://${host}:${port}`);
    console.error(`[DeepSeek MCP] Health check: http://${host}:${port}/health`);
    console.error(`[DeepSeek MCP] MCP endpoint: http://${host}:${port}/mcp`);
    console.error(
      `[DeepSeek MCP] Bearer-token auth on /mcp: ${opts.authToken ? 'ENABLED' : 'disabled'}`
    );
  });

  const shutdown = async () => {
    console.error('[DeepSeek MCP] Shutting down HTTP transport...');
    for (const [id, transport] of Object.entries(transports)) {
      await transport.close();
      delete transports[id];
    }
    httpServer.close();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
