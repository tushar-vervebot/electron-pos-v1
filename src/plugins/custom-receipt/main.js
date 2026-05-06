'use strict';

/**
 * custom-receipt/main.js — Main-process stub for the Custom Receipt plugin.
 *
 * TO IMPLEMENT:
 *   - Register a replacement receipt renderer that overrides the default template.
 *   - Support logo image path, custom header/footer text, and barcode generation.
 *   - Expose IPC handler: get-template to serve the custom template to the renderer.
 */

module.exports = {
  activate(api) {
    api.logger.info('Custom Receipt plugin activated (stub — not yet implemented).');
  },
  deactivate() {},
};
