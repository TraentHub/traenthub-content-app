# Traent Hub Visual Configurator — AI Agent Context

## What this app is

A **single-file static HTML application** (~1290 lines) that lets users visually configure social media slide decks for Traent Hub. Each deck has multiple slides with title, body, kicker, footer, graphic assets, emphasis devices, and brand elements.

**Repo:** `https://github.com/luca-nik/traent-hub-visual-tool`

## File structure

```
index.html          — The entire app (HTML + CSS + JS in one file)
server.js           — Node server: static files + POST /screenshot (Playwright PNG export)
package.json        — Playwright dependency, dev script runs server.js
```

## How to run

```bash
npm install    # Installs Playwright + Chromium
npm run dev    # Starts server.js on http://localhost:3000
```

## Architecture overview

### State (source of truth)

The entire app state is a single JS object:

```javascript
state = {
  version: "stable-import-fix",
  global: {
    canvas: "1080x1350",          // Slide dimensions (also: 1920x1080, 1080x1080, etc.)
    accent: "#FF3D00",            // Brand orange
    name: "my-design",            // Design name → used for filenames
    lightSlideBackground: "#F5F2ED"
  },
  slides: {
    "1": {
      role: "opener",             // opener | content | closing
      status: "draft",            // draft | approved | needs_revision
      kicker: "TRAENT HUB",       // Can be empty (removed)
      footerMeta: "visual config", // Can be empty (removed)
      title: "...",
      body: "...",
      style: "Manifesto",         // Manifesto | Editorial | Energetic | Institutional-light
      theme: "light",             // light | dark
      layout: "poster_text",      // poster_text | left_text_right_visual | centered_manifesto | split_panel
      brand: "full_lockup",       // full_lockup | symbol_only | wordmark_only | none
      brandPosition: "bottom-left", // bottom-left | bottom-right | top-left | top-right
      asset: "system-field",      // Key into BASE_GRAPHICS registry
      graphicPos: null,           // {x, y, size} override or null for layout default
      textSize: { title:0, body:0, kicker:0, footer:0 },  // Scale steps ±3
      titleWidth: null,           // Optional width % override
      emphasisRules: [            // Array of emphasis device rules
        { id:"r_abc", field:"title", target:"text", device:"underline_pop", default:true }
      ]
    }
  }
}
```

### Rendering pipeline

```
User input → event handler → render()
  → readUi()        // DOM inputs → state
  → applyScope()    // Bulk apply to other slides
  → renderMainPreview()   // Large slide preview
  → renderFilmstrip()     // Thumbnail strip
  → renderReview()        // Grid view of all slides
  → renderRuleList()      // Emphasis rule editor
  → fitTitles()           // Auto-scale titles to fit
  → fitActivePreview()    // Scale preview to viewport
  → syncJson()            // Update JSON textarea
  → savePreferences()     // Persist to localStorage
```

- `setUi()` — state → DOM (used when switching slides or importing)
- `readUi()` — DOM → state (called at start of every `render()`)

### Component registries (extensible)

**EMPHASIS_DEVICES** — Text styling devices (underline, outline, etc.)
```javascript
const EMPHASIS_DEVICES = {
  "underline_pop": {
    label: "Underline orange",      // UI label
    css: ".em-underline_pop{...}",  // Base CSS (class = em-{key})
    cssDark: "...",     // optional: dark-mode override
    cssLight: "...",    // optional: light-mode explicit
    cssPreview: "...",  // optional: preview-stage sizing
    cssThumb: "..."     // optional: thumbnail sizing
  },
  // italic_pop, strike_muted, outline, filled_highlight, plain_orange
};
```

**To add a new emphasis device:** add one entry to `EMPHASIS_DEVICES`. The UI dropdowns, rendering, and export all pick it up automatically. Convention: CSS class is always `em-{key}`.

**BASE_GRAPHICS** — Decorative SVG assets
```javascript
const BASE_GRAPHICS = {
  "system-field": {
    use: "Opener / hero / general system view",  // Description shown in gallery
    svg: "<svg viewBox='0 0 420 300'>...</svg>"   // Inline SVG
  },
  // orbit-dotted, fragmented-network, ordered-network, force-map, handshake-trust, none
};
```

**To add a new asset:** add one entry to `BASE_GRAPHICS`. The asset gallery and rendering pick it up automatically.

**Other registries:**
- `STYLE_META` — Style presets (Manifesto, Editorial, etc.)
- `PRESETS` — Complete slide configurations
- Layouts and themes are CSS-driven (not in a registry yet)

### Export system

- **JSON** (`↓ JSON`) — Downloads full state as JSON. Also importable.
- **HTML** (`↓ HTML`) — `buildHtmlDeck()` generates a standalone HTML file with all CSS, fonts, SVGs, and inline JS for title fitting. `downloadHtmlDeck()` wraps it as a download.
- **PNG** (`↓ PNG`) — `exportSlidePngs()` calls `buildHtmlDeck()` → POSTs HTML to `/screenshot` → Playwright renders each `.deck article.slide` → returns base64 PNGs → JSZip bundles them as `{name}.zip`.
- **Copy JSON** / **Ready HTML** — Clipboard helpers for GPT workflow.

### Server (`server.js`)

- Serves static files from project root
- `POST /screenshot` — accepts `{html}`, writes to temp file, opens with Playwright headless Chromium (2× DPI, 2200×1200 viewport), screenshots each `.deck article.slide`, returns `{slides: [{id, png: base64}]}`

### CSS architecture

CSS variables (`:root`):
- `--paper: #F5F2ED` — slide background (light)
- `--ink: #0D0D0D` — text color
- `--pop: #FF3D00` — accent orange
- `--secondary: #EDE9E1` — split panel secondary
- `--gray-d/m/l` — muted text levels
- `--dark: #0D0D0D` — dark theme background
- `--stage: #D8D3CC` — app background

Slide class system: `.slide.{theme}.layout-{layout}.brand-{brand}.brand-pos-{position}`

Emphasis CSS is injected dynamically: `/*__EMPHASIS_CSS__*/` placeholder in `<style>` is replaced at startup by `buildEmphasisCSS()` which compiles all device CSS from the registry.

Slides have no border-radius and no box-shadow (flat, full-bleed rectangles). The `.slide` CSS rule has `overflow:hidden` but no rounded corners.

### Key functions reference

| Function | Purpose |
|----------|---------|
| `render()` | Main render orchestrator |
| `readUi()` | DOM inputs → state |
| `setUi()` | State → DOM inputs |
| `slideMarkup(s, thumb)` | Generate slide HTML from slide state |
| `applyRulesToText(text, rules, field, slide)` | Apply emphasis rules to text |
| `buildHtmlDeck()` | Generate standalone HTML for export |
| `exportSlidePngs()` | PNG export via Playwright |
| `renderRuleList()` | Render emphasis rule editor |
| `renderAssetGallery()` | Render graphic asset picker |
| `renderStyleCards()` | Render style preset picker |
| `fitTitles()` | Auto-scale titles to fit containers |
| `emphClass(type)` | Returns `"em-"+type` (CSS class convention) |
| `brandMarkup(s, location)` | Generate logo/wordmark HTML |
| `updateToggleBtn()` | Toggle kicker/footer add/remove button state |

### Sync rule

After every edit to `index.html`, copy to:
```
/Users/luca/programmi/personal/traent-hub/traent-hub-visual-app-coding-handoff/traent-hub-visual-configurator.html
```

### When extending the app

1. **Adding an emphasis device** — add one entry to `EMPHASIS_DEVICES`. Done.
2. **Adding a graphic asset** — add one entry to `BASE_GRAPHICS`. Done.
3. **Adding a new layout** — requires: CSS rules for positioning, entry in UI `<select>`, entry in `layoutGraphicDefault()`, handling in `fitTitles()` if title sizing differs. Not yet registry-driven.
4. **Any edit to index.html** — always run JS syntax check (`new Function(jsBlock)`) and sync to handoff directory.
5. **All rendering is in `slideMarkup()`** — this is the central function that generates slide HTML. Any new visual element needs to be added here.
6. **State must round-trip** — `readUi()` reads from DOM, `setUi()` writes to DOM. New fields need entries in both.
7. **Export must include new CSS** — `buildHtmlDeck()` reads `document.querySelector("style").textContent`, so dynamically injected CSS is included. But any new static CSS must be inside the `<style>` tag.
8. **Kicker and footer are toggleable** — each slide's `kicker` and `footerMeta` can be empty (removed). In `slideMarkup()`, empty values produce no HTML element. The UI has "Add/Remove" toggle buttons that update the input field, then `render()` → `readUi()` picks up the change.
