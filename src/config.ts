/**
 * Centralized Configuration
 * Loads and validates configuration from environment variables
 */

import { z } from 'zod';

const ConfigSchema = z.object({
  apiKey: z.string().min(1, 'DEEPSEEK_API_KEY is required'),
  baseUrl: z.string().url().default('https://api.deepseek.com'),
  showCostInfo: z.boolean().default(true),
  requestTimeout: z.number().positive().default(60000),
  maxRetries: z.number().min(0).max(10).default(2),
});

export type Config = z.infer<typeof ConfigSchema>;

let cachedConfig: Config | null = null;

/**
 * Load configuration from environment variables.
 * Validates with Zod and caches the result.
 * Exits process if validation fails (e.g., missing API key).
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
  };

  const result = ConfigSchema.safeParse(raw);

  if (!result.success) {
    console.error('Error: Configuration validation failed');
    const issues = result.error.issues;
    for (const issue of issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    if (!raw.apiKey) {
      console.error('Please set your DeepSeek API key:');
      console.error('  export DEEPSEEK_API_KEY="your-api-key-here"');
    }
    process.exit(1);
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
