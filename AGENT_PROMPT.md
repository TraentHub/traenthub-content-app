# AGENT PROMPT: Generate a Branded Visual Configurator

You are adapting a visual slide configurator template to a new brand. You will receive a `brand.json` file and optionally a design system document. Your job is to produce a complete, working `index.html` file tailored to the brand.

## What you receive

1. **`template.html`** — The generic template (a working `index.html` with delimited brand sections)
2. **`brand.json`** — The client's design system values (see `brand.schema.json` for validation)
3. **(Optional)** A design system document (PDF, Figma export, or markdown) for additional context

## Substitution instructions

The template has 3 delimited brand sections. Replace the content between the markers for each.

---

### Section 1: CSS Variables

Find the markers:
```css
/* ╔══ BRAND CSS VARIABLES — Replace for a new brand ══ */
/* ╚══ END BRAND CSS VARIABLES ══ */
```

Replace the `:root` block with values from `brand.json` → `colors`:

```css
:root{
  --paper:{colors.paper}; --slide-paper:{colors.lightSlideBg}; --ink:{colors.ink}; --pop:{colors.accent}; --secondary:{colors.secondary};
  --gray-d:{colors.grayDark}; --gray-m:{colors.grayMid}; --gray-l:{colors.grayLight}; --line:{colors.line};
  --dark:{colors.dark}; --stage:{colors.stage}; --ratio:4/5;
}
```

---

### Section 2: Head Block

Find the markers:
```html
<!-- ╔══ BRAND HEAD — Replace title and fonts for a new brand ══ -->
<!-- ╚══ END BRAND HEAD ══ -->
```

Replace:
- `<title>` with `{brand.name}`
- Google Fonts `<link>` URL: construct from `fonts.*.family`, `fonts.*.weights`, and `fonts.*.italics`

**Google Fonts URL formula:**
```
https://fonts.googleapis.com/css2?family={fonts.body.family}:wght@{fonts.body.weights.join(';')}&family={fonts.display.family}:ital,wght@0,{fonts.display.weights.join(';')};1,{fonts.display.weights.join(';')}&family={fonts.mono.family}:wght@{fonts.mono.weights.join(';')}&display=swap
```
(Include `ital,` prefix only if `italics: true`)

Also update the font URL inside `buildHtmlDeck()` (search for `fonts.googleapis.com` in the JS — there's a second instance). Use a lighter subset for the export deck (only weights 400, 600, 700 and italics).

---

### Section 3: JS Brand Config

Find the markers:
```javascript
// ╔══ BRAND CONFIGURATION — Replace this entire block for a new brand     ║
// ╚══ END BRAND CONFIGURATION
```

Replace the `BRAND` object with values from `brand.json`:

```javascript
const BRAND = {
  name: brand.name,
  slug: brand.slug,
  accentColor: colors.accent,
  lightBg: colors.lightSlideBg,
  defaultKicker: defaults.kicker,
  defaultFooterMeta: defaults.footerMeta,
  wordmarkHtml: wordmark.html,
  localStoragePrefix: brand.slug,
  fileNamePrefix: brand.slug + "-visual-config",
  renderedDeckTitle: brand.name + " Rendered Deck",
  sampleConfigUrl: brand.slug + "-visual-config.json"
};
```

Also in this section:

**LOGO_DARK and LOGO_LIGHT**: Replace the base64 values with `logos.dark` and `logos.light` from brand.json.

**STYLE_META**: Replace with `styleMeta` from brand.json. Each key maps to `{ desc, preview }`.

**EMPHASIS_DEVICES**: Update labels from `emphasisDevices` in brand.json. The CSS rules stay generic (they reference `var(--pop)`).

**BASE_GRAPHICS**: The client MUST provide their SVG assets. Replace the SVG markup for each asset. SVGs should use `var(--pop)` and `currentColor` for brand-neutral color references. If the client provides fewer assets, remove unused entries; if more, add them.

**PRESETS**: Update any preset names and demo content to match the brand's voice.

---

### Additional substitutions (outside delimited sections)

These are individual string replacements in the JS code:

1. **`brandMarkup()` function**: The wordmark HTML is already templated via `BRAND.wordmarkHtml` — no change needed.

2. **`renderStyleCards()`**: The kicker preview `<div class="m-k">` already uses `BRAND.defaultKicker` — no change needed.

3. **`buildHtmlDeck()`**: The deck title already uses `BRAND.renderedDeckTitle` — no change needed.

4. **Download filenames**: Already use `BRAND.fileNamePrefix` — no change needed.

5. **localStorage keys**: Already use `BRAND.localStoragePrefix` — no change needed.

6. **`syncJson()` instructions string**: Update the Italian instructions text if the client's language differs.

7. **Sample config fallback JSON** (inside `loadSampleConfig()`): Update the hardcoded fallback JSON with brand-appropriate content.

8. **`<html lang="it">`**: Change to the client's language code (e.g. `lang="en"`).

---

## Verification checklist

After substitution, verify ALL of the following:

1. **Valid HTML**: The file opens without console errors in a browser
2. **No leftover brand strings**: Search for "Traent", "traent", "TRAENT" — should only appear inside the `BRAND` object definition and the CSS/HTML delimiters
3. **Config schema validates**: Load the page, paste a valid JSON config, click Import — should succeed
4. **Session creation works**: Click "Create session" — should get a 201 response
5. **Autosave works**: Edit a slide title, wait 3 seconds — "Saving…" indicator should appear then confirm
6. **Export works**: Click "Download HTML deck" — should produce a valid HTML file with the new brand
7. **All brand elements render**: Logos, wordmark, accent color, fonts should all reflect the new brand
8. **Emphasis rules render**: Create an emphasis rule — it should use the new accent color
9. **Dark theme works**: Switch a slide to dark theme — logo should switch to light variant
10. **Style cards show new kicker**: The style picker cards should show the brand's default kicker

## Important notes

- Do NOT modify the generic code outside the delimited sections unless explicitly listed above
- Do NOT change the API routes, session management, or import/export logic
- Do NOT remove any CSS classes or layout logic — these are brand-agnostic
- The `config-schema.js` module should NOT be modified — it receives brand config at runtime via `configureBrand()`
- Keep the single-file architecture — no build step, no external CSS/JS files (except `config-schema.js` and the sample config)
- The `none` asset (no decorative graphic) is universal and should always be available

## Common mistakes to avoid

These are bugs we hit during development. Do NOT make these mistakes:

1. **CSS delimiters must be INSIDE `<style>` tag** — The `/* ╔══ BRAND CSS VARIABLES */` block must be inside the existing `<style>...</style>` element. Do NOT place it outside or create a duplicate.

2. **Static HTML topbar wordmark must be literal text** — There is a `<div class="brand">` in the static HTML (near line 310, inside the topbar). This is plain HTML, NOT a JavaScript template literal. The wordmark must be written as literal HTML like `<span class="wordmark dark">brand<span class="dot">.</span>name</span>`. Do NOT use `${BRAND.wordmarkHtml}` here — it would render as literal text.

3. **`sampleConfigUrl` must NOT have `public/` prefix** — The server serves files from `public/` as root, so the URL should be `"slug-visual-config.json"`, NOT `"public/slug-visual-config.json"`.

4. **Do NOT create `const X.Y = ...` declarations** — When replacing `TRAENT_ORANGE`, the original `const TRAENT_ORANGE = "..."` line has already been removed. Do NOT reintroduce it or create invalid JS like `const BRAND.accentColor = ...`.

5. **Ensure `LOGO_DARK` / `LOGO_LIGHT` are on their own lines** — After the `configureBrand()` call and before `STYLE_META`, make sure each logo constant starts on a new line. Do NOT merge them onto the same line as other statements.

6. **Google Fonts `<link>` in `buildHtmlDeck()`** — There is a SECOND Google Fonts URL inside the `buildHtmlDeck()` function (around the `fonts=[` array). This must also be updated to match the new brand fonts, using a lighter subset (weights 400, 600, 700 only).
