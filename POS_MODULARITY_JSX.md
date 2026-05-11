# POS System — JSX Modularity Guide

This document explains how to add new UI code or override existing UI components in this POS system through a separate plugin, without touching the base code at all.

The goal is simple:

- **Install a plugin** → its JSX code becomes active automatically
- **Uninstall a plugin** → everything returns to the original state, no cleanup needed
- **Base code is never touched** — no edits, no deletions, no risk of breaking the core

There are four ways to achieve this, each designed for a different situation.

---

## Understanding the Two Things You Can Do with a plugin

Before looking at the ways, it helps to know the two distinct jobs a plugin can do:

| Job | What it means |
|---|---|
| **Override** | Replace an existing component with your own version. The base component is no longer used while the plugin is active. |
| **Inject** | Add new JSX into an existing component at a specific point — before, after, or inside it — without replacing anything. |

Some ways below handle overriding, some handle injecting, and some can do both.

---

## The Foundation — How plugins Get Loaded

Before going into each way, there is one shared piece that all four ways depend on: the plugin loader.

There is a single file called `pluginLoader.js`. It is the only place you ever need to edit when installing or uninstalling a plugin. It imports each active plugin, and that import causes the plugin to register itself with the rest of the system.

```js
// src/renderer/plugins/pluginLoader.js

const activeplugins = [
  () => import('./loyalty-discount'),
  () => import('./split-payment'),
  () => import('./kiosk-mode'),
  // To install a new plugin: add one line here
  // To uninstall a plugin: remove that line — nothing else changes
];

export async function loadplugins() {
  for (const load of activeplugins) {
    await load();
  }
}
```

This file runs once, before React starts rendering. By the time the first screen appears, all active plugins have already registered their overrides and injections.

The folder structure for plugins:

```
src/renderer/
│
├── plugins/
│   ├── pluginLoader.js          ← the only file you touch to install/uninstall
│   ├── loyalty-discount/
│   │   ├── index.js             ← the plugin's entry point, registers everything
│   │   ├── LoyaltyPointsBar.jsx
│   │   └── LoyaltyButton.plugin.css
│   ├── split-payment/
│   │   ├── index.js
│   │   └── SplitPaymentPanel.jsx
│   └── kiosk-mode/
│       ├── index.js
│       └── KioskProductCard.jsx
│
├── features/                    ← base code — never touched by any plugin
├── components/
└── ...
```

---

## Way 1 — Component Registry (Override an Existing Component)

### What it is

A central registry acts like a lookup table. For every component that should be overridable, there is an entry in this table. The base code always asks the registry "which component should I render here?" before rendering. By default the answer is the base component. When a plugin is installed, it updates that answer to point to its own version.

### How it works

**Step 1 — The registry itself**

This is a single small file. It stores the current mapping of component names to their implementations, and provides two functions: one to register an override, and one to look up which component to use.

```js
// src/renderer/registry/componentRegistry.js

const registry = {};

// A plugin calls this to register its override
export function registerComponent(name, component) {
  registry[name] = component;
}

// Base code calls this to get the component it should render
// If no plugin has registered an override, the fallback (base component) is returned
export function getComponent(name, fallback) {
  return registry[name] || fallback;
}
```

**Step 2 — The base component uses the registry before rendering**

The base `CartSummary` component has a discount section. Instead of hardcoding which component renders that section, it asks the registry first.

```jsx
// src/features/cart/components/CartSummary/CartSummary.jsx

import { getComponent } from '@registry/componentRegistry';
import { DefaultDiscountRow } from './DefaultDiscountRow';

export function CartSummary() {
  // Ask the registry: has any plugin registered a replacement for DiscountRow?
  // If yes, use that. If no plugin is active, use DefaultDiscountRow.
  const DiscountRow = getComponent('cart.DiscountRow', DefaultDiscountRow);

  return (
    <div className={styles.summary}>
      <CartItemList />
      <DiscountRow />          {/* renders whichever version is registered */}
      <CartTotal />
    </div>
  );
}
```

**Step 3 — A plugin registers its override**

The loyalty plugin's entry point registers its own `LoyaltyDiscountRow` as the replacement for `cart.DiscountRow`.

```js
// src/plugins/loyalty-discount/index.js

import { registerComponent } from '@registry/componentRegistry';
import { LoyaltyDiscountRow } from './LoyaltyDiscountRow';

// From this point, CartSummary will render LoyaltyDiscountRow instead of DefaultDiscountRow
registerComponent('cart.DiscountRow', LoyaltyDiscountRow);
```

**What happens in each state:**

```
No plugin installed:
  CartSummary asks registry for 'cart.DiscountRow'
  → Registry has no entry → returns DefaultDiscountRow
  → Default 10% flat discount row is shown

Loyalty plugin installed (one line added to pluginLoader.js):
  CartSummary asks registry for 'cart.DiscountRow'
  → Registry has entry → returns LoyaltyDiscountRow
  → Loyalty points row is shown instead

plugin uninstalled (that line removed from pluginLoader.js):
  → Registry entry is gone → DefaultDiscountRow is shown again
  → No other file was changed
```

### What this is good for

Use this when a plugin needs to completely replace one part of the UI with its own version. The base component's structure stays the same — it just renders a different piece inside it.

---

## Way 2 — Slot System (Inject New JSX Into an Existing Component)

### What it is

Base components have named empty slots — designated positions where plugins can inject additional JSX content. The base component defines where content can be injected. A plugin says what content to put there. If no plugin injects anything, the slot is simply empty and invisible.

This is for adding new UI that does not exist in the base at all — not replacing something, but inserting something new.

### How it works

**Step 1 — The slot registry**

```js
// src/renderer/registry/slotRegistry.js

const slots = {};

// A plugin calls this to inject a component into a named slot
export function registerSlot(slotName, component) {
  if (!slots[slotName]) slots[slotName] = [];
  slots[slotName].push(component);
}

// Base code calls this to get the list of components registered for a slot
export function getSlotContent(slotName) {
  return slots[slotName] || [];
}
```

**Step 2 — The base component defines its slots**

The base `CartPanel` has two slots: one just above the total, one just below it. By default, both are empty. The base component renders nothing there.

```jsx
// src/features/cart/components/CartPanel/CartPanel.jsx

import { getSlotContent } from '@registry/slotRegistry';

export function CartPanel() {
  // Get whatever components plugins have registered for these slots
  const AboveTotalComponents = getSlotContent('cart.above-total');
  const BelowTotalComponents = getSlotContent('cart.below-total');

  return (
    <div className={styles.panel}>
      <CartItemList />

      {/* Slot: plugins can inject content here, above the total */}
      {AboveTotalComponents.map((Component, index) => (
        <Component key={index} />
      ))}

      <CartTotal />

      {/* Slot: plugins can inject content here, below the total */}
      {BelowTotalComponents.map((Component, index) => (
        <Component key={index} />
      ))}
    </div>
  );
}
```

**Step 3 — A plugin injects its component into a slot**

The loyalty plugin wants to display a loyalty points summary just above the cart total. It registers its component for that slot.

```js
// src/plugins/loyalty-discount/index.js

import { registerSlot } from '@registry/slotRegistry';
import { LoyaltyPointsSummary } from './LoyaltyPointsSummary';

// Inject LoyaltyPointsSummary into the slot just above the cart total
registerSlot('cart.above-total', LoyaltyPointsSummary);
```

**What happens in each state:**

```
No plugin installed:
  getSlotContent('cart.above-total') returns []
  → Nothing is rendered above the total
  → Cart looks exactly as designed in base code

Loyalty plugin installed:
  getSlotContent('cart.above-total') returns [LoyaltyPointsSummary]
  → LoyaltyPointsSummary renders above the total
  → Loyalty points are visible in the cart

Two plugins installed (loyalty + gift-card):
  getSlotContent('cart.above-total') returns [LoyaltyPointsSummary, GiftCardBalance]
  → Both components render above the total, stacked
  → plugins do not know about each other — they just both registered for the same slot
```

### What this is good for

Use this when a plugin is adding something new that does not exist in the base UI at all. The base component defines where extra content is allowed; the plugin decides whether to put something there.

---

## Way 3 — Component Wrapper (Add JSX Around an Existing Component)

### What it is

A plugin wraps an existing component. The original component still renders, but the plugin adds its own JSX around it — before it, after it, or layered on top of it visually. The original component has no idea it is being wrapped. Nothing inside the original component changes.

### How it works

**Step 1 — The wrapper registry**

```js
// src/renderer/registry/wrapperRegistry.js

const wrappers = {};

// A plugin calls this to register a wrapper for a component
export function wrapComponent(name, WrapperComponent) {
  wrappers[name] = WrapperComponent;
}

// Base code calls this to get the wrapper, or returns the component as-is
export function getWrapped(name, BaseComponent) {
  const Wrapper = wrappers[name];
  if (!Wrapper) return BaseComponent;

  // Return a new component that renders the Wrapper, passing the original as a prop
  return function WrappedVersion(props) {
    return <Wrapper WrappedComponent={BaseComponent} {...props} />;
  };
}
```

**Step 2 — The base ProductCard uses the wrapper registry**

```jsx
// src/features/pos/components/ProductCard/ProductCard.jsx

import { getWrapped } from '@registry/wrapperRegistry';

function BaseProductCard({ product }) {
  return (
    <div className={styles.card}>
      <img src={product.image} alt={product.name} />
      <span>{product.name}</span>
      <span>{product.price}</span>
    </div>
  );
}

// Export the wrapped version — if a plugin registered a wrapper, it applies here
// If no plugin is active, this is just BaseProductCard unchanged
export const ProductCard = getWrapped('ProductCard', BaseProductCard);
```

**Step 3 — A plugin wraps the ProductCard to add a loyalty badge**

The loyalty plugin wants every product card to show how many loyalty points it earns. It wraps the card and adds the badge on top.

```jsx
// src/plugins/loyalty-discount/index.js

import { wrapComponent } from '@registry/wrapperRegistry';
import styles from './LoyaltyBadge.plugin.css';

wrapComponent('ProductCard', function LoyaltyProductCard({ WrappedComponent, product, ...props }) {
  return (
    <div className={styles.cardWrapper}>
      {/* The original ProductCard renders exactly as it always did */}
      <WrappedComponent product={product} {...props} />

      {/* The loyalty badge is layered on top — the original card has no idea */}
      {product.loyaltyPoints > 0 && (
        <span className={styles.loyaltyBadge}>
          +{product.loyaltyPoints} pts
        </span>
      )}
    </div>
  );
});
```

**What happens in each state:**

```
No plugin installed:
  getWrapped('ProductCard', BaseProductCard) returns BaseProductCard unchanged
  → Product card renders normally, no badge

Loyalty plugin installed:
  getWrapped('ProductCard', BaseProductCard) returns LoyaltyProductCard
  → LoyaltyProductCard renders, which renders BaseProductCard inside it
  → Loyalty badge appears on every card
  → BaseProductCard code is not changed in any way

plugin uninstalled:
  → No wrapper → BaseProductCard again → badges gone
```

### What this is good for

Use this when a plugin needs to add visual elements around or on top of an existing component without changing the component itself. Good for badges, banners, overlays, and contextual indicators.

---

## Way 4 — Route and Screen Registration (Add Entirely New Screens)

### What it is

A plugin adds a completely new screen to the POS — a screen that does not exist in the base system at all. The plugin registers both the URL path for the screen and the component that renders it. The navigation system picks this up and makes the screen accessible.

### How it works

**Step 1 — The route registry**

```js
// src/renderer/registry/routeRegistry.js

const extraRoutes = [];

// A plugin calls this to register a new screen
export function registerRoute({ path, component, label, icon }) {
  extraRoutes.push({ path, component, label, icon });
}

// The router calls this to get all plugin-registered routes
export function getRegisteredRoutes() {
  return extraRoutes;
}
```

**Step 2 — The base router includes registered routes**

```jsx
// src/renderer/router/AppRouter.jsx

import { getRegisteredRoutes } from '@registry/routeRegistry';

export function AppRouter() {
  const pluginRoutes = getRegisteredRoutes();

  return (
    <Routes>
      {/* Base routes — always present */}
      <Route path="/" element={<PosScreen />} />
      <Route path="/orders" element={<OrdersScreen />} />
      <Route path="/settings" element={<SettingsScreen />} />

      {/* plugin routes — only present if a plugin registered them */}
      {pluginRoutes.map(({ path, component: Screen }) => (
        <Route key={path} path={path} element={<Screen />} />
      ))}
    </Routes>
  );
}
```

**Step 3 — The sidebar also picks up registered routes for navigation**

```jsx
// src/components/layout/Sidebar/Sidebar.jsx

import { getRegisteredRoutes } from '@registry/routeRegistry';

export function Sidebar() {
  const pluginRoutes = getRegisteredRoutes();

  return (
    <nav>
      <NavLink to="/">POS</NavLink>
      <NavLink to="/orders">Orders</NavLink>
      <NavLink to="/settings">Settings</NavLink>

      {/* plugin navigation links appear automatically */}
      {pluginRoutes.map(({ path, label }) => (
        <NavLink key={path} to={path}>{label}</NavLink>
      ))}
    </nav>
  );
}
```

**Step 4 — A plugin registers its new screen**

```js
// src/plugins/loyalty-program/index.js

import { registerRoute } from '@registry/routeRegistry';
import { LoyaltyProgramScreen } from './LoyaltyProgramScreen';

registerRoute({
  path: '/loyalty',
  component: LoyaltyProgramScreen,
  label: 'Loyalty Program',
});
```

**What happens in each state:**

```
No plugin installed:
  getRegisteredRoutes() returns []
  → Sidebar shows: POS, Orders, Settings
  → Navigating to /loyalty shows a 404 page

Loyalty program plugin installed:
  getRegisteredRoutes() returns [{ path: '/loyalty', ... }]
  → Sidebar automatically shows a new 'Loyalty Program' link
  → /loyalty renders LoyaltyProgramScreen
  → No changes to AppRouter.jsx or Sidebar.jsx

plugin uninstalled:
  → Route is gone → link is gone → nothing else changes
```

### What this is good for

Use this when a plugin is adding a full new area of the POS that does not exist in the base system — a loyalty program screen, a reporting dashboard, a staff management panel, an inventory screen.

---

## Practical Questions About Building the Base Code

### Question 1 — Do I have to add the registry imports to base components from day one?

Yes, but the amount of upfront work is different for each way. Here is the honest answer for all four:

---

#### Way 1 — Component Registry

**Yes, you must plan this upfront.**

For a component section to be replaceable by a plugin, the base component must already be calling `getComponent()` at that spot. If it is not, there is no hook for a plugin to plug into — the component will just hardcode its child forever.

What this means in practice: when you are writing a base component that contains a child section which a future plugin might want to replace, you do not hardcode that child. You call `getComponent('some.name', DefaultChild)` instead.

```
Without the registry call:
  <CartSummary> always renders <DefaultDiscountRow> — hardcoded, no plugin can replace it

With the registry call:
  <CartSummary> asks getComponent() every time it renders
  → If a plugin is active, it renders the plugin's version
  → If no plugin is active, it renders DefaultDiscountRow (the fallback)
```

The base `DefaultDiscountRow` itself needs no changes. The registry call only goes in the parent component at the point where the child is rendered.

---

#### Way 2 — Slot System

**Yes, you must define the slots upfront in the base component.**

A slot is a position in a component's JSX where plugins are allowed to inject content. If you do not put a slot there, there is no injection point and no plugin can add content there.

The key question to ask when writing a base component: are there positions in this layout where a plugin might reasonably want to add something? If yes, add a slot at that position. If the slot stays empty forever (no plugin ever uses it), it renders nothing and has zero cost.

```
Without the slot in CartPanel:
  A loyalty plugin has nowhere to insert its points display
  → The only option is to edit CartPanel.jsx directly — which breaks the rule

With the slot in CartPanel:
  <CartPanel> has getSlotContent('cart.above-total') already in its JSX
  → Loyalty plugin registers for that slot
  → Points display appears, no base file touched
```

Slots are cheap to add. They are just two lines in the JSX — calling `getSlotContent()` and mapping the result. Add them generously to any component where injecting additional content later seems plausible.

---

#### Way 3 — Component Wrapper

**This is the most flexible — you can add it before or after the base component is written.**

There are two approaches:

**Option A — The component wraps itself (must be planned upfront)**

The base component calls `getWrapped()` on itself during its own definition. This is what was shown in the document. It requires the registry import to be in the base component file from the start.

```jsx
// BaseProductCard wraps itself — the registry call is inside the component's own file
export const ProductCard = getWrapped('ProductCard', BaseProductCard);
```

**Option B — The parent wraps it when rendering (can be added at any time)**

Instead of the component wrapping itself, the component that renders it does the wrapping. The `ProductCard` file is completely untouched. The wrapping logic lives one level up, in the component that decides which card to render.

```jsx
// ProductGrid renders cards — it applies the wrapper here, not inside ProductCard
import { getWrapped } from '@registry/wrapperRegistry';
import { ProductCard } from '../ProductCard/ProductCard';

const WrappedProductCard = getWrapped('ProductCard', ProductCard);

export function ProductGrid({ products }) {
  return (
    <div className={styles.grid}>
      {products.map(product => (
        <WrappedProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
```

Option B is useful when you want to make an existing component wrappable without touching its file at all. You add the wrapping logic to its parent instead.

---

#### Way 4 — Route Registration

**Only the router and sidebar need upfront changes — individual screen components need nothing.**

The two files that need `getRegisteredRoutes()` from day one are `AppRouter.jsx` and `Sidebar.jsx`. These are shared layout files that you write once at the start of the project. After that, any screen any plugin adds is automatically picked up — the screen component itself has no registry code at all.

```
AppRouter.jsx:    needs getRegisteredRoutes() → written once, never touched again
Sidebar.jsx:      needs getRegisteredRoutes() → written once, never touched again
LoyaltyScreen.jsx: no registry code needed → plugin just registers it by name
```

---

#### Summary — What to add upfront and where

| Way | What needs the registry code | When to add it |
|---|---|---|
| Component Registry | The parent component that renders the replaceable child | Upfront — when writing that parent component |
| Slot System | The component that contains the injection points | Upfront — when writing that component |
| Component Wrapper (Option A) | The base component itself | Upfront — when writing the component |
| Component Wrapper (Option B) | The parent that renders the component | Can be added at any time — base component untouched |
| Route Registration | AppRouter.jsx and Sidebar.jsx only | Once at project start — never needs changing again |

---

### Question 2 — How do I decide at the start which registry to use for a component?

This is a design decision, not a technical one. The right way to think about it is to ask one question for each component you are building:

**What might a future plugin want to do with this component?**

Work through this mental checklist when writing any base component:

---

**1. Does this component contain a section that a plugin might want to completely replace?**

For example: the cart has a discount row. A loyalty plugin would want to replace that with its own discount logic and UI. The base version should never show when the loyalty plugin is active.

→ Use **Component Registry** for that section. Wrap the child in `getComponent()`.

---

**2. Are there positions in this component's layout where a plugin might want to add content that does not exist yet?**

For example: the cart panel has a total at the bottom. A gift-card plugin might want to show the gift card balance above it. A promo plugin might want to show the savings below it. Neither of these exist in the base.

→ Use **Slot System**. Add `getSlotContent()` calls at those positions.

---

**3. Might a plugin want to add a visual decoration around this entire component?**

For example: a product card. A loyalty plugin might want to add a "+20 pts" badge on top of every card. A "low stock" plugin might want to add a red border around cards with low inventory. These additions live outside the component, layered around it.

→ Use **Component Wrapper**. Add `getWrapped()` either in the component or its parent.

---

**4. Does this component handle navigation or layout — showing other screens?**

For example: the router decides which screen to show at which URL. The sidebar decides which navigation links appear. These are the only two places where new screens need to be registered.

→ Use **Route Registration** in AppRouter.jsx and Sidebar.jsx.

---

**A practical shortcut for everyday components**

You do not need to think deeply about every single component. Most components are small and internal — a price label, a quantity badge, an icon. These do not need any registry hooks.

Focus the registry planning on:

- **Large container components** (CartPanel, ProductGrid, PaymentScreen, ReceiptView) — these are the ones plugins will want to interact with
- **Repeated item components** (ProductCard, CartItem, OrderRow) — plugins often want to decorate these
- **Key functional sections** (DiscountRow, PaymentMethodSelector, CartTotal) — these are the sections plugins most commonly replace

Everything else — labels, icons, small display components — can be left plain. If a plugin needs to affect them, it can do so through the parent container's slots or wrapper.

---

**A one-sentence rule for each way:**

- Add a **Component Registry** hook wherever the base component delegates rendering a child that another business rule might need to change
- Add **Slot** positions wherever blank space between existing elements could logically hold additional information
- Add a **Wrapper** hook on any component that stands alone visually and could have decorations layered on it
- Add **Route Registration** only in the router and sidebar — once, at project start

---

### Question 3 — What If a Component Was Built Without Registry Hooks?

This is a real situation. You wrote a component early in development, did not add registry hooks, and now a plugin needs to override it. Here is how to handle it correctly.

You have two options, and the right one depends on where in the component tree the hook is missing.

---

#### Option 1 — Use the Parent (No base file touched)

Before assuming you need to edit the base component, check its parent — the component that renders it.

**If the parent has a Wrapper hook already:**
The plugin registers a wrapper at the parent level. The wrapper renders the plugin's replacement version and hides the original using CSS. The base component file is never opened.

**If the parent has a Slot already:**
The plugin injects its replacement into a slot that sits next to the original. Combined with a CSS override that hides the original, the plugin's version is shown instead. No base file touched.

**If the parent renders the base component in a loop (like ProductGrid renders ProductCard):**
Use Wrapper Option B — add `getWrapped()` to the parent at the point where it renders the child. The parent file is touched once, the base component file itself is not.

```jsx
// ProductGrid — adding Wrapper Option B without touching ProductCard.jsx
import { getWrapped } from '@registry/wrapperRegistry';
import { ProductCard } from '../ProductCard/ProductCard';

// This line is added to the parent — ProductCard.jsx is never changed
const WrappedProductCard = getWrapped('ProductCard', ProductCard);

export function ProductGrid({ products }) {
  return (
    <div className={styles.grid}>
      {products.map(product => (
        <WrappedProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
```

Always check the parent first. In many cases the parent is a larger container component that already has some registry work done, and you can solve the problem without touching the base component at all.

---

#### Option 2 — Retrofit the Registry Hook (Controlled, one-time edit to base code)

If Option 1 does not apply — the parent has no hooks and adding a wrapper to the parent does not solve the problem — then the right move is to add the registry hook to the base component itself. This is called retrofitting.

**This is acceptable.** It is not the same as editing business logic. Here is the important distinction:

| Type of edit | What it means | Is it okay? |
|---|---|---|
| Editing business logic in base code | Changing what a function does, what data it shows, how it behaves | No — this breaks the modularity rule |
| Retrofitting a registry hook | Adding `getComponent()`, `getSlotContent()`, or `getWrapped()` to make the component modular | Yes — this is a planned, structural improvement |

Retrofitting a registry hook has no functional impact when no plugin is active. The fallback is always the original component. The component behaves identically before and after the retrofit, as long as no plugin is registered. You are not changing what the component does — you are opening a door that was not there before.

**The retrofit is small — typically 1 to 3 lines.**

*Before retrofit — the component hardcodes its child:*

```jsx
// CartSummary.jsx — written without registry hooks
export function CartSummary() {
  return (
    <div className={styles.summary}>
      <CartItemList />
      <DefaultDiscountRow />    {/* hardcoded — no plugin can touch this */}
      <CartTotal />
    </div>
  );
}
```

*After retrofit — one import and one changed line:*

```jsx
// CartSummary.jsx — retrofitted with a Component Registry hook
import { getComponent } from '@registry/componentRegistry';   // added
import { DefaultDiscountRow } from './DefaultDiscountRow';

export function CartSummary() {
  const DiscountRow = getComponent('cart.DiscountRow', DefaultDiscountRow);  // changed

  return (
    <div className={styles.summary}>
      <CartItemList />
      <DiscountRow />           {/* now overridable — fallback is DefaultDiscountRow */}
      <CartTotal />
    </div>
  );
}
```

When no plugin is installed, `DiscountRow` resolves to `DefaultDiscountRow` — exactly what was there before. The component behaves identically. Once the retrofit is done, this file is never touched again.

---

### Which Option to Choose

| Situation | What to do |
|---|---|
| The parent renders the component in a loop | Wrapper Option B in the parent — base component untouched |
| The parent already has slots or wrappers nearby | Use those — base component untouched |
| The base component contains a replaceable child section | Retrofit a Component Registry hook into the base component |
| The base component needs injection points | Retrofit Slot calls into the base component |
| None of the above fit | Retrofit the most appropriate registry hook |

**The rule is:** Always try Option 1 first — use the parent. If the parent cannot solve it, retrofit the base component with a registry hook. A retrofit is always a small, safe, structural change. It is the one-time cost of adding modularity support to a component that missed it during initial development.

Once retrofitted, the component is modular forever. You never touch it for plugin-related reasons again.

---

## Comparison of All Four Ways

| | Component Registry | Slot System | Component Wrapper | Route Registration |
|---|---|---|---|---|
| What it does | Replaces a component | Injects into a designated space | Adds JSX around a component | Adds a new screen |
| Base component used? | No — replaced | Yes — kept, content added around it | Yes — rendered inside the wrapper | Not applicable |
| Base file touched? | No | No | No | No |
| Use when | You want to swap out part of the UI | You want to add something new in a defined spot | You want to layer something on top | You want a whole new screen |
| Real POS example | Replace discount row with loyalty row | Add loyalty points display above cart total | Add loyalty badge on product cards | Add a loyalty program management screen |

---

## Which Way to Use and When

**Use Component Registry** when your plugin's purpose is to replace the behaviour or appearance of an existing UI section. The base version disappears while your plugin is active. When the plugin is removed, the base version comes back automatically.

**Use Slot System** when your plugin is adding something that the base UI has no equivalent of. You are not replacing anything — you are adding new content into a pre-approved space inside an existing component.

**Use Component Wrapper** when your plugin needs to add something visually around or on top of an existing component — a badge, a highlight, an overlay — without changing that component's own code or output.

**Use Route Registration** when your plugin introduces a whole new section of the app: a new screen, a new workflow, a new management area.

In practice, a single plugin may use more than one of these. A loyalty plugin might use the Slot System to inject a points display into the cart, the Component Wrapper to add a badge to product cards, and Route Registration to add a loyalty management screen — all from a single `index.js`, and all undone by removing one line from `pluginLoader.js`.

---

## The Complete Install and Uninstall Flow

### Installing a plugin

1. Drop the plugin folder into `src/renderer/plugins/`
2. Add one line to `pluginLoader.js`:
   ```js
   () => import('./loyalty-discount'),
   ```
3. That is it. The plugin's `index.js` runs at startup, registers its overrides and injections, and the new behaviour is live.

### Uninstalling a plugin

1. Remove that one line from `pluginLoader.js`
2. That is it. The plugin's registrations never happen. Every base component falls back to its default. Every slot is empty again. Every route is gone.

No edits to base components. No cleanup. No leftover code.

---

## The Registries — Where to Put Them

All four registries live in one shared folder that both base code and plugin code can import from:

```
src/renderer/registry/
├── componentRegistry.js    ← for Way 1
├── slotRegistry.js         ← for Way 2
├── wrapperRegistry.js      ← for Way 3
└── routeRegistry.js        ← for Way 4
```

Base components import from here when they need to look something up. plugin entry points import from here when they register something. The registries are the neutral ground between the two.

---

## Production Validity

These four patterns are not invented for this system. They are already running in production in major Electron and frontend applications:

| Way | Pattern name | Used in |
|---|---|---|
| Component Registry | Contribution Points / Service Registry | VS Code — its entire extension system (30,000+ extensions) is built on this exact pattern |
| Slot System | Named Slots / Extension Points | VS Code views, WordPress plugin hooks (150+ named positions, 15+ years in production) |
| Component Wrapper | Higher-Order Component (HOC) | React-Redux, React DevTools, BetterDiscord (5M+ users — built entirely on wrapping Discord's components) |
| Route Registration | Dynamic Route Registration | VS Code views, Angular lazy-loaded feature plugins, React Router v6 |

None of these are experimental. All four have years of real-world validation at scale in exactly the kind of modular, extensible application this POS is being built as.
