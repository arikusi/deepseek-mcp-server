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
