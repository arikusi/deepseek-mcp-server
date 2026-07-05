/**
 * Centralized Configuration
 * Loads and validates configuration from environment variables
 */

import { z } from 'zod';
import { ConfigError } from './errors.js';

const ConfigSchema = z.object({
  apiKey: z.string().min(1, 'DEEPSEEK_API_KEY is required'),
  baseUrl: z.string().url().default('https://api.deepseek.com'),
  showCostInfo: z.boolean().default(true),
  requestTimeout: z.number().positive().default(60000),
  maxRetries: z.number().min(0).max(10).default(2),
  skipConnectionTest: z.boolean().default(false),
  maxMessageLength: z.number().positive().default(100_000),
  sessionTtlMinutes: z.number().positive().default(30),
  maxSessions: z.number().positive().default(100),
  fallbackEnabled: z.boolean().default(true),
  defaultModel: z.string().default('deepseek-v4-flash'),
  circuitBreakerThreshold: z.number().positive().default(5),
  circuitBreakerResetTimeout: z.number().positive().default(30000),
  maxSessionMessages: z.number().positive().default(200),
  enableMultimodal: z.boolean().default(false),
  // Max server-side repair retries when a response_schema validation fails.
  // Set to 0 for a strictly deterministic single call (no extra API round-trips).
  responseSchemaMaxRetries: z.number().min(0).max(5).default(2),
  transport: z.enum(['stdio', 'http']).default('stdio'),
  httpPort: z.number().positive().default(3000),
  httpHost: z.string().min(1).default('127.0.0.1'),
  httpAuthToken: z.string().min(1).optional(),
  httpAllowedHosts: z.array(z.string().min(1)).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

let cachedConfig: Config | null = null;

/**
 * Load configuration from environment variables.
 * Validates with Zod and caches the result.
 * Throws ConfigError if validation fails.
 */
export function loadConfig(): Config {
  const raw = {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    showCostInfo: process.env.SHOW_COST_INFO !== 'false',
    requestTimeout: process.env.REQUEST_TIMEOUT
      ? parseInt(process.env.REQUEST_TIMEOUT, 10)
      : 60000,
    maxRetries: process.env.MAX_RETRIES
      ? parseInt(process.env.MAX_RETRIES, 10)
      : 2,
    skipConnectionTest: process.env.SKIP_CONNECTION_TEST === 'true',
    maxMessageLength: process.env.MAX_MESSAGE_LENGTH
      ? parseInt(process.env.MAX_MESSAGE_LENGTH, 10)
      : 100_000,
    sessionTtlMinutes: process.env.SESSION_TTL_MINUTES
      ? parseInt(process.env.SESSION_TTL_MINUTES, 10)
      : 30,
    maxSessions: process.env.MAX_SESSIONS
      ? parseInt(process.env.MAX_SESSIONS, 10)
      : 100,
    fallbackEnabled: process.env.FALLBACK_ENABLED !== 'false',
    defaultModel: process.env.DEFAULT_MODEL || 'deepseek-v4-flash',
    circuitBreakerThreshold: process.env.CIRCUIT_BREAKER_THRESHOLD
      ? parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD, 10)
      : 5,
    circuitBreakerResetTimeout: process.env.CIRCUIT_BREAKER_RESET_TIMEOUT
      ? parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT, 10)
      : 30000,
    maxSessionMessages: process.env.MAX_SESSION_MESSAGES
      ? parseInt(process.env.MAX_SESSION_MESSAGES, 10)
      : 200,
    enableMultimodal: process.env.ENABLE_MULTIMODAL === 'true',
    responseSchemaMaxRetries: process.env.RESPONSE_SCHEMA_MAX_RETRIES
      ? parseInt(process.env.RESPONSE_SCHEMA_MAX_RETRIES, 10)
      : 2,
    transport: (process.env.TRANSPORT || 'stdio') as 'stdio' | 'http',
    httpPort: process.env.HTTP_PORT ? parseInt(process.env.HTTP_PORT, 10) : 3000,
    httpHost: process.env.HTTP_HOST || '127.0.0.1',
    httpAuthToken: process.env.HTTP_AUTH_TOKEN || undefined,
    httpAllowedHosts: process.env.HTTP_ALLOWED_HOSTS
      ? process.env.HTTP_ALLOWED_HOSTS.split(',').map((h) => h.trim()).filter(Boolean)
      : undefined,
  };

  const result = ConfigSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));

    const hint = !raw.apiKey
      ? '\nPlease set your DeepSeek API key:\n  export DEEPSEEK_API_KEY="your-api-key-here"'
      : '';

    throw new ConfigError(
      `Configuration validation failed${hint}`,
      issues
    );
  }

  cachedConfig = result.data;
  return cachedConfig;
}

/**
 * Get the cached configuration.
 * Throws if loadConfig() hasn't been called yet.
 */
export function getConfig(): Config {
  if (!cachedConfig) {
    throw new Error('Config not loaded. Call loadConfig() first.');
  }
  return cachedConfig;
}

/**
 * Reset cached configuration (for testing).
 */
export function resetConfig(): void {
  cachedConfig = null;
}
