/** @type {Map<string, {id, label, component, pluginId}>} */
const panels = new Map();

export function registerSettingsPanel(config) {
  panels.set(config.id, config);
}

export function getAllSettingsPanels() {
  return Array.from(panels.values());
}

export function removeSettingsPanelsByPluginId(pluginId) {
  for (const [id, panel] of panels.entries()) {
    if (panel.pluginId === pluginId) panels.delete(id);
  }
}
