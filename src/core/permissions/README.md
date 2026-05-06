# src/core/permissions

**Permission and access control** system.

## What goes here

| File | Purpose |
|---|---|
| `permissionGuard.js` | React component / HOC that blocks render if permission missing |
| `roleManager.js` | Manages user roles: cashier, supervisor, admin |
| `accessRules.js` | Defines which roles can access which resources |
| `pluginPermissions.js` | Checks if a plugin has declared a required permission |
| `permissionChecker.js` | `can(user, action)` helper used throughout the app |

## Permission key examples

```
orders:read       orders:create     orders:update     orders:delete
customers:read    customers:update  payments:create   payments:refund
printer:use       barcode:read      settings:read     settings:update
reports:view      hardware:cctv
```

## Rules

- Every IPC service call must check the caller's permissions.
- Plugin API must expose only allowed services based on `plugin.json` declared permissions.
- Use `<PermissionGuard permission="payments:refund">` in UI components.
