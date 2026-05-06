import React from 'react';
import { getSlotItems } from '../registries/slotRegistry';
import { ErrorBoundary } from '../app/ErrorBoundary';

/**
 * Renders all components registered to the given slot name.
 * Each item is wrapped in an ErrorBoundary so one crashing plugin
 * cannot break sibling slot items or the host page.
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
        return (
          <ErrorBoundary key={item.id} showDetail={false}>
            <Component {...props} />
          </ErrorBoundary>
        );
      })}
    </>
  );
}
