# HOW_TO_GUIDE.md — POS System Developer Reference

Quick reference for the three most common tasks: adding a product, changing styles, and adding a plugin.

---

## 1. How to Add a Product

Products live in **one place** in the renderer.

### File to edit
```
src/renderer/renderer.js
```

### The array (top of the file)
```js
const PRODUCTS = [
  { id: 1,  name: 'Coffee',      price: 3.50,  emoji: '☕' },
  { id: 2,  name: 'Tea',         price: 2.50,  emoji: '🍵' },
  // ... existing products ...
];
```

### What to do
Add a new object to the array. Give it the next unused `id`.

```js
{ id: 13, name: 'Lemonade', price: 2.75, emoji: '🍋' },
```

That's it. The `renderProducts()` function automatically loops the array and creates a `.product-card` for each entry. No HTML changes needed.

### Rules
| Field   | Type   | Notes                                    |
|---------|--------|------------------------------------------|
| `id`    | number | Must be unique. Increment from the last. |
| `name`  | string | Shown on the card and in the cart.       |
| `price` | number | In dollars. Tax is calculated on top.    |
| `emoji` | string | Any single emoji. Shown large on card.   |

### Where the card is rendered
`renderer.js → renderProducts()` → appends a `<div class="product-card">` to `#productGrid` in `index.html`.

---

## 2. How to Change the CSS Style

The CSS system is split into three layers. Edit the right layer for what you want to change.

```
src/renderer/
├── variables.css   ← Layer 1: Design tokens (colours, spacing, radius)
├── styles.css      ← Layer 2: Component rules (use the tokens)
└── catalog.css     ← Layer 3: Screen-level overrides (demo)
```

### Layer 1 — Change a colour everywhere in the app

Edit **`variables.css`**. Every component reads from these tokens.

```css
/* variables.css */
:root {
  --color-primary: #e8590c;   /* ← change this one line */
  --color-accent:  #4f46e5;   /* ← or this for buttons/prices */
}
```

Changing `--color-primary` will update the topbar, marketplace tab indicator, install buttons, and any other component that uses `var(--color-primary)` — all at once, with one edit.

#### Available tokens

| Token | Default | Used for |
|---|---|---|
| `--color-primary` | `#e8590c` | Topbar, active tabs, primary buttons |
| `--color-accent` | `#4f46e5` | Checkout button, product card hover, prices |
| `--color-danger` | `#ef4444` | Delete/remove hover states |
| `--color-success` | `#22c55e` | Toggle on state, scale reading |
| `--color-surface` | `#ffffff` | Card and modal backgrounds |
| `--color-text` | `#1a1a2e` | Main body text |
| `--color-text-muted` | `#555555` | Labels, secondary text |
| `--color-border` | `#e5e7eb` | Card borders, dividers |
| `--color-bg-from/mid/to` | warm orange | Body gradient (3 stops) |
| `--topbar-bg` | `var(--color-primary)` | Topbar background |
| `--cart-width` | `360px` | Width of the right cart panel |
| `--radius-md` | `8px` | Standard border radius |
| `--spacing-lg` | `16px` | Standard spacing unit |

### Layer 2 — Change a specific component rule

Edit **`styles.css`**. Find the component section and change the rule. Use variables for any colour/size value — do not hard-code.

```css
/* styles.css — make product cards taller */
.product-card {
  padding: 28px 10px;   /* was 18px 10px */
}
```

```css
/* styles.css — make the checkout button rounded */
.btn-checkout {
  border-radius: var(--radius-pill);   /* was var(--radius-lg) */
}
```

### Layer 3 — Change the style for ONE screen only (without affecting others)

Create (or edit) a screen-specific CSS file. Override only the variables you want, scoped to a wrapper class on `<body>`.

This is exactly what the Catalog screen does:

```css
/* catalog.css — only affects elements inside .catalog-screen */
.catalog-screen {
  --color-primary: #0d9488;   /* teal instead of orange */
  --color-accent:  #7c3aed;   /* violet instead of indigo */
  --color-bg-from: #eff6ff;   /* blue gradient */
}
```

Because `<body class="catalog-screen">` wraps everything on that page, all components automatically pick up the new tokens. Zero component rules are duplicated.

**To create a new themed screen:**
1. Add `<body class="my-screen">` to your HTML file.
2. Load `variables.css` + `styles.css` + your new `my-screen.css`.
3. In `my-screen.css` write only `.my-screen { --color-primary: ...; }` overrides.

---

## 3. How to Add a New Plugin

A plugin is a folder inside `src/plugins/` with three files.

### Folder structure to create
```
src/plugins/
└── my-plugin/
    ├── plugin.json    ← metadata + config
    ├── index.js       ← main-process logic (Node.js / IPC handlers)
    └── panel.html     ← UI injected into the POS renderer
```

### Step 1 — plugin.json (metadata)

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "entry": "index.js",
  "enabled": true,
  "description": "What this plugin does."
}
```

- `id` must be lowercase, hyphen-separated, unique across all plugins.
- `enabled: true` makes it active immediately on next app start.

### Step 2 — index.js (main-process logic)

```js
'use strict';

module.exports = {
  activate(api) {
    api.logger.info('My Plugin activated.');

    // Register an IPC handler the renderer can call.
    // Full channel name becomes: plugin:my-plugin:do-something
    api.ipc.handle('do-something', async (_event, payload) => {
      // ... your logic here (file I/O, hardware, etc.) ...
      return { ok: true, result: 'Hello from main process!' };
    });

    // React to a hook emitted by the renderer (e.g. cart:checkout)
    api.hooks.on('cart:checkout', (data) => {
      api.logger.info('Order checked out:', data);
    });
  },

  deactivate() {
    // Called when the user disables the plugin via the Marketplace.
    // IPC handlers registered with api.ipc.handle() are removed automatically.
  }
};
```

#### Available `api` methods

| Method | What it does |
|---|---|
| `api.ipc.handle(action, fn)` | Register a handler. Channel = `plugin:<id>:<action>` |
| `api.hooks.on(hookName, fn)` | Listen for a lifecycle hook emitted by the renderer |
| `api.logger.info(msg)` | Log to electron-log (appears in DevTools + log file) |
| `api.logger.warn(msg)` | Log a warning |
| `api.logger.error(msg)` | Log an error |

### Step 3 — panel.html (renderer UI)

```html
<!-- my-plugin/panel.html -->
<div class="plugin-panel" id="panel-my-plugin">

  <div class="plugin-panel-header" style="background: #0f766e;">
    <span class="plugin-panel-icon">🔧</span>
    <span class="plugin-panel-title">My Plugin</span>
    <span class="plugin-panel-badge">v1.0.0</span>
  </div>

  <div class="plugin-panel-body">
    <p class="plugin-panel-desc">Short description shown in the panel.</p>

    <!-- Buttons use data-plugin-action to call IPC handlers -->
    <div class="plugin-btn-row">
      <button
        class="btn-plugin"
        data-plugin-id="my-plugin"
        data-plugin-action="do-something"
      >
        Do Something
      </button>
    </div>

    <!-- Output area — filled by JS response -->
    <pre class="plugin-output" id="my-plugin-output">Waiting…</pre>
  </div>

</div>
```

#### How `data-plugin-action` works

`marketplace.js` wires every button that has `data-plugin-action` automatically:

```
click → window.electronAPI.plugins.invoke('my-plugin', 'do-something', payload)
      → IPC → main process → index.js activate() handler
      → response returned to renderer
```

No extra JS needed for basic button → IPC → response flows.

### Step 4 — Enable / install via the Marketplace

1. Start (or restart) the app — the plugin loader scans `src/plugins/` on startup.
2. Click **🧩 Plugins** in the topbar → **Marketplace** tab.
3. Find your plugin → **Install** → it moves to the **Installed** tab.
4. Toggle it **on** — the panel appears at the bottom of the POS screen.

To enable by default without going through the UI, set `"enabled": true` in `plugin.json` before starting the app.

---

## Summary — Which file do I edit?

| Task | File(s) to edit |
|---|---|
| Add / remove a product | `src/renderer/renderer.js` → `PRODUCTS` array |
| Change a colour everywhere | `src/renderer/variables.css` → `:root { }` block |
| Change a specific component layout/style | `src/renderer/styles.css` → find the component section |
| Create a different look for a new screen | New `my-screen.css` with `.my-screen { --token: value; }` overrides |
| Add a new plugin | New folder in `src/plugins/my-plugin/` with `plugin.json`, `index.js`, `panel.html` |
| Change plugin UI | `src/plugins/<id>/panel.html` |
| Change plugin logic | `src/plugins/<id>/index.js` |
