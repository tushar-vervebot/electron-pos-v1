import { on, off, emit, removeListenersByPluginId } from '../registries/eventRegistry';

export const eventBus = { on, off, emit, removeListenersByPluginId };
export default eventBus;
