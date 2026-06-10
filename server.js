'use strict';
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const Schema = require('./public/shared/config-schema.js');

const PORT = process.env.PORT || 3000;

// ── Storage ────────────────────────────────────────────────────────────────
// Uses Vercel Redis (node-redis) when REDIS_URL is set (production).
// Falls back to an in-memory store for local development.
//
// NOTE: On Vercel this file IS the deployed entrypoint (framework "node"),
// so the store must live here. In-memory state does not survive across
// Fluid Compute instances/cold starts, hence Redis in production.

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
  // In-memory implementation (default for local dev)
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

const store = process.env.REDIS_URL ? createRedisStore() : createMemoryStore();

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

// Layered export: each slide element on its own transparent PNG, cropped to the
// element's bounds (background is full-bleed), with slide-relative position so
// layers can be placed as tight, reorderable PPTX elements. Bottom → top.
// Mirrors export-server.js (the production Cloud Run service).
const LAYER_DEFS = [
  { name: 'background', selector: null },
  { name: 'graphic',    selector: '.graphic' },
  { name: 'logo',       selector: '.brand-lockup' },
  { name: 'footer',     selector: '.footer-meta' },
  { name: 'kicker',     selector: '.kicker' },
  { name: 'body',       selector: '.body' },
  { name: 'title',      selector: '.title' },
];

async function screenshotLayers(html) {
  const { chromium } = require('playwright');
  const tmp = path.join(os.tmpdir(), `traent-lyr-${Date.now()}.html`);
  fs.writeFileSync(tmp, html, 'utf8');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 2200, height: 1200 });
  try {
    await page.goto(`file://${tmp}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready.then(() => window.dispatchEvent(new Event('resize'))));
    await page.waitForTimeout(700);
    await page.addStyleTag({
      content:
        'article.slide.lyr-transparent{background:transparent !important}' +
        'article.slide.lyr-transparent::after{display:none !important}',
    });
    // Grow the viewport to fit the whole deck so page.screenshot({clip}) can
    // capture regions below the original fold (slides are taller than 1200px).
    const fullHeight = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
    await page.setViewportSize({ width: 2200, height: Math.max(1200, fullHeight) });
    await page.waitForTimeout(200);

    const slideHandles = await page.$$('.deck article.slide');
    const out = [];
    for (let i = 0; i < slideHandles.length; i++) {
      const slide = slideHandles[i];
      const box = await slide.boundingBox();
      const layers = [];
      for (const def of LAYER_DEFS) {
        const isBg = def.selector === null;
        const rect = await slide.evaluate((el, d) => {
          el.classList.toggle('lyr-transparent', !d.isBg);
          el.querySelectorAll('*').forEach((n) => { n.style.visibility = 'hidden'; });
          const sr = el.getBoundingClientRect();
          if (d.isBg) return { x: 0, y: 0, w: sr.width, h: sr.height };
          for (let a = el.parentElement; a; a = a.parentElement) {
            a.style.setProperty('background', 'transparent', 'important');
            a.setAttribute('data-lyr-anc', '1');
          }
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, any = false;
          const grow = (r) => {
            if (!r || r.width <= 0 || r.height <= 0) return;
            if (r.left < minX) minX = r.left;
            if (r.top < minY) minY = r.top;
            if (r.right > maxX) maxX = r.right;
            if (r.bottom > maxY) maxY = r.bottom;
          };
          el.querySelectorAll(d.selector).forEach((t) => {
            const cs = getComputedStyle(t);
            const base = t.getBoundingClientRect();
            if (cs.display === 'none' || base.width <= 0 || base.height <= 0) return;
            any = true;
            t.style.visibility = 'visible';
            t.querySelectorAll('*').forEach((n) => { n.style.visibility = 'visible'; });
            grow(base);
            // Text can overflow its box (e.g. a long unbreakable title word);
            // the text line boxes give the true rendered extent.
            try {
              const rng = document.createRange();
              rng.selectNodeContents(t);
              const rects = rng.getClientRects();
              for (let k = 0; k < rects.length; k++) grow(rects[k]);
            } catch (e) { /* ignore */ }
          });
          if (!any) return null;
          const PAD = 3; // px safety for glyph overhang
          const x = Math.max(0, minX - sr.left - PAD), y = Math.max(0, minY - sr.top - PAD);
          const w = Math.min(sr.width, maxX - sr.left + PAD) - x;
          const h = Math.min(sr.height, maxY - sr.top + PAD) - y;
          if (w <= 0 || h <= 0) return null;
          return { x, y, w, h };
        }, { selector: def.selector, isBg });
        if (rect && box) {
          // One set of integer, slide-relative coords for both the capture clip
          // and the reported position, so the PNG lines up exactly when placed.
          const X = Math.round(rect.x), Y = Math.round(rect.y);
          const W = Math.round(rect.w), H = Math.round(rect.h);
          const ox = Math.round(box.x), oy = Math.round(box.y);
          const png = await page.screenshot({
            type: 'png',
            omitBackground: !isBg,
            clip: { x: ox + X, y: oy + Y, width: W, height: H },
          });
          layers.push({ name: def.name, png: png.toString('base64'), x: X, y: Y, w: W, h: H });
        }
        await slide.evaluate((el) => {
          el.classList.remove('lyr-transparent');
          el.querySelectorAll('*').forEach((n) => { n.style.visibility = ''; });
          el.ownerDocument.querySelectorAll('[data-lyr-anc]').forEach((a) => {
            a.style.removeProperty('background');
            a.removeAttribute('data-lyr-anc');
          });
        });
      }
      out.push({ id: String(i + 1).padStart(2, '0'), w: Math.round(box ? box.width : 0), h: Math.round(box ? box.height : 0), layers });
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
    // GET /api/debug — reports which store is active (verifies REDIS_URL)
    if (method === 'GET' && (url === '/api/debug' || url === '/debug')) {
      return jsonResponse(res, 200, {
        store: process.env.REDIS_URL ? 'redis' : 'memory',
        redisUrlSet: !!process.env.REDIS_URL,
        redisUrlPrefix: process.env.REDIS_URL ? process.env.REDIS_URL.slice(0, 20) + '…' : null,
      });
    }

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

  // Layered screenshot endpoint (PPTX export)
  if (req.method === 'POST' && req.url === '/screenshot-layers') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      try {
        const { html } = JSON.parse(Buffer.concat(chunks).toString());
        const slides = await screenshotLayers(html);
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
