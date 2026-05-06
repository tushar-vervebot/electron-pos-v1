/** @type {Map<string, {id, label, component, processPayment, order, permission, pluginId}>} */
const methods = new Map();

export function registerPaymentMethod(config) {
  methods.set(config.id, { order: 100, ...config });
}

export function getPaymentMethod(id) {
  return methods.get(id) || null;
}

export function getAllPaymentMethods() {
  return Array.from(methods.values()).sort((a, b) => a.order - b.order);
}

export function removePaymentMethodsByPluginId(pluginId) {
  for (const [id, method] of methods.entries()) {
    if (method.pluginId === pluginId) methods.delete(id);
  }
}
