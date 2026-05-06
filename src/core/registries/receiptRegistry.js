/** @type {Map<string, {id, label, component, printRenderer, pluginId}>} */
const templates = new Map();
let activeTemplateId = null;

export function registerReceiptTemplate(config) {
  templates.set(config.id, config);
  if (!activeTemplateId) activeTemplateId = config.id;
}

export function getActiveTemplate() {
  return activeTemplateId ? templates.get(activeTemplateId) : null;
}

export function setActiveTemplate(id) {
  if (!templates.has(id)) throw new Error(`Receipt template not found: ${id}`);
  activeTemplateId = id;
}

export function getAllTemplates() {
  return Array.from(templates.values());
}

export function removeTemplatesByPluginId(pluginId) {
  for (const [id, tpl] of templates.entries()) {
    if (tpl.pluginId === pluginId) {
      templates.delete(id);
      if (activeTemplateId === id) activeTemplateId = null;
    }
  }
}
