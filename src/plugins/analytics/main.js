'use strict';

/**
 * analytics/main.js — Main-process stub for the Analytics plugin.
 *
 * TO IMPLEMENT:
 *   - Collect cart:checkout events and write them to a local SQLite or JSON log.
 *   - Batch-upload anonymised sales data to a configurable HTTP endpoint.
 *   - Expose IPC handlers: get-daily-summary, get-weekly-summary, clear-log.
 */

const path = require('path');
const fs   = require('fs');

module.exports = {
  activate(api) {
    api.logger.info('Analytics plugin activated (stub — not yet implemented).');

    // Skeleton: log each checkout event to a local JSON file
    let logPath = null;
    try {
      const { app } = require('electron');
      const dir = path.join(app.getPath('userData'), 'analytics');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      logPath = path.join(dir, 'events.jsonl');
    } catch (_) {}

    api.hooks.on('cart:checkout', (data) => {
      if (!logPath) return;
      const entry = JSON.stringify({ ts: new Date().toISOString(), total: data?.total, items: data?.cart?.length }) + '\n';
      try { fs.appendFileSync(logPath, entry, 'utf8'); } catch (_) {}
    });
  },
  deactivate() {},
};
