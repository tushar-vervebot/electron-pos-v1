# src/core/styles

Global **CSS design system** – variables, reset, typography, and theme definitions.

## What goes here

| File | Purpose |
|---|---|
| `global.css` | Global base styles and Tailwind directives |
| `reset.css` | CSS reset / normalise |
| `variables.css` | All CSS custom properties (design tokens) |
| `themes.css` | Theme overrides (dark mode, kiosk mode, etc.) |
| `typography.css` | Font-face declarations and text utility classes |
| `zIndex.css` | z-index scale constants |

## CSS Variable categories defined in `variables.css`

```css
--color-primary / --color-secondary / --color-danger / --color-warning
--color-surface / --color-background / --color-text / --color-muted
--spacing-xs / -sm / -md / -lg / -xl
--radius-sm / -md / -lg
--font-size-sm / -md / -lg / -xl
```

## Rules

- **Never hard-code** colors, spacing, or radius values in component CSS files.
- Component CSS files must use variables: `background: var(--color-primary)`.
- Plugin themes override these variables via `themeRegistry`.
- Do not put component-specific styles here – each component has its own `.module.css`.
