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
