/**
 * Loyalty points service.
 * In a real app this would call an API. Here it uses localStorage for demo.
 */

const STORAGE_KEY = 'pos:loyalty:points';

function loadPoints() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function savePoints(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export const loyaltyService = {
  /**
   * Get points balance for a customer name (used as key for demo).
   * @param {string} customerName
   * @returns {number}
   */
  getPoints(customerName) {
    if (!customerName) return 0;
    return loadPoints()[customerName] ?? 0;
  },

  /**
   * Add points for a completed order.
   * Rule: 1 point per whole dollar spent.
   * @param {string} customerName
   * @param {number} orderTotal
   * @returns {number} new balance
   */
  addPoints(customerName, orderTotal) {
    if (!customerName) return 0;
    const earned = Math.floor(orderTotal);
    const map = loadPoints();
    map[customerName] = (map[customerName] ?? 0) + earned;
    savePoints(map);
    return map[customerName];
  },

  /**
   * Calculate how many points an order will earn.
   * @param {number} orderTotal
   * @returns {number}
   */
  calcEarned(orderTotal) {
    return Math.floor(orderTotal);
  },
};
