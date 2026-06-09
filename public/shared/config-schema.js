// shared/config-schema.js
// Single source of truth for Traent Hub Visual Config schema.
// Used by both the browser (via <script> → window.CONFIG_SCHEMA)
// and Node.js (via require() → module.exports).
//
// UMD wrapper — no build step required.

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.CONFIG_SCHEMA = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ── Constants ──────────────────────────────────────────────────────────

  var VERSION = "stable-import-fix";

  // ── Brand Defaults (overridden by configureBrand) ──────────────────────

  var _brand = {
    accentColor: "#FF3D00",
    defaultKicker: "TRAENT HUB",
    defaultFooterMeta: "visual config",
  };

  function configureBrand(cfg) {
    if (!cfg) return;
    if (cfg.accentColor) _brand.accentColor = cfg.accentColor;
    if (cfg.defaultKicker) _brand.defaultKicker = cfg.defaultKicker;
    if (cfg.defaultFooterMeta) _brand.defaultFooterMeta = cfg.defaultFooterMeta;
  }

  var TRAENT_ORANGE = _brand.accentColor; // legacy alias

  // ── Enumerations ───────────────────────────────────────────────────────
  // Derived from the real HTML <select> controls and JS registries in index.html.

  var ENUMS = Object.freeze({
    canvas: Object.freeze([
      "1080x1350",
      "1920x1080",
      "1200x1200",
      "1600x900",
      "1080x1080",
      "1080x1920",
    ]),
    status: Object.freeze([
      "draft",
      "selected",
      "needs_revision",
      "approved",
    ]),
    role: Object.freeze(["opener", "content", "closing"]),
    theme: Object.freeze(["light", "dark", "split"]),
    layout: Object.freeze([
      "left_text_right_visual",
      "centered_manifesto",
      "poster_text",
      "split_panel",
    ]),
    brand: Object.freeze([
      "full_lockup",
      "symbol_only",
      "wordmark_only",
      "none",
    ]),
    brandPosition: Object.freeze([
      "bottom-left",
      "bottom-right",
      "top-left",
      "top-right",
    ]),
    style: Object.freeze([
      "Manifesto",
      "Editorial",
      "Energetic",
      "Institutional-light",
    ]),
    asset: Object.freeze([
      "system-field",
      "orbit-dotted",
      "fragmented-network",
      "ordered-network",
      "force-map",
      "handshake-trust",
      "none",
    ]),
    emphasisDevice: Object.freeze([
      "underline_pop",
      "italic_pop",
      "strike_muted",
      "outline",
      "filled_highlight",
      "plain_orange",
    ]),
    emphasisField: Object.freeze(["title", "body", "kicker", "footerMeta"]),
  });

  // ── Defaults ───────────────────────────────────────────────────────────

  function defaultTextSizes() {
    return { title: 0, body: 0, kicker: 0, footer: 0, logo: 0, wordmark: 0 };
  }

  function defaultGlobal() {
    return {
      canvas: "1080x1350",
      accent: TRAENT_ORANGE,
      name: "",
    };
  }

  function defaultSlide(index) {
    return {
      role: index === 0 ? "opener" : "content",
      status: "draft",
      kicker: _brand.defaultKicker,
      footerMeta: _brand.defaultFooterMeta,
      title: "",
      body: "",
      style: index === 0 ? "Manifesto" : "Editorial",
      theme: "light",
      layout: index === 0 ? "poster_text" : "left_text_right_visual",
      brand: "full_lockup",
      brandPosition: "bottom-left",
      asset: "system-field",
      textSize: defaultTextSizes(),
      emphasisRules: [],
      titleWidth: null,
      graphicPos: null,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  function sortedSlideIds(slidesObj) {
    return Object.keys(slidesObj || {}).sort(function (a, b) {
      var na = Number(a),
        nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    });
  }

  function generateRuleId() {
    return (
      "r_" +
      Math.random().toString(36).slice(2, 9)
    );
  }

  // ── Normalization ──────────────────────────────────────────────────────
  // Exact extraction of normalizeImportedConfig from index.html lines 1018-1052.
  // Fills missing fields with defaults. Does NOT validate enum values.

  function normalizeConfig(cfg) {
    if (!cfg || typeof cfg !== "object")
      throw new Error("Imported value is not an object");
    if (!cfg.global) cfg.global = {};
    if (!cfg.slides || typeof cfg.slides !== "object")
      throw new Error("Missing slides object");

    cfg.version = cfg.version || VERSION;
    cfg.global.canvas = cfg.global.canvas || "1080x1350";
    cfg.global.accent = cfg.global.accent || _brand.accentColor;
    cfg.global.name = cfg.global.name || "";
    // Preserve lightSlideBackground if present, do not overwrite
    // (used by buildHtmlDeck, not part of normalization defaults)

    var ids = sortedSlideIds(cfg.slides);
    if (!ids.length) throw new Error("Slides object is empty");

    ids.forEach(function (id, index) {
      var s = cfg.slides[id] || {};
      s.role = s.role || (index === 0 ? "opener" : "content");
      s.status = s.status || "draft";
      s.kicker = s.kicker || "TRAENT HUB";
      s.footerMeta = s.footerMeta || "visual config";
      s.title = s.title || "";
      s.body = s.body || "";
      s.style = s.style || (index === 0 ? "Manifesto" : "Editorial");
      s.theme = s.theme || "light";
      s.layout =
        s.layout || (index === 0 ? "poster_text" : "left_text_right_visual");
      s.brand = s.brand || "full_lockup";
      s.brandPosition = s.brandPosition || "bottom-left";
      s.asset = s.asset || "system-field";
      s.textSize = Object.assign(defaultTextSizes(), s.textSize || {});
      s.emphasisRules = Array.isArray(s.emphasisRules)
        ? s.emphasisRules
        : [];
      s.emphasisRules.forEach(function (r) {
        if (!r.id) r.id = generateRuleId();
      });
      // Preserve optional fields if present
      if (s.titleWidth === undefined) s.titleWidth = null;
      if (s.graphicPos === undefined) s.graphicPos = null;
      cfg.slides[id] = s;
    });

    return cfg;
  }

  // ── Validation ─────────────────────────────────────────────────────────
  // Normalizes first, then checks enum values.
  // Returns { valid, errors, warnings, normalizedConfig }.

  function validateConfig(cfg) {
    var errors = [];
    var warnings = [];

    // 1. Normalize (fills defaults, throws on structural errors)
    var normalized;
    try {
      normalized = normalizeConfig(
        typeof cfg === "object" && cfg !== null && cfg.config ? cfg.config : cfg
      );
    } catch (e) {
      return {
        valid: false,
        errors: [{ path: "", message: e.message }],
        warnings: [],
        normalizedConfig: null,
      };
    }

    // 2. Check global enums
    if (!ENUMS.canvas.includes(normalized.global.canvas)) {
      errors.push({
        path: "global.canvas",
        message:
          'Unknown canvas "' +
          normalized.global.canvas +
          '". Valid: ' +
          ENUMS.canvas.join(", "),
      });
    }

    // 3. Check per-slide enums
    var ids = sortedSlideIds(normalized.slides);
    ids.forEach(function (id) {
      var s = normalized.slides[id];
      var prefix = "slides." + id;

      if (!ENUMS.role.includes(s.role))
        errors.push({
          path: prefix + ".role",
          message:
            'Unknown role "' + s.role + '". Valid: ' + ENUMS.role.join(", "),
        });
      if (!ENUMS.status.includes(s.status))
        errors.push({
          path: prefix + ".status",
          message:
            'Unknown status "' +
            s.status +
            '". Valid: ' +
            ENUMS.status.join(", "),
        });
      if (!ENUMS.theme.includes(s.theme))
        errors.push({
          path: prefix + ".theme",
          message:
            'Unknown theme "' +
            s.theme +
            '". Valid: ' +
            ENUMS.theme.join(", "),
        });
      if (!ENUMS.layout.includes(s.layout))
        errors.push({
          path: prefix + ".layout",
          message:
            'Unknown layout "' +
            s.layout +
            '". Valid: ' +
            ENUMS.layout.join(", "),
        });
      if (!ENUMS.brand.includes(s.brand))
        errors.push({
          path: prefix + ".brand",
          message:
            'Unknown brand "' +
            s.brand +
            '". Valid: ' +
            ENUMS.brand.join(", "),
        });
      if (!ENUMS.brandPosition.includes(s.brandPosition))
        errors.push({
          path: prefix + ".brandPosition",
          message:
            'Unknown brandPosition "' +
            s.brandPosition +
            '". Valid: ' +
            ENUMS.brandPosition.join(", "),
        });
      if (!ENUMS.style.includes(s.style))
        errors.push({
          path: prefix + ".style",
          message:
            'Unknown style "' +
            s.style +
            '". Valid: ' +
            ENUMS.style.join(", "),
        });
      if (!ENUMS.asset.includes(s.asset))
        errors.push({
          path: prefix + ".asset",
          message:
            'Unknown asset "' +
            s.asset +
            '". Valid: ' +
            ENUMS.asset.join(", "),
        });

      // 4. Check emphasis rules
      var rules = s.emphasisRules || [];
      rules.forEach(function (r, i) {
        var rPrefix = prefix + ".emphasisRules[" + i + "]";

        if (!ENUMS.emphasisField.includes(r.field))
          errors.push({
            path: rPrefix + ".field",
            message:
              'Unknown emphasis field "' +
              r.field +
              '". Valid: ' +
              ENUMS.emphasisField.join(", "),
          });
        if (!ENUMS.emphasisDevice.includes(r.device))
          errors.push({
            path: rPrefix + ".device",
            message:
              'Unknown emphasis device "' +
              r.device +
              '". Valid: ' +
              ENUMS.emphasisDevice.join(", "),
          });

        // Warning (not error) if target text not found in the field
        if (r.target && r.target.trim()) {
          var fieldText = getFieldText(s, r.field);
          if (
            !fieldText
              .toLowerCase()
              .includes(r.target.trim().toLowerCase())
          ) {
            warnings.push({
              path: rPrefix + ".target",
              message:
                'Target text "' +
                r.target +
                '" not found in ' +
                r.field +
                ' of slide ' +
                id +
                ". The rule is valid but will not render until the text matches.",
            });
          }
        }
      });
    });

    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings,
      normalizedConfig: normalized,
    };
  }

  function getFieldText(slide, field) {
    return (
      {
        kicker: slide.kicker || "",
        title: slide.title || "",
        body: slide.body || "",
        footerMeta: slide.footerMeta || "",
      }[field] || ""
    );
  }

  // ── Session ID ─────────────────────────────────────────────────────────

  function generateSessionId() {
    // Works in both Node.js (require('crypto')) and browser (window.crypto)
    var crypto =
      typeof window !== "undefined"
        ? window.crypto
        : typeof require === "function"
          ? require("crypto")
          : null;
    if (crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
    // Fallback (should not happen in modern environments)
    return (
      "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0;
        var v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      })
    );
  }

  // ── Schema Descriptor ──────────────────────────────────────────────────
  // Returned by GET /api/schema

  function getSchemaDescriptor() {
    return {
      version: VERSION,
      defaults: {
        global: defaultGlobal(),
        slide: {
          role: "content (opener for first slide)",
          status: "draft",
          kicker: "TRAENT HUB",
          footerMeta: "visual config",
          title: "",
          body: "",
          style: "Editorial (Manifesto for first slide)",
          theme: "light",
          layout:
            "left_text_right_visual (poster_text for first slide)",
          brand: "full_lockup",
          brandPosition: "bottom-left",
          asset: "system-field",
          textSize: defaultTextSizes(),
          emphasisRules: [],
          titleWidth: null,
          graphicPos: null,
        },
      },
      enums: {
        canvas: ENUMS.canvas,
        status: ENUMS.status,
        role: ENUMS.role,
        theme: ENUMS.theme,
        layout: ENUMS.layout,
        brand: ENUMS.brand,
        brandPosition: ENUMS.brandPosition,
        style: ENUMS.style,
        asset: ENUMS.asset,
        emphasisDevice: ENUMS.emphasisDevice,
        emphasisField: ENUMS.emphasisField,
      },
      requiredFields: {
        global: ["canvas", "accent"],
        slide: ["title"],
        emphasisRule: ["field", "target", "device"],
      },
      optionalFields: {
        global: ["name", "lightSlideBackground"],
        slide: [
          "role",
          "status",
          "kicker",
          "footerMeta",
          "body",
          "textSize",
          "emphasisRules",
          "titleWidth",
          "graphicPos",
        ],
        emphasisRule: ["id", "default"],
      },
      guidance: {
        description:
          "Traent Hub Visual Config schema for generating social media slide decks.",
        workflow: [
          "1. GET /api/schema to read current enums and defaults.",
          "2. Build a config JSON with at least { global: { canvas, accent }, slides: { '1': { title, ... } } }.",
          "3. POST /api/configs/validate to check and normalize your config.",
          "4. POST /api/configs with the validated config to create a session.",
          "5. Share the returned URL with the user to open the visual editor.",
        ],
        notes: [
          "Slide IDs are string keys (e.g. '1', '2', '3'). They are sorted numerically.",
          "emphasisRules[].target is a substring to find in the field text. Case-insensitive matching.",
          "textSize values are integers, 0 = default, positive = larger, negative = smaller.",
          "titleWidth and graphicPos are optional positioning overrides. If null, layout defaults are used.",
          "Extra/unknown fields are preserved during normalization — forward-compatible.",
          "lightSlideBackground defaults to '#F5F2ED' at render time if not provided.",
        ],
      },
    };
  }

  // ── Exports ────────────────────────────────────────────────────────────

  return {
    VERSION: VERSION,
    TRAENT_ORANGE: _brand.accentColor,
    ENUMS: ENUMS,
    defaultTextSizes: defaultTextSizes,
    defaultGlobal: defaultGlobal,
    defaultSlide: defaultSlide,
    sortedSlideIds: sortedSlideIds,
    normalizeConfig: normalizeConfig,
    validateConfig: validateConfig,
    generateSessionId: generateSessionId,
    getSchemaDescriptor: getSchemaDescriptor,
    configureBrand: configureBrand,
  };
});
