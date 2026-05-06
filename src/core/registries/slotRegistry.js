/** @type {Map<string, Array<{id, component, order, pluginId}>>} slotName -> items[] */
const slots = new Map();

export function registerSlot(slotName, item) {
  if (!slots.has(slotName)) slots.set(slotName, []);

  const items = slots.get(slotName);
  items.push({ order: 100, ...item });
  items.sort((a, b) => a.order - b.order);
}

export function getSlotItems(slotName) {
  return slots.get(slotName) || [];
}

export function removeSlotsByPluginId(pluginId) {
  for (const [name, items] of slots.entries()) {
    slots.set(
      name,
      items.filter((item) => item.pluginId !== pluginId)
    );
  }
}
