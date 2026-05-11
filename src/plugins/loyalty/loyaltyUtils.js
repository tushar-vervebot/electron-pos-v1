/**
 * loyaltyUtils.js — Loyalty point calculations and storage
 *
 * Points rate: 1 point per $1 of product price (rounded down).
 * Stored in localStorage so they persist across sessions.
 */

const STORAGE_KEY = 'loyalty_points';

/** Calculate how many points a single product earns */
export function getPointsForProduct(product) {
  if (!product?.price || product.price <= 0) return 0;
  return Math.floor(product.price); // 1 pt per $1
}

/** Sum points across all items in the cart */
export function getLoyaltyPointsForCart(cartItems = []) {
  return cartItems.reduce((total, item) => {
    return total + getPointsForProduct(item.product) * item.quantity;
  }, 0);
}

/** Read the stored loyalty point balance */
export function getStoredPoints() {
  return parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
}

/** Add points to the stored balance */
export function addPoints(amount) {
  const current = getStoredPoints();
  localStorage.setItem(STORAGE_KEY, String(current + amount));
}

/** Reset the stored balance to zero */
export function resetPoints() {
  localStorage.setItem(STORAGE_KEY, '0');
}
