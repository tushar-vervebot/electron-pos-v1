/**
 * componentRegistry.js — Registry for replaceable core UI components.
 *
 * Plugins can override specific named components (e.g. the receipt card,
 * the product card, the cart total row) by registering a replacement.
 * Core components call getComponent(name, DefaultComponent) to get
 * either the override or the default.
 */

/** @type {Map<string, {component: React.ComponentType, pluginId: string}>} */
const components = new Map();

/**
 * Register a replacement for a named core component.
 * @param {string} name - Component name key (e.g. 'receipt.card')
 * @param {React.ComponentType} component - Replacement React component
 * @param {string} pluginId - Owning plugin ID
 */
export function registerComponent(name, component, pluginId) {
  components.set(name, { component, pluginId });
}

/**
 * Get the registered override for a component, or the default if none.
 * @param {string} name - Component name key
 * @param {React.ComponentType} DefaultComponent - Fallback component
 * @returns {React.ComponentType}
 */
export function getComponent(name, DefaultComponent) {
  return components.get(name)?.component ?? DefaultComponent;
}

export function hasComponent(name) {
  return components.has(name);
}

export function removeComponentsByPluginId(pluginId) {
  for (const [name, entry] of components.entries()) {
    if (entry.pluginId === pluginId) components.delete(name);
  }
}
