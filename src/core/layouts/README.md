# src/core/layouts

Reusable **screen layout** structures.

## What goes here

```
layouts/
├── POSLayout/        – Header + product grid + cart sidebar
├── DashboardLayout/  – Dashboard shell with sidebar navigation
├── AuthLayout/       – Centered card layout for login
├── SettingsLayout/   – Settings shell with menu + panel area
└── CustomerDisplayLayout/ – Full-screen customer-facing display
```

## Rules

- Layouts define **structure only** (header, aside, main, footer).
- Use `<Slot>` components inside layouts so plugins can inject UI.
- Accept children or named render props for flexible content areas.
- Never put business logic inside a layout.

## Example slots a layout exposes

```
app.header.left
app.header.right
app.sidebar.top
app.sidebar.bottom
```
