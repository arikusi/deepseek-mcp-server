/**
 * Custom Error Classes
 * Structured error hierarchy for DeepSeek MCP Server
 */

/**
 * Base error class for all DeepSeek MCP errors
 */
export class BaseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

/**
 * Configuration validation error
 * Thrown when config validation fails (replaces process.exit)
 */
export class ConfigError extends BaseError {
  public readonly issues: Array<{ path: string; message: string }>;

  constructor(
    message: string,
    issues: Array<{ path: string; message: string }> = [],
    options?: ErrorOptions
  ) {
    super(message, options);
    this.issues = issues;
  }
}

/**
 * DeepSeek API error
 * Wraps errors from the DeepSeek/OpenAI API
 */
export class ApiError extends BaseError {
  public readonly statusCode?: number;
  public readonly retryable: boolean;

  constructor(
    message: string,
    options?: ErrorOptions & { statusCode?: number; retryable?: boolean }
  ) {
    super(message, options);
    this.statusCode = options?.statusCode;
    this.retryable = options?.retryable ?? false;
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends ApiError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, { ...options, statusCode: 429, retryable: true });
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends ApiError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, { ...options, statusCode: 401, retryable: false });
  }
}

/**
 * Input validation error
 */
export class ValidationError extends BaseError {
  public readonly zodErrors?: Array<{ path: string; message: string }>;

  constructor(
    message: string,
    zodErrors?: Array<{ path: string; message: string }>,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.zodErrors = zodErrors;
  }
}

/**
 * Network/connection error
 */
export class ConnectionError extends BaseError {
  public readonly retryable: boolean;

  constructor(message: string, options?: ErrorOptions & { retryable?: boolean }) {
    super(message, options);
    this.retryable = options?.retryable ?? true;
  }
}
