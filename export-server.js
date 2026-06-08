/**
 * Traent Hub — Export Microservice (Koyeb)
 *
 * Standalone server for PNG slide export via Playwright + Chromium.
 * Two endpoints:
 *   GET  /health     → { status: "ok" }
 *   POST /screenshot → { html } → { slides: [{ id, png }] }
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Configuration ──────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3000', 10);
const API_KEY = process.env.TRAENT_API_KEY;           // optional, set to require auth
const MAX_BODY_BYTES = 10 * 1024 * 1024;              // 10 MB payload limit

const ALLOWED_ORIGINS = [
  'https://traent-hub-visual-tool.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
];

// ── Screenshot Engine ──────────────────────────────────────────────────────

async function screenshotSlides(html) {
  const { chromium } = require('playwright');
  const tmp = path.join(os.tmpdir(), `traent-${Date.now()}.html`);
  fs.writeFileSync(tmp, html, 'utf8');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-dev-shm-usage',    // use /tmp instead of limited /dev/shm
      '--disable-gpu',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-extensions',
      '--no-first-run',
      '--disable-features=VizDisplayCompositor',
    ],
  });

  const ctx = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 2200, height: 1200 });

  try {
    await page.goto(`file://${tmp}`, { waitUntil: 'networkidle' });
    await page.evaluate(() =>
      document.fonts.ready.then(() => window.dispatchEvent(new Event('resize')))
    );
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

// ── Helpers ────────────────────────────────────────────────────────────────

function setCORS(res, origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function json(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;
    req.on('data', (c) => {
      received += c.length;
      if (received > MAX_BODY_BYTES) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function checkApiKey(req) {
  if (!API_KEY) return true; // no key configured → open access
  const hdr = (req.headers['authorization'] || '').replace('Bearer ', '');
  return hdr === API_KEY;
}

// ── Route Handlers ─────────────────────────────────────────────────────────

function handleHealth(req, res) {
  json(res, 200, { status: 'ok', service: 'traent-hub-export' });
}

async function handleScreenshot(req, res) {
  const origin = req.headers['origin'] || '';
  setCORS(res, origin);

  if (!checkApiKey(req)) {
    return json(res, 401, { error: 'Unauthorized — invalid or missing API key' });
  }

  try {
    const body = await readBody(req);
    const { html } = JSON.parse(body.toString());

    if (!html || typeof html !== 'string') {
      return json(res, 400, { error: 'Missing or invalid "html" field' });
    }

    const slides = await screenshotSlides(html);
    json(res, 200, { slides });
  } catch (e) {
    console.error('[screenshot]', e);
    if (e.message === 'Payload too large') {
      return json(res, 413, { error: 'Payload exceeds 10 MB limit' });
    }
    json(res, 500, { error: e.message || 'Internal screenshot error' });
  }
}

// ── Server ─────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    setCORS(res, req.headers['origin'] || '');
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url.split('?')[0]; // strip query string

  if (req.method === 'GET' && url === '/health') {
    return handleHealth(req, res);
  }

  if (req.method === 'POST' && url === '/screenshot') {
    return handleScreenshot(req, res);
  }

  json(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`✅ Traent Hub Export Service running on port ${PORT}`);
  console.log(`   GET  /health     — health check`);
  console.log(`   POST /screenshot — PNG export`);
  console.log(`   API key: ${API_KEY ? 'required' : 'open (no key set)'}`);
});
