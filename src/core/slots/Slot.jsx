import React from 'react';
import { getSlotItems } from '../registries/slotRegistry';

/**
 * Renders all components registered to the given slot name.
 *
 * @param {{ name: string, props?: object }} param0
 */
export function Slot({ name, props = {} }) {
  const items = getSlotItems(name);

  if (!items.length) return null;

  return (
    <>
      {items.map((item) => {
        const Component = item.component;
        return <Component key={item.id} {...props} />;
      })}
    </>
  );
}
