/**
 * Auth Resolver - Shared credential resolution and auth header building
 *
 * Consolidates the duplicated pattern of:
 *   1. Look up integration + connection
 *   2. Verify connection is active
 *   3. Fetch stored credentials
 *   4. Decrypt them
 *   5. If OAuth2, check expiry and refresh if needed
 *   6. Build Authorization header
 *
 * Used by sync routes, test-connection, discover-events, and the scheduler.
 */

import { createChildLogger } from '../logger';
import { storage } from '../storage';
import {
  decryptCredential,
  encryptCredential,
  maskCredential,
  refreshAccessToken,
  isTokenExpired,
  calculateTokenExpiry,
} from '../credential-manager';
import type {
  CustomerIntegration,
  IntegrationConnection,
  StoredCredential,
} from '@shared/schema';

const logger = createChildLogger('AuthResolver');

// ─── Types ───────────────────────────────────────────────────────────────────

export class AuthResolverError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'INTEGRATION_NOT_FOUND'
      | 'CONNECTION_NOT_FOUND'
      | 'CONNECTION_NOT_CONNECTED'
      | 'NO_CREDENTIALS'
      | 'DECRYPT_FAILED'
      | 'TOKEN_REFRESH_FAILED',
    public readonly httpStatus: number = 400,
  ) {
    super(message);
    this.name = 'AuthResolverError';
  }
}

export interface ResolvedAuth {
  /** Auth headers ready to spread into a fetch request (e.g. { Authorization: "Bearer ..." }) */
  headers: Record<string, string>;
  /** The integration's base URL (trailing slash stripped) */
  baseUrl: string;
  /** The full integration record — callers often need fields like syncTemplates */
  integration: CustomerIntegration;
  /** The connection record — callers may need the id for updating sync state, etc. */
  connection: IntegrationConnection;
}

export interface ResolveAuthOptions {
  /**
   * When true, skip the `connectionStatus === 'connected'` check.
   * Useful for the test-connection endpoint which deliberately tests
   * connections that may not yet be marked connected.
   */
  skipConnectionStatusCheck?: boolean;
}

// ─── Helper: decrypt a StoredCredential row ──────────────────────────────────

function decrypt(cred: StoredCredential): string {
  return decryptCredential({
    encryptedValue: cred.encryptedValue,
    iv: cred.iv,
    authTag: cred.authTag,
    encryptionKeyId: cred.encryptionKeyId,
  });
}

// ─── Helper: refresh an OAuth2 access token ──────────────────────────────────

async function tryRefreshOAuth2Token(
  integration: CustomerIntegration,
  connection: IntegrationConnection,
  accessTokenCred: StoredCredential,
): Promise<string | null> {
  // Only attempt refresh if the access token has an expiry and it's expired/expiring
  if (!accessTokenCred.expiresAt || !isTokenExpired(accessTokenCred.expiresAt)) {
    return null; // Token is still valid — no refresh needed
  }

  logger.info(
    { integrationId: integration.id },
    'Access token expired or expiring soon, attempting refresh',
  );

  // Need a refresh token
  const refreshTokenCred = await storage.getStoredCredentialByType(connection.id, 'refresh_token');
  if (!refreshTokenCred) {
    logger.warn(
      { integrationId: integration.id },
      'Access token expired but no refresh token available',
    );
    return null; // Fall through — the caller will use the (possibly expired) access token
  }

  // Need the provider's OAuth2 config for the token URL
  const provider = await storage.getIntegrationProvider(integration.providerId);
  if (!provider?.oauth2Config?.tokenUrl) {
    logger.warn(
      { integrationId: integration.id },
      'Cannot refresh token: provider missing oauth2Config.tokenUrl',
    );
    return null;
  }

  const refreshToken = decrypt(refreshTokenCred);
  const clientId = process.env[`${integration.providerId.toUpperCase()}_CLIENT_ID`] || '';
  const clientSecret = process.env[`${integration.providerId.toUpperCase()}_CLIENT_SECRET`] || '';

  try {
    const tokens = await refreshAccessToken(
      {
        clientId,
        clientSecret,
        authorizationUrl: provider.oauth2Config.authorizationUrl || '',
        tokenUrl: provider.oauth2Config.tokenUrl,
        redirectUri: '',
      },
      refreshToken,
    );

    // Invalidate old access token
    await storage.updateStoredCredential(accessTokenCred.id, {
      isValid: false,
      invalidatedAt: new Date(),
      invalidationReason: 'refreshed',
    });

    // Store new access token
    const encrypted = encryptCredential(tokens.access_token);
    await storage.createStoredCredential({
      connectionId: connection.id,
      credentialType: 'access_token',
      encryptedValue: encrypted.encryptedValue,
      encryptionKeyId: encrypted.encryptionKeyId,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      maskedValue: maskCredential(tokens.access_token),
      tokenType: tokens.token_type,
      scope: tokens.scope,
      expiresAt: tokens.expires_in ? calculateTokenExpiry(tokens.expires_in) : null,
    });

    // Rotate refresh token if the provider issued a new one
    if (tokens.refresh_token) {
      await storage.updateStoredCredential(refreshTokenCred.id, {
        isValid: false,
        invalidatedAt: new Date(),
        invalidationReason: 'rotated',
      });

      const newRefreshEncrypted = encryptCredential(tokens.refresh_token);
      await storage.createStoredCredential({
        connectionId: connection.id,
        credentialType: 'refresh_token',
        encryptedValue: newRefreshEncrypted.encryptedValue,
        encryptionKeyId: newRefreshEncrypted.encryptionKeyId,
        iv: newRefreshEncrypted.iv,
        authTag: newRefreshEncrypted.authTag,
        maskedValue: maskCredential(tokens.refresh_token),
      });
    }

    // Update connection timestamp
    await storage.updateIntegrationConnection(connection.id, {
      lastSuccessfulCallAt: new Date(),
    });

    logger.info({ integrationId: integration.id }, 'OAuth2 token refreshed successfully');
    return tokens.access_token;
  } catch (error) {
    logger.error(
      { err: error, integrationId: integration.id },
      'OAuth2 token refresh failed — falling back to existing token',
    );
    // Don't throw — let the caller try the existing (possibly expired) token.
    // The downstream API call will surface the 401 if it's truly dead.
    return null;
  }
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Resolve auth headers for an integration.
 *
 * Looks up the integration, verifies the connection is active, fetches and
 * decrypts stored credentials, refreshes OAuth2 tokens when needed, and
 * returns ready-to-use Authorization headers plus the base URL.
 *
 * @throws {AuthResolverError} with a descriptive code on any resolution failure
 */
export async function resolveAuthHeaders(
  integrationId: string,
  options: ResolveAuthOptions = {},
): Promise<ResolvedAuth> {
  // 1. Get the integration
  const integration = await storage.getCustomerIntegration(integrationId);
  if (!integration) {
    throw new AuthResolverError(
      'Integration not found',
      'INTEGRATION_NOT_FOUND',
      404,
    );
  }

  // 2. Get the connection
  const connection = await storage.getIntegrationConnectionByIntegration(integrationId);
  if (!connection) {
    throw new AuthResolverError(
      'No connection found. Please connect credentials first.',
      'CONNECTION_NOT_FOUND',
    );
  }

  if (!options.skipConnectionStatusCheck && connection.connectionStatus !== 'connected') {
    throw new AuthResolverError(
      'Integration not connected. Please connect credentials first.',
      'CONNECTION_NOT_CONNECTED',
    );
  }

  // 3. Fetch all credential types in parallel
  const [accessToken, apiKey, bearerToken, basicUsername, basicPassword] = await Promise.all([
    storage.getStoredCredentialByType(connection.id, 'access_token'),
    storage.getStoredCredentialByType(connection.id, 'api_key'),
    storage.getStoredCredentialByType(connection.id, 'bearer_token'),
    storage.getStoredCredentialByType(connection.id, 'basic_username'),
    storage.getStoredCredentialByType(connection.id, 'basic_password'),
  ]);

  const hasBasicAuth = basicUsername && basicPassword;
  const hasAnyCredential = accessToken || apiKey || bearerToken || hasBasicAuth;

  if (!hasAnyCredential) {
    throw new AuthResolverError(
      'No credentials found. Please configure credentials first.',
      'NO_CREDENTIALS',
    );
  }

  // 4. Build auth headers
  const headers: Record<string, string> = {};

  try {
    if (accessToken) {
      // 5. For OAuth2 access tokens, attempt refresh if expired
      const refreshedToken = await tryRefreshOAuth2Token(integration, connection, accessToken);
      const token = refreshedToken ?? decrypt(accessToken);
      headers['Authorization'] = `Bearer ${token}`;
    } else if (bearerToken) {
      headers['Authorization'] = `Bearer ${decrypt(bearerToken)}`;
    } else if (apiKey) {
      headers['Authorization'] = `Bearer ${decrypt(apiKey)}`;
    } else if (hasBasicAuth) {
      const username = decrypt(basicUsername);
      const password = decrypt(basicPassword);
      headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    }
  } catch (error) {
    // Decryption failure — likely bad encryption key or corrupted data
    logger.error(
      { err: error, integrationId },
      'Failed to decrypt credentials',
    );
    throw new AuthResolverError(
      'Failed to decrypt credentials. They may need to be re-entered.',
      'DECRYPT_FAILED',
      500,
    );
  }

  const baseUrl = integration.baseUrl.replace(/\/$/, '');

  logger.debug(
    { integrationId, authType: integration.authType, hasAuth: !!headers['Authorization'] },
    'Auth headers resolved',
  );

  return {
    headers,
    baseUrl,
    integration,
    connection,
  };
}
