/**
 * appConfig.js — Application-level configuration.
 *
 * Values can be overridden at build time via environment variables.
 * Access config values through this module — never read process.env directly
 * in component or service code.
 */

export const appConfig = {
  /** Application name shown in the UI and window title */
  appName: 'POS System',

  /** API base URL — set via VITE_API_URL environment variable */
  apiBaseUrl: import.meta.env?.VITE_API_URL ?? 'http://localhost:8000/api',

  /** WebSocket URL for live updates */
  wsUrl: import.meta.env?.VITE_WS_URL ?? 'ws://localhost:8001',

  /** Tax rate as a decimal (0.10 = 10%) */
  defaultTaxRate: 0.10,

  /** Maximum products per page in the product grid */
  productPageSize: 50,

  /** Maximum cart history entries kept in local storage */
  maxCartHistoryEntries: 100,

  /** Whether to enable plugin hot-reload in development */
  pluginHotReload: import.meta.env?.DEV ?? false,
};
