/**
 * permissionRegistry.js — Tracks permission rules declared by plugins.
 *
 * Plugins declare required permissions in plugin.json.
 * This registry stores custom permission rules that extend the base
 * PERMISSIONS constants for plugin-specific access control.
 */

/** @type {Map<string, {description: string, pluginId: string}>} */
const rules = new Map();

/**
 * Register a custom permission rule.
 * @param {string} permission - Permission string (e.g. 'loyalty:redeem')
 * @param {string} description - Human-readable description
 * @param {string} pluginId - Plugin that owns this permission
 */
export function registerPermission(permission, description, pluginId) {
  rules.set(permission, { description, pluginId });
}

export function getPermission(permission) {
  return rules.get(permission) || null;
}

export function getAllPermissions() {
  return Array.from(rules.entries()).map(([permission, meta]) => ({ permission, ...meta }));
}

export function removePermissionsByPluginId(pluginId) {
  for (const [permission, entry] of rules.entries()) {
    if (entry.pluginId === pluginId) rules.delete(permission);
  }
}
