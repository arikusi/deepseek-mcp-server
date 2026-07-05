/**
 * JSON extraction for json_mode responses.
 *
 * When a model answers under json_mode — especially with thinking enabled —
 * the `content` field is not always a bare JSON value. Observed failure modes:
 *   - fenced output:            ```json\n{...}\n```
 *   - chain-of-thought leaking before the object:  "Let me think... {...}"
 *   - trailing prose after the object:             "{...}\nDone." (JSON.parse
 *     throws "Unexpected non-whitespace / Extra data")
 *
 * This module deterministically recovers the JSON value without a second API
 * call (preserving temp=0 reproducibility): it tries the raw string, then a
 * de-fenced version, then the first balanced {...} / [...] slice. The result is
 * a clean JSON string the consumer can parse directly.
 */

export interface JsonExtractResult {
  /** Whether a valid JSON value was recovered */
  ok: boolean;
  /** The cleaned JSON text (== raw when ok is false) */
  text: string;
  /** The parsed value (present only when ok) */
  value?: unknown;
  /** JSON.parse error from the last attempt (present only when !ok) */
  error?: string;
}

/**
 * Strip a single wrapping markdown code fence (```json ... ``` or ``` ... ```).
 * Returns the input unchanged if it is not fenced.
 */
function stripCodeFence(s: string): string {
  const match = s.match(/^```[^\n]*\n?([\s\S]*?)\n?```$/);
  return match ? match[1].trim() : s;
}

/**
 * Return the first balanced {...} or [...] slice in `s`, respecting string
 * literals and escapes so braces inside strings don't skew the depth count.
 * Returns null when no balanced value is found.
 */
function findBalanced(s: string): string | null {
  const start = s.search(/[{[]/);
  if (start === -1) return null;

  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < s.length; i++) {
    const ch = s[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }

  return null;
}

/**
 * Recover a JSON value from raw model content produced under json_mode.
 *
 * Tries, in order: the trimmed string, a de-fenced version, then the first
 * balanced object/array slice. The first candidate that JSON.parse accepts
 * wins. All-fail returns { ok: false } with the original raw text preserved.
 */
export function extractJson(raw: string): JsonExtractResult {
  const trimmed = raw.trim();

  const candidates: string[] = [];
  if (trimmed) candidates.push(trimmed);

  const defenced = stripCodeFence(trimmed);
  if (defenced && defenced !== trimmed) candidates.push(defenced);

  const balanced = findBalanced(defenced || trimmed);
  if (balanced && !candidates.includes(balanced)) candidates.push(balanced);

  let lastError = 'empty content';
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      return { ok: true, text: candidate, value };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return { ok: false, text: raw, error: lastError };
}
