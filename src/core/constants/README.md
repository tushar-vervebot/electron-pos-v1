# src/core/constants

Shared **constants** used across core and plugins.

## What goes here

| File | Purpose |
|---|---|
| `routes.js` | All route path strings |
| `permissions.js` | Permission key constants (`orders:read`, `payments:create`, …) |
| `paymentTypes.js` | Payment method ID constants |
| `eventNames.js` | All event name strings (mirrors `src/core/events/eventNames.js`) |
| `hookNames.js` | All hook name strings |
| `slotNames.js` | All slot name strings |
| `storageKeys.js` | localStorage / IndexedDB key strings |

## Rules

- Never hard-code event/slot/hook names as string literals in components or services.
- Always import from these constants files.
- Keeps renaming safe and searchable.
