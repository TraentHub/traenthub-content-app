# Traent Hub Visual Configurator

A single-file static HTML application for visually configuring social media slide decks for Traent Hub. No build step required.

## Quick start

```bash
npm install    # Installs Playwright + Chromium (for PNG export)
npm run dev    # Starts server.js on http://localhost:3000
```

Open `http://localhost:3000` in your browser.

## What it does

- **Design slides** visually — title, body, kicker, footer, layouts, themes, graphic assets, brand elements
- **Emphasis devices** — apply text styling (underline, outline, highlight, etc.) to specific words via rules
- **Export** — download as JSON config, standalone HTML deck, or ZIP of PNG slides
- **Import** — paste JSON config, load from file, or load from URL hash
- **Persist** — auto-saves to localStorage between sessions

## Architecture

```
index.html          — The entire app (HTML + CSS + JS, ~1290 lines)
server.js           — Static file server + POST /screenshot endpoint (Playwright)
package.json        — Dependencies and scripts
public/             — Sample configs and JSON schema
docs/               — Requirements and future plans
```

### Key concepts

| Concept | Description |
|---------|-------------|
| **State** | Single JS object (`state`) — source of truth for all slides |
| **Registries** | `EMPHASIS_DEVICES` and `BASE_GRAPHICS` — add new components by adding one entry |
| **Rendering** | `render()` → `readUi()` → `renderMainPreview()` → `slideMarkup()` |
| **Export** | HTML: `buildHtmlDeck()` generates standalone file · PNG: Playwright via `/screenshot` |
| **CSS** | Variables (`--pop`, `--paper`, `--ink`) + class system (`.slide.{theme}.layout-{layout}`) |

### Extending

- **New emphasis device** → add one entry to `EMPHASIS_DEVICES`
- **New graphic asset** → add one entry to `BASE_GRAPHICS`
- See `PROMPT_FOR_AI_AGENT.md` for full developer context

## Tech stack

- Vanilla HTML/CSS/JS (no framework, no build)
- [Playwright](https://playwright.dev/) for pixel-perfect PNG export
- [JSZip](https://stuk.github.io/jszip/) loaded on-demand for ZIP generation
- Google Fonts: Outfit, Playfair Display, JetBrains Mono
- localStorage for persistence

## License

Private repository. All rights reserved.
