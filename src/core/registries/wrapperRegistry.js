import React from 'react';

/**
 * wrapperRegistry.js — Way 3: Component Wrapper
 *
 * Lets a plugin add JSX around an existing component (badges, overlays, borders)
 * without touching the original component's code.
 *
 * The base component calls:
 *   export const MyComponent = getWrapped('MyComponent', BaseMyComponent);
 * OR the parent calls it at render time (Option B – base file untouched).
 *
 * @type {Map<string, {wrapper: React.ComponentType, pluginId: string}>}
 */
const wrappers = new Map();

/**
 * Register a wrapper for a named component.
 * The wrapper receives `WrappedComponent` as a prop alongside all original props.
 *
 * @param {string} name                   - Component key (e.g. 'ProductCard')
 * @param {React.ComponentType} WrapperComponent
 * @param {string} pluginId               - Owner plugin id
 */
export function wrapComponent(name, WrapperComponent, pluginId) {
  wrappers.set(name, { wrapper: WrapperComponent, pluginId });
}

/**
 * Return a wrapped version of BaseComponent when a wrapper is registered,
 * or BaseComponent unchanged when no wrapper is active.
 *
 * @param {string} name
 * @param {React.ComponentType} BaseComponent
 * @returns {React.ComponentType}
 */
export function getWrapped(name, BaseComponent) {
  const entry = wrappers.get(name);
  if (!entry) return BaseComponent;

  const Wrapper = entry.wrapper;

  // Return a stable named component so React's reconciler keeps the same node type
  function WrappedVersion(props) {
    return <Wrapper WrappedComponent={BaseComponent} {...props} />;
  }
  WrappedVersion.displayName = `Wrapped(${name})`;

  return WrappedVersion;
}

/**
 * Remove all wrappers registered by a specific plugin.
 * Called automatically when a plugin is unloaded.
 * @param {string} pluginId
 */
export function removeWrappersByPluginId(pluginId) {
  for (const [name, entry] of wrappers.entries()) {
    if (entry.pluginId === pluginId) wrappers.delete(name);
  }
}
