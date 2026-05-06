import { LoyaltyCartFooter } from './slots/LoyaltyCartFooter';
import { LoyaltyReceiptFooter } from './slots/LoyaltyReceiptFooter';
import { loyaltyService } from './services/loyaltyService';

/**
 * Loyalty plugin entry point.
 *
 * Demonstrates all four modularity mechanisms:
 *   1. Slot  — injects UI into cart footer and receipt footer
 *   2. Event — listens to order.paid to award points
 *   3. Service — registers loyaltyService for use by other plugins
 *   4. Settings — registers a settings panel entry
 */
export default function register(pluginAPI) {
  pluginAPI.logger.info('Loyalty plugin registered');

  // ── 1. Slot registrations ──────────────────────────────────────────────────

  // Show "will earn X points" in the cart footer
  pluginAPI.registerSlot('pos.cart.footer', {
    id: 'loyalty-cart-footer',
    component: LoyaltyCartFooter,
    order: 10,
  });

  // Show "earned X points" on the receipt
  pluginAPI.registerSlot('receipt.footer', {
    id: 'loyalty-receipt-footer',
    component: LoyaltyReceiptFooter,
    order: 10,
  });

  // ── 2. Event listener ──────────────────────────────────────────────────────

  // Award points when an order is paid
  pluginAPI.events.on('order.paid', ({ order }) => {
    const customerName = order?.customer_name;
    const total = order?.total ?? 0;

    if (customerName && total > 0) {
      const newBalance = loyaltyService.addPoints(customerName, total);
      pluginAPI.logger.info(`Awarded ${Math.floor(total)} points to "${customerName}". Balance: ${newBalance}`);
    }
  });

  // ── 3. Service registration ────────────────────────────────────────────────

  // Expose loyalty service so other plugins can query point balances
  pluginAPI.registerService('loyalty', loyaltyService);

  // ── 4. Settings panel ─────────────────────────────────────────────────────

  pluginAPI.registerSettingsPanel({
    id: 'loyalty-settings',
    label: 'Loyalty Points',
    icon: '⭐',
    component: null, // placeholder — implement a settings UI component here
  });
}
