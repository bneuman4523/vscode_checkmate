import { describe, it, expect } from 'vitest';

function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function validatePasswordComplexity(password: string): string | null {
  if (!password || password.length < 10) return "Password must be at least 10 characters";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number";
  return null;
}

function sanitizeAttendeeData<T extends Record<string, string | undefined | null>>(data: T): T {
  const fieldsToSanitize = ['firstName', 'lastName', 'email', 'company', 'title', 'phone'] as const;
  const sanitized = { ...data };
  for (const field of fieldsToSanitize) {
    if (typeof sanitized[field] === 'string') {
      (sanitized as Record<string, string | undefined | null>)[field] = sanitizeHtml(sanitized[field] as string);
    }
  }
  return sanitized;
}

type UserRole = 'super_admin' | 'admin' | 'staff';
interface DbUser { role: UserRole }

function canAssignRole(assigner: DbUser | undefined, targetRole: UserRole): boolean {
  if (!assigner) return false;
  if (assigner.role === "super_admin") return true;
  if (assigner.role === "admin") return targetRole !== "super_admin";
  return false;
}

describe('sanitizeHtml', () => {
  it('escapes HTML angle brackets', () => {
    expect(sanitizeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('escapes ampersands', () => {
    expect(sanitizeHtml('AT&T')).toBe('AT&amp;T');
  });

  it('escapes single quotes', () => {
    expect(sanitizeHtml("it's")).toBe('it&#x27;s');
  });

  it('escapes double quotes', () => {
    expect(sanitizeHtml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('passes through safe strings unchanged', () => {
    expect(sanitizeHtml('hello world 123')).toBe('hello world 123');
  });

  it('handles event handler injection attempts', () => {
    const input = '<img onerror="alert(1)" src=x>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });
});

describe('validatePasswordComplexity', () => {
  it('rejects short passwords', () => {
    expect(validatePasswordComplexity('Abc1')).toContain('10 characters');
  });

  it('rejects missing lowercase', () => {
    expect(validatePasswordComplexity('ABCDEFGHIJ1')).toContain('lowercase');
  });

  it('rejects missing uppercase', () => {
    expect(validatePasswordComplexity('abcdefghij1')).toContain('uppercase');
  });

  it('rejects missing number', () => {
    expect(validatePasswordComplexity('Abcdefghijk')).toContain('number');
  });

  it('accepts a valid password', () => {
    expect(validatePasswordComplexity('SecurePass1')).toBeNull();
  });

  it('rejects empty string', () => {
    expect(validatePasswordComplexity('')).not.toBeNull();
  });

  it('accepts complex valid password', () => {
    expect(validatePasswordComplexity('My$ecur3Password!')).toBeNull();
  });
});

describe('sanitizeAttendeeData', () => {
  it('sanitizes PII fields', () => {
    const data = {
      firstName: '<script>alert(1)</script>',
      lastName: 'Smith',
      email: 'test@example.com',
      company: 'Acme & Co.',
    };
    const result = sanitizeAttendeeData(data);
    expect(result.firstName).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result.lastName).toBe('Smith');
    expect(result.company).toBe('Acme &amp; Co.');
  });

  it('does not modify non-targeted fields', () => {
    const data = {
      firstName: 'Alice',
      customField: '<b>bold</b>',
    };
    const result = sanitizeAttendeeData(data);
    expect(result.customField).toBe('<b>bold</b>');
  });

  it('handles null and undefined fields gracefully', () => {
    const data = {
      firstName: null,
      lastName: undefined,
      email: 'test@test.com',
    };
    const result = sanitizeAttendeeData(data as any);
    expect(result.firstName).toBeNull();
    expect(result.lastName).toBeUndefined();
  });
});

describe('canAssignRole (RBAC)', () => {
  it('super_admin can assign any role', () => {
    const superAdmin: DbUser = { role: 'super_admin' };
    expect(canAssignRole(superAdmin, 'super_admin')).toBe(true);
    expect(canAssignRole(superAdmin, 'admin')).toBe(true);
    expect(canAssignRole(superAdmin, 'staff')).toBe(true);
  });

  it('admin can assign admin and staff but not super_admin', () => {
    const admin: DbUser = { role: 'admin' };
    expect(canAssignRole(admin, 'super_admin')).toBe(false);
    expect(canAssignRole(admin, 'admin')).toBe(true);
    expect(canAssignRole(admin, 'staff')).toBe(true);
  });

  it('staff cannot assign any role', () => {
    const staff: DbUser = { role: 'staff' };
    expect(canAssignRole(staff, 'staff')).toBe(false);
    expect(canAssignRole(staff, 'admin')).toBe(false);
    expect(canAssignRole(staff, 'super_admin')).toBe(false);
  });

  it('undefined user cannot assign any role', () => {
    expect(canAssignRole(undefined, 'staff')).toBe(false);
  });
});
