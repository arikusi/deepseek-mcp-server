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
import { isSafe } from 'redos-detector';

// One Ajv instance for the process. allErrors so the repair message lists every
// problem at once; strict:false so ordinary JSON Schemas from callers (which may
// use keywords/formats Ajv doesn't recognize) don't get rejected as invalid.
const ajv = new Ajv({ allErrors: true, strict: false });

/** Cap on schema-walk recursion depth — a defensive bound against a pathologically
 *  deep caller schema; well past anything a real response_schema needs. */
const MAX_SCHEMA_DEPTH = 200;

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
 * Reject a single regex that is vulnerable to catastrophic backtracking.
 * Caller-supplied schema patterns are compiled by Ajv into native RegExp
 * objects; a pattern like `^(a+)+$` tested against a non-matching string blocks
 * the event loop for minutes, so one request could stall the whole server. We
 * refuse such a pattern up front as a caller error. redos-detector's own
 * analysis is internally step-/time-bounded, so this check can't itself hang.
 */
function assertRegexSafe(pattern: string): void {
  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch {
    // A syntactically invalid pattern is not a ReDoS risk; let Ajv surface it
    // as an invalid schema when it compiles.
    return;
  }
  if (!isSafe(re).safe) {
    throw new InvalidSchemaError(
      `Invalid response_schema: regex pattern ${JSON.stringify(
        pattern
      )} is vulnerable to catastrophic backtracking (ReDoS) and was rejected. Use a simpler, linear-time pattern.`
    );
  }
}

/**
 * Walk a JSON Schema and ReDoS-check every regex it carries: `pattern` values
 * (whose value is the regex) and `patternProperties` keys (which are regexes).
 * Recursion covers nested subschemas ($defs, items, allOf, propertyNames, …).
 * Throws InvalidSchemaError on the first unsafe pattern.
 */
function assertSchemaPatternsSafe(node: unknown, depth = 0): void {
  if (depth > MAX_SCHEMA_DEPTH || node === null || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const item of node) assertSchemaPatternsSafe(item, depth + 1);
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === 'pattern' && typeof value === 'string') {
      assertRegexSafe(value);
    } else if (
      key === 'patternProperties' &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      for (const patternKey of Object.keys(value)) assertRegexSafe(patternKey);
    }
    assertSchemaPatternsSafe(value, depth + 1);
  }
}

/**
 * Compile (and cache) a validator for the given JSON Schema.
 * Throws InvalidSchemaError if the schema cannot be compiled or carries a
 * regex pattern vulnerable to catastrophic backtracking (ReDoS).
 */
function getValidator(schema: Record<string, unknown>): ValidateFunction {
  const key = JSON.stringify(schema);
  const cached = validatorCache.get(key);
  if (cached) return cached;

  // Refuse ReDoS-prone patterns before Ajv turns them into live RegExp objects.
  assertSchemaPatternsSafe(schema);

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
