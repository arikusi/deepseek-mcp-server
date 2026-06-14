#!/usr/bin/env node

/**
 * DeepSeek MCP Server
 * Model Context Protocol server for DeepSeek API integration
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, getConfig } from './config.js';
import { ConfigError } from './errors.js';
import { DeepSeekClient } from './deepseek-client.js';
import { createServer, version } from './server.js';
import { registerAllTools } from './tools/index.js';
import { registerAllPrompts } from './prompts/index.js';
import { registerAllResources } from './resources/index.js';
import { startHttpTransport } from './transport-http.js';
import { SessionStore } from './session.js';
import { UsageTracker } from './usage-tracker.js';

async function main() {
  // Load and validate configuration
  try {
    loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error('Error: ' + error.message);
      for (const issue of error.issues) {
        console.error(`  - ${issue.path}: ${issue.message}`);
      }
    }
    process.exit(1);
  }

  const config = getConfig();
  const deepseek = new DeepSeekClient();
  const server = createServer();

  // STDIO mode: single shared SessionStore for the lifetime of this process.
  // (HTTP mode builds its own per-session stores below — see serverFactory.)
  const stdioSessionStore = new SessionStore();

  // Register tools, prompts, and resources
  registerAllTools(server, deepseek, stdioSessionStore);
  registerAllPrompts(server);
  registerAllResources(server);

  // Wire the usage tracker's active-session count to the STDIO store.
  // In HTTP mode this is intentionally NOT wired: each HTTP session owns its
  // own store, so a process-wide count would be misleading and could leak
  // tenant info.
  if (config.transport !== 'http') {
    UsageTracker.getInstance().setSessionSource(() => stdioSessionStore.list().length);
  }

  console.error(`[DeepSeek MCP] Starting server v${version}...`);

  // Optional connection test (controlled by SKIP_CONNECTION_TEST env)
  if (!config.skipConnectionTest) {
    console.error('[DeepSeek MCP] Testing API connection...');
    const isConnected = await deepseek.testConnection();

    if (!isConnected) {
      console.error('[DeepSeek MCP] Warning: Failed to connect to DeepSeek API');
      console.error(
        '[DeepSeek MCP] Please check your API key and internet connection'
      );
    } else {
      console.error('[DeepSeek MCP] API connection successful');
    }
  }

  if (config.transport === 'http') {
    // HTTP transport: per-session McpServer AND per-session SessionStore.
    // DeepSeekClient is shared (stateless API client is fine cross-session).
    // Each HTTP session gets an isolated SessionStore so that one client
    // cannot read, list, or clear another client's conversation history.
    const serverFactory = () => {
      const s = createServer();
      const sessionStore = new SessionStore();
      registerAllTools(s, deepseek, sessionStore);
      registerAllPrompts(s);
      registerAllResources(s);
      return s;
    };
    await startHttpTransport(serverFactory, config.httpPort, {
      host: config.httpHost,
      authToken: config.httpAuthToken,
      allowedHosts: config.httpAllowedHosts,
    });
  } else {
    // Stdio transport (default)
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error('[DeepSeek MCP] Server running on stdio');
    console.error(
      '[DeepSeek MCP] Available tools: deepseek_chat (sessions, fallback), deepseek_sessions'
    );
    console.error('[DeepSeek MCP] Available prompts: 12 reasoning templates');
    console.error('[DeepSeek MCP] Available resources: deepseek://models, deepseek://config, deepseek://usage');
  }
}

// Error handling
process.on('uncaughtException', (error) => {
  console.error('[DeepSeek MCP] Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(
    '[DeepSeek MCP] Unhandled rejection at:',
    promise,
    'reason:',
    reason
  );
  process.exit(1);
});

// Smithery sandbox: allows scanning tools/resources without real credentials
export function createSandboxServer() {
  process.env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sandbox-key';
  process.env.SKIP_CONNECTION_TEST = 'true';
  loadConfig();
  const client = new DeepSeekClient();
  const server = createServer();
  const sessionStore = new SessionStore();
  registerAllTools(server, client, sessionStore);
  registerAllPrompts(server);
  registerAllResources(server);
  return server;
}

// Start the server
main().catch((error) => {
  console.error('[DeepSeek MCP] Fatal error:', error);
  process.exit(1);
});
