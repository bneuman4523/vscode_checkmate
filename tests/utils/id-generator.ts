/**
 * ID Generator Utility
 * Generates unique IDs for test data
 */

import { randomBytes } from 'crypto';

export function generateId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const randomPart = randomBytes(8).toString('hex');
  return prefix ? `${prefix}_${timestamp}_${randomPart}` : `${timestamp}_${randomPart}`;
}

export function generateBatch(count: number, prefix: string = ''): string[] {
  return Array.from({ length: count }, () => generateId(prefix));
}

export function generateEmail(index: number): string {
  return `test_attendee_${index}@scaletest.local`;
}

export function generateName(): { firstName: string; lastName: string } {
  const firstNames = ['Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
  return {
    firstName: firstNames[Math.floor(Math.random() * firstNames.length)],
    lastName: lastNames[Math.floor(Math.random() * lastNames.length)],
  };
}

export function generateCompany(): string {
  const companies = ['Acme Corp', 'TechCo', 'GlobalInc', 'StartupXYZ', 'Enterprise Ltd', 'Innovation Labs', 'Digital Solutions', 'CloudFirst', 'DataDriven', 'FutureTech'];
  return companies[Math.floor(Math.random() * companies.length)];
}

export function generateParticipantType(): string {
  const types = ['General', 'VIP', 'Speaker', 'Staff', 'Sponsor', 'Press'];
  const weights = [0.7, 0.1, 0.05, 0.08, 0.05, 0.02]; // Most are General
  const random = Math.random();
  let cumulative = 0;
  for (let i = 0; i < types.length; i++) {
    cumulative += weights[i];
    if (random < cumulative) return types[i];
  }
  return 'General';
}
