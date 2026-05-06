# installed-plugins

**Runtime-installed external plugins** – installed after app deployment.

## Purpose

This folder holds plugins that are installed by the administrator at runtime,
outside the normal app build process. These are customer-specific or third-party
extensions that are NOT bundled with the app.

## Folder structure per plugin

```
installed-plugins/
└── my-plugin-name/
    ├── plugin.json          Metadata, version, permissions
    ├── renderer.bundle.js   Built and bundled renderer-side code
    ├── main.bundle.js       Built and bundled main-process-side code (if any)
    ├── styles.css           Compiled styles
    └── assets/              Icons, images
```

## Install flow

1. Admin selects a plugin package (`.zip` or folder).
2. App validates `plugin.json` format and version compatibility.
3. App optionally verifies plugin signature.
4. App copies the plugin into this folder.
5. Plugin is marked **installed but disabled**.
6. Admin enables the plugin from the Settings → Plugin Manager screen.
7. App loads and registers the plugin.

## Use cases for runtime plugins

- Customer-specific tax rules
- Regional invoice formats
- Custom payment provider integrations
- Store-specific promotions
- Custom hardware integrations

## Security

- Plugin code runs in a **restricted** `pluginAPI` context.
- Plugins can only access services they have declared permission for.
- Plugin signing is recommended for production deployments.
