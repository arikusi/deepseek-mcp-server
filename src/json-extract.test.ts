import { describe, it, expect } from 'vitest';
import { extractJson } from './json-extract.js';

describe('json-extract/extractJson', () => {
  it('passes through a bare JSON object', () => {
    const r = extractJson('{"a":1,"b":"x"}');
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ a: 1, b: 'x' });
    expect(r.text).toBe('{"a":1,"b":"x"}');
  });

  it('trims surrounding whitespace', () => {
    const r = extractJson('\n  {"ok":true}\n ');
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ ok: true });
  });

  it('strips a ```json code fence', () => {
    const r = extractJson('```json\n{"role":"core"}\n```');
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ role: 'core' });
    expect(r.text).toBe('{"role":"core"}');
  });

  it('strips a bare ``` fence', () => {
    const r = extractJson('```\n[1,2,3]\n```');
    expect(r.ok).toBe(true);
    expect(r.value).toEqual([1, 2, 3]);
  });

  it('recovers JSON after leading chain-of-thought prose', () => {
    const r = extractJson('Let me reason about this.\nHere is the answer:\n{"verdict":"pass"}');
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ verdict: 'pass' });
  });

  it('recovers JSON with trailing text (the "Extra data" case)', () => {
    const r = extractJson('{"verdict":"pass"}\nDone. Hope that helps!');
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ verdict: 'pass' });
  });

  it('does not miscount braces that appear inside strings', () => {
    const r = extractJson('{"note":"a } brace and { another","n":2}');
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ note: 'a } brace and { another', n: 2 });
  });

  it('handles escaped quotes inside strings', () => {
    const r = extractJson('prefix {"q":"she said \\"hi\\""} suffix');
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ q: 'she said "hi"' });
  });

  it('extracts a nested object with mixed brackets', () => {
    const r = extractJson('noise {"a":[1,{"b":2}],"c":{"d":3}} tail');
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ a: [1, { b: 2 }], c: { d: 3 } });
  });

  it('recovers a top-level array', () => {
    const r = extractJson('```json\n[{"x":1},{"x":2}]\n```');
    expect(r.ok).toBe(true);
    expect(r.value).toEqual([{ x: 1 }, { x: 2 }]);
  });

  it('reports failure for content with no JSON', () => {
    const r = extractJson('there is no json here at all');
    expect(r.ok).toBe(false);
    expect(r.error).toBeDefined();
    expect(r.text).toBe('there is no json here at all');
  });

  it('reports failure and preserves raw for empty content', () => {
    const r = extractJson('   ');
    expect(r.ok).toBe(false);
    expect(r.text).toBe('   ');
  });

  it('reports failure for an unterminated object', () => {
    const r = extractJson('{"a":1, "b":');
    expect(r.ok).toBe(false);
    expect(r.error).toBeDefined();
  });

  it('is deterministic: same input yields byte-identical text', () => {
    const input = 'reasoning...\n```json\n{"z":9,"a":1}\n```\ntrailing';
    const a = extractJson(input);
    const b = extractJson(input);
    expect(a.text).toBe(b.text);
    expect(a.text).toBe('{"z":9,"a":1}');
  });
});
