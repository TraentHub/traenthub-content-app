# Traent Hub API Future Plan

This is not phase 1.

This document describes the intended future extension after the static app is stable.

---

## Goal

Allow GPT and the visual configurator app to exchange configs without manual copy/paste.

---

## Future workflow

```text
GPT creates visual config
↓
GPT Action calls POST /configs
↓
API saves config and returns session URL
↓
User opens session URL
↓
User edits deck in configurator
↓
App PATCHes updated config
↓
User tells GPT to continue
↓
GPT Action calls GET /configs/{id}
↓
GPT generates HTML preview
↓
User approves
↓
GPT generates PPTX
```

---

## Minimal API

### POST /configs

Creates a config session.

Request:
```json
{
  "config": {}
}
```

Response:
```json
{
  "id": "abc123",
  "url": "https://traent-hub-visual.app/session/abc123",
  "config": {}
}
```

---

### GET /configs/{id}

Returns current config.

Response:
```json
{
  "id": "abc123",
  "status": "draft",
  "config": {}
}
```

---

### PATCH /configs/{id}

Updates config.

Request:
```json
{
  "config": {}
}
```

Response:
```json
{
  "id": "abc123",
  "status": "draft",
  "updatedAt": "...",
  "config": {}
}
```

---

### POST /configs/{id}/approve

Marks config as approved.

Request:
```json
{
  "status": "approved"
}
```

Response:
```json
{
  "id": "abc123",
  "status": "approved",
  "config": {}
}
```

---

## GPT Action

A GPT Action can later use an OpenAPI schema for these endpoints.

The GPT should be able to:
- create a session;
- retrieve a session;
- check approval status;
- fetch final config.

---

## Security considerations

Because configs may contain strategic messaging, avoid public indexing.

Options:
- unguessable IDs;
- short-lived sessions;
- optional password;
- org-level auth later;
- delete sessions after export.

For phase 2, unguessable IDs may be enough for internal testing.

---

## Data model

```json
{
  "id": "string",
  "status": "draft | approved | archived",
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp",
  "config": {}
}
```

---

## Do not change schema

The backend should not introduce a different deck model.

It should store the same visual config JSON used by the static app and GPT.

JSON remains the source of truth.
