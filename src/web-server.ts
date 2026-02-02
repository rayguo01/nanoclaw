import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import { WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import pino from 'pino';
import { NewMessage } from './types.js';
import * as nango from './nango-client.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: { target: 'pino-pretty', options: { colorize: true } }
});

// Connected WebSocket clients
const wsClients = new Set<WebSocket>();

// Message callback - will be set by index.ts
type MessageCallback = (text: string, source: 'web') => Promise<string | null>;
let onWebMessage: MessageCallback | null = null;

// Get messages callback - will be set by index.ts
type GetMessagesCallback = (limit?: number, before?: string) => Array<{
  id: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  source: 'whatsapp' | 'web';
}>;
let getMessages: GetMessagesCallback | null = null;

export interface WebServerConfig {
  port: number;
  password: string;
  jwtSecret: string;
  staticDir?: string;
}

let fastify: FastifyInstance | null = null;

export function setMessageCallback(callback: MessageCallback): void {
  onWebMessage = callback;
}

export function setGetMessagesCallback(callback: GetMessagesCallback): void {
  getMessages = callback;
}

/**
 * Broadcast a message to all connected WebSocket clients
 */
export function broadcastMessage(message: {
  type: 'message' | 'typing' | 'status' | 'auth_required';
  data: unknown;
}): void {
  const payload = JSON.stringify(message);
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

/**
 * Broadcast a new message from any source (WhatsApp or Web)
 */
export function broadcastNewMessage(msg: {
  id: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  source: 'whatsapp' | 'web';
}): void {
  broadcastMessage({ type: 'message', data: msg });
}

/**
 * Broadcast auth_required event when a skill needs OAuth
 */
export function broadcastAuthRequired(provider: string, message?: string): void {
  broadcastMessage({
    type: 'auth_required',
    data: {
      provider,
      message: message || `需要授权 ${provider} 才能继续`,
    }
  });
}

export async function startWebServer(config: WebServerConfig): Promise<void> {
  fastify = Fastify({
    logger: false // We use our own logger
  });

  // Register plugins
  await fastify.register(fastifyCors, {
    origin: true,
    credentials: true
  });

  await fastify.register(fastifyCookie);

  await fastify.register(fastifyJwt, {
    secret: config.jwtSecret,
    cookie: {
      cookieName: 'token',
      signed: false
    }
  });

  await fastify.register(fastifyWebsocket);

  // Serve static files from web/dist if it exists
  const staticDir = config.staticDir || path.resolve(process.cwd(), 'web', 'dist');
  if (fs.existsSync(staticDir)) {
    await fastify.register(fastifyStatic, {
      root: staticDir,
      prefix: '/'
    });
  }

  // Note: @fastify/jwt already decorates request with 'user', no need to add it

  // Auth verification hook
  const verifyAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: 'Unauthorized' });
    }
  };

  // ===== Auth Routes =====

  fastify.post('/api/auth/login', async (request, reply) => {
    const { password } = request.body as { password?: string };

    if (!password || password !== config.password) {
      return reply.status(401).send({ error: 'Invalid password' });
    }

    const token = fastify!.jwt.sign({ authenticated: true }, { expiresIn: '7d' });

    reply
      .setCookie('token', token, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 // 7 days
      })
      .send({ success: true });
  });

  fastify.post('/api/auth/logout', async (request, reply) => {
    reply
      .clearCookie('token', { path: '/' })
      .send({ success: true });
  });

  fastify.get('/api/auth/check', { preHandler: verifyAuth }, async (request, reply) => {
    return { authenticated: true };
  });

  // ===== OAuth Provider Routes =====

  // Get Nango config for frontend
  fastify.get('/api/auth/nango-config', { preHandler: verifyAuth }, async (request, reply) => {
    return {
      publicKey: nango.getPublicKey(),
      host: nango.getNangoHost(),
    };
  });

  // Check if a provider is connected
  fastify.get('/api/auth/status/:provider', { preHandler: verifyAuth }, async (request, reply) => {
    const { provider } = request.params as { provider: string };

    const isConfigured = await nango.isProviderConfigured(provider);
    if (!isConfigured) {
      return { connected: false, configured: false };
    }

    const hasConn = await nango.hasConnection(provider);
    return { connected: hasConn, configured: true };
  });

  // Get OAuth connection info for a provider
  fastify.get('/api/auth/connect/:provider', { preHandler: verifyAuth }, async (request, reply) => {
    const { provider } = request.params as { provider: string };

    const isConfigured = await nango.isProviderConfigured(provider);
    if (!isConfigured) {
      return reply.status(400).send({
        error: 'Provider not configured',
        message: `${provider} is not configured in Nango. Please set up the provider first.`
      });
    }

    // Default scopes for known providers
    const defaultScopes: Record<string, string[]> = {
      'google-calendar': [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events'
      ]
    };
    const scopes = defaultScopes[provider];

    return {
      authUrl: nango.getAuthUrl(provider, 'main', scopes),
      provider,
    };
  });

  // Notify that OAuth completed (called by frontend after popup closes)
  fastify.post('/api/auth/complete', { preHandler: verifyAuth }, async (request, reply) => {
    const { provider } = request.body as { provider: string };

    if (!provider) {
      return reply.status(400).send({ error: 'Provider is required' });
    }

    // Verify the connection was successful
    const hasConn = await nango.hasConnection(provider);
    if (!hasConn) {
      return reply.status(400).send({
        error: 'Connection not found',
        message: 'OAuth flow may not have completed successfully'
      });
    }

    // Sync token to file for container access
    await nango.syncTokenToFile(provider);

    logger.info({ provider }, 'OAuth connection completed');
    return { success: true, provider };
  });

  // List all connected providers
  fastify.get('/api/auth/connections', { preHandler: verifyAuth }, async (request, reply) => {
    const connections = await nango.listConnections();
    return { connections };
  });

  // Disconnect a provider
  fastify.delete('/api/auth/disconnect/:provider', { preHandler: verifyAuth }, async (request, reply) => {
    const { provider } = request.params as { provider: string };

    const success = await nango.deleteConnection(provider);
    if (!success) {
      return reply.status(500).send({ error: 'Failed to disconnect provider' });
    }

    logger.info({ provider }, 'OAuth connection disconnected');
    return { success: true };
  });

  // ===== Messages Routes =====

  fastify.get('/api/messages', { preHandler: verifyAuth }, async (request, reply) => {
    const { limit, before } = request.query as { limit?: string; before?: string };

    if (!getMessages) {
      return reply.status(500).send({ error: 'Messages not available' });
    }

    const messages = getMessages(
      limit ? parseInt(limit, 10) : 50,
      before
    );

    return { messages };
  });

  // ===== Chat Routes =====

  fastify.post('/api/chat', { preHandler: verifyAuth }, async (request, reply) => {
    const { message } = request.body as { message?: string };

    if (!message || typeof message !== 'string' || !message.trim()) {
      return reply.status(400).send({ error: 'Message is required' });
    }

    if (!onWebMessage) {
      return reply.status(500).send({ error: 'Chat not available' });
    }

    // Create unique ID for this message
    const msgId = `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date().toISOString();

    // Broadcast the user message immediately
    broadcastNewMessage({
      id: msgId,
      sender: 'web-user',
      sender_name: 'You',
      content: message.trim(),
      timestamp,
      source: 'web'
    });

    // Note: typing indicator and response broadcast are handled by the callback in index.ts
    // to avoid duplicate broadcasts
    try {
      const response = await onWebMessage(message.trim(), 'web');
      return { success: true, response };
    } catch (err) {
      logger.error({ err }, 'Error processing web message');
      return reply.status(500).send({ error: 'Failed to process message' });
    }
  });

  // ===== WebSocket Route =====

  fastify.register(async function (fastify) {
    fastify.get('/api/ws', { websocket: true }, (socket, request) => {
      // Verify JWT from cookie or query param
      const token = request.cookies.token || (request.query as { token?: string }).token;

      if (!token) {
        socket.close(4001, 'Unauthorized');
        return;
      }

      try {
        fastify.jwt.verify(token);
      } catch {
        socket.close(4001, 'Unauthorized');
        return;
      }

      logger.info('WebSocket client connected');
      wsClients.add(socket);

      socket.on('close', () => {
        wsClients.delete(socket);
        logger.info('WebSocket client disconnected');
      });

      socket.on('error', (err: Error) => {
        logger.error({ err }, 'WebSocket error');
        wsClients.delete(socket);
      });

      // Handle ping/pong for keepalive
      socket.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong' }));
          }
        } catch {
          // Ignore invalid messages
        }
      });

      // Send initial connection confirmation
      socket.send(JSON.stringify({ type: 'connected' }));
    });
  });

  // ===== SPA Fallback =====
  // Serve index.html for any unmatched routes (SPA routing)
  if (fs.existsSync(staticDir)) {
    fastify.setNotFoundHandler((request, reply) => {
      // Only for non-API routes
      if (!request.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.status(404).send({ error: 'Not found' });
    });
  }

  // Start server
  try {
    await fastify.listen({ port: config.port, host: '0.0.0.0' });
    logger.info({ port: config.port }, 'Web server started');
  } catch (err) {
    logger.error({ err }, 'Failed to start web server');
    throw err;
  }
}

export async function stopWebServer(): Promise<void> {
  if (fastify) {
    await fastify.close();
    fastify = null;
    wsClients.clear();
    logger.info('Web server stopped');
  }
}
