/**
 * Credential Manager - Secure credential storage and retrieval
 * 
 * SECURITY POLICY:
 * - NO credentials stored in database
 * - Only environment variable references stored
 * - Credentials retrieved at runtime from secure vault
 * - Short-lived in-memory caching with automatic expiration
 */

import { createChildLogger } from '../logger';

const logger = createChildLogger('CredentialManager');

interface CredentialCache {
  value: string;
  expiresAt: number;
}

class CredentialManager {
  private cache: Map<string, CredentialCache> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Store a credential in environment (server-side only)
   * Returns a reference key for database storage
   */
  async storeCredential(customerId: string, integrationName: string, key: string, value: string): Promise<string> {
    const ref = `CUSTOMER_${customerId}_${integrationName}_${key}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    
    // In production, this would call a secure secret management service
    // For now, we'll use process.env (server-side only)
    process.env[ref] = value;
    
    logger.info(`Stored credential: ${ref}`);
    return ref;
  }

  /**
   * Retrieve a credential by reference
   * Uses short-lived cache to minimize secret store access
   */
  async getCredential(ref: string): Promise<string | null> {
    // Check cache first
    const cached = this.cache.get(ref);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    // Retrieve from environment (or external secret manager in production)
    const value = process.env[ref];
    if (!value) {
      logger.error(`Credential not found: ${ref}`);
      return null;
    }

    // Cache for short period
    this.cache.set(ref, {
      value,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });

    return value;
  }

  /**
   * Delete a credential
   */
  async deleteCredential(ref: string): Promise<void> {
    this.cache.delete(ref);
    delete process.env[ref];
    logger.info(`Deleted credential: ${ref}`);
  }

  /**
   * Clear cache (useful for security or testing)
   */
  clearCache(): void {
    this.cache.clear();
    logger.info(`Cache cleared`);
  }

  /**
   * Check if a credential exists
   */
  async hasCredential(ref: string): Promise<boolean> {
    return !!process.env[ref];
  }
}

export const credentialManager = new CredentialManager();
