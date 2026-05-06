import { useEffect, useRef } from 'react';
import { bootstrapPlugins } from '../../bootstrap';

/**
 * PluginBootstrap — runs bootstrapPlugins() exactly once after the core app
 * has mounted. Placing it inside the React tree ensures the store and context
 * are ready before any plugin registers slots/hooks.
 */
export function PluginBootstrap({ onReady }) {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    bootstrapPlugins()
      .then(() => {
        if (onReady) onReady();
      })
      .catch((err) => {
        console.error('[PluginBootstrap] Failed to bootstrap plugins:', err);
      });
  }, []);

  return null; // renders nothing — side-effect only
}
