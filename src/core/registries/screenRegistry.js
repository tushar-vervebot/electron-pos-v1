/** @type {Map<string, {id, path, label, component, permission, pluginId}>} */
const screens = new Map();

export function registerScreen(id, config) {
  if (screens.has(id)) {
    throw new Error(`Screen already registered: ${id}`);
  }
  screens.set(id, { ...config, id });
}

export function getScreen(id) {
  return screens.get(id);
}

export function getAllScreens() {
  return Array.from(screens.values());
}

export function removeScreensByPluginId(pluginId) {
  for (const [id, screen] of screens.entries()) {
    if (screen.pluginId === pluginId) screens.delete(id);
  }
}
