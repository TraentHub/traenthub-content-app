# README_DEPLOY

## Goal

Deploy the Traent Hub Visual Configurator as a static app.

## Recommended first deployment

Use Vercel or Netlify.

The simplest deployable file is:

`index.html`

You can start by copying:

`traent-hub-visual-configurator.html`

to:

`index.html`

## Vercel

1. Create a new project.
2. Upload or connect the folder.
3. Use static deployment.
4. No build command required if using plain HTML.
5. Output directory: project root.

## Netlify

1. Create a new site.
2. Drag and drop the folder or connect repo.
3. Publish directory: project root.
4. No build command required.

## GitHub Pages

1. Create repo.
2. Put `index.html` at root.
3. Enable GitHub Pages from main branch.

## Stable URL

Try to create a stable URL like:

`https://traent-hub-visual.vercel.app`

The GPT can then always tell the user:

“Open the Traent Hub Visual Configurator and import this JSON.”

## Phase 1

No backend.
No API.
No auth.

## Phase 2

Add backend/API and GPT Action only after static workflow is stable.
