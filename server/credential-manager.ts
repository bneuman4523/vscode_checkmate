import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY is required. Set it in environment variables.');
  }
  return crypto.createHash('sha256').update(key).digest();
}

export interface EncryptedCredential {
  encryptedValue: string;
  iv: string;
  authTag: string;
  encryptionKeyId: string;
}

export interface DecryptedCredential {
  value: string;
  metadata?: {
    tokenType?: string;
    scope?: string;
    expiresAt?: Date;
  };
}

export function encryptCredential(plaintext: string): EncryptedCredential {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encryptedValue: encrypted,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    encryptionKeyId: 'v1'
  };
}

export function decryptCredential(encrypted: EncryptedCredential): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(encrypted.iv, 'base64');
  const authTag = Buffer.from(encrypted.authTag, 'base64');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted.encryptedValue, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

export function maskCredential(credential: string): string {
  if (!credential || credential.length < 8) {
    return '****';
  }
  const visibleStart = credential.slice(0, 4);
  const visibleEnd = credential.slice(-4);
  return `${visibleStart}...${visibleEnd}`;
}

export function generateState(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function generatePKCEVerifier(): string {
  return crypto.randomBytes(64).toString('base64url');
}

export function generatePKCEChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export function validateState(stored: string, received: string): boolean {
  if (!stored || !received) return false;
  return crypto.timingSafeEqual(
    Buffer.from(stored, 'utf8'),
    Buffer.from(received, 'utf8')
  );
}

export interface OAuth2Config {
  clientId: string;
  clientSecret?: string;
  authorizationUrl: string;
  tokenUrl: string;
  scope?: string;
  redirectUri: string;
}

export interface OAuth2TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

export async function buildAuthorizationUrl(
  config: OAuth2Config,
  state: string,
  codeChallenge: string
): Promise<string> {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  
  if (config.scope) {
    params.set('scope', config.scope);
  }
  
  return `${config.authorizationUrl}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  config: OAuth2Config,
  code: string,
  codeVerifier: string
): Promise<OAuth2TokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier,
    client_id: config.clientId,
  });
  
  if (config.clientSecret) {
    params.set('client_secret', config.clientSecret);
  }
  
  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: params.toString(),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${response.status} - ${error}`);
  }
  
  return response.json();
}

export async function refreshAccessToken(
  config: OAuth2Config,
  refreshToken: string
): Promise<OAuth2TokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
  });
  
  if (config.clientSecret) {
    params.set('client_secret', config.clientSecret);
  }
  
  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: params.toString(),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${response.status} - ${error}`);
  }
  
  return response.json();
}

export async function revokeToken(
  revokeUrl: string,
  token: string,
  tokenTypeHint: 'access_token' | 'refresh_token' = 'access_token'
): Promise<boolean> {
  try {
    const params = new URLSearchParams({
      token: token,
      token_type_hint: tokenTypeHint,
    });
    
    const response = await fetch(revokeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    
    return response.ok;
  } catch {
    return false;
  }
}

export function isTokenExpired(expiresAt: Date | null, bufferMinutes: number = 5): boolean {
  if (!expiresAt) return true;
  const now = new Date();
  const buffer = bufferMinutes * 60 * 1000;
  return expiresAt.getTime() - buffer <= now.getTime();
}

export function calculateTokenExpiry(expiresIn: number): Date {
  return new Date(Date.now() + expiresIn * 1000);
}
