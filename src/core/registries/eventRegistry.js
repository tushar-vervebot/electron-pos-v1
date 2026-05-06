/** @type {Map<string, Array<{handler, pluginId}>>} eventName -> listeners[] */
const listeners = new Map();

export function on(eventName, handler, pluginId = null) {
  if (!listeners.has(eventName)) listeners.set(eventName, []);
  listeners.get(eventName).push({ handler, pluginId });

  // Return unsubscribe function
  return () => off(eventName, handler);
}

export function off(eventName, handler) {
  const callbacks = listeners.get(eventName) || [];
  listeners.set(
    eventName,
    callbacks.filter((item) => item.handler !== handler)
  );
}

export function emit(eventName, payload) {
  const callbacks = listeners.get(eventName) || [];
  callbacks.forEach(({ handler }) => {
    try {
      handler(payload);
    } catch (err) {
      console.error(`[EventBus] Error in handler for "${eventName}":`, err);
    }
  });
}

export function removeListenersByPluginId(pluginId) {
  for (const [name, callbacks] of listeners.entries()) {
    listeners.set(
      name,
      callbacks.filter((item) => item.pluginId !== pluginId)
    );
  }
}
