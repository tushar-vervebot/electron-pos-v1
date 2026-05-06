/**
 * date.js — Date formatting utilities.
 * No React state. No side effects. Pure functions.
 */

/**
 * Format a date as a short, readable string: "May 6, 2026 3:45 PM"
 * @param {Date|string|number} date
 * @returns {string}
 */
export function formatDateTime(date) {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format as date only: "May 6, 2026"
 * @param {Date|string|number} date
 * @returns {string}
 */
export function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format as time only: "3:45 PM"
 * @param {Date|string|number} date
 * @returns {string}
 */
export function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Return an ISO timestamp string for the current moment.
 * @returns {string}
 */
export function nowISO() {
  return new Date().toISOString();
}
