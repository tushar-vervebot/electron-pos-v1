/**
 * uuid.js — Simple UUID generation utility.
 */

/**
 * Generate a random UUID v4.
 * Uses the Web Crypto API (available in Electron renderer and Node 19+).
 * @returns {string}
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a short ID (8 characters) suitable for display.
 * Not cryptographically unique — for UI labels only.
 * @returns {string}
 */
export function shortId() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}
