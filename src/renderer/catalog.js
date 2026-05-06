// catalog.js — Product Catalog screen logic
// Reuses the same PRODUCTS list and the same .product-card component.
// CSS modularity demo: the cards look different here because catalog.css
// overrides a few CSS variables scoped to .catalog-screen — no JS changes.

const PRODUCTS = [
  { id: 1,  name: 'Coffee',       price: 3.50,  emoji: '☕', category: 'Drinks' },
  { id: 2,  name: 'Tea',          price: 2.50,  emoji: '🍵', category: 'Drinks' },
  { id: 3,  name: 'Sandwich',     price: 6.99,  emoji: '🥪', category: 'Food'   },
  { id: 4,  name: 'Burger',       price: 8.99,  emoji: '🍔', category: 'Food'   },
  { id: 5,  name: 'Pizza Slice',  price: 4.50,  emoji: '🍕', category: 'Food'   },
  { id: 6,  name: 'Salad',        price: 5.75,  emoji: '🥗', category: 'Food'   },
  { id: 7,  name: 'Juice',        price: 3.25,  emoji: '🧃', category: 'Drinks' },
  { id: 8,  name: 'Water',        price: 1.50,  emoji: '💧', category: 'Drinks' },
  { id: 9,  name: 'Chips',        price: 2.00,  emoji: '🍟', category: 'Snacks' },
  { id: 10, name: 'Cookie',       price: 1.75,  emoji: '🍪', category: 'Snacks' },
  { id: 11, name: 'Muffin',       price: 2.25,  emoji: '🧁', category: 'Snacks' },
  { id: 12, name: 'Ice Cream',    price: 3.99,  emoji: '🍦', category: 'Snacks' },
];

// --- Render ---
const grid = document.getElementById('catalogGrid');

PRODUCTS.forEach(p => {
  const card = document.createElement('div');
  // SAME class name as POS screen — styles.css .product-card applies.
  // catalog.css only overrides variables, so the card looks different here.
  card.className = 'product-card';
  card.innerHTML = `
    <span class="prod-emoji">${p.emoji}</span>
    <span class="prod-name">${p.name}</span>
    <span class="prod-price">$${p.price.toFixed(2)}</span>
  `;
  grid.appendChild(card);
});

// --- Clock ---
function tick() {
  const el = document.getElementById('datetime');
  if (el) el.textContent = new Date().toLocaleTimeString();
}
tick();
setInterval(tick, 1000);
