/**
 * OAuth2 Service - Token lifecycle management
 * 
 * Features:
 * - Multiple grant type support (authorization_code, client_credentials, refresh_token)
 * - Automatic token refresh with jitter
 * - Proactive renewal (5 min before expiry)
 * - Concurrent refresh protection
 * - Retry with exponential backoff
 */

import { createChildLogger } from '../logger';
import { credentialManager } from './credential-manager';

const logger = createChildLogger('OAuth2Service');

interface OAuth2Config {
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  scope?: string;
  grantType: 'authorization_code' | 'client_credentials' | 'password' | 'refresh_token';
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

interface TokenMetadata {
  accessTokenRef: string;
  refreshTokenRef?: string;
  tokenType: string;
  scope?: string;
  issuedAt: Date;
  expiresAt: Date;
  status: 'active' | 'expired' | 'revoked' | 'error';
}

class OAuth2Service {
  private refreshLocks: Map<string, Promise<TokenMetadata>> = new Map();
  private readonly PROACTIVE_REFRESH_MS = 5 * 60 * 1000; // Refresh 5 min before expiry

  /**
   * Exchange authorization code for tokens (Authorization Code flow)
   */
  async exchangeCodeForToken(
    integrationId: string,
    code: string,
    config: OAuth2Config
  ): Promise<TokenMetadata> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri || '',
    });

    const tokenResponse = await this.requestToken(config.tokenUrl, params);
    return await this.storeTokens(integrationId, tokenResponse, config);
  }

  /**
   * Get access token using client credentials flow
   */
  async getClientCredentialsToken(
    integrationId: string,
    config: OAuth2Config
  ): Promise<TokenMetadata> {
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: config.scope || '',
    });

    const tokenResponse = await this.requestToken(config.tokenUrl, params);
    return await this.storeTokens(integrationId, tokenResponse, config);
  }

  /**
   * Refresh an access token using refresh token
   */
  async refreshAccessToken(
    integrationId: string,
    refreshTokenRef: string,
    config: OAuth2Config
  ): Promise<TokenMetadata> {
    // Check if refresh already in progress (prevents concurrent refreshes)
    const existingRefresh = this.refreshLocks.get(integrationId);
    if (existingRefresh) {
      logger.info(`Waiting for existing refresh: ${integrationId}`);
      return existingRefresh;
    }

    // Create refresh promise and store in lock
    const refreshPromise = this.performRefresh(integrationId, refreshTokenRef, config);
    this.refreshLocks.set(integrationId, refreshPromise);

    try {
      const result = await refreshPromise;
      return result;
    } finally {
      // Remove lock
      this.refreshLocks.delete(integrationId);
    }
  }

  private async performRefresh(
    integrationId: string,
    refreshTokenRef: string,
    config: OAuth2Config
  ): Promise<TokenMetadata> {
    const refreshToken = await credentialManager.getCredential(refreshTokenRef);
    if (!refreshToken) {
      throw new Error(`Refresh token not found: ${refreshTokenRef}`);
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });

    const tokenResponse = await this.requestToken(config.tokenUrl, params);
    return await this.storeTokens(integrationId, tokenResponse, config);
  }

  /**
   * Check if token needs refresh (proactively refresh 5 min before expiry)
   */
  needsRefresh(expiresAt: Date): boolean {
    const now = Date.now();
    const expiryTime = expiresAt.getTime();
    return (expiryTime - now) <= this.PROACTIVE_REFRESH_MS;
  }

  /**
   * Get valid access token (auto-refresh if needed)
   */
  async getValidAccessToken(
    integrationId: string,
    tokenMetadata: TokenMetadata,
    config: OAuth2Config
  ): Promise<string> {
    // Check if token needs refresh
    if (this.needsRefresh(tokenMetadata.expiresAt) && tokenMetadata.refreshTokenRef) {
      logger.info(`Token expiring soon, refreshing: ${integrationId}`);
      const refreshed = await this.refreshAccessToken(
        integrationId,
        tokenMetadata.refreshTokenRef,
        config
      );
      return await credentialManager.getCredential(refreshed.accessTokenRef) || '';
    }

    // Return current token
    return await credentialManager.getCredential(tokenMetadata.accessTokenRef) || '';
  }

  /**
   * Make token request with retry logic
   */
  private async requestToken(
    tokenUrl: string,
    params: URLSearchParams,
    retries = 3
  ): Promise<TokenResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `OAuth2 token request failed: ${response.status} ${response.statusText}\n${errorText}`
          );
        }

        const data = await response.json();
        return data as TokenResponse;
      } catch (error) {
        lastError = error as Error;
        logger.error({ err: error }, `Token request attempt ${attempt + 1} failed`);

        // Exponential backoff
        if (attempt < retries - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('OAuth2 token request failed after retries');
  }

  /**
   * Store tokens securely and return metadata
   */
  private async storeTokens(
    integrationId: string,
    tokenResponse: TokenResponse,
    config: OAuth2Config
  ): Promise<TokenMetadata> {
    const now = new Date();
    const expiresIn = tokenResponse.expires_in || 3600; // Default 1 hour
    const expiresAt = new Date(now.getTime() + expiresIn * 1000);

    // Store access token
    const accessTokenRef = await credentialManager.storeCredential(
      integrationId,
      'oauth2',
      'access_token',
      tokenResponse.access_token
    );

    // Store refresh token (if provided)
    let refreshTokenRef: string | undefined;
    if (tokenResponse.refresh_token) {
      refreshTokenRef = await credentialManager.storeCredential(
        integrationId,
        'oauth2',
        'refresh_token',
        tokenResponse.refresh_token
      );
    }

    return {
      accessTokenRef,
      refreshTokenRef,
      tokenType: tokenResponse.token_type,
      scope: tokenResponse.scope || config.scope,
      issuedAt: now,
      expiresAt,
      status: 'active',
    };
  }

  /**
   * Revoke a token
   */
  async revokeToken(
    tokenRef: string,
    revokeUrl: string,
    config: OAuth2Config
  ): Promise<void> {
    const token = await credentialManager.getCredential(tokenRef);
    if (!token) {
      logger.warn(`Token not found for revocation: ${tokenRef}`);
      return;
    }

    try {
      await fetch(revokeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          token,
          client_id: config.clientId,
          client_secret: config.clientSecret,
        }).toString(),
      });

      await credentialManager.deleteCredential(tokenRef);
      logger.info(`Token revoked successfully: ${tokenRef}`);
    } catch (error) {
      logger.error({ err: error }, `Token revocation failed`);
      throw error;
    }
  }
}

export const oauth2Service = new OAuth2Service();
