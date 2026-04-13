import { describe, it, expect } from 'vitest';
import { insertUserSchema, updateAttendeeSchema, insertAttendeeSchema } from '../shared/schema';

describe('insertUserSchema', () => {
  const validUser = {
    email: 'test@example.com',
    phoneNumber: '+15551234567',
    role: 'admin' as const,
  };

  it('accepts valid E.164 phone number', () => {
    const result = insertUserSchema.safeParse(validUser);
    expect(result.success).toBe(true);
  });

  it('rejects phone number without + prefix', () => {
    const result = insertUserSchema.safeParse({
      ...validUser,
      phoneNumber: '15551234567',
    });
    expect(result.success).toBe(false);
  });

  it('rejects phone number starting with +0', () => {
    const result = insertUserSchema.safeParse({
      ...validUser,
      phoneNumber: '+05551234567',
    });
    expect(result.success).toBe(false);
  });

  it('rejects phone number with letters', () => {
    const result = insertUserSchema.safeParse({
      ...validUser,
      phoneNumber: '+1555abc4567',
    });
    expect(result.success).toBe(false);
  });

  it('defaults role to staff when not provided', () => {
    const result = insertUserSchema.safeParse({
      email: 'staff@example.com',
      phoneNumber: '+15551234567',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe('staff');
    }
  });

  it('accepts valid international number', () => {
    const result = insertUserSchema.safeParse({
      ...validUser,
      email: 'uk@example.com',
      phoneNumber: '+447911123456',
      role: 'staff',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid role', () => {
    const result = insertUserSchema.safeParse({
      ...validUser,
      role: 'overlord',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateAttendeeSchema', () => {
  it('accepts partial updates', () => {
    const result = updateAttendeeSchema.safeParse({
      firstName: 'Updated',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (all fields optional)', () => {
    const result = updateAttendeeSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('transforms string dates to Date objects for checkedInAt', () => {
    const result = updateAttendeeSchema.safeParse({
      checkedInAt: '2025-06-15T10:30:00Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.checkedInAt).toBeInstanceOf(Date);
    }
  });

  it('accepts null for checkedInAt (un-check-in)', () => {
    const result = updateAttendeeSchema.safeParse({
      checkedInAt: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.checkedInAt).toBeNull();
    }
  });

  it('transforms badgePrintedAt string to Date', () => {
    const result = updateAttendeeSchema.safeParse({
      badgePrintedAt: '2025-06-15T12:00:00Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.badgePrintedAt).toBeInstanceOf(Date);
    }
  });
});
