import { describe, it, expect, beforeAll } from 'vitest';
import { encryptCredential, decryptCredential, maskCredential, generateState, generatePKCEVerifier } from '../server/credential-manager';

beforeAll(() => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = 'test-encryption-key-for-unit-tests-only';
});

describe('encryptCredential / decryptCredential', () => {
  it('round-trips a simple string', () => {
    const plaintext = 'my-secret-api-key-12345';
    const encrypted = encryptCredential(plaintext);
    const decrypted = decryptCredential(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('round-trips a JSON payload', () => {
    const payload = JSON.stringify({ accessToken: 'abc', refreshToken: 'xyz', expiresIn: 3600 });
    const encrypted = encryptCredential(payload);
    const decrypted = decryptCredential(encrypted);
    expect(decrypted).toBe(payload);
    expect(JSON.parse(decrypted)).toEqual({ accessToken: 'abc', refreshToken: 'xyz', expiresIn: 3600 });
  });

  it('round-trips an empty string', () => {
    const encrypted = encryptCredential('');
    const decrypted = decryptCredential(encrypted);
    expect(decrypted).toBe('');
  });

  it('round-trips unicode and special characters', () => {
    const plaintext = 'pässwörd-🔐-$pecial&chars=value';
    const encrypted = encryptCredential(plaintext);
    const decrypted = decryptCredential(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('produces unique IVs for the same plaintext', () => {
    const a = encryptCredential('same-key');
    const b = encryptCredential('same-key');
    expect(a.iv).not.toBe(b.iv);
    expect(a.encryptedValue).not.toBe(b.encryptedValue);
  });

  it('returns the expected shape', () => {
    const encrypted = encryptCredential('test');
    expect(encrypted).toHaveProperty('encryptedValue');
    expect(encrypted).toHaveProperty('iv');
    expect(encrypted).toHaveProperty('authTag');
    expect(encrypted).toHaveProperty('encryptionKeyId');
    expect(encrypted.encryptionKeyId).toBe('v1');
  });

  it('rejects tampered ciphertext', () => {
    const encrypted = encryptCredential('sensitive-data');
    encrypted.encryptedValue = 'dGFtcGVyZWQ=';
    expect(() => decryptCredential(encrypted)).toThrow();
  });

  it('rejects tampered auth tag', () => {
    const encrypted = encryptCredential('sensitive-data');
    encrypted.authTag = Buffer.from('0000000000000000').toString('base64');
    expect(() => decryptCredential(encrypted)).toThrow();
  });
});

describe('maskCredential', () => {
  it('masks a long credential showing first and last 4 chars', () => {
    expect(maskCredential('sk_live_abcdefghijklmnop')).toBe('sk_l...mnop');
  });

  it('returns **** for short credentials', () => {
    expect(maskCredential('abc')).toBe('****');
    expect(maskCredential('')).toBe('****');
  });

  it('returns **** for empty string', () => {
    expect(maskCredential('')).toBe('****');
  });

  it('handles exactly 8 character credential', () => {
    expect(maskCredential('12345678')).toBe('1234...5678');
  });
});

describe('generateState', () => {
  it('returns a base64url string', () => {
    const state = generateState();
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produces unique values', () => {
    const a = generateState();
    const b = generateState();
    expect(a).not.toBe(b);
  });

  it('has sufficient length for CSRF protection', () => {
    const state = generateState();
    expect(state.length).toBeGreaterThanOrEqual(32);
  });
});

describe('generatePKCEVerifier', () => {
  it('returns a base64url string', () => {
    const verifier = generatePKCEVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('meets minimum PKCE length requirement (43 chars)', () => {
    const verifier = generatePKCEVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });

  it('produces unique values', () => {
    const a = generatePKCEVerifier();
    const b = generatePKCEVerifier();
    expect(a).not.toBe(b);
  });
});
