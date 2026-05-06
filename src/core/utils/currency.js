/**
 * currency.js — Currency formatting utilities.
 * No React state. No side effects. Pure functions.
 */

/**
 * Format a number as a currency string.
 * @param {number} amount
 * @param {string} [currencyCode='USD']
 * @param {string} [locale='en-US']
 * @returns {string}
 */
export function formatCurrency(amount, currencyCode = 'USD', locale = 'en-US') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format as a plain price string (e.g. "$12.50").
 * @param {number} amount
 * @returns {string}
 */
export function formatPrice(amount) {
  return `$${(amount ?? 0).toFixed(2)}`;
}

/**
 * Round to 2 decimal places (avoids floating-point drift).
 * @param {number} amount
 * @returns {number}
 */
export function roundMoney(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Calculate tax amount from a subtotal.
 * @param {number} subtotal
 * @param {number} [rate=0.10] - Tax rate as decimal (0.10 = 10%)
 * @returns {number}
 */
export function calcTax(subtotal, rate = 0.10) {
  return roundMoney(subtotal * rate);
}

/**
 * Calculate order totals from cart items.
 * @param {Array<{unitPrice: number, quantity: number}>} items
 * @param {number} [discount=0]
 * @param {number} [taxRate=0.10]
 * @returns {{ subTotal: number, tax: number, total: number }}
 */
export function calcOrderTotals(items, discount = 0, taxRate = 0.10) {
  const subTotal = roundMoney(items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0));
  const tax = calcTax(subTotal, taxRate);
  const total = roundMoney(subTotal + tax - discount);
  return { subTotal, tax, total };
}
