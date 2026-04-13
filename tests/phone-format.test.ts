import { describe, it, expect } from 'vitest';
import { formatPhoneNumber, toE164 } from '../client/src/lib/phone-format';

describe('formatPhoneNumber', () => {
  it('formats a US number progressively', () => {
    expect(formatPhoneNumber('+1')).toBe('+1');
    expect(formatPhoneNumber('+155')).toBe('+1 (55');
    expect(formatPhoneNumber('+1555')).toBe('+1 (555');
    expect(formatPhoneNumber('+15551')).toBe('+1 (555) 1');
    expect(formatPhoneNumber('+1555123')).toBe('+1 (555) 123');
    expect(formatPhoneNumber('+15551234567')).toBe('+1 (555) 123-4567');
  });

  it('handles bare digits without leading +', () => {
    expect(formatPhoneNumber('15551234567')).toBe('+1 (555) 123-4567');
  });

  it('returns + for empty input', () => {
    expect(formatPhoneNumber('')).toBe('+');
    expect(formatPhoneNumber('+')).toBe('+');
  });

  it('handles international numbers (non-US) as raw digits', () => {
    expect(formatPhoneNumber('+447911123456')).toBe('+447911123456');
  });

  it('strips non-digit characters except leading +', () => {
    expect(formatPhoneNumber('+1 (555) 123-4567')).toBe('+1 (555) 123-4567');
  });
});

describe('toE164', () => {
  it('converts formatted US number to E.164', () => {
    expect(toE164('+1 (555) 123-4567')).toBe('+15551234567');
  });

  it('passes through already-clean E.164', () => {
    expect(toE164('+15551234567')).toBe('+15551234567');
  });

  it('handles international numbers', () => {
    expect(toE164('+44 7911 123456')).toBe('+447911123456');
  });

  it('adds + prefix for bare digits', () => {
    expect(toE164('15551234567')).toBe('+15551234567');
  });

  it('returns empty string for empty input', () => {
    expect(toE164('')).toBe('');
  });
});
