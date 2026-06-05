'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const PORT = 3000;

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
    // Trigger fitTitles() with real loaded fonts (same inline JS in exported HTML)
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

const MIME = {
  '.html':'text/html;charset=utf-8', '.js':'application/javascript',
  '.css':'text/css', '.png':'image/png', '.ico':'image/x-icon',
  '.json':'application/json', '.svg':'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
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

  const urlPath = req.url.split('?')[0];
  const filePath = urlPath === '/' ? './index.html' : '.' + decodeURIComponent(urlPath);
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

server.listen(PORT, () => console.log(`\n  Traent Hub Visual Configurator → http://localhost:${PORT}\n`));
