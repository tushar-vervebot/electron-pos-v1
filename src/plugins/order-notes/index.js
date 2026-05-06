'use strict';

/**
 * order-notes/index.js
 *
 * Lets cashiers attach a free-text note to the current order.
 * Demonstrates:
 *   - Persistent storage (notes log saved to app userData)
 *   - Reacting to cart:checkout and cart:cleared hooks
 *   - Multiple IPC handlers (set-note, get-note, get-history, clear-note)
 *   - Pushing updates back to the renderer via api.ipc.sendToMain()
 */

const fs   = require('fs');
const path = require('path');

module.exports = {
  activate(api) {
    api.logger.info('Order Notes plugin activated.');

    // ── Storage setup ───────────────────────────────────────────────────────
    let notesLogPath = null;
    try {
      const { app } = require('electron');
      const dataDir = path.join(app.getPath('userData'), 'order-notes');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      notesLogPath = path.join(dataDir, 'notes-history.json');
      if (!fs.existsSync(notesLogPath)) fs.writeFileSync(notesLogPath, '[]', 'utf8');
    } catch (err) {
      api.logger.warn('Could not set up notes storage:', err.message);
    }

    // In-memory current note for the active order
    let currentNote = '';

    function readHistory() {
      try {
        return JSON.parse(fs.readFileSync(notesLogPath, 'utf8'));
      } catch (_) {
        return [];
      }
    }

    function appendHistory(entry) {
      try {
        const history = readHistory();
        history.unshift(entry);          // newest first
        const trimmed = history.slice(0, 50); // keep last 50
        fs.writeFileSync(notesLogPath, JSON.stringify(trimmed, null, 2), 'utf8');
      } catch (err) {
        api.logger.warn('Could not save note history:', err.message);
      }
    }

    // ── IPC Handlers ────────────────────────────────────────────────────────

    // Save (or update) the note for the current order
    // Channel: plugin:order-notes:set-note
    api.ipc.handle('set-note', async (_event, payload) => {
      const note = String(payload?.note ?? '').trim();
      currentNote = note;
      api.logger.info(`Note set: "${note}"`);
      // Push the updated note back to the renderer panel output
      api.ipc.sendToMain('note-updated', { note: currentNote });
      return { ok: true, note: currentNote };
    });

    // Get the current active note
    // Channel: plugin:order-notes:get-note
    api.ipc.handle('get-note', async () => {
      return { ok: true, note: currentNote };
    });

    // Get saved notes history
    // Channel: plugin:order-notes:get-history
    api.ipc.handle('get-history', async () => {
      return { ok: true, history: readHistory() };
    });

    // Clear the current note without checkout
    // Channel: plugin:order-notes:clear-note
    api.ipc.handle('clear-note', async () => {
      currentNote = '';
      api.ipc.sendToMain('note-updated', { note: '' });
      api.logger.info('Note cleared manually.');
      return { ok: true };
    });

    // ── Lifecycle Hooks ─────────────────────────────────────────────────────

    // On checkout: save note to history along with order summary
    api.hooks.on('cart:checkout', (data) => {
      if (!currentNote) return;

      const entry = {
        note:      currentNote,
        total:     Number(data?.total ?? 0).toFixed(2),
        itemCount: data?.cart?.length ?? 0,
        savedAt:   new Date().toISOString(),
      };

      appendHistory(entry);
      api.logger.info(`Note saved to history for order $${entry.total}: "${currentNote}"`);

      // Keep note visible until cart is cleared
    });

    // On cart cleared: wipe the current note
    api.hooks.on('cart:cleared', () => {
      if (currentNote) {
        api.logger.info('Cart cleared — note reset.');
        currentNote = '';
        api.ipc.sendToMain('note-updated', { note: '' });
      }
    });

    // ── UI Panel ────────────────────────────────────────────────────────────
    api.renderer.addPanel('panel.html');
  },

  deactivate() {},
};
