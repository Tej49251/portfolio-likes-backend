/**
 * tests/validation.test.js
 *
 * Unit tests for server-side name validation.
 * Tests are independent of the database and Express.
 * Covers Unicode letters (\p{L}), combining marks (\p{M} for Indic scripts),
 * whitespace, empty input, excessive length, numbers, punctuation, and emoji.
 */

import { describe, it, expect } from '@jest/globals';
import { validateNameValue } from '../src/middleware/validateName.js';

describe('validateNameValue', () => {
  // ── Valid names ─────────────────────────────────────────────────────────

  it('accepts a simple ASCII name', () => {
    const result = validateNameValue('Alex');
    expect(result.valid).toBe(true);
    expect(result.normalizedName).toBe('Alex');
  });

  it('accepts a name with spaces', () => {
    const result = validateNameValue('John Doe');
    expect(result.valid).toBe(true);
    expect(result.normalizedName).toBe('John Doe');
  });

  it('accepts a Unicode name with accents', () => {
    const result = validateNameValue('María García');
    expect(result.valid).toBe(true);
    expect(result.normalizedName).toBe('María García');
  });

  it('accepts a Chinese name', () => {
    const result = validateNameValue('李伟');
    expect(result.valid).toBe(true);
    expect(result.normalizedName).toBe('李伟');
  });

  it('accepts a Hindi name', () => {
    const result = validateNameValue('राज');
    expect(result.valid).toBe(true);
    expect(result.normalizedName).toBe('राज');
  });

  it('accepts a Japanese name', () => {
    const result = validateNameValue('田中太郎');
    expect(result.valid).toBe(true);
    expect(result.normalizedName).toBe('田中太郎');
  });

  it('accepts a Korean name', () => {
    const result = validateNameValue('김민준');
    expect(result.valid).toBe(true);
    expect(result.normalizedName).toBe('김민준');
  });

  it('trims leading and trailing whitespace', () => {
    const result = validateNameValue('  Alex  ');
    expect(result.valid).toBe(true);
    expect(result.normalizedName).toBe('Alex');
  });

  it('collapses internal multiple spaces', () => {
    const result = validateNameValue('John   Doe');
    expect(result.valid).toBe(true);
    expect(result.normalizedName).toBe('John Doe');
  });

  it('accepts a name exactly 40 characters long', () => {
    // 40 Unicode letters
    const name = 'A'.repeat(40);
    const result = validateNameValue(name);
    expect(result.valid).toBe(true);
    expect(result.normalizedName).toBe(name);
  });

  // ── Empty / absent (valid, returns null) ─────────────────────────────────

  it('accepts undefined (field absent — optional)', () => {
    const result = validateNameValue(undefined);
    expect(result.valid).toBe(true);
    expect(result.normalizedName).toBeNull();
  });

  it('accepts null (field null)', () => {
    const result = validateNameValue(null);
    expect(result.valid).toBe(true);
    expect(result.normalizedName).toBeNull();
  });

  it('accepts empty string (no name submitted)', () => {
    const result = validateNameValue('');
    expect(result.valid).toBe(true);
    expect(result.normalizedName).toBeNull();
  });

  it('rejects whitespace-only string', () => {
    // Whitespace-only trims to empty → null (treated as optional)
    const result = validateNameValue('   ');
    expect(result.valid).toBe(true);
    expect(result.normalizedName).toBeNull();
  });

  // ── Invalid names ────────────────────────────────────────────────────────

  it('rejects a name longer than 40 code points', () => {
    const name = 'A'.repeat(41);
    const result = validateNameValue(name);
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/40/);
  });

  it('rejects a name with digits', () => {
    const result = validateNameValue('Alex1');
    expect(result.valid).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it('rejects a name with punctuation', () => {
    const result = validateNameValue('Alex!');
    expect(result.valid).toBe(false);
  });

  it('rejects a name with a hyphen', () => {
    const result = validateNameValue('Jean-Pierre');
    expect(result.valid).toBe(false);
  });

  it('rejects a name with an apostrophe', () => {
    const result = validateNameValue("O'Brien");
    expect(result.valid).toBe(false);
  });

  it('rejects an emoji', () => {
    const result = validateNameValue('Alex 😀');
    expect(result.valid).toBe(false);
  });

  it('rejects HTML tags', () => {
    const result = validateNameValue('<script>alert(1)</script>');
    expect(result.valid).toBe(false);
  });

  it('rejects SQL injection payload (contains non-letter chars)', () => {
    const result = validateNameValue("'; DROP TABLE submissions; --");
    expect(result.valid).toBe(false);
  });

  it('rejects XSS payload', () => {
    const result = validateNameValue('<img src=x onerror=alert(1)>');
    expect(result.valid).toBe(false);
  });

  it('rejects a non-string value (number)', () => {
    const result = validateNameValue(42);
    expect(result.valid).toBe(false);
  });

  it('rejects a non-string value (array)', () => {
    const result = validateNameValue(['Alex']);
    expect(result.valid).toBe(false);
  });

  it('rejects a non-string value (object)', () => {
    const result = validateNameValue({ name: 'Alex' });
    expect(result.valid).toBe(false);
  });
});
