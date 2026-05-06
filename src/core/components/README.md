# src/core/components

Reusable **UI components** shared by core pages and plugins.

## What goes here

Each component gets its own sub-folder:

```
components/
├── Button/
│   ├── Button.jsx
│   ├── Button.module.css
│   └── index.js
├── Modal/
├── Input/
├── Select/
├── ProductCard/
├── CartPanel/
├── ReceiptView/
├── DataTable/
├── Loader/
├── Badge/
├── EmptyState/
└── Toast/
```

## Rules

- Components must be **generic** – no plugin-specific logic.
- Accept `className` prop for style extension by plugins.
- Key components should support a `replaceStyles` prop for full visual replacement.
- Use **CSS variables**, not hard-coded colors or spacing.
- Each component must have its own `.module.css` file.
