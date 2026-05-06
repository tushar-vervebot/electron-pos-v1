# src/core/app

Root **application bootstrap** files.

## What goes here

| File | Purpose |
|---|---|
| `App.jsx` | Root React component – wraps providers and router |
| `Router.jsx` | Main route rendering (core routes + plugin-registered routes) |
| `AppProviders.jsx` | Wraps the app with providers: store, theme, auth, plugin context |
| `Startup.jsx` | Runs startup tasks: load settings, check health, init enabled plugins |
| `ErrorBoundary.jsx` | Prevents a plugin crash from breaking the whole app |
| `PluginBootstrap.jsx` | Calls `bootstrapPlugins()` after core services are ready |

## Rules

- `App.jsx` must stay thin – only wraps providers and router.
- Plugin registration happens in `PluginBootstrap.jsx`, not in `App.jsx`.
- Use `ErrorBoundary` around plugin-rendered areas.
