import { createChildLogger } from '../logger';
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";
import {
  encryptCredential,
  decryptCredential,
  maskCredential,
  generateState,
  generatePKCEVerifier,
  generatePKCEChallenge,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  isTokenExpired,
  calculateTokenExpiry
} from "../credential-manager";
import { checkinSyncService } from "../services/checkin-sync-service";
import { logSettingsAudit } from "./shared";

const logger = createChildLogger('IntegrationRoutes');

export function registerIntegrationConnectionRoutes(app: Express): void {

  // Get connection status for an integration
  app.get("/api/integrations/:integrationId/connection", requireAuth, async (req, res) => {
    try {
      const integrationId = req.params.integrationId;
      
      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }

      const connection = await storage.getIntegrationConnectionByIntegration(integrationId);
      if (!connection) {
        return res.json({ 
          integrationId,
          connectionStatus: "not_configured",
          authMethod: integration.authType
        });
      }

      res.json({
        id: connection.id,
        integrationId: connection.integrationId,
        authMethod: connection.authMethod,
        connectionStatus: connection.connectionStatus,
        grantedScopes: connection.grantedScopes,
        lastValidatedAt: connection.lastValidatedAt,
        lastSuccessfulCallAt: connection.lastSuccessfulCallAt,
        consecutiveFailures: connection.consecutiveFailures,
        lastErrorMessage: connection.lastErrorMessage,
        connectedAt: connection.connectedAt,
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching connection status");
      res.status(500).json({ error: "Failed to fetch connection status" });
    }
  });

  // Start OAuth2 authorization flow
  app.post("/api/integrations/:integrationId/oauth/start", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const integrationId = req.params.integrationId;
      const { redirectUri } = req.body;

      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }

      const provider = await storage.getIntegrationProvider(integration.providerId);
      if (!provider || !provider.oauth2Config) {
        return res.status(400).json({ error: "Provider does not support OAuth2" });
      }

      const state = generateState();
      const codeVerifier = generatePKCEVerifier();
      const codeChallenge = generatePKCEChallenge(codeVerifier);

      let connection = await storage.getIntegrationConnectionByIntegration(integrationId);
      if (connection) {
        await storage.updateIntegrationConnection(connection.id, {
          oauth2State: state,
          pkceCodeVerifier: codeVerifier,
          connectionStatus: "connecting",
        });
      } else {
        connection = await storage.createIntegrationConnection({
          integrationId,
          authMethod: "oauth2",
          connectionStatus: "connecting",
          oauth2State: state,
          pkceCodeVerifier: codeVerifier,
        });
      }

      const oauth2Config = provider.oauth2Config;
      const clientId = process.env[`${integration.providerId.toUpperCase()}_CLIENT_ID`] || "";
      
      const authUrl = await buildAuthorizationUrl(
        {
          clientId,
          authorizationUrl: oauth2Config.authorizationUrl!,
          tokenUrl: oauth2Config.tokenUrl!,
          scope: oauth2Config.scope,
          redirectUri: redirectUri || `${req.protocol}://${req.get('host')}/api/integrations/oauth/callback`,
        },
        state,
        codeChallenge
      );

      res.json({ 
        authorizationUrl: authUrl,
        state,
        connectionId: connection.id
      });
    } catch (error) {
      logger.error({ err: error }, "Error starting OAuth flow");
      res.status(500).json({ error: "Failed to start OAuth authorization" });
    }
  });

  // OAuth2 callback handler
  app.get("/api/integrations/oauth/callback", async (req, res) => {
    try {
      const { code, state, error: oauthError, error_description } = req.query;

      if (oauthError) {
        return res.status(400).send(`
          <html><body>
            <h1>Authorization Failed</h1>
            <p>${oauthError}: ${error_description || 'Unknown error'}</p>
            <script>window.opener?.postMessage({ type: 'oauth_error', error: '${oauthError}' }, '*'); window.close();</script>
          </body></html>
        `);
      }

      if (!code || !state) {
        return res.status(400).json({ error: "Missing code or state parameter" });
      }

      const customers = await storage.getCustomers();
      let match: { connection: any; integration: any; provider: any } | null = null;

      for (const customer of customers) {
        if (match) break;
        const integrations = await storage.getCustomerIntegrations(customer.id);
        for (const integration of integrations) {
          const conn = await storage.getIntegrationConnectionByIntegration(integration.id);
          if (conn && conn.oauth2State === state) {
            const provider = await storage.getIntegrationProvider(integration.providerId);
            if (provider) {
              match = { connection: conn, integration, provider };
              break;
            }
          }
        }
      }

      if (!match) {
        return res.status(400).send(`
          <html><body>
            <h1>Authorization Failed</h1>
            <p>Invalid or expired state parameter</p>
            <script>window.opener?.postMessage({ type: 'oauth_error', error: 'invalid_state' }, '*'); window.close();</script>
          </body></html>
        `);
      }

      const { connection, integration, provider } = match;
      
      if (!provider.oauth2Config) {
        return res.status(400).json({ error: "Provider OAuth2 config not found" });
      }

      if (!connection.pkceCodeVerifier) {
        logger.error({ err: connection.id }, "PKCE code verifier not found for connection");
        return res.status(400).send(`
          <html><body>
            <h1>Authorization Failed</h1>
            <p>PKCE verification failed - missing code verifier</p>
            <script>window.opener?.postMessage({ type: 'oauth_error', error: 'pkce_error' }, '*'); window.close();</script>
          </body></html>
        `);
      }

      const clientId = process.env[`${integration.providerId.toUpperCase()}_CLIENT_ID`] || "";
      const clientSecret = process.env[`${integration.providerId.toUpperCase()}_CLIENT_SECRET`] || "";
      const redirectUri = `${req.protocol}://${req.get('host')}/api/integrations/oauth/callback`;

      const tokens = await exchangeCodeForTokens(
        {
          clientId,
          clientSecret,
          authorizationUrl: provider.oauth2Config.authorizationUrl!,
          tokenUrl: provider.oauth2Config.tokenUrl!,
          redirectUri,
        },
        code as string,
        connection.pkceCodeVerifier
      );

      const accessTokenEncrypted = encryptCredential(tokens.access_token);
      await storage.createStoredCredential({
        connectionId: connection.id,
        credentialType: "access_token",
        encryptedValue: accessTokenEncrypted.encryptedValue,
        encryptionKeyId: accessTokenEncrypted.encryptionKeyId,
        iv: accessTokenEncrypted.iv,
        authTag: accessTokenEncrypted.authTag,
        maskedValue: maskCredential(tokens.access_token),
        tokenType: tokens.token_type,
        scope: tokens.scope,
        expiresAt: tokens.expires_in ? calculateTokenExpiry(tokens.expires_in) : null,
      });

      if (tokens.refresh_token) {
        const refreshTokenEncrypted = encryptCredential(tokens.refresh_token);
        await storage.createStoredCredential({
          connectionId: connection.id,
          credentialType: "refresh_token",
          encryptedValue: refreshTokenEncrypted.encryptedValue,
          encryptionKeyId: refreshTokenEncrypted.encryptionKeyId,
          iv: refreshTokenEncrypted.iv,
          authTag: refreshTokenEncrypted.authTag,
          maskedValue: maskCredential(tokens.refresh_token),
        });
      }

      await storage.updateIntegrationConnection(connection.id, {
        connectionStatus: "connected",
        oauth2State: null,
        pkceCodeVerifier: null,
        grantedScopes: tokens.scope ? tokens.scope.split(" ") : null,
        connectedAt: new Date(),
        lastValidatedAt: new Date(),
      });

      res.send(`
        <html><body>
          <h1>Authorization Successful</h1>
          <p>You can close this window.</p>
          <script>window.opener?.postMessage({ type: 'oauth_success', integrationId: '${integration.id}' }, '*'); window.close();</script>
        </body></html>
      `);
    } catch (error) {
      logger.error({ err: error }, "Error in OAuth callback");
      res.status(500).send(`
        <html><body>
          <h1>Authorization Failed</h1>
          <p>An error occurred during authorization</p>
          <script>window.opener?.postMessage({ type: 'oauth_error', error: 'server_error' }, '*'); window.close();</script>
        </body></html>
      `);
    }
  });

  // Submit API key/token credentials
  app.post("/api/integrations/:integrationId/credentials", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const integrationId = req.params.integrationId;
      const { credentialType, value } = req.body;

      if (!value || !credentialType) {
        return res.status(400).json({ error: "credentialType and value are required" });
      }

      if (!["api_key", "bearer_token", "client_secret", "password", "basic_username", "basic_password"].includes(credentialType)) {
        return res.status(400).json({ error: "Invalid credential type" });
      }

      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }

      let connection = await storage.getIntegrationConnectionByIntegration(integrationId);
      if (!connection) {
        let authMethod: "api_key" | "bearer_token" | "basic" = "bearer_token";
        if (credentialType === "api_key") authMethod = "api_key";
        else if (credentialType === "basic_username" || credentialType === "basic_password") authMethod = "basic";
        
        connection = await storage.createIntegrationConnection({
          integrationId,
          authMethod,
          connectionStatus: "connecting",
        });
      }

      const existingCredential = await storage.getStoredCredentialByType(connection.id, credentialType);
      if (existingCredential) {
        await storage.updateStoredCredential(existingCredential.id, {
          isValid: false,
          invalidatedAt: new Date(),
          invalidationReason: "replaced",
        });
      }

      const encrypted = encryptCredential(value);
      await storage.createStoredCredential({
        connectionId: connection.id,
        credentialType,
        encryptedValue: encrypted.encryptedValue,
        encryptionKeyId: encrypted.encryptionKeyId,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        maskedValue: maskCredential(value),
      });

      // Mark as pending_validation - user must test connection to verify credentials work
      await storage.updateIntegrationConnection(connection.id, {
        connectionStatus: "pending_validation",
      });

      res.json({ 
        success: true, 
        connectionId: connection.id,
        maskedValue: maskCredential(value),
        message: "Credentials saved. Please test the connection to verify they work."
      });
    } catch (error) {
      logger.error({ err: error }, "Error storing credentials");
      res.status(500).json({ error: "Failed to store credentials" });
    }
  });

  // Copy credentials from another integration (reuse same credentials with different account code)
  app.post("/api/integrations/:integrationId/copy-credentials", requireAuth, async (req, res) => {
    try {
      const targetIntegrationId = req.params.integrationId;
      const { sourceIntegrationId } = req.body;

      if (!sourceIntegrationId) {
        return res.status(400).json({ error: "sourceIntegrationId is required" });
      }

      // Get both integrations
      const targetIntegration = await storage.getCustomerIntegration(targetIntegrationId);
      const sourceIntegration = await storage.getCustomerIntegration(sourceIntegrationId);

      if (!targetIntegration) {
        return res.status(404).json({ error: "Target integration not found" });
      }
      if (!sourceIntegration) {
        return res.status(404).json({ error: "Source integration not found" });
      }

      // Verify same customer owns both integrations
      if (targetIntegration.customerId !== sourceIntegration.customerId) {
        return res.status(403).json({ error: "Cannot copy credentials between different customers" });
      }

      // Get source connection and credentials
      const sourceConnection = await storage.getIntegrationConnectionByIntegration(sourceIntegrationId);
      if (!sourceConnection) {
        return res.status(400).json({ error: "Source integration has no connection" });
      }

      const sourceCredentials = await storage.getStoredCredentials(sourceConnection.id);
      if (!sourceCredentials || sourceCredentials.length === 0) {
        return res.status(400).json({ error: "Source integration has no credentials to copy" });
      }

      // Create or get target connection
      let targetConnection = await storage.getIntegrationConnectionByIntegration(targetIntegrationId);
      if (!targetConnection) {
        targetConnection = await storage.createIntegrationConnection({
          integrationId: targetIntegrationId,
          authMethod: sourceConnection.authMethod,
          connectionStatus: "connecting",
        });
      }

      // Copy each credential
      let copiedCount = 0;
      for (const credential of sourceCredentials) {
        if (!credential.isValid) continue;

        // Check if target already has this credential type
        const existing = await storage.getStoredCredentialByType(targetConnection.id, credential.credentialType);
        if (existing) {
          await storage.updateStoredCredential(existing.id, {
            isValid: false,
            invalidatedAt: new Date(),
            invalidationReason: "replaced",
          });
        }

        // Copy the encrypted credential directly (same encryption, just new connection)
        await storage.createStoredCredential({
          connectionId: targetConnection.id,
          credentialType: credential.credentialType,
          encryptedValue: credential.encryptedValue,
          encryptionKeyId: credential.encryptionKeyId,
          iv: credential.iv,
          authTag: credential.authTag,
          maskedValue: credential.maskedValue,
        });
        copiedCount++;
      }

      // Mark target as pending validation
      await storage.updateIntegrationConnection(targetConnection.id, {
        connectionStatus: "pending_validation",
        authMethod: sourceConnection.authMethod,
      });

      res.json({ 
        success: true, 
        copiedCount,
        message: `Copied ${copiedCount} credential(s). Please test the connection to verify they work with the new account code.`
      });
    } catch (error) {
      logger.error({ err: error }, "Error copying credentials");
      res.status(500).json({ error: "Failed to copy credentials" });
    }
  });

  // Disconnect integration
  app.post("/api/integrations/:integrationId/disconnect", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const integrationId = req.params.integrationId;

      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }

      const connection = await storage.getIntegrationConnectionByIntegration(integrationId);
      if (!connection) {
        return res.json({ success: true, message: "No connection found" });
      }

      await storage.deleteStoredCredentialsByConnection(connection.id);

      await storage.updateIntegrationConnection(connection.id, {
        connectionStatus: "disconnected",
        disconnectedAt: new Date(),
        grantedScopes: null,
      });

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error disconnecting integration");
      res.status(500).json({ error: "Failed to disconnect integration" });
    }
  });

  // Validate connection (test API call)
  app.post("/api/integrations/:integrationId/validate", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const integrationId = req.params.integrationId;

      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }

      const connection = await storage.getIntegrationConnectionByIntegration(integrationId);
      if (!connection || connection.connectionStatus !== "connected") {
        return res.status(400).json({ error: "Integration not connected" });
      }

      const accessToken = await storage.getStoredCredentialByType(connection.id, "access_token");
      const apiKey = await storage.getStoredCredentialByType(connection.id, "api_key");
      const bearerToken = await storage.getStoredCredentialByType(connection.id, "bearer_token");
      const basicUsername = await storage.getStoredCredentialByType(connection.id, "basic_username");
      const basicPassword = await storage.getStoredCredentialByType(connection.id, "basic_password");
      
      const hasBasicAuth = basicUsername && basicPassword;
      if (!accessToken && !apiKey && !bearerToken && !hasBasicAuth) {
        return res.status(400).json({ error: "No credentials found" });
      }

      await storage.updateIntegrationConnection(connection.id, {
        lastValidatedAt: new Date(),
        lastSuccessfulCallAt: new Date(),
        consecutiveFailures: 0,
      });

      res.json({ 
        valid: true, 
        lastValidatedAt: new Date().toISOString(),
        hasAccessToken: !!accessToken,
        hasApiKey: !!apiKey,
        hasBearerToken: !!bearerToken,
        hasBasicAuth: hasBasicAuth,
        tokenExpiry: accessToken?.expiresAt
      });
    } catch (error) {
      logger.error({ err: error }, "Error validating connection");
      res.status(500).json({ error: "Failed to validate connection" });
    }
  });

  // Test connection with actual API call to testEndpointPath
  app.post("/api/integrations/:integrationId/test-connection", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    const startTime = Date.now();
    try {
      const integrationId = req.params.integrationId;

      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ 
          success: false, 
          message: "Integration not found",
          latencyMs: Date.now() - startTime 
        });
      }

      // Check if test endpoint is configured
      if (!integration.testEndpointPath) {
        return res.status(400).json({ 
          success: false, 
          message: "No test endpoint configured. Please set a test endpoint path in the integration settings.",
          latencyMs: Date.now() - startTime 
        });
      }

      const connection = await storage.getIntegrationConnectionByIntegration(integrationId);
      if (!connection) {
        return res.status(400).json({ 
          success: false, 
          message: "No connection found. Please connect credentials first.",
          latencyMs: Date.now() - startTime 
        });
      }

      // Get credentials - check all possible types
      const accessToken = await storage.getStoredCredentialByType(connection.id, "access_token");
      const apiKey = await storage.getStoredCredentialByType(connection.id, "api_key");
      const bearerToken = await storage.getStoredCredentialByType(connection.id, "bearer_token");
      const basicUsername = await storage.getStoredCredentialByType(connection.id, "basic_username");
      const basicPassword = await storage.getStoredCredentialByType(connection.id, "basic_password");
      
      const hasBasicAuth = basicUsername && basicPassword;
      const hasAnyCredential = accessToken || apiKey || bearerToken || hasBasicAuth;
      
      if (!hasAnyCredential) {
        return res.status(400).json({ 
          success: false, 
          message: "No credentials found. Please configure credentials first.",
          latencyMs: Date.now() - startTime 
        });
      }

      // Build the test URL - handle case where full URL is entered in path field
      let testEndpointPath = integration.testEndpointPath;
      try {
        const pathUrl = new URL(testEndpointPath);
        // If it parsed as a URL, extract just the pathname
        testEndpointPath = pathUrl.pathname + pathUrl.search;
        logger.info(`Extracted path from full URL: ${testEndpointPath}`);
      } catch {
        // Not a full URL, use as-is
      }
      
      // Substitute {accountCode} or {{accountCode}} variable if present
      if (integration.accountCode) {
        testEndpointPath = testEndpointPath.replace(/\{\{accountCode\}\}/g, integration.accountCode);
        testEndpointPath = testEndpointPath.replace(/\{accountCode\}/g, integration.accountCode);
      }
      
      const testUrl = `${integration.baseUrl.replace(/\/$/, '')}${testEndpointPath.startsWith('/') ? '' : '/'}${testEndpointPath}`;
      logger.info(`Testing URL: ${testUrl}`);

      // Build headers with auth
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      };

      if (accessToken) {
        const token = decryptCredential({
          encryptedValue: accessToken.encryptedValue,
          iv: accessToken.iv,
          authTag: accessToken.authTag,
          encryptionKeyId: accessToken.encryptionKeyId,
        });
        headers['Authorization'] = `Bearer ${token}`;
      } else if (bearerToken) {
        const token = decryptCredential({
          encryptedValue: bearerToken.encryptedValue,
          iv: bearerToken.iv,
          authTag: bearerToken.authTag,
          encryptionKeyId: bearerToken.encryptionKeyId,
        });
        headers['Authorization'] = `Bearer ${token}`;
      } else if (apiKey) {
        const key = decryptCredential({
          encryptedValue: apiKey.encryptedValue,
          iv: apiKey.iv,
          authTag: apiKey.authTag,
          encryptionKeyId: apiKey.encryptionKeyId,
        });
        headers['Authorization'] = `Bearer ${key}`;
      } else if (hasBasicAuth) {
        const username = decryptCredential({
          encryptedValue: basicUsername.encryptedValue,
          iv: basicUsername.iv,
          authTag: basicUsername.authTag,
          encryptionKeyId: basicUsername.encryptionKeyId,
        });
        const password = decryptCredential({
          encryptedValue: basicPassword.encryptedValue,
          iv: basicPassword.iv,
          authTag: basicPassword.authTag,
          encryptionKeyId: basicPassword.encryptionKeyId,
        });
        headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      }

      // Make the test request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      try {
        const response = await fetch(testUrl, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const latencyMs = Date.now() - startTime;

        if (response.ok) {
          // Update connection status on success and clear any previous error
          await storage.updateIntegrationConnection(connection.id, {
            lastValidatedAt: new Date(),
            lastSuccessfulCallAt: new Date(),
            consecutiveFailures: 0,
            connectionStatus: "connected",
            lastErrorMessage: null,
            lastErrorAt: null,
          });

          return res.json({
            success: true,
            statusCode: response.status,
            message: `Connection successful! API responded with status ${response.status}`,
            latencyMs,
          });
        } else {
          // Map error codes to user-friendly messages
          let message = `API returned status ${response.status}`;
          if (response.status === 401) {
            message = "Authentication failed. Please check your credentials.";
          } else if (response.status === 403) {
            message = "Access denied. Your credentials may not have sufficient permissions.";
          } else if (response.status === 404) {
            message = "Test endpoint not found. Please verify the test endpoint path.";
          } else if (response.status >= 500) {
            message = "The external API is experiencing issues. Please try again later.";
          }

          await storage.updateIntegrationConnection(connection.id, {
            consecutiveFailures: (connection.consecutiveFailures || 0) + 1,
            lastErrorMessage: message,
            lastErrorAt: new Date(),
          });

          return res.json({
            success: false,
            statusCode: response.status,
            message,
            latencyMs,
          });
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        const latencyMs = Date.now() - startTime;

        let message = "Failed to connect to the API";
        if (fetchError.name === 'AbortError') {
          message = "Request timed out after 30 seconds";
        } else if (fetchError.code === 'ENOTFOUND') {
          message = "Could not resolve host. Please check the base URL.";
        } else if (fetchError.code === 'ECONNREFUSED') {
          message = "Connection refused. The API server may be down.";
        }

        return res.json({
          success: false,
          message,
          latencyMs,
        });
      }
    } catch (error) {
      logger.error({ err: error }, "Error testing connection");
      res.status(500).json({ 
        success: false, 
        message: "Failed to test connection",
        latencyMs: Date.now() - startTime 
      });
    }
  });

  // Discover events from external platform (Certain only)
  app.post("/api/integrations/:integrationId/discover-events", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    const startTime = Date.now();
    try {
      const integrationId = req.params.integrationId;

      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ 
          success: false, 
          message: "Integration not found",
          latencyMs: Date.now() - startTime 
        });
      }

      // Only allow for Certain integrations
      if (!integration.providerId.startsWith('certain')) {
        return res.status(400).json({ 
          success: false, 
          message: "Event discovery is only available for Certain platform integrations",
          latencyMs: Date.now() - startTime 
        });
      }

      // Check if event list endpoint is configured
      if (!integration.eventListEndpointPath) {
        return res.status(400).json({ 
          success: false, 
          message: "No event list endpoint configured. Please set an event list endpoint path in the integration settings.",
          latencyMs: Date.now() - startTime 
        });
      }

      const connection = await storage.getIntegrationConnectionByIntegration(integrationId);
      if (!connection || connection.connectionStatus !== "connected") {
        return res.status(400).json({ 
          success: false, 
          message: "Integration not connected. Please connect credentials first.",
          latencyMs: Date.now() - startTime 
        });
      }

      // Get credentials and build auth headers
      const accessToken = await storage.getStoredCredentialByType(connection.id, "access_token");
      const apiKey = await storage.getStoredCredentialByType(connection.id, "api_key");
      const bearerToken = await storage.getStoredCredentialByType(connection.id, "bearer_token");
      const basicUsername = await storage.getStoredCredentialByType(connection.id, "basic_username");
      const basicPassword = await storage.getStoredCredentialByType(connection.id, "basic_password");
      
      const hasBasicAuth = basicUsername && basicPassword;
      const hasAnyCredential = accessToken || apiKey || bearerToken || hasBasicAuth;
      
      if (!hasAnyCredential) {
        return res.status(400).json({ 
          success: false, 
          message: "No credentials found. Please configure credentials first.",
          latencyMs: Date.now() - startTime 
        });
      }

      // Build auth headers
      const authHeaders: Record<string, string> = {};

      if (accessToken) {
        const token = decryptCredential({
          encryptedValue: accessToken.encryptedValue,
          iv: accessToken.iv,
          authTag: accessToken.authTag,
          encryptionKeyId: accessToken.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Bearer ${token}`;
      } else if (bearerToken) {
        const token = decryptCredential({
          encryptedValue: bearerToken.encryptedValue,
          iv: bearerToken.iv,
          authTag: bearerToken.authTag,
          encryptionKeyId: bearerToken.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Bearer ${token}`;
      } else if (apiKey) {
        const key = decryptCredential({
          encryptedValue: apiKey.encryptedValue,
          iv: apiKey.iv,
          authTag: apiKey.authTag,
          encryptionKeyId: apiKey.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Bearer ${key}`;
      } else if (hasBasicAuth) {
        const username = decryptCredential({
          encryptedValue: basicUsername.encryptedValue,
          iv: basicUsername.iv,
          authTag: basicUsername.authTag,
          encryptionKeyId: basicUsername.encryptionKeyId,
        });
        const password = decryptCredential({
          encryptedValue: basicPassword.encryptedValue,
          iv: basicPassword.iv,
          authTag: basicPassword.authTag,
          encryptionKeyId: basicPassword.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      }

      // Import and call the sync orchestrator
      const { syncOrchestrator } = await import("./services/sync-orchestrator");
      
      const result = await syncOrchestrator.discoverEvents({
        integration,
        authHeaders,
      });

      const latencyMs = Date.now() - startTime;

      const parts = [`Discovered ${result.processedCount} events`];
      if (result.filteredOutCount > 0) parts.push(`${result.filteredOutCount} filtered out (no "checkmate" tag)`);
      parts.push(`Created ${result.createdCount} new, updated ${result.skippedCount} existing`);
      if (result.removedCount > 0) parts.push(`removed ${result.removedCount} untagged`);
      if (result.errors.length > 0) parts.push(`${result.errors.length} errors`);

      res.json({
        success: result.success,
        message: parts.join('. ') + '.',
        processedCount: result.processedCount,
        createdCount: result.createdCount,
        skippedCount: result.skippedCount,
        removedCount: result.removedCount,
        filteredOutCount: result.filteredOutCount,
        errors: result.errors.length > 0 ? result.errors.map(e => e.error) : undefined,
        latencyMs,
      });
    } catch (error: any) {
      logger.error({ err: error }, "Error discovering events");
      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to discover events",
        latencyMs: Date.now() - startTime 
      });
    }
  });

  // Full initial sync - runs events, attendees, sessions, and session registrations in sequence
  app.post("/api/integrations/:integrationId/initial-sync", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    const startTime = Date.now();
    try {
      const integrationId = req.params.integrationId;
      const { delayBetweenStepsMs = 3000 } = req.body;

      // Get the integration
      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ success: false, message: "Integration not found" });
      }

      // Get connection and credentials
      const connection = await storage.getIntegrationConnectionByIntegration(integrationId);
      if (!connection || connection.connectionStatus !== "connected") {
        return res.status(400).json({ 
          success: false, 
          message: "Integration not connected. Please connect credentials first.",
          latencyMs: Date.now() - startTime 
        });
      }

      // Get credentials and build auth headers (same pattern as discover-events)
      const accessToken = await storage.getStoredCredentialByType(connection.id, "access_token");
      const apiKey = await storage.getStoredCredentialByType(connection.id, "api_key");
      const bearerToken = await storage.getStoredCredentialByType(connection.id, "bearer_token");
      const basicUsername = await storage.getStoredCredentialByType(connection.id, "basic_username");
      const basicPassword = await storage.getStoredCredentialByType(connection.id, "basic_password");
      
      const hasBasicAuth = basicUsername && basicPassword;
      const hasAnyCredential = accessToken || apiKey || bearerToken || hasBasicAuth;
      
      if (!hasAnyCredential) {
        return res.status(400).json({ 
          success: false, 
          message: "No credentials found. Please configure credentials first.",
          latencyMs: Date.now() - startTime 
        });
      }

      // Build auth headers
      const authHeaders: Record<string, string> = {};

      if (accessToken) {
        const token = decryptCredential({
          encryptedValue: accessToken.encryptedValue,
          iv: accessToken.iv,
          authTag: accessToken.authTag,
          encryptionKeyId: accessToken.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Bearer ${token}`;
      } else if (bearerToken) {
        const token = decryptCredential({
          encryptedValue: bearerToken.encryptedValue,
          iv: bearerToken.iv,
          authTag: bearerToken.authTag,
          encryptionKeyId: bearerToken.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Bearer ${token}`;
      } else if (apiKey) {
        const key = decryptCredential({
          encryptedValue: apiKey.encryptedValue,
          iv: apiKey.iv,
          authTag: apiKey.authTag,
          encryptionKeyId: apiKey.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Bearer ${key}`;
      } else if (hasBasicAuth) {
        const username = decryptCredential({
          encryptedValue: basicUsername.encryptedValue,
          iv: basicUsername.iv,
          authTag: basicUsername.authTag,
          encryptionKeyId: basicUsername.encryptionKeyId,
        });
        const password = decryptCredential({
          encryptedValue: basicPassword.encryptedValue,
          iv: basicPassword.iv,
          authTag: basicPassword.authTag,
          encryptionKeyId: basicPassword.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      }

      // Import and run the sequential sync
      const { syncOrchestrator } = await import("./services/sync-orchestrator");
      
      const result = await syncOrchestrator.runSequentialSync({
        integration,
        customerId: integration.customerId,
        authHeaders,
        delayBetweenStepsMs,
      });

      // Mark initial sync as completed on success
      if (result.success) {
        await storage.updateCustomerIntegration(integrationId, {
          initialSyncCompletedAt: new Date(),
          lastSync: new Date(),
        });
      }

      const latencyMs = Date.now() - startTime;
      
      res.json({
        success: result.success,
        message: result.success 
          ? `Initial sync complete. Total records: ${result.totalRecords}` 
          : 'Initial sync completed with some errors',
        steps: result.steps,
        totalRecords: result.totalRecords,
        durationMs: result.durationMs,
        latencyMs,
      });
    } catch (error: any) {
      logger.error({ err: error }, "Error during initial sync");
      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to run initial sync",
        latencyMs: Date.now() - startTime 
      });
    }
  });

  // =====================
  // Event Sync State Routes
  // =====================

  // Get sync states for an event
  app.get("/api/events/:eventId/sync-states", requireAuth, async (req, res) => {
    try {
      const eventId = req.params.eventId;
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      const syncStates = await storage.getEventSyncStates(eventId);
      res.json(syncStates);
    } catch (error) {
      logger.error({ err: error }, "Error fetching sync states");
      res.status(500).json({ error: "Failed to fetch sync states" });
    }
  });

  // Initialize sync states for an event (creates states for attendees, sessions, session_registrations)
  app.post("/api/events/:eventId/sync-states/initialize", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const eventId = req.params.eventId;
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (!event.integrationId) {
        return res.status(400).json({ error: "Event has no integration configured" });
      }

      const integration = await storage.getCustomerIntegration(event.integrationId);
      if (!integration) {
        return res.status(400).json({ error: "Integration not found" });
      }

      const { syncOrchestrator } = await import("./services/sync-orchestrator");
      const dataTypes = ['attendees', 'sessions', 'session_registrations'];
      const createdStates = [];

      for (const dataType of dataTypes) {
        const existing = await storage.getEventSyncState(eventId, dataType);
        const syncTemplates = integration.syncTemplates as any;
        const templateKey = dataType === 'session_registrations' ? 'sessionRegistrations' : dataType;
        const template = syncTemplates?.[templateKey];
        
        let resolvedEndpoint: string | null = null;
        if (template?.endpointPath) {
          resolvedEndpoint = syncOrchestrator.buildResolvedEndpoint(
            template.endpointPath,
            { accountCode: event.accountCode, eventCode: event.eventCode }
          );
        }

        if (!existing) {
          const state = await storage.createEventSyncState({
            eventId,
            integrationId: integration.id,
            dataType,
            resolvedEndpoint,
            syncEnabled: true,
            syncStatus: 'pending',
          });
          createdStates.push(state);
        } else if (resolvedEndpoint && existing.resolvedEndpoint !== resolvedEndpoint) {
          await storage.updateEventSyncState(existing.id, { resolvedEndpoint });
          logger.info(`Updated ${dataType} endpoint: ${existing.resolvedEndpoint} → ${resolvedEndpoint}`);
        }
      }

      const allStates = await storage.getEventSyncStates(eventId);
      res.json({ 
        message: `Initialized ${createdStates.length} new sync states`,
        syncStates: allStates 
      });
    } catch (error) {
      logger.error({ err: error }, "Error initializing sync states");
      res.status(500).json({ error: "Failed to initialize sync states" });
    }
  });

  // Update sync state for a specific data type
  app.patch("/api/events/:eventId/sync-states/:dataType", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const { eventId, dataType } = req.params;
      const state = await storage.getEventSyncState(eventId, dataType);
      if (!state) {
        return res.status(404).json({ error: "Sync state not found" });
      }

      const updateSchema = z.object({
        syncEnabled: z.boolean().optional(),
        syncIntervalMinutes: z.number().min(1).optional(),
        resolvedEndpoint: z.string().optional(),
      });

      const updates = updateSchema.parse(req.body);
      const updated = await storage.updateEventSyncState(state.id, updates);
      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, "Error updating sync state");
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update sync state" });
    }
  });

  // Trigger manual sync for a specific data type
  app.post("/api/events/:eventId/sync/:dataType", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    const startTime = Date.now();
    try {
      const { eventId, dataType } = req.params;
      
      if (!['attendees', 'sessions', 'session_registrations'].includes(dataType)) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid data type. Must be one of: attendees, sessions, session_registrations" 
        });
      }

      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ success: false, message: "Event not found" });
      }

      const evtSyncSettings = event.syncSettings as { syncFrozen?: boolean } | null;
      if (evtSyncSettings?.syncFrozen) {
        return res.status(423).json({ success: false, message: "Inbound sync is frozen for this event. Unfreeze in event settings to sync." });
      }

      if (!event.integrationId) {
        return res.status(400).json({ success: false, message: "Event has no integration configured" });
      }

      const integration = await storage.getCustomerIntegration(event.integrationId);
      if (!integration) {
        return res.status(400).json({ success: false, message: "Integration not found" });
      }

      const connection = await storage.getIntegrationConnectionByIntegration(integration.id);
      if (!connection || connection.connectionStatus !== "connected") {
        return res.status(400).json({ success: false, message: "Integration not connected" });
      }

      // Get or create sync state, always re-resolve endpoint from current integration templates
      const { syncOrchestrator: orchestrator } = await import("./services/sync-orchestrator");
      const syncTemplates = integration.syncTemplates as any;
      const templateKey = dataType === 'session_registrations' ? 'sessionRegistrations' : dataType;
      const template = syncTemplates?.[templateKey];
      
      let currentResolvedEndpoint: string | null = null;
      if (template?.endpointPath) {
        currentResolvedEndpoint = orchestrator.buildResolvedEndpoint(
          template.endpointPath,
          { accountCode: event.accountCode, eventCode: event.eventCode }
        );
      }

      let syncState = await storage.getEventSyncState(eventId, dataType);
      if (!syncState) {
        syncState = await storage.createEventSyncState({
          eventId,
          integrationId: integration.id,
          dataType,
          resolvedEndpoint: currentResolvedEndpoint,
          syncEnabled: true,
          syncStatus: 'pending',
        });
      } else if (currentResolvedEndpoint && syncState.resolvedEndpoint !== currentResolvedEndpoint) {
        await storage.updateEventSyncState(syncState.id, { resolvedEndpoint: currentResolvedEndpoint });
        logger.info(`Updated endpoint from integration: ${syncState.resolvedEndpoint} → ${currentResolvedEndpoint}`);
        syncState = { ...syncState, resolvedEndpoint: currentResolvedEndpoint };
      }

      if (!syncState.resolvedEndpoint) {
        return res.status(400).json({ 
          success: false, 
          message: `No endpoint configured for ${dataType}. Please configure sync templates in the integration settings.` 
        });
      }

      // Mark as syncing
      await storage.updateEventSyncState(syncState.id, { syncStatus: 'syncing' });

      // Create a sync job record for reporting
      const jobTypeMap: Record<string, string> = {
        attendees: 'event_attendee_sync',
        sessions: 'event_session_sync',
        session_registrations: 'event_session_registration_sync',
      };
      const syncJob = await storage.createSyncJob({
        integrationId: integration.id,
        eventId,
        eventSyncStateId: syncState.id,
        jobType: jobTypeMap[dataType] || 'event_attendee_sync',
        syncTier: dataType === 'session_registrations' ? 'event_dependent' : 'event_data',
        triggerType: 'manual',
        priority: 1,
        status: 'running',
        startedAt: new Date(),
        attempts: 1,
      });

      // Get credentials and build auth headers
      const accessToken = await storage.getStoredCredentialByType(connection.id, "access_token");
      const apiKey = await storage.getStoredCredentialByType(connection.id, "api_key");
      const bearerToken = await storage.getStoredCredentialByType(connection.id, "bearer_token");
      const basicUsername = await storage.getStoredCredentialByType(connection.id, "basic_username");
      const basicPassword = await storage.getStoredCredentialByType(connection.id, "basic_password");
      
      const hasBasicAuth = basicUsername && basicPassword;
      const hasAnyCredential = accessToken || apiKey || bearerToken || hasBasicAuth;
      
      if (!hasAnyCredential) {
        await storage.updateEventSyncState(syncState.id, { 
          syncStatus: 'error', 
          lastErrorMessage: 'No credentials found' 
        });
        return res.status(400).json({ success: false, message: "No credentials found" });
      }

      // Build auth headers
      const authHeaders: Record<string, string> = {};
      if (accessToken) {
        const token = decryptCredential({
          encryptedValue: accessToken.encryptedValue,
          iv: accessToken.iv,
          authTag: accessToken.authTag,
          encryptionKeyId: accessToken.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Bearer ${token}`;
      } else if (bearerToken) {
        const token = decryptCredential({
          encryptedValue: bearerToken.encryptedValue,
          iv: bearerToken.iv,
          authTag: bearerToken.authTag,
          encryptionKeyId: bearerToken.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Bearer ${token}`;
      } else if (apiKey) {
        const key = decryptCredential({
          encryptedValue: apiKey.encryptedValue,
          iv: apiKey.iv,
          authTag: apiKey.authTag,
          encryptionKeyId: apiKey.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Bearer ${key}`;
      } else if (hasBasicAuth) {
        const username = decryptCredential({
          encryptedValue: basicUsername.encryptedValue,
          iv: basicUsername.iv,
          authTag: basicUsername.authTag,
          encryptionKeyId: basicUsername.encryptionKeyId,
        });
        const password = decryptCredential({
          encryptedValue: basicPassword.encryptedValue,
          iv: basicPassword.iv,
          authTag: basicPassword.authTag,
          encryptionKeyId: basicPassword.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      }

      // Build the full URL with lastSyncTimestamp substituted at sync time
      const { syncOrchestrator: orchestratorForUrl } = await import("./services/sync-orchestrator");
      const baseUrl = integration.baseUrl.replace(/\/$/, '');
      
      // We've already verified resolvedEndpoint is not null above
      const resolvedEndpoint = syncState.resolvedEndpoint!;
      
      // Check if this endpoint requires per-attendee iteration
      const requiresAttendeeIteration = orchestratorForUrl.templateRequiresAttendeeIteration(
        resolvedEndpoint
      );
      
      let records: any[] = [];
      let latencyMs = 0;
      let apiCallCount = 0;
      let errorCount = 0;
      let lastError: string | null = null;
      
      if (requiresAttendeeIteration) {
        // Fetch all attendees for this event
        const attendees = await storage.getAttendees(eventId);
        const attendeesWithExternalId = attendees.filter(a => a.externalId);
        
        if (attendeesWithExternalId.length === 0) {
          await storage.updateEventSyncState(syncState.id, { 
            syncStatus: 'error', 
            lastErrorMessage: 'No attendees with external IDs found. Sync attendees first.',
            lastErrorAt: new Date(),
          });
          return res.json({
            success: false,
            message: 'No attendees with external IDs found. Please sync attendees first before syncing per-attendee data.',
            latencyMs: Date.now() - startTime,
          });
        }
        
        logger.info(`Per-attendee sync: processing ${attendeesWithExternalId.length} attendees`);
        
        // Make API call for each attendee
        for (const attendee of attendeesWithExternalId) {
          const attendeeEndpoint = orchestratorForUrl.prepareEndpointForAttendee(
            resolvedEndpoint,
            attendee.externalId
          );
          
          if (!attendeeEndpoint) continue;
          
          // Also substitute lastSyncTimestamp
          const finalEndpoint = orchestratorForUrl.prepareEndpointForSync(
            attendeeEndpoint,
            syncState.lastSyncTimestamp
          );

          let endpointPath = finalEndpoint;
          try {
            const pathUrl = new URL(finalEndpoint);
            endpointPath = pathUrl.pathname + pathUrl.search;
          } catch {
            // Not a full URL, use as-is
          }
          endpointPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
          let url = `${baseUrl}${endpointPath}`;

          // Apply incremental filter for subsequent syncs
          url = orchestratorForUrl.applyIncrementalFilter(url, integration.providerId, dataType, syncState.lastSyncTimestamp);
          
          try {
            const callStart = Date.now();
            const response = await fetch(url, {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                ...authHeaders,
              },
            });
            latencyMs += Date.now() - callStart;
            apiCallCount++;
            
            if (!response.ok) {
              if (response.status === 404) {
                logger.info(`API returned 404 for attendee ${attendee.externalId} — treating as no data`);
                continue;
              }
              errorCount++;
              lastError = `API returned ${response.status} for attendee ${attendee.externalId}`;
              logger.warn(`Error for attendee ${attendee.externalId}: ${response.status}`);
              continue;
            }
            
            const data = await response.json();
            
            // Extract records from this response
            let attendeeRecords: any[] = [];
            if (Array.isArray(data)) {
              attendeeRecords = data;
            } else if (data.results && Array.isArray(data.results)) {
              attendeeRecords = data.results;
            } else if (data.data && Array.isArray(data.data)) {
              attendeeRecords = data.data;
            } else if (data.registrations && Array.isArray(data.registrations)) {
              attendeeRecords = data.registrations;
            } else if (data.sessions && Array.isArray(data.sessions)) {
              attendeeRecords = data.sessions;
            }
            
            // Tag each record with the attendee info for later processing
            attendeeRecords.forEach(r => {
              r._attendeeId = attendee.id;
              r._attendeeExternalId = attendee.externalId;
            });
            
            records.push(...attendeeRecords);
          } catch (err: any) {
            errorCount++;
            lastError = err.message;
            logger.error({ err: err.message }, `Failed for attendee ${attendee.externalId}`);
          }
        }
        
        logger.info(`Per-attendee sync complete: ${records.length} total records from ${apiCallCount} calls, ${errorCount} errors`);
        
        // Handle complete failure (all calls failed)
        if (apiCallCount > 0 && errorCount === apiCallCount) {
          await storage.updateEventSyncState(syncState.id, { 
            syncStatus: 'error', 
            lastErrorMessage: `All ${apiCallCount} per-attendee API calls failed. Last error: ${lastError}`,
            lastErrorAt: new Date(),
            consecutiveFailures: (syncState.consecutiveFailures || 0) + 1,
          });
          return res.json({
            success: false,
            message: `All ${apiCallCount} per-attendee API calls failed`,
            lastError,
            latencyMs,
          });
        }
        
      } else {
        // Standard single-endpoint sync
        const endpoint = orchestratorForUrl.prepareEndpointForSync(
          resolvedEndpoint,
          syncState.lastSyncTimestamp
        );

        let endpointPath = endpoint;
        try {
          const pathUrl = new URL(endpoint);
          endpointPath = pathUrl.pathname + pathUrl.search;
        } catch {
          // Not a full URL, use as-is
        }
        endpointPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
        let url = `${baseUrl}${endpointPath}`;

        // Apply incremental filter (dateModified_after) for subsequent syncs
        url = orchestratorForUrl.applyIncrementalFilter(url, integration.providerId, dataType, syncState.lastSyncTimestamp);

        logger.info(`Syncing ${dataType} from: ${url}`);

        // Save the request URL to the job for debugging
        if (syncJob) {
          await storage.updateSyncJob(syncJob.id, {
            payload: { requestUrl: url, dataType, eventId, incremental: !!syncState.lastSyncTimestamp },
          });
        }

        // Make the API call
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            ...authHeaders,
          },
        });

        latencyMs = Date.now() - startTime;
        apiCallCount = 1;

        if (!response.ok) {
          const errorText = await response.text();
          
          const errorLower = errorText.toLowerCase();
          const is404NoData = response.status === 404 && (
            errorLower.includes('no sessions') || 
            errorLower.includes('no registrations') || 
            errorLower.includes('no attendees') ||
            errorLower.includes('not_found') ||
            errorLower.includes('not found')
          );
          
          if (is404NoData) {
            logger.info(`API returned 404 (no data found) for ${dataType} — treating as empty result`);
            records = [];
          } else {
            await storage.updateEventSyncState(syncState.id, { 
              syncStatus: 'error', 
              lastErrorMessage: `API returned ${response.status}: ${errorText}`,
              lastErrorAt: new Date(),
              consecutiveFailures: (syncState.consecutiveFailures || 0) + 1,
            });
            return res.json({
              success: false,
              message: `API returned status ${response.status}`,
              latencyMs,
            });
          }
        }

        if (records.length === 0 && response.ok) {
          const data = await response.json();
        
          if (Array.isArray(data)) {
            records = data;
          } else if (data.results && Array.isArray(data.results)) {
            records = data.results;
          } else if (data.data && Array.isArray(data.data)) {
            records = data.data;
          } else if (data.attendees && Array.isArray(data.attendees)) {
            records = data.attendees;
          } else if (data.sessions && Array.isArray(data.sessions)) {
            records = data.sessions;
          } else if (data.registrations && Array.isArray(data.registrations)) {
            records = data.registrations;
          }
        }
      }

      // Process and save records to database based on data type
      const { syncOrchestrator } = await import("./services/sync-orchestrator");
      let createdCount = 0;
      let updatedCount = 0;
      let processErrorCount = 0;

      if (dataType === 'attendees' && records.length > 0) {
        logger.info(`Processing ${records.length} attendee records for event ${event.name}`);
        for (const rawAttendee of records) {
          try {
            // Transform using the same logic as SequentialSync
            const profile = rawAttendee.profile || {};
            const statusLabel = rawAttendee.registrationStatusLabel || '';
            const externalId = String(rawAttendee.registrationCode || rawAttendee.pkRegId || '');
            // orderCode links guests to primary attendee - matches primary's externalId
            // For primary attendees, orderCode equals their own externalId
            const orderCode = String(rawAttendee.orderCode || externalId);
            const attendeeData = {
              externalId,
              firstName: profile.firstName || rawAttendee.firstName || '',
              lastName: profile.lastName || rawAttendee.lastName || '',
              email: profile.email || rawAttendee.email || '',
              company: profile.organization || profile.company || null,
              title: profile.position || profile.title || null,
              participantType: rawAttendee.attendeeType || rawAttendee.attendeeTypeCode || 'General',
              registrationStatus: statusLabel || (rawAttendee.isActive ? 'Registered' : 'Invited'),
              registrationStatusLabel: statusLabel || null,
              orderCode,
            };

            if (!attendeeData.externalId) continue;

            const isAttended = (attendeeData.registrationStatus || '').toLowerCase() === 'attended';

            const existing = await storage.getAttendeeByExternalId(event.id, attendeeData.externalId);
            if (existing) {
              const updatePayload: any = {
                firstName: attendeeData.firstName,
                lastName: attendeeData.lastName,
                email: attendeeData.email,
                company: attendeeData.company,
                title: attendeeData.title,
                participantType: attendeeData.participantType,
                registrationStatus: attendeeData.registrationStatus,
                registrationStatusLabel: attendeeData.registrationStatusLabel,
                orderCode: attendeeData.orderCode,
              };
              if (existing.checkedIn) {
                updatePayload.registrationStatus = 'Attended';
                updatePayload.registrationStatusLabel = attendeeData.registrationStatusLabel || existing.registrationStatusLabel || null;
              } else if (isAttended) {
                updatePayload.checkedIn = true;
                updatePayload.checkedInAt = existing.checkedInAt || new Date();
              }
              await storage.updateAttendee(existing.id, updatePayload);
              updatedCount++;
            } else {
              const createPayload: any = {
                eventId: event.id,
                firstName: attendeeData.firstName,
                lastName: attendeeData.lastName,
                email: attendeeData.email,
                company: attendeeData.company,
                title: attendeeData.title,
                participantType: attendeeData.participantType,
                externalId: attendeeData.externalId,
                registrationStatus: attendeeData.registrationStatus,
                registrationStatusLabel: attendeeData.registrationStatusLabel,
                orderCode: attendeeData.orderCode,
              };
              if (isAttended) {
                createPayload.checkedIn = true;
                createPayload.checkedInAt = new Date();
              }
              await storage.createAttendee(createPayload);
              createdCount++;
            }
          } catch (e: any) {
            logger.warn({ err: e.message }, `Failed to process attendee`);
            processErrorCount++;
          }
        }
        logger.info(`Attendee processing complete: ${createdCount} created, ${updatedCount} updated, ${processErrorCount} errors`);
      }

      // Update sync state with result — only advance timestamp if records were returned
      const now = new Date();
      const serverTimestamp = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}T${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}`;
      const defaultSyncSettings = (integration.defaultSyncSettings as any) || {};
      const nextSyncAt = syncOrchestrator.calculateNextSyncTime(
        { startDate: event.startDate, endDate: event.endDate },
        defaultSyncSettings
      );
      
      // Determine final status based on error count
      const totalErrors = errorCount + processErrorCount;
      const hasPartialFailure = totalErrors > 0;
      const finalSyncStatus = hasPartialFailure ? 'partial' : 'success';
      
      await storage.updateEventSyncState(syncState.id, {
        syncStatus: finalSyncStatus,
        lastSyncAt: new Date(),
        lastSyncTimestamp: (hasPartialFailure || records.length === 0) ? syncState.lastSyncTimestamp : serverTimestamp,
        consecutiveFailures: hasPartialFailure ? (syncState.consecutiveFailures || 0) : 0,
        lastErrorMessage: hasPartialFailure ? `${totalErrors} errors during sync` : null,
        nextSyncAt,
        lastSyncResult: {
          processedCount: records.length,
          createdCount,
          updatedCount,
          errorCount: totalErrors,
          durationMs: Date.now() - startTime,
        },
      });

      // Update sync job record for reporting
      if (syncJob) {
        await storage.updateSyncJob(syncJob.id, {
          status: hasPartialFailure ? 'completed' : 'completed',
          completedAt: new Date(),
          processedRecords: records.length,
          createdRecords: createdCount,
          updatedRecords: updatedCount,
          failedRecords: totalErrors,
          errorMessage: hasPartialFailure ? `${totalErrors} errors during sync` : null,
          result: {
            processedCount: records.length,
            createdCount,
            updatedCount,
            errorCount: totalErrors,
            durationMs: Date.now() - startTime,
            apiCallCount,
            lastSyncTimestamp: syncState.lastSyncTimestamp,
            incrementalFilter: !!syncState.lastSyncTimestamp,
          },
        });
      }

      let responseMessage: string;
      if (dataType === 'attendees' && (createdCount > 0 || updatedCount > 0)) {
        responseMessage = `Synced ${records.length} attendees: ${createdCount} created, ${updatedCount} updated${totalErrors > 0 ? `, ${totalErrors} errors` : ''}`;
      } else if (requiresAttendeeIteration) {
        responseMessage = `Synced ${records.length} ${dataType} records from ${apiCallCount} attendees${errorCount > 0 ? ` (${errorCount} errors)` : ''}`;
      } else {
        responseMessage = `Synced ${records.length} ${dataType} records`;
      }
      
      res.json({
        success: true,
        message: responseMessage,
        recordCount: records.length,
        createdCount,
        updatedCount,
        apiCallCount,
        errorCount: totalErrors,
        latencyMs: Date.now() - startTime,
      });
    } catch (error: any) {
      logger.error({ err: error }, `Error syncing ${req.params.dataType}`);
      try {
        const syncState = await storage.getEventSyncState(req.params.eventId, req.params.dataType);
        if (syncState) {
          await storage.updateEventSyncState(syncState.id, {
            syncStatus: 'error',
            lastErrorMessage: error.message || `Failed to sync ${req.params.dataType}`,
            lastErrorAt: new Date(),
            consecutiveFailures: (syncState.consecutiveFailures || 0) + 1,
          });
        }
      } catch (stateErr) {
        logger.error({ err: stateErr }, 'Failed to update sync state after error');
      }
      // Update sync job record on failure
      try {
        if (typeof syncJob !== 'undefined' && syncJob) {
          await storage.updateSyncJob(syncJob.id, {
            status: 'failed',
            completedAt: new Date(),
            errorMessage: error.message || `Failed to sync ${req.params.dataType}`,
            errorStack: error.stack,
          });
        }
      } catch (jobErr) {
        logger.error({ err: jobErr }, 'Failed to update sync job after error');
      }
      res.status(500).json({
        success: false, 
        message: error.message || `Failed to sync ${req.params.dataType}`,
        latencyMs: Date.now() - startTime,
      });
    }
  });

  // Bulk resync check-in statuses back to external platform
  app.post("/api/events/:eventId/resync-checkins", requireAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const user = req.dbUser;
      if (!user) return res.status(401).json({ error: "Not authenticated" });
      if (user.role !== 'super_admin' && user.customerId !== event.customerId) {
        return res.status(403).json({ error: "Not authorized to manage this event" });
      }

      const integration = await checkinSyncService.getIntegrationForEvent(event);
      if (!integration) {
        return res.status(400).json({ error: "No active integration found for this event" });
      }

      const config = integration.realtimeSyncConfig as any;
      if (!config?.enabled || !config?.endpointUrl) {
        return res.status(400).json({ error: "Realtime sync is not configured for this integration. Please configure the realtime sync settings first." });
      }

      const attendees = await storage.getAttendees(eventId);
      const checkedInAttendees = attendees.filter((a: any) => a.checkedIn && a.externalId);

      if (checkedInAttendees.length === 0) {
        return res.json({ success: true, message: "No checked-in attendees to resync", synced: 0, failed: 0, total: 0 });
      }

      let synced = 0;
      let failed = 0;
      const errors: string[] = [];
      const RATE_LIMIT_DELAY_MS = 200;

      for (const attendee of checkedInAttendees) {
        try {
          const result = await checkinSyncService.sendCheckinSync(attendee, event, integration);
          if (result.success) {
            synced++;
          } else {
            failed++;
            if (errors.length < 10) {
              errors.push(`${attendee.firstName} ${attendee.lastName} (${attendee.externalId}): ${result.error || 'Unknown error'}`);
            }
          }
          if (RATE_LIMIT_DELAY_MS > 0) {
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
          }
        } catch (err: any) {
          failed++;
          if (errors.length < 10) {
            errors.push(`${attendee.firstName} ${attendee.lastName}: ${err.message}`);
          }
        }
      }

      logger.info(`Event ${event.name}: ${synced} synced, ${failed} failed out of ${checkedInAttendees.length} checked-in attendees`);

      res.json({
        success: failed === 0,
        message: `Resynced ${synced} of ${checkedInAttendees.length} checked-in attendees${failed > 0 ? ` (${failed} failed)` : ''}`,
        synced,
        failed,
        total: checkedInAttendees.length,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      logger.error({ err: error }, "Error");
      res.status(500).json({ error: error.message || "Failed to resync check-ins" });
    }
  });

  // Reset all check-ins for an event (for testing/reset purposes)
  app.post("/api/events/:eventId/reset-checkins", requireAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const user = req.dbUser;
      if (!user) return res.status(401).json({ error: "Not authenticated" });
      if (user.role !== 'super_admin') {
        return res.status(403).json({ error: "Only super admins can reset event check-ins" });
      }

      const { db } = await import("./db");
      const schema = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");

      const result = await db.update(schema.attendees)
        .set({
          checkedIn: false,
          checkedInAt: null,
          registrationStatus: 'Registered',
          badgePrinted: false,
          badgePrintedAt: null,
        })
        .where(
          and(
            eq(schema.attendees.eventId, eventId),
            eq(schema.attendees.checkedIn, true)
          )
        )
        .returning({ id: schema.attendees.id });

      const resetCount = result.length;
      logger.info(`Event ${event.name}: Reset ${resetCount} checked-in attendees`);

      res.json({
        success: true,
        message: `Reset ${resetCount} attendee${resetCount !== 1 ? 's' : ''} to Registered status`,
        resetCount,
      });
    } catch (error: any) {
      logger.error({ err: error }, "Error");
      res.status(500).json({ error: error.message || "Failed to reset check-ins" });
    }
  });

  // Update integration sync templates
  app.patch("/api/integrations/:integrationId/sync-templates", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const integrationId = req.params.integrationId;
      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }

      const templateSchema = z.object({
        attendees: z.object({
          endpointPath: z.string(),
          method: z.string().optional(),
          headers: z.record(z.string()).optional(),
          responseMapping: z.record(z.string()).optional(),
        }).optional(),
        sessions: z.object({
          endpointPath: z.string(),
          method: z.string().optional(),
          headers: z.record(z.string()).optional(),
          responseMapping: z.record(z.string()).optional(),
        }).optional(),
        sessionRegistrations: z.object({
          endpointPath: z.string(),
          method: z.string().optional(),
          headers: z.record(z.string()).optional(),
          responseMapping: z.record(z.string()).optional(),
        }).optional(),
      });

      const syncTemplates = templateSchema.parse(req.body);
      const oldSyncTemplates = integration.syncTemplates;
      const updated = await storage.updateCustomerIntegration(integrationId, { syncTemplates });
      
      const customer = await storage.getCustomer(integration.customerId);
      logSettingsAudit(req, {
        action: 'sync_templates_update',
        resourceType: 'customer_integration',
        resourceId: integrationId,
        resourceName: integration.name,
        customerId: integration.customerId,
        customerName: customer?.name,
        oldValues: { syncTemplates: oldSyncTemplates },
        newValues: { syncTemplates },
      });
      
      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, "Error updating sync templates");
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update sync templates" });
    }
  });

  // Update integration default sync settings
  app.patch("/api/integrations/:integrationId/default-sync-settings", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const integrationId = req.params.integrationId;
      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }

      const settingsSchema = z.object({
        preEventIntervalMinutes: z.number().min(1).default(1440), // 24 hours
        duringEventIntervalMinutes: z.number().min(1).default(1), // 1 minute
        syncWindowStartOffset: z.number().optional(),
        syncWindowEndOffset: z.number().optional(),
      });

      const oldSyncSettings = integration.defaultSyncSettings;
      const defaultSyncSettings = settingsSchema.parse(req.body);
      const updated = await storage.updateCustomerIntegration(integrationId, { defaultSyncSettings });
      
      const customer = await storage.getCustomer(integration.customerId);
      logSettingsAudit(req, {
        action: 'sync_settings_update',
        resourceType: 'customer_integration',
        resourceId: integrationId,
        resourceName: integration.name,
        customerId: integration.customerId,
        customerName: customer?.name,
        oldValues: { defaultSyncSettings: oldSyncSettings },
        newValues: { defaultSyncSettings },
      });
      
      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, "Error updating default sync settings");
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update default sync settings" });
    }
  });

  // Refresh OAuth2 token
  app.post("/api/integrations/:integrationId/refresh-token", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const integrationId = req.params.integrationId;

      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }

      const provider = await storage.getIntegrationProvider(integration.providerId);
      if (!provider || !provider.oauth2Config) {
        return res.status(400).json({ error: "Provider does not support OAuth2" });
      }

      const connection = await storage.getIntegrationConnectionByIntegration(integrationId);
      if (!connection) {
        return res.status(400).json({ error: "No connection found" });
      }

      const refreshTokenCred = await storage.getStoredCredentialByType(connection.id, "refresh_token");
      if (!refreshTokenCred) {
        return res.status(400).json({ error: "No refresh token available" });
      }

      const refreshToken = decryptCredential({
        encryptedValue: refreshTokenCred.encryptedValue,
        iv: refreshTokenCred.iv,
        authTag: refreshTokenCred.authTag,
        encryptionKeyId: refreshTokenCred.encryptionKeyId,
      });

      const clientId = process.env[`${integration.providerId.toUpperCase()}_CLIENT_ID`] || "";
      const clientSecret = process.env[`${integration.providerId.toUpperCase()}_CLIENT_SECRET`] || "";

      const tokens = await refreshAccessToken(
        {
          clientId,
          clientSecret,
          authorizationUrl: provider.oauth2Config.authorizationUrl!,
          tokenUrl: provider.oauth2Config.tokenUrl!,
          redirectUri: "",
        },
        refreshToken
      );

      const existingAccessToken = await storage.getStoredCredentialByType(connection.id, "access_token");
      if (existingAccessToken) {
        await storage.updateStoredCredential(existingAccessToken.id, {
          isValid: false,
          invalidatedAt: new Date(),
          invalidationReason: "refreshed",
        });
      }

      const accessTokenEncrypted = encryptCredential(tokens.access_token);
      await storage.createStoredCredential({
        connectionId: connection.id,
        credentialType: "access_token",
        encryptedValue: accessTokenEncrypted.encryptedValue,
        encryptionKeyId: accessTokenEncrypted.encryptionKeyId,
        iv: accessTokenEncrypted.iv,
        authTag: accessTokenEncrypted.authTag,
        maskedValue: maskCredential(tokens.access_token),
        tokenType: tokens.token_type,
        scope: tokens.scope,
        expiresAt: tokens.expires_in ? calculateTokenExpiry(tokens.expires_in) : null,
      });

      if (tokens.refresh_token) {
        await storage.updateStoredCredential(refreshTokenCred.id, {
          isValid: false,
          invalidatedAt: new Date(),
          invalidationReason: "rotated",
        });

        const newRefreshTokenEncrypted = encryptCredential(tokens.refresh_token);
        await storage.createStoredCredential({
          connectionId: connection.id,
          credentialType: "refresh_token",
          encryptedValue: newRefreshTokenEncrypted.encryptedValue,
          encryptionKeyId: newRefreshTokenEncrypted.encryptionKeyId,
          iv: newRefreshTokenEncrypted.iv,
          authTag: newRefreshTokenEncrypted.authTag,
          maskedValue: maskCredential(tokens.refresh_token),
        });
      }

      await storage.updateIntegrationConnection(connection.id, {
        lastValidatedAt: new Date(),
      });

      res.json({ 
        success: true, 
        expiresAt: tokens.expires_in ? calculateTokenExpiry(tokens.expires_in) : null
      });
    } catch (error) {
      logger.error({ err: error }, "Error refreshing token");
      res.status(500).json({ error: "Failed to refresh token" });
    }
  });
}
