/**
 * marketplace.js — Plugin Marketplace + Manager
 *
 * Loaded after renderer.js. Depends on window.electronAPI.plugins being
 * available (exposed by preload.js).
 *
 * State:
 *   installedIds  — Set of plugin IDs the user has "installed" (localStorage)
 *   enabledIds    — Set of plugin IDs currently enabled (localStorage)
 *   allPlugins    — Array of plugin manifest objects from plugin:list-all
 */

'use strict';

// ── Constants ────────────────────────────────────────────────────────────────
const INSTALLED_KEY = 'pos.plugins.installed';
const ENABLED_KEY   = 'pos.plugins.enabled';

// ── Emoji icons for known plugins (fallback: 🔌) ─────────────────────────────
const PLUGIN_ICONS = {
  'order-notes':      '📝',
  'test-plugin':      '🔌',
  'loyalty':          '⭐',
  'gift-card':        '🎁',
  'split-payment':    '✂️',
  'cctv-overlay':     '📷',
  'customer-display': '🖥️',
  'custom-receipt':   '🧾',
  'analytics':        '📊',
};

// ── State ─────────────────────────────────────────────────────────────────────
let allPlugins   = [];   // fetched from main process
let installedIds = new Set(JSON.parse(localStorage.getItem(INSTALLED_KEY) || '[]'));
let enabledIds   = new Set(JSON.parse(localStorage.getItem(ENABLED_KEY)   || '[]'));
let searchQuery  = '';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const pluginMarketBtn    = document.getElementById('pluginMarketBtn');
const pluginMarketModal  = document.getElementById('pluginMarketModal');
const pluginMarketClose  = document.getElementById('pluginMarketClose');
const mktTabs            = document.querySelectorAll('.mkt-tab');
const mktPanes           = document.querySelectorAll('.mkt-pane');
const mktGrid            = document.getElementById('mktGrid');
const mktInstalledGrid   = document.getElementById('mktInstalledGrid');
const installedBadge     = document.getElementById('installedBadge');
const mktSearch          = document.getElementById('mktSearch');

// ── Persist state ─────────────────────────────────────────────────────────────
function persist() {
  localStorage.setItem(INSTALLED_KEY, JSON.stringify([...installedIds]));
  localStorage.setItem(ENABLED_KEY,   JSON.stringify([...enabledIds]));
}

// ── Open / close ──────────────────────────────────────────────────────────────
pluginMarketBtn.addEventListener('click', async () => {
  pluginMarketModal.hidden = false;
  await loadPlugins();
});

pluginMarketClose.addEventListener('click', () => { pluginMarketModal.hidden = true; });
pluginMarketModal.addEventListener('click', (e) => {
  if (e.target === pluginMarketModal) pluginMarketModal.hidden = true;
});

// ── Tab switching ─────────────────────────────────────────────────────────────
mktTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    mktTabs.forEach(t => t.classList.remove('mkt-tab--active'));
    tab.classList.add('mkt-tab--active');
    const target = tab.dataset.tab;
    mktPanes.forEach(p => {
      p.classList.toggle('mkt-pane--hidden', !p.id.endsWith(target));
    });
    if (target === 'installed') renderInstalled();
  });
});

// ── Search ────────────────────────────────────────────────────────────────────
mktSearch.addEventListener('input', () => {
  searchQuery = mktSearch.value.toLowerCase().trim();
  renderMarketplace();
});

// ── Load plugin list ──────────────────────────────────────────────────────────
async function loadPlugins() {
  mktGrid.innerHTML = '<p class="mkt-empty">Loading…</p>';

  try {
    const list = await window.electronAPI.plugins.listAll();
    allPlugins = list;

    // Auto-mark bundled plugins that started enabled as installed + enabled
    for (const p of allPlugins) {
      if (p.active && !installedIds.has(p.id)) {
        installedIds.add(p.id);
        enabledIds.add(p.id);
      }
    }
    persist();
  } catch (err) {
    mktGrid.innerHTML = `<p class="mkt-empty">Failed to load plugins: ${err.message}</p>`;
    return;
  }

  renderMarketplace();
  renderInstalled();
  updateBadge();
}

// ── Render Marketplace tab ────────────────────────────────────────────────────
function renderMarketplace() {
  const filtered = allPlugins.filter(p => {
    if (!searchQuery) return true;
    return (p.name || p.id).toLowerCase().includes(searchQuery) ||
           (p.description || '').toLowerCase().includes(searchQuery);
  });

  if (filtered.length === 0) {
    mktGrid.innerHTML = '<p class="mkt-empty">No plugins match your search.</p>';
    return;
  }

  mktGrid.innerHTML = '';
  for (const plugin of filtered) {
    mktGrid.appendChild(buildMarketCard(plugin));
  }
}

function buildMarketCard(plugin) {
  const isInstalled = installedIds.has(plugin.id);
  const isEnabled   = enabledIds.has(plugin.id);
  const icon        = PLUGIN_ICONS[plugin.id] || '🔌';

  const card = document.createElement('div');
  card.className = 'mkt-card' + (isInstalled ? ' mkt-card--installed' : '');
  card.innerHTML = `
    <div class="mkt-card-icon">${icon}</div>
    <div class="mkt-card-info">
      <div class="mkt-card-name">${plugin.name || plugin.id}</div>
      <div class="mkt-card-version">v${plugin.version || '1.0.0'}</div>
      <div class="mkt-card-desc">${plugin.description || 'No description.'}</div>
    </div>
    <div class="mkt-card-actions">
      ${isInstalled
        ? `<span class="mkt-tag mkt-tag--installed">✔ Installed</span>
           <button class="mkt-btn mkt-btn--danger mkt-uninstall" data-id="${plugin.id}">Uninstall</button>`
        : `<button class="mkt-btn mkt-btn--primary mkt-install" data-id="${plugin.id}">Install</button>`
      }
    </div>
  `;

  card.querySelector('.mkt-install')?.addEventListener('click', () => installPlugin(plugin.id));
  card.querySelector('.mkt-uninstall')?.addEventListener('click', () => uninstallPlugin(plugin.id));
  return card;
}

// ── Render Installed tab ──────────────────────────────────────────────────────
function renderInstalled() {
  const installed = allPlugins.filter(p => installedIds.has(p.id));

  if (installed.length === 0) {
    mktInstalledGrid.innerHTML = '<p class="mkt-empty">No plugins installed yet. Go to Marketplace to install one.</p>';
    return;
  }

  mktInstalledGrid.innerHTML = '';
  for (const plugin of installed) {
    mktInstalledGrid.appendChild(buildInstalledCard(plugin));
  }
}

function buildInstalledCard(plugin) {
  const isEnabled = enabledIds.has(plugin.id);
  const icon      = PLUGIN_ICONS[plugin.id] || '🔌';

  const card = document.createElement('div');
  card.className = 'mkt-card mkt-card--installed';
  card.innerHTML = `
    <div class="mkt-card-icon">${icon}</div>
    <div class="mkt-card-info">
      <div class="mkt-card-name">${plugin.name || plugin.id}</div>
      <div class="mkt-card-version">v${plugin.version || '1.0.0'}</div>
      <div class="mkt-card-desc">${plugin.description || 'No description.'}</div>
    </div>
    <div class="mkt-card-actions mkt-card-actions--col">
      <label class="mkt-toggle" title="${isEnabled ? 'Disable plugin' : 'Enable plugin'}">
        <input type="checkbox" class="mkt-toggle-input" data-id="${plugin.id}" ${isEnabled ? 'checked' : ''} />
        <span class="mkt-toggle-track"></span>
        <span class="mkt-toggle-label">${isEnabled ? 'Enabled' : 'Disabled'}</span>
      </label>
      <button class="mkt-btn mkt-btn--danger mkt-uninstall" data-id="${plugin.id}">Uninstall</button>
    </div>
  `;

  const checkbox = card.querySelector('.mkt-toggle-input');
  checkbox.addEventListener('change', () => togglePlugin(plugin.id, checkbox.checked));
  card.querySelector('.mkt-uninstall').addEventListener('click', () => uninstallPlugin(plugin.id));
  return card;
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function installPlugin(pluginId) {
  installedIds.add(pluginId);
  // Also enable immediately on install
  await enablePlugin(pluginId);
  persist();
  renderMarketplace();
  renderInstalled();
  updateBadge();
}

async function uninstallPlugin(pluginId) {
  // Disable first
  if (enabledIds.has(pluginId)) await disablePlugin(pluginId);
  installedIds.delete(pluginId);
  persist();
  renderMarketplace();
  renderInstalled();
  updateBadge();
}

async function togglePlugin(pluginId, shouldEnable) {
  if (shouldEnable) {
    await enablePlugin(pluginId);
  } else {
    await disablePlugin(pluginId);
  }
  persist();
  renderInstalled(); // re-render to update label
}

async function enablePlugin(pluginId) {
  try {
    const result = await window.electronAPI.plugins.setEnabled(pluginId, true);
    if (result && result.ok) {
      enabledIds.add(pluginId);
      await refreshPluginPanels();
    }
  } catch (err) {
    console.error(`[Marketplace] Failed to enable "${pluginId}":`, err);
  }
}

async function disablePlugin(pluginId) {
  try {
    const result = await window.electronAPI.plugins.setEnabled(pluginId, false);
    if (result && result.ok) {
      enabledIds.delete(pluginId);
      removePluginPanel(pluginId);
    }
  } catch (err) {
    console.error(`[Marketplace] Failed to disable "${pluginId}":`, err);
  }
}

// ── Plugin panel management ───────────────────────────────────────────────────
async function refreshPluginPanels() {
  try {
    const panels = await window.electronAPI.plugins.getPanels();
    const container = document.getElementById('plugin-panels');
    const section   = document.getElementById('plugin-panels-section');
    if (!container || !section) return;

    // Inject only panels not already in the DOM
    for (const { pluginId, htmlContent } of panels) {
      if (!document.getElementById(`panel-${pluginId}`)) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = htmlContent;
        const panelEl = wrapper.firstElementChild;
        if (panelEl) {
          container.appendChild(panelEl);
          wirePluginPanel(panelEl, pluginId);
        }
      }
    }

    section.style.display = container.children.length > 0 ? '' : 'none';
  } catch (err) {
    console.error('[Marketplace] refreshPluginPanels failed:', err);
  }
}

function removePluginPanel(pluginId) {
  const el = document.getElementById(`panel-${pluginId}`);
  if (el) el.remove();

  const section   = document.getElementById('plugin-panels-section');
  const container = document.getElementById('plugin-panels');
  if (section && container) {
    section.style.display = container.children.length > 0 ? '' : 'none';
  }
}

/**
 * Wire up data-plugin-action buttons inside a newly injected panel.
 * Buttons use: data-plugin-id + data-plugin-action attributes.
 */
function wirePluginPanel(panelEl, pluginId) {
  panelEl.querySelectorAll('[data-plugin-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action  = btn.dataset.pluginAction;
      const channel = `plugin:${pluginId}:${action}`;
      const outputEl = panelEl.querySelector('.plugin-output');
      try {
        const result = await window.electronAPI.plugins.invoke(channel, {});
        if (outputEl) outputEl.textContent = JSON.stringify(result, null, 2);
      } catch (err) {
        if (outputEl) outputEl.textContent = `Error: ${err.message}`;
      }
    });
  });
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function updateBadge() {
  installedBadge.textContent = installedIds.size;
  installedBadge.style.display = installedIds.size > 0 ? '' : 'none';
}

// ── Init: load panels for already-enabled plugins on startup ──────────────────
(async function init() {
  if (!window.electronAPI?.plugins?.getPanels) return;
  await refreshPluginPanels();
  updateBadge();
})();
