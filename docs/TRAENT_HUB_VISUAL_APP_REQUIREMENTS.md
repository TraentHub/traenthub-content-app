# Traent Hub Visual App Requirements

## Product goal

Create a deployable visual configurator app for Traent Hub slide decks.

The app is not the final deck generator.
The app is the visual configuration interface.

The source of truth is always:

`traent-hub-visual-config.json`

The app edits this JSON.

---

## Primary workflow

1. GPT creates or proposes a visual config JSON.
2. User opens the deployed visual configurator app.
3. User imports JSON.
4. User edits visuals.
5. User exports/copies updated JSON.
6. User sends JSON back to GPT.
7. GPT generates HTML preview.
8. User approves HTML.
9. GPT generates PPTX.

---

## Phase 1: static app

Phase 1 should be a static app.

No backend.
No database.
No auth.
No GPT Action.

The app must work as a deployable static site.

Recommended platforms:
- Vercel;
- Netlify;
- GitHub Pages;
- Cloudflare Pages.

---

## Required features

### 1. Import JSON

The app must import JSON from:

- textarea;
- `.json` file upload;
- raw JSON;
- fenced markdown block:
  ```json
  { ... }
  ```
- pasted text that contains a JSON object before or after explanatory text.

Import must:
- parse the first valid JSON object;
- normalize missing fields;
- support more than 5 slides;
- rebuild slide selector dynamically;
- update active preview, filmstrip, and deck review;
- show success or error message.

---

### 2. Export JSON

The app must provide:

- copy JSON;
- download JSON;
- copy approved config for GPT.

The “Copy approved config for GPT” button should copy a message like:

```text
Ecco il visual config approvato. Genera HTML preview, non PPTX.

{ ...json... }
```

---

### 3. Stable file naming

The deployed app should use stable names:

- `index.html` for deployment;
- `traent-hub-visual-configurator.html` if distributed as standalone file;
- `TRAENT_HUB_VISUAL_CONFIG_SCHEMA.json` for schema/reference.

Do not introduce versioned filenames in instructions or docs.

---

### 4. Visual editing

The app must preserve current editing capabilities:

- canvas size;
- slide status;
- theme;
- layout;
- brand mode;
- logo position;
- accent color;
- text size controls;
- copy fields;
- emphasis devices;
- style family;
- graphic assets;
- import/export;
- focus edit mode;
- deck review mode.

---

### 5. Logo position behavior

Each slide has:

```json
"brandPosition": "bottom-left"
```

Allowed values:
- `bottom-left`;
- `bottom-right`;
- `top-left`;
- `top-right`.

Behavior:
- logo bottom-left -> footer meta bottom-right;
- logo bottom-right -> footer meta bottom-left;
- logo top-left -> kicker top-right;
- logo top-right -> kicker top-left.

Default:
- `bottom-left`.

---

### 6. Light slide background

Light slide background must be locked to:

```text
#F5F2ED
```

This must apply to:
- active preview;
- filmstrip thumbnails;
- deck review slides;
- split slides.

---

### 7. Canvas fitting

The active slide must fit inside the available preview area without overflow.

Must work for:
- 1080x1350;
- 1920x1080;
- 1600x900;
- 1080x1080;
- 1200x1200;
- 1080x1920.

The app should treat slides as logical canvases and scale them into the preview area.

---

## Should-have features

### URL hash import

The app should support:

```text
#config=<encoded-json>
```

At minimum:
- base64url encoded JSON.

Better:
- compressed JSON, for example LZ-string.

If config exists in URL:
- auto-import it on page load;
- show success/error message.

---

### Local preferences

Persist in localStorage:
- default canvas;
- default accent;
- default brand position;
- last opened config as backup.

Provide a reset preferences button if simple.

---

### Sample config

Provide a “Load sample config” action for testing.

---

## Out of scope for phase 1

Do not build:
- backend;
- session storage;
- GPT Action;
- account system;
- final HTML deck preview generator;
- PPTX generator.

Those come later.

---

## Manual QA checklist

Test import:
- raw JSON;
- fenced JSON;
- JSON with text before/after;
- JSON file upload;
- 6-slide config;
- missing optional fields;
- invalid JSON.

Test visual editing:
- logo position all four options;
- footer size;
- outline emphasis;
- title size;
- body size;
- dark theme;
- split layout;
- deck review mode.

Test export:
- copy JSON;
- download JSON;
- copy approved config for GPT.

Test deployment:
- open app on hosted URL;
- refresh page;
- import again;
- verify no console errors.
