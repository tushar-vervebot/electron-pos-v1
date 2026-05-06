# POS System Auto-Update

This project is configured for Windows in-app updates with `electron-builder`, `electron-updater`, and a generic HTTP update server.

## Current update server

The app is currently configured to check:

`http://192.168.1.92:8080`

That machine should be your main PC or another server reachable from the other PCs on the same network.

## First-time install on a new PC

1. Build the installer on the main PC:
   `npm run dist:win`
2. Send the generated installer from `dist/` to the new PC:
   `POS-System-Setup-1.0.3.exe`
3. Install it on the new PC.

## Sending a new update later

Every time you change the app and want other PCs to update:

1. Increase the version in `package.json`.
   Example: `1.0.3` -> `1.0.4`
2. Build the new Windows installer:
   `npm run dist:win`
3. Start the update server from the project root on the main PC:
   `npm run serve:updates`

The `dist/` folder must contain at least:

- `latest.yml`
- the new setup `.exe`
- the new `.blockmap`

## What the installed app does

When the installed app starts on the other PC:

1. It checks the configured server for `latest.yml`.
2. If a newer version exists, it shows an update prompt.
3. If the user clicks `Download`, the app downloads the update.
4. When the download finishes, the app shows `Install and Restart`.
5. Clicking that button installs the update and restarts the app.

## Important rules

- The server must stay reachable from the target PCs.
- You must increase the app version for every release.
- Keep the old and new update files in `dist/` while serving updates.
- If your main PC IP changes, update the publish URL in `package.json` and rebuild the installer.

## Quick release example

1. Change code.
2. Edit `package.json` version to `1.0.4`.
3. Run `npm run dist:win`.
4. Run `npm run serve:updates` on the main PC.
5. Open the app on the other PC.
6. Accept `Download`.
7. Accept `Install and Restart`.

---

## Rollback / Blocked Version Support

The app now checks `blocked.json` on the update server **before** doing the normal update check.

### How it works

On every startup (5 seconds after launch), the app:
1. Downloads `http://your-server/blocked.json`
2. Checks if its own version is in `blocked_versions`
3. If **not blocked** → normal update check runs as before
4. If **blocked** → shows a "Version Recalled" dialog → silently downloads `previous.yml` target → installs and restarts automatically

### blocked.json (live in dist/)

```json
{
  "blocked_versions": [],
  "minimum_version": "1.0.0"
}
```

- `blocked_versions` — list of version strings that must not run (e.g. `["1.0.5"]`)
- `minimum_version` — any version older than this is also force-rolled back

### Release workflow (with rollback support)

Every time you publish a new version:

1. **Before building the new version**, copy the current `latest.yml` → `previous.yml` in `dist/`
2. Keep the current installer `.exe` in `dist/` (do not delete it — it is the rollback target)
3. Bump version in `package.json`, build, drop new `.exe` + `latest.yml` into `dist/`

```
dist/
  blocked.json          ← you maintain this
  latest.yml            ← points to the NEW build
  previous.yml          ← copy of the OLD latest.yml (rollback target)
  POS-System-Setup-1.0.6.exe   ← new build
  POS-System-Setup-1.0.5.exe   ← old build (kept as rollback target)
```

### To roll back a bad release

If version `1.0.6` is bad:

1. Open `dist/blocked.json` on the server
2. Add `"1.0.6"` to `blocked_versions`
3. Make sure `previous.yml` still points to `1.0.5`
4. Make sure `POS-System-Setup-1.0.5.exe` is still in `dist/`

That's it. Every client running `1.0.6` will automatically downgrade to `1.0.5` on their next startup. No manual visit required.

### To test rollback manually

1. Build and install version A (e.g. `1.0.13`) on the test PC
2. Build version B (e.g. `1.0.14`) and push it as an OTA update — test PC updates to B
3. Copy `latest.yml` → `previous.yml` in `dist/` (so B is the rollback target — adjust to your scenario)
4. Add `"1.0.14"` to `blocked_versions` in `dist/blocked.json`
5. Restart the app on the test PC — it should show the "Version Recalled" dialog and roll back automatically