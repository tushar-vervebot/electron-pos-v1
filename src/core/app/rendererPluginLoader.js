/**
 * rendererPluginLoader.js
 *
 * Declares which renderer-side (JSX) plugins are active and loads them.
 * This is the ONLY file you ever edit to install or uninstall a renderer plugin.
 *
 * Each entry is a tuple of:
 *   [pluginMeta, () => import('./path/to/plugin')]
 *
 * Plugins are loaded in order. Each plugin's default export must be:
 *   export default async function register(api) { ... }
 *
 * To install a plugin: add one tuple here.
 * To uninstall a plugin: remove that tuple — nothing else changes.
 */

import { loadPlugin } from '../../pluginAPI';

const ACTIVE_RENDERER_PLUGINS = [
  // ── Example: Loyalty plugin ──────────────────────────────────────────────
  // Uncomment the line below to activate the loyalty plugin.
  // It will:
  //   - inject a loyalty points summary into the cart footer slot (Way 2)
  //   - wrap ProductCard to show a "+N pts" badge on every card (Way 3)
  //   - add a "Loyalty" screen accessible from the header nav (Way 4)
  //
  [
    { id: 'loyalty', name: 'Loyalty Program', version: '1.0.0', enabled: true },
    () => import('../../plugins/loyalty/index.jsx'),
  ],

    [
    { id: 'test2', name: 'Test2', version: '1.0.0', enabled: true },
    () => import('../../plugins/test2/index.jsx'),
  ],

  // ── Add more renderer plugins here ───────────────────────────────────────
  // [
  //   { id: 'my-plugin', name: 'My Plugin', version: '1.0.0', enabled: true },
  //   () => import('../../plugins/my-plugin/index.jsx'),
  // ],
];

/**
 * Load all active renderer plugins.
 * Call this BEFORE rendering the React app so all registries are populated
 * before any component module is evaluated.
 */
export async function loadRendererPlugins() {
  for (const [meta, importFn] of ACTIVE_RENDERER_PLUGINS) {
    await loadPlugin(meta, importFn);
  }
}
