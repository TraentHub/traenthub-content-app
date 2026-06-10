// Verifies the cropped/positioned layered export recomposes to the original
// slide: places each layer at its reported (x,y,w,h) and diffs against the flat
// /screenshot render. Also prints per-layer sizes and saves a composite PNG.
//
//   PORT=3997 node server.js &   then   node scripts/test-layers.js
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:3997';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  const html = await page.evaluate(() => buildHtmlDeck());

  const [flat, layered] = await page.evaluate(async (html) => {
    const a = await (await fetch('/screenshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html }) })).json();
    const b = await (await fetch('/screenshot-layers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html }) })).json();
    return [a.slides, b.slides];
  }, html);

  // Report layer sizes for slide 1.
  console.log(`slides: ${layered.length} | page errors: ${errors.length ? errors : 'none'}`);
  for (const s of layered) {
    console.log(`\nslide ${s.id} (${s.w}x${s.h}) — ${s.layers.length} layers (bottom→top):`);
    for (const l of s.layers) console.log(`   ${l.name.padEnd(11)} @ (${l.x},${l.y})  ${l.w}x${l.h}`);
  }

  // Composite slide 1 at reported positions and diff against flat render.
  const res = await page.evaluate(async ({ flatPng, sl }) => {
    const load = (b64) => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b64; });
    const flatImg = await load(flatPng);
    const W = flatImg.width, H = flatImg.height;
    const scale = W / sl.w; // flat is deviceScaleFactor 2; layer coords are CSS px
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    for (const l of sl.layers) {
      const img = await load(l.png);
      ctx.drawImage(img, Math.round(l.x * scale), Math.round(l.y * scale), Math.round(l.w * scale), Math.round(l.h * scale));
    }
    const comp = ctx.getImageData(0, 0, W, H).data;
    const compositeDataUrl = c.toDataURL('image/png');
    const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
    const ctx2 = c2.getContext('2d'); ctx2.drawImage(flatImg, 0, 0);
    const flat = ctx2.getImageData(0, 0, W, H).data;
    let sum = 0, over = 0; const n = W * H;
    for (let i = 0; i < flat.length; i += 4) {
      const d = (Math.abs(flat[i] - comp[i]) + Math.abs(flat[i + 1] - comp[i + 1]) + Math.abs(flat[i + 2] - comp[i + 2])) / 3;
      sum += d; if (d > 25) over++;
    }
    return { W, H, meanDiff: sum / n, pctOver: 100 * over / n, compositeDataUrl };
  }, { flatPng: flat[0].png, sl: layered[0] });

  fs.writeFileSync('/tmp/flat.png', Buffer.from(flat[0].png, 'base64'));
  fs.writeFileSync('/tmp/composite.png', Buffer.from(res.compositeDataUrl.split(',')[1], 'base64'));
  await browser.close();
  console.log(`\ncomposite ${res.W}x${res.H} | mean RGB diff ${res.meanDiff.toFixed(2)}/255 | pixels >25: ${res.pctOver.toFixed(3)}%`);
  console.log('saved /tmp/flat.png and /tmp/composite.png');
  console.log('RESULT:', res.meanDiff < 1.0 && res.pctOver < 0.1 ? 'PASS' : 'CHECK');
})();
