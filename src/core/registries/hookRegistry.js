/** @type {Map<string, Array<{handler, order, pluginId}>>} hookName -> handlers[] */
const hooks = new Map();

export function registerHook(name, handler, options = {}) {
  if (!hooks.has(name)) hooks.set(name, []);

  hooks.get(name).push({
    handler,
    order: options.order ?? 100,
    pluginId: options.pluginId ?? null,
  });

  hooks.get(name).sort((a, b) => a.order - b.order);
}

export async function runHooks(name, payload) {
  const handlers = hooks.get(name) || [];
  let result = payload;

  for (const item of handlers) {
    result = await item.handler(result);
  }

  return result;
}

export function removeHooksByPluginId(pluginId) {
  for (const [name, handlers] of hooks.entries()) {
    hooks.set(
      name,
      handlers.filter((h) => h.pluginId !== pluginId)
    );
  }
}
