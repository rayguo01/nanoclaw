import fs from 'fs';
import path from 'path';
import pino from 'pino';
import { DATA_DIR } from './config.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: { target: 'pino-pretty', options: { colorize: true } }
});

const TOKENS_DIR = path.join(DATA_DIR, 'tokens');

// Token cache in memory
const tokenCache: Record<string, { token: string; expiresAt: number }> = {};

interface NangoTokenResponse {
  access_token: string;
  expires_at?: string;
  refresh_token?: string;
  raw?: Record<string, unknown>;
}

interface TokenData {
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  provider: string;
  connection_id: string;
  updated_at: string;
}

/**
 * Get the Nango server URL from environment
 */
function getNangoServerUrl(): string {
  return process.env.NANGO_SERVER_URL || 'http://localhost:3003';
}

/**
 * Get the Nango secret key from environment
 */
function getNangoSecretKey(): string {
  const key = process.env.NANGO_SECRET_KEY;
  if (!key) {
    throw new Error('NANGO_SECRET_KEY not set');
  }
  return key;
}

/**
 * Ensure tokens directory exists
 */
function ensureTokensDir(): void {
  fs.mkdirSync(TOKENS_DIR, { recursive: true });
}

/**
 * Get the token file path for a provider and connection
 */
function getTokenPath(provider: string, connectionId?: string): string {
  const filename = connectionId ? `${provider}-${connectionId}.json` : `${provider}.json`;
  return path.join(TOKENS_DIR, filename);
}

/**
 * Load token from disk
 */
function loadToken(provider: string, connectionId?: string): TokenData | null {
  const tokenPath = getTokenPath(provider, connectionId);
  try {
    if (fs.existsSync(tokenPath)) {
      return JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
    }
  } catch (err) {
    logger.warn({ provider, connectionId, err }, 'Failed to load token from disk');
  }
  return null;
}

/**
 * Save token to disk
 */
function saveToken(provider: string, connectionId: string, data: TokenData): void {
  ensureTokensDir();
  const tokenPath = getTokenPath(provider, connectionId);
  fs.writeFileSync(tokenPath, JSON.stringify(data, null, 2));
  logger.debug({ provider, connectionId }, 'Token saved to disk');
}

/**
 * Get a valid access token for a provider/connection.
 * Fetches from Nango if needed and caches locally.
 */
export async function getToken(provider: string, connectionId: string): Promise<string | null> {
  const cacheKey = `${provider}:${connectionId}`;

  // Check memory cache first
  const cached = tokenCache[cacheKey];
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  // Check disk cache
  const diskToken = loadToken(provider, connectionId);
  if (diskToken) {
    const expiresAt = diskToken.expires_at ? new Date(diskToken.expires_at).getTime() : 0;
    if (expiresAt > Date.now()) {
      tokenCache[cacheKey] = { token: diskToken.access_token, expiresAt };
      return diskToken.access_token;
    }
  }

  // Fetch from Nango
  try {
    const serverUrl = getNangoServerUrl();
    const secretKey = getNangoSecretKey();

    const response = await fetch(
      `${serverUrl}/connection/${connectionId}?provider_config_key=${provider}`,
      {
        headers: {
          'Authorization': `Bearer ${secretKey}`
        }
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        logger.debug({ provider, connectionId }, 'No connection found in Nango');
        return null;
      }
      throw new Error(`Nango API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as NangoTokenResponse;

    if (!data.access_token) {
      logger.warn({ provider, connectionId }, 'No access token in Nango response');
      return null;
    }

    // Calculate expiry (default 1 hour if not specified)
    const expiresAt = data.expires_at
      ? new Date(data.expires_at).getTime()
      : Date.now() + 3600 * 1000;

    // Save to disk
    const tokenData: TokenData = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: new Date(expiresAt).toISOString(),
      provider,
      connection_id: connectionId,
      updated_at: new Date().toISOString()
    };
    saveToken(provider, connectionId, tokenData);

    // Update memory cache
    tokenCache[cacheKey] = { token: data.access_token, expiresAt };

    logger.info({ provider, connectionId }, 'Token fetched from Nango');
    return data.access_token;

  } catch (err) {
    logger.error({ provider, connectionId, err }, 'Failed to fetch token from Nango');
    return null;
  }
}

/**
 * Initiate OAuth flow for a provider.
 * Returns the authorization URL that the user should visit.
 */
export async function initiateOAuth(
  provider: string,
  connectionId: string,
  scopes?: string[]
): Promise<string> {
  const serverUrl = getNangoServerUrl();
  const publicKey = process.env.NANGO_PUBLIC_KEY;

  if (!publicKey) {
    throw new Error('NANGO_PUBLIC_KEY not set');
  }

  // Build the authorization URL
  const params = new URLSearchParams({
    public_key: publicKey,
    connection_id: connectionId
  });

  if (scopes && scopes.length > 0) {
    params.set('scopes', scopes.join(','));
  }

  const authUrl = `${serverUrl}/oauth/connect/${provider}?${params.toString()}`;

  logger.info({ provider, connectionId, scopes }, 'OAuth flow initiated');
  return authUrl;
}

/**
 * Check if a connection exists and is valid
 */
export async function hasValidConnection(provider: string, connectionId: string): Promise<boolean> {
  const token = await getToken(provider, connectionId);
  return token !== null;
}

/**
 * Delete a connection (local cache only, doesn't affect Nango)
 */
export function deleteLocalToken(provider: string, connectionId: string): void {
  const cacheKey = `${provider}:${connectionId}`;
  delete tokenCache[cacheKey];

  const tokenPath = getTokenPath(provider, connectionId);
  try {
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
      logger.info({ provider, connectionId }, 'Local token deleted');
    }
  } catch (err) {
    logger.warn({ provider, connectionId, err }, 'Failed to delete local token');
  }
}
