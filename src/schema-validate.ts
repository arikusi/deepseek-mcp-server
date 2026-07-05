/**
 * JSON Schema validation for response_schema.
 *
 * json_mode guarantees valid JSON but not the right *shape*. When a caller
 * supplies a response_schema (a JSON Schema), the server validates the parsed
 * model output against it and can drive repair retries. This module wraps Ajv
 * with a small compiled-validator cache and turns Ajv's error array into a
 * single human-readable string suitable for feeding back to the model.
 */

import { Ajv, type ValidateFunction } from 'ajv';

// One Ajv instance for the process. allErrors so the repair message lists every
// problem at once; strict:false so ordinary JSON Schemas from callers (which may
// use keywords/formats Ajv doesn't recognize) don't get rejected as invalid.
const ajv = new Ajv({ allErrors: true, strict: false });

/** Cache compiled validators keyed by the schema's JSON string. */
const validatorCache = new Map<string, ValidateFunction>();

export interface SchemaValidationResult {
  /** Whether the value satisfies the schema */
  valid: boolean;
  /** Human-readable validation error (present only when !valid) */
  error?: string;
}

/**
 * Thrown when the supplied response_schema itself is not a compilable JSON
 * Schema — a caller error, distinct from the model producing invalid output.
 */
export class InvalidSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSchemaError';
  }
}

/**
 * Compile (and cache) a validator for the given JSON Schema.
 * Throws InvalidSchemaError if the schema cannot be compiled.
 */
function getValidator(schema: Record<string, unknown>): ValidateFunction {
  const key = JSON.stringify(schema);
  const cached = validatorCache.get(key);
  if (cached) return cached;

  let compiled: ValidateFunction;
  try {
    compiled = ajv.compile(schema);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new InvalidSchemaError(`Invalid response_schema: ${message}`);
  }
  validatorCache.set(key, compiled);
  return compiled;
}

/**
 * Validate a parsed value against a JSON Schema.
 * Throws InvalidSchemaError if the schema itself is malformed.
 */
export function validateAgainstSchema(
  value: unknown,
  schema: Record<string, unknown>
): SchemaValidationResult {
  const validate = getValidator(schema);
  const valid = validate(value);
  if (valid) return { valid: true };

  const error = (validate.errors ?? [])
    .map((e) => {
      const path = e.instancePath || '(root)';
      return `${path} ${e.message ?? 'is invalid'}`.trim();
    })
    .join('; ');

  return { valid: false, error: error || 'value does not match schema' };
}
