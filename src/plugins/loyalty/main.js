'use strict';

/**
 * loyalty/main.js — Main-process (Electron) entry for the Loyalty Points plugin.
 *
 * The main process uses require() (CommonJS), so this is a separate CJS entry.
 * Heavy lifting (slots, React components) lives in index.js (ESM), which is
 * loaded by the renderer via bootstrap.js dynamic import().
 *
 * Main-process responsibilities:
 *   - Listen for the 'cart:checkout' hook to log loyalty point activity
 *   - Expose an IPC handler so the renderer can query point balances from here
 *     if needed in the future
 */

const path = require('path');
const fs   = require('fs');

module.exports = {
  activate(api) {
    api.logger.info('Loyalty plugin (main process) activated.');

    // ── Persist loyalty points in userData ────────────────────────────────
    let pointsPath = null;
    let pointsData = {};

    try {
      const { app } = require('electron');
      const dataDir = path.join(app.getPath('userData'), 'loyalty');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      pointsPath = path.join(dataDir, 'points.json');
      if (fs.existsSync(pointsPath)) {
        pointsData = JSON.parse(fs.readFileSync(pointsPath, 'utf8'));
      }
    } catch (err) {
      api.logger.warn('Loyalty: could not set up storage:', err.message);
    }

    function savePoints() {
      if (!pointsPath) return;
      try { fs.writeFileSync(pointsPath, JSON.stringify(pointsData, null, 2), 'utf8'); } catch (_) {}
    }

    // ── Hook: award points on checkout ────────────────────────────────────
    api.hooks.on('cart:checkout', (data) => {
      const customer = data?.customerName;
      const total    = Number(data?.total || 0);
      if (!customer || total <= 0) return;

      const earned = Math.floor(total);
      pointsData[customer] = (pointsData[customer] || 0) + earned;
      savePoints();
      api.logger.info(`Loyalty: awarded ${earned} pts to "${customer}". Balance: ${pointsData[customer]}`);
    });

    // ── IPC: get points balance ───────────────────────────────────────────
    api.ipc.handle('get-points', (_event, { customerName } = {}) => {
      if (!customerName) return { points: 0 };
      return { points: pointsData[customerName] || 0 };
    });
  },

  deactivate() {
    // IPC handlers are cleaned up automatically by PluginManager
  },
};
