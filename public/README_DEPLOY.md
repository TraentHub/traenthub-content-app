# Deployment Guide

## Quick start (local development)

```bash
npm install    # Installs Playwright + Chromium
npm run dev    # Starts server.js on http://localhost:3000
```

The server (`server.js`) does two things:
1. **Serves static files** — the app works entirely in the browser
2. **`POST /screenshot`** — uses Playwright for pixel-perfect PNG export

## Deploying as a static site

For deployment without PNG export (JSON + HTML export still work):

Deploy only `index.html` to any static host. No build step needed.

### Vercel
1. Create a new project, connect repo
2. Framework: Other, no build command
3. Output directory: project root

### Netlify
1. Create new site, drag-and-drop or connect repo
2. Publish directory: project root
3. No build command

### GitHub Pages
1. Push `index.html` to repo root
2. Enable GitHub Pages from main branch

## Stable URL

Aim for a stable URL like `https://traenthub-content-app.vercel.app` so the GPT can always direct users there.

## Phase 1 (current)

- No backend required for basic usage
- PNG export needs the local server (`npm run dev`)
- All data persists in browser localStorage

## Phase 2 (future)

- Backend API for PNG export server-side
- GPT Action integration
- See `docs/TRAENT_HUB_API_FUTURE_PLAN.md`
