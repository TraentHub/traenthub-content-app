# Traent Hub Visual Tool — Context for LLMs

## What This App Does

Traent Hub Visual Tool is a web-based visual configurator for creating branded social media slide decks. Users (or AI agents) define slides as JSON, and the app renders them visually with live editing, emphasis rules, and multiple export formats.

**Live URL**: https://traent-hub-visual-tool.vercel.app

## Use Cases

1. **AI Agent creates a session**: An agent (GPT, Claude, etc.) generates a slide config JSON, validates it, creates a session via API, and returns a URL for the user to edit visually.
2. **Human user edits visually**: A designer opens a session URL and fine-tunes slide content, styles, emphasis rules, and layout with real-time preview.
3. **Export**: Users export slides as HTML deck, PNG images (zip), or JSON config for programmatic use.

## API Endpoints

Base URL: `https://traent-hub-visual-tool.vercel.app`

### GET /api/schema
Returns the current config schema — enums, defaults, required fields, and usage guidance. **No auth required.**

### POST /api/configs/validate
Validates a config JSON. **No auth required.**
```json
{ "config": { "version": "...", "global": {...}, "slides": {...} } }
```
Returns: `{ valid, errors, warnings, normalizedConfig }`

### POST /api/configs
Creates a new visual session. **Requires API key** (Bearer token in Authorization header).
```json
{ "config": { "version": "...", "global": {...}, "slides": {...} } }
```
Returns: `{ id, status, url, config, createdAt, updatedAt }`
The `url` field contains the session URL to share with the user.

### GET /api/configs/:id
Retrieves an existing session. **No auth required.**
Returns the full session with config.

### PATCH /api/configs/:id
Updates a session's config (full replacement). **No auth required.**
```json
{ "config": { "version": "...", "global": {...}, "slides": {...} } }
```

### POST /api/configs/:id/approve
Marks a session as approved. **No auth required.**

## Config JSON Format

### Minimal valid config:
```json
{
  "version": "stable-import-fix",
  "global": {
    "canvas": "1080x1350",
    "accent": "#FF3D00"
  },
  "slides": {
    "1": {
      "title": "Your headline here"
    }
  }
}
```

### Full slide fields:
```json
{
  "role": "opener|content|closing",
  "status": "draft|selected|needs_revision|approved",
  "kicker": "BRAND TAGLINE",
  "footerMeta": "slide deck",
  "title": "Main headline",
  "body": "Supporting copy text",
  "style": "Manifesto|Editorial|Energetic|Institutional-light",
  "theme": "light|dark|split",
  "layout": "left_text_right_visual|centered_manifesto|poster_text|split_panel",
  "brand": "full_lockup|symbol_only|wordmark_only|none",
  "brandPosition": "bottom-left|bottom-right|top-left|top-right",
  "asset": "system-field|orbit-dotted|fragmented-network|ordered-network|force-map|handshake-trust|none",
  "textSize": { "title": 0, "body": 0, "kicker": 0, "footer": 0 },
  "emphasisRules": [
    { "field": "title", "target": "word to emphasize", "device": "underline_pop|italic_pop|strike_muted|outline|filled_highlight|plain_orange" }
  ]
}
```

### Canvas sizes:
`1080x1350` (Instagram portrait, default), `1920x1080` (landscape), `1200x1200` (square), `1600x900` (widescreen), `1080x1080` (Instagram square), `1080x1920` (Stories/Reels)

## Recommended Agent Workflow

1. `GET /api/schema` — read current enums and defaults
2. Build a config JSON with `{ global: { canvas, accent }, slides: { "1": { title, ... } } }`
3. `POST /api/configs/validate` — validate and normalize
4. `POST /api/configs` — create session (returns URL)
5. Return the session URL to the user for visual editing

## Brand Identity

- **Brand**: Traent Hub
- **Accent color**: #FF3D00 (Signal Red)
- **Fonts**: Playfair Display (display), Outfit (body), JetBrains Mono (monospace)
- **Background**: #F5F2ED (warm cream)
- **Text**: #0D0D0D (near-black)

## Privacy Policy

Available at: https://traent-hub-visual-tool.vercel.app/privacy

## Contact

contact@traenthub.com
