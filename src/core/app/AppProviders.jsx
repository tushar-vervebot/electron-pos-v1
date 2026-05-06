import React, { createContext, useContext, useState, useCallback } from 'react';
import { getAllPlugins } from '../registries/pluginRegistry';
import { applyThemeVariables } from '../registries/themeRegistry';

// ── Plugin Context ─────────────────────────────────────────────────────────
const PluginContext = createContext({
  plugins: [],
  reloadPlugins: () => {},
});

export function usePlugins() {
  return useContext(PluginContext);
}

// ── AppProviders ───────────────────────────────────────────────────────────
/**
 * AppProviders — wraps the entire React tree with shared contexts.
 * Add new providers here as the system grows (auth, i18n, etc.).
 */
export function AppProviders({ children }) {
  const [pluginList, setPluginList] = useState(() => getAllPlugins());

  const reloadPlugins = useCallback(() => {
    setPluginList(getAllPlugins());
  }, []);

  return (
    <PluginContext.Provider value={{ plugins: pluginList, reloadPlugins }}>
      {children}
    </PluginContext.Provider>
  );
}
