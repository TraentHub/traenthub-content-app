# Prompt per assistente AI: configurare traent-hub-agent

Sto costruendo un GPT agent personalizzato (traent-hub-agent) che deve creare visual config JSON e inviarli a un'API per generare sessioni visive editabili.

## Cosa fa l'API

Un'app web (Traent Hub Visual Configurator) espone un'API REST. L'agente deve:

1. Leggere lo schema corrente → `GET /api/schema`
2. Generare un JSON config compatibile con quello schema
3. Validarlo → `POST /api/configs/validate`
4. Creare una sessione → `POST /api/configs` (con API key)
5. Restituire all'utente l'URL della sessione per l'editing visivo

## Endpoint e base URL

**Produzione**: `https://traenthub-content-app.vercel.app`

### `GET /api/schema`
Nessuna auth. Ritorna `{ version, enums, defaults, requiredFields, optionalFields, guidance }`.

### `POST /api/configs/validate`
Nessuna auth. Body: `{ "config": { ... } }`. Ritorna `{ valid, errors, warnings, normalizedConfig }`.

### `POST /api/configs`
**Auth**: header `Authorization: Bearer traent-hub-2026`.
Body: `{ "config": { ... } }`.
Ritorna `{ id, url, status, config, createdAt, updatedAt }`. HTTP 201.

### `GET /api/configs/:id`
Nessuna auth. Ritorna la sessione completa.

### `PATCH /api/configs/:id`
Nessuna auth. Body: `{ "config": { ... } }`. **Full replacement** della config.

### `POST /api/configs/:id/approve`
Nessuna auth. Imposta `status: "approved"`.

## Schema della config

```json
{
  "global": {
    "canvas": "1080x1350",
    "accent": "#FF3D00",
    "name": "nome-deck"
  },
  "slides": {
    "1": {
      "role": "opener",
      "title": "Titolo slide",
      "body": "Testo di supporto",
      "style": "Manifesto",
      "theme": "light",
      "layout": "poster_text",
      "asset": "system-field",
      "brand": "full_lockup",
      "brandPosition": "bottom-left"
    }
  }
}
```

### Enum obbligatori (da verificare sempre con `GET /api/schema`)

| Campo | Valori |
|-------|--------|
| canvas | `1080x1350`, `1920x1080`, `1200x1200`, `1600x900`, `1080x1080`, `1080x1920` |
| style | `Manifesto`, `Editorial`, `Energetic`, `Institutional-light` |
| theme | `light`, `dark`, `split` |
| layout | `left_text_right_visual`, `centered_manifesto`, `poster_text`, `split_panel` |
| asset | `system-field`, `orbit-dotted`, `fragmented-network`, `ordered-network`, `force-map`, `handshake-trust`, `none` |
| brand | `full_lockup`, `symbol_only`, `wordmark_only`, `none` |
| brandPosition | `bottom-left`, `bottom-right`, `top-left`, `top-right` |
| emphasisDevice | `underline_pop`, `italic_pop`, `strike_muted`, `outline`, `filled_highlight`, `plain_orange` |

### Campi richiesti minimo
- `slides` con almeno una slide
- Ogni slide deve avere almeno `title`
- I campi mancanti vengono riempiti con i default dalla normalizzazione

## File utili nel repo

- `openapi.yaml` — schema OpenAPI 3.1 completo
- `shared/config-schema.js` — modulo condiviso con enums, defaults, validazione (fonte di verità)
- `public/test-config.json` — config di esempio con 3 slide

## Cosa devi aiutarmi a fare

Definire le istruzioni del GPT agent (system prompt + GPT Actions/OpenAPI schema) così che:

1. L'utente dica all'agente cosa vuole comunicare (es. "Crea un deck per il lancio del prodotto X")
2. L'agente generi un visual config JSON compatibile
3. L'agente chiami l'API e restituisca l'URL della sessione all'utente
4. L'utente apra l'URL e modifichi visivamente

Decidi con me: GPT Actions vs function calling vs curl tool? Come strutturare lo schema dell'azione? Che istruzioni dare nel system prompt?
