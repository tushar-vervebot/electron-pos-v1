/**
 * componentRegistry.js — Way 1: Component Override
 *
 * Lets a plugin completely replace a named UI section.
 * Base code asks getComponent(name, FallbackComponent) before rendering.
 * If no plugin registered an override the fallback is returned unchanged.
 *
 * @type {Map<string, {component: React.ComponentType, pluginId: string}>}
 */
const registry = new Map();

/**
 * Register a plugin component that replaces a named slot.
 * @param {string} name        - Unique component key (e.g. 'cart.DiscountRow')
 * @param {React.ComponentType} component
 * @param {string} pluginId    - Owner plugin id (for cleanup on unload)
 */
export function registerComponent(name, component, pluginId) {
  registry.set(name, { component, pluginId });
}

/**
 * Retrieve the active component for the given name.
 * Falls back to `fallback` when no plugin has registered an override.
 *
 * @param {string} name
 * @param {React.ComponentType} fallback - The base component to use when no override exists
 * @returns {React.ComponentType}
 */
export function getComponent(name, fallback) {
  return registry.get(name)?.component ?? fallback;
}

/**
 * Remove all component overrides registered by a specific plugin.
 * Called automatically when a plugin is unloaded.
 * @param {string} pluginId
 */
export function removeComponentsByPluginId(pluginId) {
  for (const [name, entry] of registry.entries()) {
    if (entry.pluginId === pluginId) registry.delete(name);
  }
}
