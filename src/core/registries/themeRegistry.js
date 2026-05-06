/** @type {Map<string, Record<string, string>>} themeId -> CSS variable map */
const themes = new Map();
let activeThemeId = null;

export function registerTheme(id, variables) {
  themes.set(id, variables);
}

export function applyTheme(id) {
  const variables = themes.get(id);
  if (!variables) throw new Error(`Theme not found: ${id}`);

  const root = document.documentElement;
  Object.entries(variables).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  activeThemeId = id;
}

export function applyThemeVariables(variables) {
  const root = document.documentElement;
  Object.entries(variables).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

export function removeThemesByPluginId(pluginId) {
  for (const [id, theme] of themes.entries()) {
    if (theme._pluginId === pluginId) themes.delete(id);
  }
}
