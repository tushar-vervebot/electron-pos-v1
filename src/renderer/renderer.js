// renderer.js — all POS logic runs here (renderer process)

const PRODUCTS = [
  { id: 1, name: 'Coffee',       price: 3.50,  emoji: '☕' },
  { id: 2, name: 'Tea',          price: 2.50,  emoji: '🍵' },
  { id: 3, name: 'Sandwich',     price: 6.99,  emoji: '🥪' },
  { id: 4, name: 'Burger',       price: 8.99,  emoji: '🍔' },
  { id: 5, name: 'Pizza Slice',  price: 4.50,  emoji: '🍕' },
  { id: 6, name: 'Salad',        price: 5.75,  emoji: '🥗' },
  { id: 7, name: 'Juice',        price: 3.25,  emoji: '🧃' },
  { id: 8, name: 'Water',        price: 1.50,  emoji: '💧' },
  { id: 9, name: 'Chips',        price: 2.00,  emoji: '🍟' },
  { id: 10, name: 'Cookie',      price: 1.75,  emoji: '🍪' },
  { id: 11, name: 'Muffin',      price: 2.25,  emoji: '🧁' },
  { id: 12, name: 'Ice Cream',   price: 3.99,  emoji: '🍦' },
];

const TAX_RATE = 0.08;

// --- State ---
let cart = []; // [{ product, qty }]

// --- DOM refs ---
const productGrid   = document.getElementById('productGrid');
const cartList      = document.getElementById('cartList');
const subtotalEl    = document.getElementById('subtotal');
const taxEl         = document.getElementById('tax');
const grandTotalEl  = document.getElementById('grandTotal');
const clearBtn      = document.getElementById('clearBtn');
const checkoutBtn   = document.getElementById('checkoutBtn');
const receiptModal  = document.getElementById('receiptModal');
const receiptText   = document.getElementById('receiptText');
const closeReceiptBtn = document.getElementById('closeReceiptBtn');
const datetimeEl    = document.getElementById('datetime');
const printerSelect = document.getElementById('printerSelect');
const refreshPrintersBtn = document.getElementById('refreshPrintersBtn');
const printTestBtn = document.getElementById('printTestBtn');
const scaleServerUrl = document.getElementById('scaleServerUrl');
const scaleExePath = document.getElementById('scaleExePath');
const startScaleBtn = document.getElementById('startScaleBtn');
const checkScaleBtn = document.getElementById('checkScaleBtn');
const readWeightBtn = document.getElementById('readWeightBtn');
const hardwareLog = document.getElementById('hardwareLog');

// --- Scale modal elements ---
const scaleModalBtn      = document.getElementById('scaleModalBtn');
const scaleModal         = document.getElementById('scaleModal');
const scaleModalClose    = document.getElementById('scaleModalClose');
const scaleDisplayValue  = document.getElementById('scaleDisplayValue');
const scaleDisplayUnit   = document.getElementById('scaleDisplayUnit');
const scaleAddToCartRow  = document.getElementById('scaleAddToCartRow');
const scaleProductName   = document.getElementById('scaleProductName');
const scaleProductPrice  = document.getElementById('scaleProductPrice');
const scaleAddCartBtn    = document.getElementById('scaleAddCartBtn');

// --- Scale modal open / close ---
scaleModalBtn.addEventListener('click', () => { scaleModal.hidden = false; });
scaleModalClose.addEventListener('click', () => { scaleModal.hidden = true; });
scaleModal.addEventListener('click', (e) => { if (e.target === scaleModal) scaleModal.hidden = true; });

const SCALE_SERVER_KEY = 'pos.scale.server.url.v1';
const SCALE_EXE_KEY = 'pos.scale.exe.path.v1';
const DEFAULT_SCALE_EXE = 'C:\\Users\\kashi\\Downloads\\scale\\scale\\scale_latest_w_id.exe';

let weightReadInProgress = false;
let lastHardwareLog = { message: '', at: 0 };
let lastScaleReading = null; // { value, unit }

// Update the big reading display in the scale modal
function updateScaleDisplay(value, unit) {
  lastScaleReading = { value, unit };
  scaleDisplayValue.textContent = value ?? '— —';
  scaleDisplayUnit.textContent = unit || 'kg';
  // Show the "Add to Cart" row once we have a reading
  if (value != null) scaleAddToCartRow.style.display = 'flex';
}

// Add weighed item to cart
scaleAddCartBtn.addEventListener('click', () => {
  const name  = scaleProductName.value.trim() || 'Weighed Item';
  const pricePerKg = parseFloat(scaleProductPrice.value);
  const weight = parseFloat(lastScaleReading?.value);

  if (isNaN(weight) || weight <= 0) {
    logHardware('No valid weight reading. Click "Read Weight" first.');
    return;
  }

  const price = isNaN(pricePerKg) || pricePerKg <= 0
    ? weight  // fall back to weight as price (1:1)
    : Math.round(weight * pricePerKg * 100) / 100;

  const unit = lastScaleReading?.unit || 'kg';
  const product = {
    id: Date.now(),
    name: `${name} (${weight} ${unit})`,
    price,
    emoji: '⚖',
  };
  addToCart(product);
  logHardware(`Added "${product.name}" → $${price.toFixed(2)}`);
  scaleModal.hidden = true;
});

// --- Date/time ticker ---
function updateClock() {
  datetimeEl.textContent = new Date().toLocaleString();
}
updateClock();
setInterval(updateClock, 1000);

// --- Render products ---
function renderProducts() {
  productGrid.innerHTML = '';
  PRODUCTS.forEach(p => {
    const card = document.createElement('button');
    card.className = 'product-card';
    card.innerHTML = `<span class="prod-emoji">${p.emoji}</span>
                      <span class="prod-name">${p.name}</span>
                      <span class="prod-price">$${p.price.toFixed(2)}</span>`;
    card.addEventListener('click', () => addToCart(p));
    productGrid.appendChild(card);
  });
}

// --- Cart logic ---
function addToCart(product) {
  const existing = cart.find(i => i.product.id === product.id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ product, qty: 1 });
  }
  renderCart();
  // Notify plugins
  window.electronAPI?.plugins?.emitHook('cart:item-added', {
    id: product.id,
    name: product.name,
    emoji: product.emoji,
    unitPrice: product.price,
    qty: cart.find(i => i.product.id === product.id)?.qty ?? 1,
  });
}

function removeFromCart(productId) {
  cart = cart.filter(i => i.product.id !== productId);
  renderCart();
}

function changeQty(productId, delta) {
  const item = cart.find(i => i.product.id === productId);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) removeFromCart(productId);
  else renderCart();
}

function renderCart() {
  cartList.innerHTML = '';

  if (cart.length === 0) {
    cartList.innerHTML = '<li class="empty-msg">No items added yet.</li>';
    updateTotals(0);
    syncCustomerScreen();
    return;
  }

  let subtotal = 0;

  cart.forEach(({ product, qty }) => {
    const lineTotal = product.price * qty;
    subtotal += lineTotal;

    const li = document.createElement('li');
    li.className = 'cart-item';
    li.innerHTML = `
      <span class="ci-name">${product.emoji} ${product.name}</span>
      <span class="ci-controls">
        <button class="qty-btn" data-id="${product.id}" data-delta="-1">−</button>
        <span class="ci-qty">${qty}</span>
        <button class="qty-btn" data-id="${product.id}" data-delta="1">+</button>
      </span>
      <span class="ci-price">$${lineTotal.toFixed(2)}</span>
      <button class="remove-btn" data-id="${product.id}">✕</button>
    `;
    cartList.appendChild(li);
  });

  // Delegate events
  cartList.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      changeQty(Number(btn.dataset.id), Number(btn.dataset.delta));
    });
  });
  cartList.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(Number(btn.dataset.id)));
  });

  updateTotals(subtotal);
  syncCustomerScreen();
}

function updateTotals(subtotal) {
  const tax   = subtotal * TAX_RATE;
  const total = subtotal + tax;
  subtotalEl.textContent  = `$${subtotal.toFixed(2)}`;
  taxEl.textContent       = `$${tax.toFixed(2)}`;
  grandTotalEl.textContent = `$${total.toFixed(2)}`;
}

function syncCustomerScreen() {
  if (!window.electronAPI || !window.electronAPI.appState) return;

  const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.qty), 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;

  window.electronAPI.appState.setState({
    cart: cart.map((item) => ({
      id: item.product.id,
      name: item.product.name,
      emoji: item.product.emoji,
      qty: item.qty,
      unitPrice: item.product.price,
      lineTotal: item.product.price * item.qty,
    })),
    subtotal,
    tax,
    total,
    updatedAt: new Date().toISOString(),
  });
}

// --- Clear cart ---
clearBtn.addEventListener('click', () => {
  cart = [];
  renderCart();
  window.electronAPI?.plugins?.emitHook('cart:cleared', {});
});

// --- Checkout ---
checkoutBtn.addEventListener('click', () => {
  if (cart.length === 0) return;

  const lines = cart.map(
    ({ product, qty }) =>
      `${product.emoji} ${product.name}  x${qty}  →  $${(product.price * qty).toFixed(2)}`
  );

  const subtotal = cart.reduce((s, i) => s + i.product.price * i.qty, 0);
  const tax      = subtotal * TAX_RATE;
  const total    = subtotal + tax;

  receiptText.textContent =
    lines.join('\n') +
    `\n\nSubtotal: $${subtotal.toFixed(2)}` +
    `\nTax (8%): $${tax.toFixed(2)}` +
    `\nTotal:    $${total.toFixed(2)}`;

  receiptModal.hidden = false;

  // Notify plugins of checkout event
  window.electronAPI?.plugins?.emitHook('cart:checkout', {
    cart: cart.map(({ product, qty }) => ({
      id: product.id, name: product.name, emoji: product.emoji,
      qty, unitPrice: product.price, lineTotal: product.price * qty,
    })),
    subtotal,
    tax,
    total,
  });
});

// --- Close receipt / new sale ---
closeReceiptBtn.addEventListener('click', () => {
  cart = [];
  renderCart();
  receiptModal.hidden = true;
  window.electronAPI?.plugins?.emitHook('cart:cleared', {});
});

function logHardware(message) {
  const now = Date.now();
  if (message === lastHardwareLog.message && (now - lastHardwareLog.at) < 1500) {
    return;
  }
  lastHardwareLog = { message, at: now };

  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  hardwareLog.textContent = `${line}\n${hardwareLog.textContent}`.trim();
}

function loadSavedScaleConfig() {
  try {
    const savedUrl = localStorage.getItem(SCALE_SERVER_KEY);
    if (savedUrl) scaleServerUrl.value = savedUrl;
    const savedExe = localStorage.getItem(SCALE_EXE_KEY);
    scaleExePath.value = savedExe || DEFAULT_SCALE_EXE;
  } catch (_) {}
}

function saveScaleConfig() {
  try {
    localStorage.setItem(SCALE_SERVER_KEY, scaleServerUrl.value.trim());
    localStorage.setItem(SCALE_EXE_KEY, scaleExePath.value.trim());
  } catch (_) {}
}

function setSelectOptions(selectEl, items, formatter) {
  selectEl.innerHTML = '';
  if (!items || items.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No device found';
    selectEl.appendChild(option);
    return;
  }

  items.forEach((item, index) => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = formatter(item, index);
    selectEl.appendChild(option);
  });
}

async function loadPrinters() {
  try {
    const printers = await window.electronAPI.hardware.listPrinters();
    const mapped = printers.map((p) => ({
      value: p.name,
      label: p.name,
      port: p.portName,
      isDefault: p.isDefault,
      isUsbPort: p.isUsbPort,
    }));

    setSelectOptions(printerSelect, mapped, (x) => {
      const tags = [x.port ? x.port : ''];
      if (x.isDefault) tags.push('default');
      if (x.isUsbPort) tags.push('usb');
      return `${x.label} (${tags.filter(Boolean).join(', ')})`;
    });

    const bestIndex = mapped.findIndex((x) => x.isDefault || x.isUsbPort);
    if (bestIndex >= 0) {
      printerSelect.selectedIndex = bestIndex;
    }

    logHardware(`Printers loaded: ${mapped.length}`);
  } catch (error) {
    logHardware(`Printer load failed: ${error.message}`);
  }
}

async function loadSerialPorts() {
  try {
    const ports = await window.electronAPI.hardware.listSerialPorts();
    logHardware(`Serial ports detected: ${ports.map(p => p.path).join(', ') || 'none'}`);
  } catch (error) {
    logHardware(`Port scan failed: ${error.message}`);
  }
}

refreshPrintersBtn.addEventListener('click', loadPrinters);

startScaleBtn.addEventListener('click', async () => {
  const exePath = scaleExePath.value.trim() || DEFAULT_SCALE_EXE;
  const url = scaleServerUrl.value.trim() || 'ws://127.0.0.1:8765';
  saveScaleConfig();
  startScaleBtn.disabled = true;
  startScaleBtn.textContent = 'Checking...';

  try {
    // First check — if WebSocket server already alive, don't launch a second instance
    const alreadyUp = await window.electronAPI.hardware.readWeightOnce({ url, timeoutMs: 2000 });
    if (alreadyUp && alreadyUp.ok) {
      logHardware(`Scale server already running at ${url}. No need to start again.`);
      return;
    }
    if (alreadyUp && alreadyUp.code !== 'SCALE_CONNECT_FAILED') {
      // Server reachable but no weight yet — still alive
      logHardware(`Scale server already running at ${url}.`);
      return;
    }

    // Server not running — launch the exe
    startScaleBtn.textContent = 'Starting...';
    const result = await window.electronAPI.hardware.launchScaleServer({ exePath });
    if (!result || !result.ok) {
      logHardware(`Failed to start scale: ${result ? result.message : 'Unknown error'}`);
      return;
    }

    logHardware(`Scale: ${result.message}. Waiting for WebSocket server...`);

    // Poll every 1.5 s for up to 10 s
    let attempts = 0;
    const pollId = setInterval(async () => {
      attempts++;
      const check = await window.electronAPI.hardware.readWeightOnce({ url, timeoutMs: 2000 });
      if (check && check.code !== 'SCALE_CONNECT_FAILED') {
        clearInterval(pollId);
        if (check.ok) {
          logHardware(`Scale server ready. Current: ${check.value}${check.unit ? ' ' + check.unit : ''}`);
        } else {
          logHardware(`Scale server ready at ${url}. Click Read Weight to get a reading.`);
        }
      } else if (attempts >= 7) {
        clearInterval(pollId);
        logHardware(`Scale server did not come up after 10 s. Check the exe path and COM4 connection.`);
      }
    }, 1500);

  } catch (err) {
    logHardware(`Failed to start scale: ${err.message}`);
  } finally {
    startScaleBtn.disabled = false;
    startScaleBtn.textContent = 'Start Scale';
  }
});

checkScaleBtn.addEventListener('click', async () => {
  const url = scaleServerUrl.value.trim() || 'ws://127.0.0.1:8765';
  checkScaleBtn.disabled = true;
  checkScaleBtn.textContent = 'Checking...';
  try {
    // Short timeout — just enough to receive one broadcast from the streaming server
    const result = await window.electronAPI.hardware.readWeightOnce({ url, timeoutMs: 2000 });
    if (result && result.ok) {
      logHardware(`Scale OK — reading: ${result.value}${result.unit ? ' ' + result.unit : ''}`);
    } else if (result && result.code === 'SCALE_CONNECT_FAILED') {
      logHardware(`Scale not running. Click "Start Scale" first.`);
    } else {
      logHardware(`Scale check: ${result ? result.error : 'No response'}`);
    }
  } catch (err) {
    logHardware(`Scale check failed: ${err.message}`);
  } finally {
    checkScaleBtn.disabled = false;
    checkScaleBtn.textContent = 'Check';
  }
});

printTestBtn.addEventListener('click', async () => {
  const printerName = printerSelect.value;
  if (!printerName) {
    logHardware('Select a printer first.');
    return;
  }

  try {
    await window.electronAPI.hardware.printTest({
      printerName,
      title: 'POS System USB Printer Test',
      body: 'Printer setup is successful from Electron app.',
    });
    logHardware(`Print test sent to: ${printerName}`);
  } catch (error) {
    logHardware(`Print test failed: ${error.message}`);
  }
});

readWeightBtn.addEventListener('click', async () => {
  if (weightReadInProgress) {
    logHardware('Weight read is already in progress.');
    return;
  }

  const url = scaleServerUrl.value.trim() || 'ws://127.0.0.1:8765';
  saveScaleConfig();

  weightReadInProgress = true;
  readWeightBtn.disabled = true;
  readWeightBtn.textContent = 'Reading...';

  try {
    const result = await window.electronAPI.hardware.readWeightOnce({
      url,
      timeoutMs: 6000,
    });

    if (!result || result.ok === false) {
      logHardware(`Weight read failed: ${(result && result.error) ? result.error : 'Unknown scale error'}`);
      updateScaleDisplay(null, null);
      return;
    }

    const rendered = result.value == null
      ? result.raw
      : `${result.value}${result.unit ? ` ${result.unit}` : ''}`;
    logHardware(`Weight: ${rendered}`);
    updateScaleDisplay(result.value ?? result.raw, result.unit || 'kg');
  } catch (error) {
    logHardware(`Weight read failed: ${error.message}`);
  } finally {
    weightReadInProgress = false;
    readWeightBtn.disabled = false;
    readWeightBtn.textContent = 'Read Weight';
  }
});

// ── Scanner ────────────────────────────────────────────────────────────────
const scannerServerUrl = document.getElementById('scannerServerUrl');
const scannerExePath = document.getElementById('scannerExePath');
const startScannerBtn = document.getElementById('startScannerBtn');
const listenScannerBtn = document.getElementById('listenScannerBtn');
const lastBarcodeEl = document.getElementById('lastBarcode');
const scannerBarcodeRow = document.getElementById('scannerBarcodeRow');
const SCANNER_SERVER_KEY = 'pos.scanner.server.url.v1';
const SCANNER_EXE_KEY = 'pos.scanner.exe.path.v1';
const DEFAULT_SCANNER_EXE = 'C:\\Users\\kashi\\Downloads\\scanner\\scanner\\scanner_half_barcode_issue_solved.exe';

let scannerListening = false;

function loadSavedScannerConfig() {
  try {
    const savedUrl = localStorage.getItem(SCANNER_SERVER_KEY);
    if (savedUrl) scannerServerUrl.value = savedUrl;
    const savedExe = localStorage.getItem(SCANNER_EXE_KEY);
    scannerExePath.value = savedExe || DEFAULT_SCANNER_EXE;
  } catch (_) {}
}

function saveScannerConfig() {
  try {
    localStorage.setItem(SCANNER_SERVER_KEY, scannerServerUrl.value.trim());
    localStorage.setItem(SCANNER_EXE_KEY, scannerExePath.value.trim());
  } catch (_) {}
}

startScannerBtn.addEventListener('click', async () => {
  const exePath = scannerExePath.value.trim() || DEFAULT_SCANNER_EXE;
  const url = scannerServerUrl.value.trim() || 'ws://127.0.0.1:8766';
  saveScannerConfig();
  startScannerBtn.disabled = true;
  startScannerBtn.textContent = 'Checking...';

  try {
    // First, check if COM3 (scanner port) is available
    const ports = await window.electronAPI.hardware.listSerialPorts();
    const hasScannerPort = ports.some(p => p.path.toUpperCase() === 'COM3');
    if (!hasScannerPort) {
      logHardware('⚠ Scanner hardware not detected on COM3. Please plug in the scanner USB device.');
      startScannerBtn.disabled = false;
      startScannerBtn.textContent = 'Start Scanner';
      return;
    }

    // Quick ping — if server already alive skip launch
    const ping = await window.electronAPI.hardware.listenScanner({ url, timeoutMs: 1500 });
    if (ping && ping.code !== 'SCANNER_CONNECT_FAILED') {
      logHardware('Scanner server already running.');
      startScannerBtn.disabled = false;
      startScannerBtn.textContent = 'Start Scanner';
      return;
    }

    startScannerBtn.textContent = 'Starting...';
    const result = await window.electronAPI.hardware.launchScannerServer({ exePath });
    if (!result || !result.ok) {
      logHardware(`Failed to start scanner: ${result ? result.message : 'Unknown error'}`);
      startScannerBtn.disabled = false;
      startScannerBtn.textContent = 'Start Scanner';
      return;
    }

    logHardware(`Scanner: ${result.message}. Waiting for server...`);

    let attempts = 0;
    const pollId = setInterval(async () => {
      attempts++;
      const check = await window.electronAPI.hardware.listenScanner({ url, timeoutMs: 1500 });
      if (check && check.code !== 'SCANNER_CONNECT_FAILED') {
        clearInterval(pollId);
        logHardware('Scanner server ready. Click "Listen for Scan" and scan a barcode.');
        startScannerBtn.disabled = false;
        startScannerBtn.textContent = 'Start Scanner';
      } else if (attempts >= 7) {
        clearInterval(pollId);
        logHardware('Scanner server did not come up. Check EXE path and COM3 connection.');
        startScannerBtn.disabled = false;
        startScannerBtn.textContent = 'Start Scanner';
      }
    }, 1500);
  } catch (err) {
    logHardware(`Failed to start scanner: ${err.message}`);
    startScannerBtn.disabled = false;
    startScannerBtn.textContent = 'Start Scanner';
  }
});

listenScannerBtn.addEventListener('click', async () => {
  if (scannerListening) {
    logHardware('Already listening for a barcode scan.');
    return;
  }

  const url = scannerServerUrl.value.trim() || 'ws://127.0.0.1:8766';
  scannerListening = true;
  listenScannerBtn.disabled = true;
  listenScannerBtn.textContent = '⏳ Waiting for scan...';

  try {
    const result = await window.electronAPI.hardware.listenScanner({ url, timeoutMs: 30000 });

    if (result && result.ok) {
      lastBarcodeEl.textContent = result.barcode;
      scannerBarcodeRow.style.display = '';
      logHardware(`Barcode scanned: ${result.barcode}`);
    } else if (result && result.code === 'SCANNER_CONNECT_FAILED') {
      logHardware('Scanner not running. Click "Start Scanner" first.');
    } else if (result && result.code === 'SCANNER_TIMEOUT') {
      logHardware('No barcode scanned within 30 seconds. Try again.');
    } else {
      logHardware(`Scanner error: ${result ? result.error : 'Unknown error'}`);
    }
  } catch (err) {
    logHardware(`Scanner listen failed: ${err.message}`);
  } finally {
    scannerListening = false;
    listenScannerBtn.disabled = false;
    listenScannerBtn.textContent = 'Listen for Scan';
  }
});

// --- Init ---
renderProducts();
renderCart();
syncCustomerScreen();
loadSavedScaleConfig();
scaleServerUrl.addEventListener('change', saveScaleConfig);
scaleExePath.addEventListener('change', saveScaleConfig);
loadSavedScannerConfig();
scannerServerUrl.addEventListener('change', saveScannerConfig);
scannerExePath.addEventListener('change', saveScannerConfig);
loadPrinters();
loadSerialPorts();

// ── Plugin panel loader ────────────────────────────────────────────────────

/**
 * Fetches all registered plugin panels from the main process, injects their
 * HTML into the #plugin-panels slot, then wires up action buttons.
 *
 * Panel HTML must use data-plugin-id + data-plugin-action attributes:
 *   <button data-plugin-id="my-plugin" data-plugin-action="ping">Ping</button>
 * The loader resolves the full IPC channel as "plugin:{pluginId}:{action}"
 * and invokes it, placing the JSON result into the element with
 * id="{pluginId}-output".
 */
async function loadPluginPanels() {
  if (!window.electronAPI?.plugins) return;

  let panels;
  try {
    panels = await window.electronAPI.plugins.getPanels();
  } catch (_) {
    return;
  }
  if (!panels || panels.length === 0) return;

  const section   = document.getElementById('plugin-panels-section');
  const container = document.getElementById('plugin-panels');
  if (!section || !container) return;

  for (const { pluginId, htmlContent } of panels) {
    if (!htmlContent) continue;

    const wrapper = document.createElement('div');
    wrapper.className = 'plugin-panel-wrapper';
    // innerHTML is safe here: panel HTML is read from local plugin files
    // inside the asar or the app's userData folder.
    wrapper.innerHTML = htmlContent;
    container.appendChild(wrapper);

    // Subscribe to push events from this plugin (e.g. note-updated)
    if (window.electronAPI?.plugins?.onEvent) {
      window.electronAPI.plugins.onEvent(`plugin:${pluginId}:note-updated`, (data) => {
        const outputEl = document.getElementById(`${pluginId}-output`);
        if (outputEl) {
          outputEl.textContent = data?.note
            ? `Current note: "${data.note}"`
            : 'No note set.';
        }
      });
    }

    // Wire every action button in this panel
    wrapper.querySelectorAll('[data-plugin-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const action   = btn.dataset.pluginAction;
        const id       = btn.dataset.pluginId || pluginId;
        const channel  = `plugin:${id}:${action}`;
        const outputEl = document.getElementById(`${id}-output`);

        // If there is a text input in this panel, include its value as payload
        const inputEl = document.getElementById(`${id}-input`);
        const payload = inputEl ? { note: inputEl.value.trim() } : {};

        try {
          btn.disabled = true;
          const result = await window.electronAPI.plugins.invoke(channel, payload);

          // Format output nicely per action type
          if (result?.history) {
            outputEl.textContent = result.history.length === 0
              ? 'No history yet.'
              : result.history.map((e, i) =>
                  `#${i + 1} [${new Date(e.savedAt).toLocaleString()}]\n  Note: ${e.note}\n  Total: $${e.total}  Items: ${e.itemCount}`
                ).join('\n\n');
          } else if (result?.note !== undefined) {
            outputEl.textContent = result.note ? `Current note: "${result.note}"` : 'No note set.';
          } else {
            outputEl.textContent = JSON.stringify(result, null, 2);
          }
        } catch (err) {
          if (outputEl) outputEl.textContent = `Error: ${err.message}`;
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  // Show the section only when at least one panel was mounted
  if (container.children.length > 0) {
    section.style.display = '';
  }
}

loadPluginPanels();
