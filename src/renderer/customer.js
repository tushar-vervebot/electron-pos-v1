const cartEl = document.getElementById('customerCart');
const subtotalEl = document.getElementById('cSubtotal');
const taxEl = document.getElementById('cTax');
const totalEl = document.getElementById('cTotal');
const updatedEl = document.getElementById('updatedAt');
const clockEl = document.getElementById('clock');

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function updateClock() {
  clockEl.textContent = new Date().toLocaleString();
}

function renderCart(items) {
  if (!Array.isArray(items) || items.length === 0) {
    cartEl.innerHTML = '<li class="empty">No items yet</li>';
    return;
  }

  cartEl.innerHTML = '';
  items.forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div>
        <div class="item-name">${item.emoji || ''} ${item.name || 'Item'}</div>
        <div class="item-meta">Qty ${item.qty || 0} x ${money(item.unitPrice || 0)}</div>
      </div>
      <div class="item-total">${money(item.lineTotal || 0)}</div>
    `;
    cartEl.appendChild(li);
  });
}

function renderState(state) {
  const safe = state || {};
  renderCart(safe.cart || []);
  subtotalEl.textContent = money(safe.subtotal);
  taxEl.textContent = money(safe.tax);
  totalEl.textContent = money(safe.total);
  updatedEl.textContent = safe.updatedAt
    ? `Updated: ${new Date(safe.updatedAt).toLocaleTimeString()}`
    : 'Waiting for POS...';
}

async function init() {
  updateClock();
  setInterval(updateClock, 1000);

  if (!window.electronAPI || !window.electronAPI.appState) return;

  const current = await window.electronAPI.appState.getState();
  renderState(current);

  window.electronAPI.appState.onState((next) => {
    renderState(next);
  });
}

init();
