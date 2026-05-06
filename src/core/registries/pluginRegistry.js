/** @type {Map<string, object>} pluginId -> pluginMeta */
const plugins = new Map();

export function registerPlugin(meta) {
  plugins.set(meta.id, meta);
}

export function getPlugin(id) {
  return plugins.get(id);
}

export function getAllPlugins() {
  return Array.from(plugins.values());
}

export function isPluginEnabled(id) {
  const plugin = plugins.get(id);
  return plugin ? plugin.enabled !== false : false;
}

export function unregisterPlugin(id) {
  plugins.delete(id);
}
