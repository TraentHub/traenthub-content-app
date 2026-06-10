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

// ── Layered Screenshot Engine ────────────────────────────────────────────────
// Renders each slide element onto its own transparent, full-bleed PNG so they
// can be stacked as independent layers in a PPTX (editable/reorderable in Canva
// or PowerPoint). Order is bottom → top.

const LAYER_DEFS = [
  { name: 'background', selector: null },                 // slide fill + split panel
  { name: 'graphic',    selector: '.graphic' },           // abstract asset (below text)
  { name: 'kicker',     selector: '.content > .kicker' },
  { name: 'title',      selector: '.content > .title-wrap' },
  { name: 'body',       selector: '.content > .body' },
  { name: 'footer',     selector: '.footer-meta' },
  { name: 'logo',       selector: '.brand-lockup' },      // visible top/bottom lockup
];

const CHROMIUM_ARGS = [
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-extensions',
  '--no-first-run',
  '--disable-features=VizDisplayCompositor',
];

async function screenshotLayers(html) {
  const { chromium } = require('playwright');
  const tmp = path.join(os.tmpdir(), `traent-lyr-${Date.now()}.html`);
  fs.writeFileSync(tmp, html, 'utf8');

  const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
  const ctx = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 2200, height: 1200 });

  try {
    await page.goto(`file://${tmp}`, { waitUntil: 'networkidle' });
    await page.evaluate(() =>
      document.fonts.ready.then(() => window.dispatchEvent(new Event('resize')))
    );
    await page.waitForTimeout(700);

    // Transparent-layer helper: blanks the slide fill + split panel so overlays
    // capture only their element on a transparent background.
    await page.addStyleTag({
      content:
        'article.slide.lyr-transparent{background:transparent !important}' +
        'article.slide.lyr-transparent::after{display:none !important}',
    });

    const slideHandles = await page.$$('.deck article.slide');
    const out = [];
    for (let i = 0; i < slideHandles.length; i++) {
      const slide = slideHandles[i];
      const box = await slide.boundingBox();
      const layers = [];

      for (const def of LAYER_DEFS) {
        const isBg = def.selector === null;
        // Isolate this layer. Use visibility (not display) so nothing reflows
        // and every layer stays pixel-aligned with the others.
        const visible = await slide.evaluate((el, d) => {
          el.classList.toggle('lyr-transparent', !d.isBg);
          el.querySelectorAll('*').forEach((n) => { n.style.visibility = 'hidden'; });
          if (d.isBg) return true;
          // Neutralize ancestor backgrounds (body/deck/canvas carry an opaque
          // fill) so the transparent slide yields a real alpha channel.
          for (let a = el.parentElement; a; a = a.parentElement) {
            a.style.setProperty('background', 'transparent', 'important');
            a.setAttribute('data-lyr-anc', '1');
          }
          let any = false;
          el.querySelectorAll(d.selector).forEach((t) => {
            const cs = getComputedStyle(t);
            const r = t.getBoundingClientRect();
            if (cs.display !== 'none' && r.width > 0 && r.height > 0) {
              any = true;
              t.style.visibility = 'visible';
              t.querySelectorAll('*').forEach((n) => { n.style.visibility = 'visible'; });
            }
          });
          return any;
        }, { selector: def.selector, isBg });

        if (visible) {
          const png = await slide.screenshot({ type: 'png', omitBackground: !isBg });
          layers.push({ name: def.name, png: png.toString('base64') });
        }

        // Reset for the next layer.
        await slide.evaluate((el) => {
          el.classList.remove('lyr-transparent');
          el.querySelectorAll('*').forEach((n) => { n.style.visibility = ''; });
          el.ownerDocument.querySelectorAll('[data-lyr-anc]').forEach((a) => {
            a.style.removeProperty('background');
            a.removeAttribute('data-lyr-anc');
          });
        });
      }

      out.push({
        id: String(i + 1).padStart(2, '0'),
        w: Math.round(box ? box.width : 0),
        h: Math.round(box ? box.height : 0),
        layers,
      });
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

  // Note: screenshot endpoint is open (no API key required)
  // matches the original server.js behavior where only /api/configs required auth

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

async function handleScreenshotLayers(req, res) {
  const origin = req.headers['origin'] || '';
  setCORS(res, origin);
  try {
    const body = await readBody(req);
    const { html } = JSON.parse(body.toString());
    if (!html || typeof html !== 'string') {
      return json(res, 400, { error: 'Missing or invalid "html" field' });
    }
    const slides = await screenshotLayers(html);
    json(res, 200, { slides });
  } catch (e) {
    console.error('[screenshot-layers]', e);
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

  if (req.method === 'POST' && url === '/screenshot-layers') {
    return handleScreenshotLayers(req, res);
  }

  json(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`✅ Traent Hub Export Service running on port ${PORT}`);
  console.log(`   GET  /health     — health check`);
  console.log(`   POST /screenshot — PNG export`);
  console.log(`   POST /screenshot-layers — layered PPTX export`);
  console.log(`   API key: ${API_KEY ? 'required' : 'open (no key set)'}`);
});
