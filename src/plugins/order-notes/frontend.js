import { OrderNoteInput } from './slots/OrderNoteInput';

/**
 * Order Notes plugin (frontend).
 *
 * Injects a note input field into the cart footer slot.
 * The note is stored in the POS store and included in the order on checkout.
 */
export default function register(pluginAPI) {
  pluginAPI.logger.info('Order Notes plugin registered');

  pluginAPI.registerSlot('pos.cart.footer', {
    id: 'order-notes-input',
    component: OrderNoteInput,
    order: 5, // appears before the loyalty points row
  });
}
