import * as screenRegistry from './core/registries/screenRegistry';
import * as slotRegistry from './core/registries/slotRegistry';
import * as hookRegistry from './core/registries/hookRegistry';
import * as serviceRegistry from './core/registries/serviceRegistry';
import * as paymentRegistry from './core/registries/paymentRegistry';
import * as receiptRegistry from './core/registries/receiptRegistry';
import * as themeRegistry from './core/registries/themeRegistry';
import * as settingsRegistry from './core/registries/settingsRegistry';
import * as pluginRegistry from './core/registries/pluginRegistry';
import * as componentRegistry from './core/registries/componentRegistry';
import * as wrapperRegistry from './core/registries/wrapperRegistry';
import { eventBus } from './core/events/eventBus';

/**
 * Create a sandboxed plugin API object scoped to one plugin.
 * @param {object} pluginMeta - The plugin's plugin.json manifest
 * @returns {object} pluginAPI
 */
export function createPluginAPI(pluginMeta) {
  return {
    // ── Registration ─────────────────────────────────────────────
    registerScreen: (id, config) =>
      screenRegistry.registerScreen(id, { ...config, pluginId: pluginMeta.id }),

    registerSlot: (slotName, item) =>
      slotRegistry.registerSlot(slotName, { ...item, pluginId: pluginMeta.id }),

    registerHook: (name, handler, options = {}) =>
      hookRegistry.registerHook(name, handler, { ...options, pluginId: pluginMeta.id }),

    registerService: (name, service, requiredPermission = null) =>
      serviceRegistry.registerService(name, { ...service, _pluginId: pluginMeta.id }, requiredPermission),

    registerPaymentMethod: (config) =>
      paymentRegistry.registerPaymentMethod({ ...config, pluginId: pluginMeta.id }),

    registerReceiptTemplate: (config) =>
      receiptRegistry.registerReceiptTemplate({ ...config, pluginId: pluginMeta.id }),

    registerTheme: (id, variables) =>
      themeRegistry.registerTheme(id, { ...variables, _pluginId: pluginMeta.id }),

    registerSettingsPanel: (config) =>
      settingsRegistry.registerSettingsPanel({ ...config, pluginId: pluginMeta.id }),

    // ── UI component overrides (Way 1 & Way 3 from POS_MODULARITY_JSX.md) ──
    registerComponent: (name, component) =>
      componentRegistry.registerComponent(name, component, pluginMeta.id),

    wrapComponent: (name, WrapperComponent) =>
      wrapperRegistry.wrapComponent(name, WrapperComponent, pluginMeta.id),

    // ── Service access ───────────────────────────────────────────
    getService: (name) =>
      serviceRegistry.getServiceForPlugin(pluginMeta, name),

    // ── Events ──────────────────────────────────────────────────
    events: {
      on:   (eventName, handler) => eventBus.on(eventName, handler, pluginMeta.id),
      off:  eventBus.off,
      emit: eventBus.emit,
    },

    // ── Metadata ─────────────────────────────────────────────────
    plugin: pluginMeta,
    logger: {
      info:  (...args) => console.info(`[${pluginMeta.id}]`, ...args),
      warn:  (...args) => console.warn(`[${pluginMeta.id}]`, ...args),
      error: (...args) => console.error(`[${pluginMeta.id}]`, ...args),
    },
  };
}

/**
 * Load a single front-end plugin.
 * @param {object} pluginMeta - plugin.json manifest
 * @param {() => Promise<{default: function}>} importEntry - dynamic import function
 */
export async function loadPlugin(pluginMeta, importEntry) {
  if (pluginMeta.enabled === false) return;

  let pluginModule;
  try {
    pluginModule = await importEntry();
  } catch (err) {
    console.error(`[PluginLoader] Failed to import plugin "${pluginMeta.id}":`, err);
    return;
  }

  const register = pluginModule.default;
  if (typeof register !== 'function') {
    console.error(`[PluginLoader] Plugin "${pluginMeta.id}" must export a default register(pluginAPI) function`);
    return;
  }

  const api = createPluginAPI(pluginMeta);

  try {
    await register(api);
    pluginRegistry.registerPlugin({ ...pluginMeta, enabled: true });
    console.info(`[PluginLoader] Plugin "${pluginMeta.id}" loaded`);
  } catch (err) {
    console.error(`[PluginLoader] Plugin "${pluginMeta.id}" threw during registration:`, err);
  }
}

/**
 * Unload (disable) a plugin – removes all its registered entries.
 * @param {string} pluginId
 */
export function unloadPlugin(pluginId) {
  slotRegistry.removeSlotsByPluginId(pluginId);
  hookRegistry.removeHooksByPluginId(pluginId);
  eventBus.removeListenersByPluginId(pluginId);
  screenRegistry.removeScreensByPluginId(pluginId);
  paymentRegistry.removePaymentMethodsByPluginId(pluginId);
  receiptRegistry.removeTemplatesByPluginId(pluginId);
  settingsRegistry.removeSettingsPanelsByPluginId(pluginId);
  serviceRegistry.removeServicesByPluginId(pluginId);
  componentRegistry.removeComponentsByPluginId(pluginId);
  wrapperRegistry.removeWrappersByPluginId(pluginId);
  pluginRegistry.unregisterPlugin(pluginId);

  console.info(`[PluginLoader] Plugin "${pluginId}" unloaded`);
}
