// api/[[...path]].js
// Vercel serverless function — catch-all handler for all /api/* routes.
// Adapts our API logic to Vercel's (req, res) interface.

const Schema = require('../public/shared/config-schema.js');

// ── Storage ────────────────────────────────────────────────────────────────
// Uses Vercel Redis (node-redis) when REDIS_URL is set (production).
// Falls back to in-memory store for local development.

function createRedisStore() {
  const { createClient } = require('redis');
  let _client = null;

  async function client() {
    if (_client && _client.isReady) return _client;
    _client = createClient({ url: process.env.REDIS_URL });
    _client.on('error', err => console.error('Redis error:', err));
    await _client.connect();
    return _client;
  }

  return {
    async create(session) {
      const c = await client();
      await c.set('session:' + session.id, JSON.stringify({
        id: session.id,
        status: session.status,
        config: JSON.stringify(session.config),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }));
      return session;
    },
    async get(id) {
      const c = await client();
      const raw = await c.get('session:' + id);
      if (!raw) return null;
      const row = JSON.parse(raw);
      return {
        id: row.id,
        status: row.status,
        config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    },
    async update(id, config, status) {
      const existing = await this.get(id);
      if (!existing) return null;
      const updated = {
        id: existing.id,
        status: status !== undefined ? status : existing.status,
        config: config !== undefined ? JSON.stringify(config) : JSON.stringify(existing.config),
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      const c = await client();
      await c.set('session:' + id, JSON.stringify(updated));
      return {
        id: updated.id,
        status: updated.status,
        config: JSON.parse(updated.config),
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    },
    async list() {
      const c = await client();
      const keys = await c.keys('session:*');
      if (!keys.length) return [];
      const raws = await c.mGet(keys);
      return raws
        .filter(Boolean)
        .map(raw => {
          const row = JSON.parse(raw);
          const config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
          return {
            id: row.id,
            status: row.status,
            name: (config && config.global && config.global.name) || '',
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async delete(id) {
      const c = await client();
      await c.del('session:' + id);
      return { id };
    },
  };
}

function createMemoryStore() {
  const sessions = new Map();
  return {
    async create(session) {
      sessions.set(session.id, {
        id: session.id,
        status: session.status,
        config: JSON.stringify(session.config),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      });
      return session;
    },
    async get(id) {
      const row = sessions.get(id);
      if (!row) return null;
      return {
        id: row.id,
        status: row.status,
        config: JSON.parse(row.config),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    },
    async update(id, config, status) {
      const row = sessions.get(id);
      if (!row) return null;
      if (config !== undefined) row.config = JSON.stringify(config);
      if (status !== undefined) row.status = status;
      row.updatedAt = new Date().toISOString();
      return {
        id: row.id,
        status: row.status,
        config: JSON.parse(row.config),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    },
    async list() {
      return Array.from(sessions.values())
        .map(row => {
          const config = JSON.parse(row.config);
          return {
            id: row.id,
            status: row.status,
            name: (config && config.global && config.global.name) || '',
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async delete(id) {
      if (!sessions.has(id)) return null;
      sessions.delete(id);
      return { id };
    },
  };
}

// Lazy-init store: Upstash in production, in-memory for local dev
let _store = null;
function getStore() {
  if (!_store) {
    _store = process.env.REDIS_URL ? createRedisStore() : createMemoryStore();
  }
  return _store;
}

// ── API Key ────────────────────────────────────────────────────────────────

function requireApiKey(req) {
  const apiKey = process.env.TRAENT_API_KEY;
  // If no key is configured, skip auth (open mode)
  if (!apiKey) return { ok: true };
  const auth = req.headers['authorization'] || '';
  if (auth === 'Bearer ' + apiKey) return { ok: true };
  return { ok: false, reason: 'Invalid API key' };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['host'] || 'localhost:3000';
  return proto + '://' + host;
}

// ── Route Handler ──────────────────────────────────────────────────────────

async function handleApiRoute(req, res) {
  const url = req.url || '/';
  const method = req.method || 'GET';

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const store = await getStore();
    const body = req.body || {};

    // GET /api/schema
    if (method === 'GET' && (url === '/schema' || url === '/api/schema')) {
      return res.status(200).json(Schema.getSchemaDescriptor());
    }

    // POST /api/configs/validate
    if (method === 'POST' && (url === '/configs/validate' || url === '/api/configs/validate')) {
      const result = Schema.validateConfig(body.config || body);
      return res.status(result.valid ? 200 : 422).json({
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
        normalizedConfig: result.normalizedConfig,
      });
    }

    // POST /api/configs
    if (method === 'POST' && (url === '/configs' || url === '/api/configs')) {
      const auth = requireApiKey(req);
      if (!auth.ok) {
        return res.status(401).json({ error: 'Unauthorized', message: auth.reason });
      }
      const result = Schema.validateConfig(body.config || body);
      if (!result.valid) {
        return res.status(422).json({ error: 'Validation failed', details: result.errors });
      }
      const id = Schema.generateSessionId();
      const now = new Date().toISOString();
      const session = {
        id,
        status: 'draft',
        url: getBaseUrl(req) + '/?id=' + id,
        config: result.normalizedConfig,
        createdAt: now,
        updatedAt: now,
      };
      await store.create(session);
      return res.status(201).json(session);
    }

    // GET /api/configs (list)
    if (method === 'GET' && (url === '/configs' || url === '/api/configs')) {
      const list = await store.list();
      return res.status(200).json({ sessions: list });
    }

    // GET /api/configs/:id
    if (method === 'GET') {
      const match = url.match(/^\/(?:api\/)?configs\/([^/?]+)$/);
      if (match) {
        const row = await store.get(match[1]);
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(row);
      }
    }

    // PATCH /api/configs/:id (config and/or status update)
    if (method === 'PATCH') {
      const match = url.match(/^\/(?:api\/)?configs\/([^/?]+)$/);
      if (match && !url.endsWith('/approve')) {
        const id = match[1];
        const existing = await store.get(id);
        if (!existing) return res.status(404).json({ error: 'Not found' });
        let newConfig = undefined;
        const newStatus = body.status !== undefined ? body.status : undefined;
        if (body.config !== undefined) {
          const result = Schema.validateConfig(body.config);
          if (!result.valid) return res.status(422).json({ error: 'Validation failed', details: result.errors });
          newConfig = result.normalizedConfig;
        } else if (newStatus === undefined) {
          const result = Schema.validateConfig(body);
          if (!result.valid) return res.status(422).json({ error: 'Validation failed', details: result.errors });
          newConfig = result.normalizedConfig;
        }
        const updated = await store.update(id, newConfig, newStatus);
        return res.status(200).json({ id: updated.id, status: updated.status, updatedAt: updated.updatedAt });
      }
    }

    // DELETE /api/configs/:id
    if (method === 'DELETE') {
      const match = url.match(/^\/(?:api\/)?configs\/([^/?]+)$/);
      if (match) {
        const id = match[1];
        const existing = await store.get(id);
        if (!existing) return res.status(404).json({ error: 'Not found' });
        if (existing.status === 'published') return res.status(403).json({ error: 'Cannot delete a published session' });
        await store.delete(id);
        return res.status(200).json({ ok: true });
      }
    }

    // POST /api/configs/:id/approve
    if (method === 'POST') {
      const match = url.match(/^\/(?:api\/)?configs\/([^/]+)\/approve$/);
      if (match) {
        const id = match[1];
        const existing = await store.get(id);
        if (!existing) return res.status(404).json({ error: 'Not found' });
        const updated = await store.update(id, undefined, 'approved');
        return res.status(200).json({
          id: updated.id,
          status: updated.status,
          updatedAt: updated.updatedAt,
        });
      }
    }

    return res.status(404).json({ error: 'Not found' });

  } catch (e) {
    console.error('API error:', e);
    return res.status(500).json({ error: 'Internal server error', message: e.message });
  }
}

// ── Vercel Export ───────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Normalize: ensure req.url starts with /api/
  // Vercel may send /schema or /api/schema depending on config
  const raw = req.url || '/';
  req.url = raw.startsWith('/api/') ? raw : '/api' + raw;
  return handleApiRoute(req, res);
}
