import { describe, it, expect } from 'vitest';
import { validateAgainstSchema, InvalidSchemaError } from './schema-validate.js';

const VOTE_SCHEMA = {
  type: 'object',
  properties: {
    role: { type: 'string', enum: ['core', 'face', 'scaffold'] },
    confidence: { type: 'number' },
  },
  required: ['role', 'confidence'],
  additionalProperties: false,
};

describe('schema-validate/validateAgainstSchema', () => {
  it('accepts a value matching the schema', () => {
    const r = validateAgainstSchema({ role: 'core', confidence: 0.9 }, VOTE_SCHEMA);
    expect(r.valid).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it('rejects a missing required property with a readable error', () => {
    const r = validateAgainstSchema({ role: 'core' }, VOTE_SCHEMA);
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
    expect(r.error).toContain('confidence');
  });

  it('rejects an out-of-enum value', () => {
    const r = validateAgainstSchema({ role: 'nope', confidence: 1 }, VOTE_SCHEMA);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/role/);
  });

  it('rejects extra properties when additionalProperties is false', () => {
    const r = validateAgainstSchema(
      { role: 'core', confidence: 1, extra: true },
      VOTE_SCHEMA
    );
    expect(r.valid).toBe(false);
  });

  it('reuses a cached validator for the same schema (no throw on repeat)', () => {
    const a = validateAgainstSchema({ role: 'face', confidence: 0 }, VOTE_SCHEMA);
    const b = validateAgainstSchema({ role: 'face', confidence: 0 }, VOTE_SCHEMA);
    expect(a.valid).toBe(true);
    expect(b.valid).toBe(true);
  });

  it('throws InvalidSchemaError for a non-compilable schema', () => {
    // `type` must be a string/array of strings, not a number
    expect(() => validateAgainstSchema({}, { type: 123 } as any)).toThrow(
      InvalidSchemaError
    );
  });
});

describe('schema-validate/ReDoS guard', () => {
  // A guard-less validate() of a catastrophic-backtracking pattern against a
  // non-matching string blocks the event loop for minutes; each case here must
  // instead throw synchronously and return fast.
  const EVIL = '^(a+)+$';
  const BAD_INPUT = 'a'.repeat(40) + '!';

  it('rejects a top-level pattern vulnerable to catastrophic backtracking', () => {
    const t0 = performance.now();
    expect(() =>
      validateAgainstSchema(BAD_INPUT, { type: 'string', pattern: EVIL })
    ).toThrow(InvalidSchemaError);
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  it('mentions ReDoS and the offending pattern in the error', () => {
    expect(() =>
      validateAgainstSchema('x', { type: 'string', pattern: EVIL })
    ).toThrow(/ReDoS|backtracking/);
  });

  it('rejects an unsafe pattern nested inside object properties', () => {
    expect(() =>
      validateAgainstSchema(
        { s: BAD_INPUT },
        {
          type: 'object',
          properties: { s: { type: 'string', pattern: EVIL } },
        }
      )
    ).toThrow(InvalidSchemaError);
  });

  it('rejects an unsafe pattern buried in $defs / allOf', () => {
    expect(() =>
      validateAgainstSchema(
        {},
        {
          $defs: { thing: { type: 'string', pattern: EVIL } },
          allOf: [{ type: 'object' }],
        }
      )
    ).toThrow(InvalidSchemaError);
  });

  it('rejects an unsafe patternProperties key (the key is the regex)', () => {
    expect(() =>
      validateAgainstSchema(
        { anything: 1 },
        { type: 'object', patternProperties: { [EVIL]: { type: 'number' } } }
      )
    ).toThrow(InvalidSchemaError);
  });

  it('allows a simple linear-time pattern', () => {
    const r = validateAgainstSchema('CAT-1234', {
      type: 'string',
      pattern: '^CAT-[0-9]{4}$',
    });
    expect(r.valid).toBe(true);
  });

  it('allows a linear pattern to fail validation normally (not rejected as unsafe)', () => {
    const r = validateAgainstSchema('DOG-1', {
      type: 'string',
      pattern: '^CAT-[0-9]{4}$',
    });
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('does not treat a "pattern" object property name as a regex keyword', () => {
    // Here `pattern` is a *property name*, its schema is an object — must not throw.
    const schema = {
      type: 'object',
      properties: { pattern: { type: 'string' } },
    };
    const r = validateAgainstSchema({ pattern: 'hello' }, schema);
    expect(r.valid).toBe(true);
  });
});
