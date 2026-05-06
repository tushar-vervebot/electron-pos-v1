# src/core/config

**Application configuration** and feature flags.

## What goes here

| File | Purpose |
|---|---|
| `appConfig.js` | API base URL, app name, default locale, receipt width |
| `pluginConfig.js` | Plugin mode (`builtin` / `runtime`), default enabled plugins |
| `featureFlags.js` | Boolean flags to enable/disable features without code changes |
| `environment.js` | `isDev`, `isProd`, `isElectron` helpers |
| `buildInfo.js` | App version, build date, commit hash injected at build time |

## Rules

- Config values must never be hard-coded inline in components or services.
- Feature flags allow disabling unfinished features in production builds.
- Sensitive values (API keys, credentials) must come from the OS keychain or Electron `safeStorage`, not from this folder.
