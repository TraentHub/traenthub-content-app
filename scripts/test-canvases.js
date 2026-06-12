// Checks flat render + layered recomposition for every canvas size.
// For each: switches the editor canvas, fetches /screenshot and
// /screenshot-layers, composites the layers at their reported positions and
// diffs against the flat render, and saves /tmp/canvas-<size>.png (composite).
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:3997';
const SIZES = ['1080x1350', '1080x1080', '1080x1920', '1920x1080', '1500x500', '1584x396', '851x315', '1128x191'];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000);

  let allPass = true;
  for (const size of SIZES) {
    await page.evaluate((sz) => { const s = document.getElementById('canvas'); s.value = sz; s.dispatchEvent(new Event('change', { bubbles: true })); }, size);
    await page.waitForTimeout(400);
    const html = await page.evaluate(() => buildHtmlDeck());
    const r = await page.evaluate(async (html) => {
      const flat = await (await fetch('/screenshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html }) })).json();
      const lr = await fetch('/screenshot-layers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html }) });
      if (!lr.ok) return { err: lr.status + ': ' + (await lr.text()).slice(0, 120) };
      const layered = (await lr.json()).slides;
      // composite slide 1 at positions, diff vs flat
      const load = (b64) => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + b64; });
      const flatImg = await load(flat.slides[0].png);
      const W = flatImg.width, H = flatImg.height, sl = layered[0];
      const scale = W / sl.w;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      for (const l of sl.layers) { const img = await load(l.png); ctx.drawImage(img, Math.round(l.x * scale), Math.round(l.y * scale), Math.round(l.w * scale), Math.round(l.h * scale)); }
      const comp = ctx.getImageData(0, 0, W, H).data;
      const compUrl = c.toDataURL('image/png');
      const c2 = document.createElement('canvas'); c2.width = W; c2.height = H; const x2 = c2.getContext('2d'); x2.drawImage(flatImg, 0, 0);
      const fd = x2.getImageData(0, 0, W, H).data;
      let sum = 0, over = 0; const n = W * H;
      for (let i = 0; i < fd.length; i += 4) { const d = (Math.abs(fd[i] - comp[i]) + Math.abs(fd[i + 1] - comp[i + 1]) + Math.abs(fd[i + 2] - comp[i + 2])) / 3; sum += d; if (d > 25) over++; }
      return { slides: layered.length, dim: [sl.w, sl.h], layers: sl.layers.map(l => l.name), nLayers: sl.layers.length, meanDiff: sum / n, pctOver: 100 * over / n, compUrl, flatPng: flat.slides[0].png };
    }, html);

    if (r.err) { console.log(`${size.padEnd(10)} ENDPOINT ERROR: ${r.err}`); allPass = false; continue; }
    fs.writeFileSync(`/tmp/canvas-${size}.png`, Buffer.from(r.compUrl.split(',')[1], 'base64'));
    const pass = r.meanDiff < 1.0 && r.pctOver < 0.2 && r.nLayers >= 2;
    if (!pass) allPass = false;
    console.log(`${size.padEnd(10)} ${String(r.dim[0]).padStart(4)}x${String(r.dim[1]).padStart(4)} | ${r.nLayers} layers [${r.layers.join(',')}] | diff ${r.meanDiff.toFixed(2)} | >25: ${r.pctOver.toFixed(3)}% | ${pass ? 'PASS' : 'CHECK'}`);
  }
  await browser.close();
  console.log('\npage errors:', errors.length ? [...new Set(errors)] : 'none');
  console.log('OVERALL:', allPass ? 'PASS' : 'CHECK');
  process.exit(allPass ? 0 : 1);
})();
