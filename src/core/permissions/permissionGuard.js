/**
 * permissionGuard.js — Checks whether a user or plugin has required permissions.
 */

/**
 * Check if a plugin manifest declares a specific permission.
 * @param {object} pluginMeta - Plugin manifest object
 * @param {string} permission - Permission string (e.g. 'orders:read')
 * @returns {boolean}
 */
export function pluginHasPermission(pluginMeta, permission) {
  const perms = pluginMeta?.permissions ?? [];
  return perms.includes(permission);
}

/**
 * Assert a plugin has a permission. Throws if not.
 * @param {object} pluginMeta - Plugin manifest
 * @param {string} permission - Required permission string
 */
export function assertPluginPermission(pluginMeta, permission) {
  if (!pluginHasPermission(pluginMeta, permission)) {
    throw new Error(
      `Plugin "${pluginMeta?.id}" requires permission "${permission}" which is not declared in plugin.json`
    );
  }
}

/**
 * Check if a user (role-based) has the required role.
 * @param {object} user - User object with roles: string[]
 * @param {string|string[]} requiredRoles - Role(s) needed
 * @returns {boolean}
 */
export function userHasRole(user, requiredRoles) {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
  return roles.some(role => (user?.roles ?? []).includes(role));
}

/**
 * React guard: returns the children or null based on permission.
 * Use this to conditionally render UI based on plugin permissions.
 *
 * Example:
 *   <PermissionGuard pluginMeta={meta} permission="reports:view">
 *     <ReportsButton />
 *   </PermissionGuard>
 */
export function PermissionGuard({ pluginMeta, permission, children, fallback = null }) {
  if (!pluginHasPermission(pluginMeta, permission)) return fallback;
  return children;
}
