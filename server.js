'use strict';
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const Schema = require('./public/shared/config-schema.js');

const PORT = process.env.PORT || 3000;

// ── Storage ────────────────────────────────────────────────────────────────
// In-memory by default. Set STORAGE=kv to use Vercel KV in production.

const store = (function createStorage() {
  // In-memory implementation (default)
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
})();

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

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function jsonResponse(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host  = req.headers['host'] || ('localhost:' + PORT);
  return proto + '://' + host;
}

// ── Screenshot ─────────────────────────────────────────────────────────────

async function screenshotSlides(html) {
  const { chromium } = require('playwright');
  const tmp = path.join(os.tmpdir(), `traent-${Date.now()}.html`);
  fs.writeFileSync(tmp, html, 'utf8');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 2200, height: 1200 });
  try {
    await page.goto(`file://${tmp}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready.then(() => window.dispatchEvent(new Event('resize'))));
    await page.waitForTimeout(700);
    const slides = await page.$$('.deck article.slide');
    const out = [];
    for (let i = 0; i < slides.length; i++) {
      const png = await slides[i].screenshot({ type: 'png' });
      out.push({ id: String(i + 1).padStart(2, '0'), png: png.toString('base64') });
    }
    return out;
  } finally {
    await browser.close();
    try { fs.unlinkSync(tmp); } catch {}
  }
}

// ── API Routes ─────────────────────────────────────────────────────────────

async function handleApiRoute(req, res) {
  const url    = req.url;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  try {
    // GET /api/schema
    if (method === 'GET' && url === '/api/schema') {
      return jsonResponse(res, 200, Schema.getSchemaDescriptor());
    }

    // POST /api/configs/validate
    if (method === 'POST' && url === '/api/configs/validate') {
      const body = await readJsonBody(req);
      const result = Schema.validateConfig(body.config || body);
      return jsonResponse(res, result.valid ? 200 : 422, {
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
        normalizedConfig: result.normalizedConfig,
      });
    }

    // POST /api/configs
    if (method === 'POST' && url === '/api/configs') {
      const auth = requireApiKey(req);
      if (!auth.ok) {
        return jsonResponse(res, 401, { error: 'Unauthorized', message: auth.reason });
      }
      const body   = await readJsonBody(req);
      const result = Schema.validateConfig(body.config || body);
      if (!result.valid) {
        return jsonResponse(res, 422, {
          error: 'Validation failed',
          details: result.errors,
        });
      }
      const id       = Schema.generateSessionId();
      const now      = new Date().toISOString();
      const session  = {
        id,
        status: 'draft',
        url: getBaseUrl(req) + '/?id=' + id,
        config: result.normalizedConfig,
        createdAt: now,
        updatedAt: now,
      };
      await store.create(session);
      return jsonResponse(res, 201, session);
    }

    // GET /api/configs (list)
    if (method === 'GET' && url === '/api/configs') {
      const list = await store.list();
      return jsonResponse(res, 200, { sessions: list });
    }

    // GET /api/configs/:id
    if (method === 'GET' && url.startsWith('/api/configs/') && !url.includes('/approve')) {
      const id  = url.split('/api/configs/')[1].split('?')[0];
      const row = await store.get(id);
      if (!row) return jsonResponse(res, 404, { error: 'Not found' });
      return jsonResponse(res, 200, row);
    }

    // PATCH /api/configs/:id (config update and/or status change)
    if (method === 'PATCH' && url.startsWith('/api/configs/') && !url.endsWith('/approve')) {
      const id = url.split('/api/configs/')[1].split('?')[0];
      const existing = await store.get(id);
      if (!existing) return jsonResponse(res, 404, { error: 'Not found' });
      const body = await readJsonBody(req);
      let newConfig = undefined;
      const newStatus = body.status !== undefined ? body.status : undefined;
      if (body.config !== undefined) {
        const result = Schema.validateConfig(body.config);
        if (!result.valid) return jsonResponse(res, 422, { error: 'Validation failed', details: result.errors });
        newConfig = result.normalizedConfig;
      } else if (newStatus === undefined) {
        // Legacy: entire body is the config
        const result = Schema.validateConfig(body);
        if (!result.valid) return jsonResponse(res, 422, { error: 'Validation failed', details: result.errors });
        newConfig = result.normalizedConfig;
      }
      const updated = await store.update(id, newConfig, newStatus);
      return jsonResponse(res, 200, { id: updated.id, status: updated.status, updatedAt: updated.updatedAt });
    }

    // DELETE /api/configs/:id
    if (method === 'DELETE' && url.startsWith('/api/configs/')) {
      const id = url.split('/api/configs/')[1].split('?')[0];
      const existing = await store.get(id);
      if (!existing) return jsonResponse(res, 404, { error: 'Not found' });
      if (existing.status === 'published') return jsonResponse(res, 403, { error: 'Cannot delete a published session' });
      await store.delete(id);
      return jsonResponse(res, 200, { ok: true });
    }

    // POST /api/configs/:id/approve
    if (method === 'POST' && url.match(/^\/api\/configs\/[^/]+\/approve$/)) {
      const id  = url.split('/api/configs/')[1].replace('/approve', '');
      const existing = await store.get(id);
      if (!existing) return jsonResponse(res, 404, { error: 'Not found' });
      const updated = await store.update(id, undefined, 'approved');
      return jsonResponse(res, 200, {
        id: updated.id,
        status: updated.status,
        updatedAt: updated.updatedAt,
      });
    }

    // Unknown API route
    return jsonResponse(res, 404, { error: 'Not found' });

  } catch (e) {
    console.error('API error:', e);
    return jsonResponse(res, 500, { error: 'Internal server error', message: e.message });
  }
}

// ── Static File Serving ────────────────────────────────────────────────────

const MIME = {
  '.html':'text/html;charset=utf-8', '.js':'application/javascript',
  '.css':'text/css', '.png':'image/png', '.ico':'image/x-icon',
  '.json':'application/json', '.svg':'image/svg+xml', '.yaml':'text/yaml',
  '.yml':'text/yaml',
};

const server = http.createServer(async (req, res) => {
  // CORS for all API routes
  if (req.url.startsWith('/api/') && req.method === 'OPTIONS') {
    return handleApiRoute(req, res);
  }

  // Screenshot endpoint (existing)
  if (req.method === 'POST' && req.url === '/screenshot') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      try {
        const { html } = JSON.parse(Buffer.concat(chunks).toString());
        const slides = await screenshotSlides(html);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ slides }));
      } catch (e) {
        console.error(e);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(String(e.message));
      }
    });
    return;
  }

  // API routes
  if (req.url.startsWith('/api/')) {
    return handleApiRoute(req, res);
  }

  // Static files
  const urlPath = req.url.split('?')[0];
  const filePath = urlPath === '/' ? './public/index.html' : './public' + decodeURIComponent(urlPath);
  const ext = path.extname(filePath).toLowerCase();
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found: ' + filePath);
  }
});

server.listen(PORT, () => console.log(`\n  Traent Hub Visual Configurator → http://localhost:${PORT}\n  API → http://localhost:${PORT}/api/schema\n`));
