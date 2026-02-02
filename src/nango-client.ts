/**
 * Nango OAuth Client
 *
 * Interacts with self-hosted Nango server for OAuth token management.
 */

import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: { target: 'pino-pretty', options: { colorize: true } }
});

const NANGO_HOST = process.env.NANGO_HOST || 'http://localhost:3003';
const NANGO_SERVER_URL = process.env.NANGO_SERVER_URL || NANGO_HOST; // Public-facing URL for OAuth
const NANGO_SECRET_KEY = process.env.NANGO_SECRET_KEY || '';
const NANGO_PUBLIC_KEY = process.env.NANGO_PUBLIC_KEY || '';

// Default user ID for single-user setup
const DEFAULT_CONNECTION_ID = 'main';

interface NangoToken {
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  raw?: Record<string, unknown>;
}

interface NangoConnection {
  id: number;
  connection_id: string;
  provider_config_key: string;
  created_at: string;
  updated_at: string;
}

/**
 * Check if a provider is configured in Nango
 */
export async function isProviderConfigured(provider: string): Promise<boolean> {
  try {
    const response = await fetch(`${NANGO_HOST}/config/${provider}`, {
      headers: {
        'Authorization': `Bearer ${NANGO_SECRET_KEY}`,
      },
    });
    return response.ok;
  } catch (err) {
    logger.error({ err, provider }, 'Failed to check provider configuration');
    return false;
  }
}

/**
 * Check if user has an active connection for a provider
 */
export async function hasConnection(provider: string, connectionId: string = DEFAULT_CONNECTION_ID): Promise<boolean> {
  try {
    const response = await fetch(
      `${NANGO_HOST}/connection/${connectionId}?provider_config_key=${provider}`,
      {
        headers: {
          'Authorization': `Bearer ${NANGO_SECRET_KEY}`,
        },
      }
    );
    return response.ok;
  } catch (err) {
    logger.error({ err, provider, connectionId }, 'Failed to check connection');
    return false;
  }
}

/**
 * Get OAuth token for a provider
 */
export async function getToken(provider: string, connectionId: string = DEFAULT_CONNECTION_ID): Promise<NangoToken | null> {
  try {
    const response = await fetch(
      `${NANGO_HOST}/connection/${connectionId}?provider_config_key=${provider}`,
      {
        headers: {
          'Authorization': `Bearer ${NANGO_SECRET_KEY}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        logger.debug({ provider, connectionId }, 'No connection found');
        return null;
      }
      throw new Error(`Failed to get token: ${response.status}`);
    }

    const data = await response.json() as { credentials: NangoToken };
    return data.credentials;
  } catch (err) {
    logger.error({ err, provider, connectionId }, 'Failed to get token');
    return null;
  }
}

/**
 * Get OAuth authorization URL for connecting a provider
 */
export function getAuthUrl(provider: string, connectionId: string = DEFAULT_CONNECTION_ID, scopes?: string[]): string {
  const params = new URLSearchParams({
    connection_id: connectionId,
    public_key: NANGO_PUBLIC_KEY,
  });
  // Add scopes if provided
  if (scopes && scopes.length > 0) {
    params.set('scopes', scopes.join(','));
  }
  // Use public-facing URL for OAuth (users visit this in browser)
  return `${NANGO_SERVER_URL}/oauth/connect/${provider}?${params.toString()}`;
}

/**
 * Delete a connection
 */
export async function deleteConnection(provider: string, connectionId: string = DEFAULT_CONNECTION_ID): Promise<boolean> {
  try {
    const response = await fetch(
      `${NANGO_HOST}/connection/${connectionId}?provider_config_key=${provider}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${NANGO_SECRET_KEY}`,
        },
      }
    );
    return response.ok;
  } catch (err) {
    logger.error({ err, provider, connectionId }, 'Failed to delete connection');
    return false;
  }
}

/**
 * List all connections for a user
 */
export async function listConnections(connectionId: string = DEFAULT_CONNECTION_ID): Promise<NangoConnection[]> {
  try {
    const response = await fetch(
      `${NANGO_HOST}/connections?connection_id=${connectionId}`,
      {
        headers: {
          'Authorization': `Bearer ${NANGO_SECRET_KEY}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to list connections: ${response.status}`);
    }

    const data = await response.json() as { connections: NangoConnection[] };
    return data.connections || [];
  } catch (err) {
    logger.error({ err, connectionId }, 'Failed to list connections');
    return [];
  }
}

/**
 * Get Nango public key for frontend
 */
export function getPublicKey(): string {
  return NANGO_PUBLIC_KEY;
}

/**
 * Get Nango host URL for frontend
 */
export function getNangoHost(): string {
  // Return the public-facing URL for frontend
  return process.env.NANGO_SERVER_URL || NANGO_HOST;
}

/**
 * Sync token from Nango to local file for container access
 */
export async function syncTokenToFile(provider: string, connectionId: string = DEFAULT_CONNECTION_ID): Promise<boolean> {
  try {
    const token = await getToken(provider, connectionId);
    if (!token) {
      logger.warn({ provider, connectionId }, 'No token to sync');
      return false;
    }

    // Write token to data/tokens directory
    const tokensDir = process.env.TOKENS_DIR || './data/tokens';
    const fs = await import('fs');
    const path = await import('path');

    fs.mkdirSync(tokensDir, { recursive: true });
    const tokenFile = path.join(tokensDir, `${provider}.json`);

    const tokenData = {
      access_token: token.access_token,
      refresh_token: token.refresh_token || null,
      expires_at: token.expires_at || null,
    };

    fs.writeFileSync(tokenFile, JSON.stringify(tokenData, null, 2));
    logger.info({ provider, tokenFile }, 'Token synced to file');
    return true;
  } catch (err) {
    logger.error({ err, provider, connectionId }, 'Failed to sync token to file');
    return false;
  }
}

/**
 * Initiate OAuth flow for a provider.
 * Returns the authorization URL that the user should visit.
 */
export async function initiateOAuth(
  provider: string,
  connectionId: string = DEFAULT_CONNECTION_ID,
  scopes?: string[]
): Promise<string> {
  // Check if provider is configured
  const isConfigured = await isProviderConfigured(provider);
  if (!isConfigured) {
    throw new Error(`Provider ${provider} is not configured in Nango`);
  }

  // Default scopes for known providers
  const defaultScopes: Record<string, string[]> = {
    'google-calendar': [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ]
  };

  const finalScopes = scopes || defaultScopes[provider] || [];
  return getAuthUrl(provider, connectionId, finalScopes);
}

/**
 * Create provider integration config in Nango
 * This is needed before users can connect
 */
export async function createProviderConfig(
  provider: string,
  clientId: string,
  clientSecret: string,
  scopes: string[]
): Promise<boolean> {
  try {
    const response = await fetch(`${NANGO_HOST}/config`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NANGO_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider_config_key: provider,
        provider: provider.replace('-', '_'), // google-calendar -> google_calendar
        oauth_client_id: clientId,
        oauth_client_secret: clientSecret,
        oauth_scopes: scopes.join(' '),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error({ provider, error }, 'Failed to create provider config');
      return false;
    }

    logger.info({ provider }, 'Provider config created');
    return true;
  } catch (err) {
    logger.error({ err, provider }, 'Failed to create provider config');
    return false;
  }
}
