// api/[[...path]].js
// Vercel serverless function — catch-all handler for all /api/* routes.
// Adapts our API logic to Vercel's (req, res) interface.

const Schema = require('../public/shared/config-schema.js');

// ── Storage ────────────────────────────────────────────────────────────────
// In-memory store for POC. Sessions are lost on function restart.
// For production persistence, connect an Upstash Redis integration from
// https://vercel.com/marketplace?category=storage&search=redis
// and replace createStore() with an Upstash-backed implementation.

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
  };
}

// Lazy-init store
let _store = null;
function getStore() {
  if (!_store) _store = createMemoryStore();
  return _store;
}

// ── API Key ────────────────────────────────────────────────────────────────

function requireApiKey(req) {
  const apiKey = process.env.TRAENT_API_KEY;
  if (!apiKey) return { ok: false, reason: 'TRAENT_API_KEY not configured' };
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
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

    // GET /api/configs/:id
    if (method === 'GET') {
      const match = url.match(/^\/(?:api\/)?configs\/([^/?]+)$/);
      if (match) {
        const row = await store.get(match[1]);
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(row);
      }
    }

    // PATCH /api/configs/:id (full replacement)
    if (method === 'PATCH') {
      const match = url.match(/^\/(?:api\/)?configs\/([^/?]+)$/);
      if (match && !url.endsWith('/approve')) {
        const id = match[1];
        const existing = await store.get(id);
        if (!existing) return res.status(404).json({ error: 'Not found' });
        const result = Schema.validateConfig(body.config || body);
        if (!result.valid) {
          return res.status(422).json({ error: 'Validation failed', details: result.errors });
        }
        const updated = await store.update(id, result.normalizedConfig);
        return res.status(200).json({
          id: updated.id,
          status: updated.status,
          updatedAt: updated.updatedAt,
        });
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
