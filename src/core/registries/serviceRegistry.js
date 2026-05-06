/** @type {Map<string, object>} serviceName -> service object */
const services = new Map();

/** @type {Map<string, string>} serviceName -> required permission */
const servicePermissions = new Map();

export function registerService(name, service, requiredPermission = null) {
  services.set(name, service);
  if (requiredPermission) servicePermissions.set(name, requiredPermission);
}

export function getService(name) {
  return services.get(name) || null;
}

/**
 * Get a service after verifying the caller plugin has the required permission.
 * @param {object} pluginMeta - The plugin's manifest object
 * @param {string} name - Service name
 */
export function getServiceForPlugin(pluginMeta, name) {
  const requiredPermission = servicePermissions.get(name);

  if (requiredPermission) {
    const perms = pluginMeta.permissions || [];
    if (!perms.includes(requiredPermission)) {
      throw new Error(
        `Plugin "${pluginMeta.id}" does not have permission "${requiredPermission}" to access service "${name}"`
      );
    }
  }

  return getService(name);
}

export function removeServicesByPluginId(pluginId) {
  for (const [name, svc] of services.entries()) {
    if (svc._pluginId === pluginId) services.delete(name);
  }
}
