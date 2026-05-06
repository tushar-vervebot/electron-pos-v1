# POS System — UI Styling Decision

This document explains the two styling options considered for this POS system and why one is a better fit than the other. Each case is evaluated separately so you can understand the reasoning behind each decision, not just the final answer.

The two options are:

- **Option A — CSS Modules + CSS Variables**
- **Option B — Tailwind CSS**

---

## What This POS System Demands from Styling

Before comparing the two options, it helps to understand what this specific system needs.

This POS runs on Windows via Electron. It handles high-frequency actions — barcode scans, cart updates, billing — all day long. The UI includes precision layouts like receipt panels, numpads, and product grids. It will be maintained by a team over a long period, and it needs to support a **modular architecture** where features can be extended or overridden without touching the base code.

So the styling choice must satisfy four things:

1. Good performance with no slowdowns on low-end machines
2. Maintainability — easy to read, change, and scale over time
3. Precision — pixel-level control over complex layouts
4. **Modularity support** — styles must be safely overridable from external modules without conflicts

---

## 1. Performance

### What performance means in styling

Performance here means: does the styling system add any slowdown when the app is running? This matters because the POS UI updates constantly — every cart change, every scan, every screen switch triggers a UI redraw.

### How each option performs

Both CSS Modules and Tailwind produce plain CSS files at build time. Neither one does any extra work while the app is running. From a raw performance standpoint, they are equal.

However, there is a practical difference at scale. CSS Modules produce a fixed, predictable CSS file — every component has its own stylesheet, and it never changes unless a developer changes it. Tailwind produces a CSS file by scanning your code for utility classes, which works well but can become harder to predict as the project grows.

### Verdict

| | CSS Modules | Tailwind |
|---|---|---|
| Runtime cost | None | None |
| Predictability at scale | High | Medium |

Both are safe. CSS Modules is slightly more predictable for a long-running production system.

---

## 2. Maintainability

### What maintainability means in styling

A year from now, a developer needs to find where the receipt layout is styled and change a spacing value. How easy is that?

### CSS Modules

Each component has its own stylesheet sitting right next to it in the same folder.

```
ReceiptView/
├── ReceiptView.jsx
└── ReceiptView.module.css   ← styles are here, nowhere else
```

You open the component, you see the style file next to it, you change it. No guessing.

### Tailwind

Styles live inside the JSX as long strings of utility class names. For a simple button this is fine. For a complex POS component — a receipt with line items, totals, and discount rows — the class strings become very long and hard to read.

```jsx
<div className="flex flex-col gap-2 p-4 border border-gray-200 rounded-lg shadow-sm bg-white text-sm text-gray-800 w-full max-w-md">
```

When you come back to this six months later, finding what controls a specific spacing or color takes real effort.

### Verdict

| | CSS Modules | Tailwind |
|---|---|---|
| Finding styles quickly | Easy — dedicated file | Harder — search through JSX |
| Readability at scale | High | Drops as components grow |
| Refactoring safely | Simple | Requires care |

CSS Modules wins clearly for a long-term project with a team.

---

## 3. POS UI Precision

### What precision means here

A POS UI is not a generic dashboard. It has very specific layout requirements — a numpad where every button must be exactly the right size, a receipt that must look identical to the printed version, a product grid that must fit exactly N items per row regardless of screen size. These layouts need pixel-level control.

### CSS Modules

You write standard CSS. You can use any CSS property, any layout technique, any measurement unit. Nothing is off limits. You have the same control as writing a stylesheet for a custom website.

### Tailwind

Tailwind gives you utilities that cover most common cases. But for anything outside its preset values — custom receipt dimensions, specific grid configurations, hardware-specific button sizes — you either use Tailwind's arbitrary value syntax (which looks messy) or you write plain CSS alongside it anyway. This leads to a mixed system that is harder to manage than just using CSS Modules from the start.

### Verdict

| | CSS Modules | Tailwind |
|---|---|---|
| Custom layouts | Full control | Limited to presets or workarounds |
| Receipt / numpad precision | Natural | Awkward |
| Complex grids | Simple | Requires extra configuration |

CSS Modules wins for a UI this custom.

---

## 4. Theming

### What theming means in this system

The POS may need a light theme and dark theme. Different installations might need different brand colors. Switching should be instant with no page reload.

### CSS Modules + CSS Variables

The entire color palette and spacing scale is stored as CSS Variables in one file. To switch themes, you just switch which set of variables is active. Every component that reads `--color-primary` automatically shows the new color without any code change.

```
Light theme → --color-primary: green
Dark theme  → --color-primary: dark blue
```

One variable file controls every component at once.

### Tailwind

Tailwind does support theming through its config file. But that config is a build-time setting. You cannot switch themes at runtime without extra JavaScript work. Dynamic theming (letting a user switch themes inside the running app) is less natural.

### Verdict

| | CSS Modules | Tailwind |
|---|---|---|
| Runtime theme switching | Simple and instant | Requires extra JS |
| Centralised design tokens | Yes — one variables file | Spread across config |
| Per-scope theming | Supported | Not straightforward |

CSS Modules wins for flexible, runtime-switchable theming.

---

## 5. Team Collaboration

### The concern

Multiple developers working on the same codebase can create style conflicts — two people write a class called `.button` and one overwrites the other.

### CSS Modules

This problem cannot happen. Every CSS Module is automatically scoped to its file. A `.button` class in `Button.module.css` is completely isolated from a `.button` class anywhere else. Developers can name classes freely without checking what names are already taken.

### Tailwind

Utility classes are global, so naming conflicts are avoided because you are not naming classes at all. But a different problem appears — if two developers style the same component differently, you get two very different class strings that do the same thing. Without strong conventions enforced by the team, Tailwind codebases diverge in style over time.

### Verdict

| | CSS Modules | Tailwind |
|---|---|---|
| Class name conflicts | Impossible by design | Not applicable |
| Consistent code style across team | Naturally enforced | Requires discipline |
| Onboarding new developers | Standard CSS — no new concepts | Requires learning Tailwind's system |

Both work, but CSS Modules is more naturally consistent.

---

## 6. Modularity

### What modularity means

This is the most important case for this specific system. The POS is designed so that new features — a loyalty discount system, a split payment feature, a custom receipt layout — can be added as separate modules without touching the base code. A module lives in its own folder and registers its behaviour on top of the existing system.

The question for styling is: when a module wants to change how something looks, how does it do that without breaking the base component or conflicting with other modules?

### The two approaches to adding a module

Think of it this way. You have a base `Button` component. A loyalty module wants that button to appear gold instead of green.

- **Option A (wrong):** The module edits `Button.module.css` directly. Now the loyalty module has changed the base code. If you remove the loyalty module later, you have to manually undo those changes. If two modules both edit the base file, they create conflicts.

- **Option B (correct):** The base component accepts an optional style from outside. The module provides its own style file and passes it in. The base file is never touched.

### How CSS Modules handles this cleanly

CSS Modules has three natural ways for a module to override styles. Each one has a different job. Understanding when to use each is the key to a clean modular system.

---

### Way 1 — className Prop Forwarding

#### What it is

This is the most common way. The base component is written to accept an optional extra class from the outside. Whoever uses that component can pass in their own class, and it gets added alongside the base styles.

#### How it works

The base Button component has its own stylesheet with its normal green color. But it also accepts a `className` prop. If nobody passes one in, it uses only its own styles. If a module passes one in, both the base style and the module's style are applied — and the module's style takes priority because it comes after.

```jsx
// Base Button component — Button.jsx
// The component accepts an optional className from outside
export function Button({ children, className, ...props }) {
  return (
    <button className={`${styles.button} ${className || ''}`} {...props}>
      {children}
    </button>
  );
}
```

```css
/* Base button styles — Button.module.css */
/* This file is never touched by any module */
.button {
  background-color: var(--color-primary);  /* green */
  padding: 10px 20px;
  border-radius: 6px;
  color: white;
  font-weight: 600;
}
```

Now the loyalty module wants a gold button. It creates its own stylesheet and passes its class into the Button:

```css
/* Loyalty module's own stylesheet — LoyaltyButton.module.css */
/* Lives inside the module folder, not in the base component */
.loyaltyButton {
  background-color: #d4a017;  /* gold */
  border: 2px solid #a07800;
}
```

```jsx
/* Loyalty module uses the base Button, passes its own class */
import { Button } from '@components/common/Button';
import styles from './LoyaltyButton.module.css';

<Button className={styles.loyaltyButton}>Apply Loyalty Points</Button>
```

#### What actually happens

The button renders with both the base class and the loyalty class. The base sets the padding, font, border-radius. The loyalty class overrides only the background color. If you remove the loyalty module, the button goes back to green automatically — the base file was never changed.

```
Base styles  →  padding, font, border-radius, green background
Module styles →  overrides just the background to gold
Result       →  gold button with correct padding and font
```

#### When to use this way

Use this when you want to override the look of **one specific instance** of a component from inside a module. It is precise, scoped, and leaves no footprint in the base code.

---

### Way 2 — CSS Variables

#### What it is

Instead of overriding a specific component, this way overrides the design tokens — the underlying values that many components all share. One change can update the colors, spacing, or sizing of an entire section of the screen at once.

#### The key idea

Components are written to use CSS Variables for anything that might change — colors, spacing, border radius, font size. The actual values for those variables are defined in a central file. A module can redefine those variables for a specific area of the screen, and every component in that area picks up the change automatically.

#### How it works

First, the base design tokens are defined once in a shared file:

```css
/* Base design tokens — variables.css */
/* This is the single source of truth for the whole app */
:root {
  --color-primary: #22c55e;       /* green */
  --color-surface: #ffffff;
  --color-text: #111827;
  --spacing-md: 12px;
  --btn-radius: 6px;
}
```

Every base component uses these variables, never hard-coded values:

```css
/* Button.module.css */
.button {
  background-color: var(--color-primary);   /* reads from the token */
  padding: var(--spacing-md);
  border-radius: var(--btn-radius);
}
```

```css
/* CartSummary.module.css */
.total {
  color: var(--color-primary);   /* also reads from the same token */
}
```

Now a "dark theme" module wants to change the primary color from green to blue across the whole POS screen. It does not touch any component file. It just redefines the variable for the right scope:

```css
/* dark-theme module — theme-override.css */
/* Applies only inside elements with data-theme="dark" */
[data-theme="dark"] {
  --color-primary: #3b82f6;    /* blue replaces green */
  --color-surface: #1f2937;
  --color-text: #f9fafb;
}
```

The module activates this by adding `data-theme="dark"` to the root element. Every component that reads `--color-primary` now shows blue. When the module is removed, the attribute is removed, and everything goes back to the base green.

```
Module active   →  root has data-theme="dark"  →  all components read blue
Module removed  →  attribute gone              →  all components read green
Nothing in any component file was ever changed
```

#### When to use this way

Use this when you want to change the **visual theme or brand** across a whole section or the whole app. This is the right way to implement dark mode, light mode, or customer-specific branding. It is the most powerful way because one change affects everything.

---

### Way 3 — CSS Composes

#### What it is

`composes` is a feature built into CSS Modules. It lets one class inherit all the styles of another class and then add extra rules on top. Think of it like inheritance in code — a module's class can start with everything the base class has, then extend it.

#### The key idea

Instead of copying the base styles into the module (which creates duplication that drifts over time), the module's class simply declares "I start from the base class, then add these extra things." If the base class ever changes, the module automatically gets those changes too.

#### How it works

The base button style is defined as usual:

```css
/* Button.module.css */
.button {
  padding: 10px 20px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}
```

The loyalty module wants a variant of this button that has all the same spacing and font, but a gold background and a special border. Instead of copying those base rules, it composes from them:

```css
/* LoyaltyButton.module.css — inside the loyalty module */
.loyaltyButton {
  composes: button from '@components/common/Button/Button.module.css';
  /* All rules from .button are now included automatically */
  /* Only add what is different */
  background-color: #d4a017;
  border: 2px solid #a07800;
  color: #1a0a00;
}
```

The module then uses this composed class directly — no need to pass className into the base component:

```jsx
import styles from './LoyaltyButton.module.css';

<button className={styles.loyaltyButton}>Apply Points</button>
```

#### What actually happens

At build time, CSS Modules sees the `composes` declaration and generates a class that includes all the rules from the base `.button` plus the extra rules from `.loyaltyButton`. The HTML element ends up with both class names applied — but this is handled automatically, not manually.

```
.loyaltyButton inherits →  padding, border-radius, font-weight, cursor, transition
Then adds its own      →  gold background, gold border, dark text
No duplication in code. If base padding changes, loyalty button automatically updates.
```

#### When to use this way

Use this when you are building a **variant of an existing component** that is structurally the same but visually different. A danger button, a premium button, a loyalty button — these are all variants of a base button. Composes lets you build those variants cleanly, with no duplication.

---

### Way 4 — Complete Style Replacement

#### What it is

All three ways above work by layering — the base styles stay in place and the module adds to or adjusts them. But there is a valid situation where you do not want any of the base styles at all. You want a completely fresh start: the base component has 5 properties, your module defines 2, and only those 2 should apply — the other 3 from the base should not show up at all.

This is called complete style replacement. There are three ways to achieve it, each with a different trade-off.

---

#### Approach A — The `replaceStyles` prop (recommended)

The base component is written with a small switch: if the caller passes a `replaceStyles` prop, the component skips its own base class entirely and applies only the external class. If nobody passes `replaceStyles`, the base class applies as normal.

```jsx
// Base Button — Button.jsx
export function Button({ children, className, replaceStyles, ...props }) {
  // If replaceStyles is true, ignore the base class completely
  const appliedClass = replaceStyles ? (className || '') : `${styles.button} ${className || ''}`;

  return (
    <button className={appliedClass} {...props}>
      {children}
    </button>
  );
}
```

```css
/* Base button — Button.module.css */
.button {
  background-color: var(--color-primary);
  padding: 10px 20px;
  border-radius: 6px;
  color: white;
  font-weight: 600;   /* 5 properties — none of these will apply */
}
```

The module passes its own 2-property class and sets `replaceStyles`:

```css
/* Kiosk module — KioskButton.module.css */
.kioskButton {
  background-color: #1a1a2e;  /* dark navy */
  font-size: 22px;             /* large for touchscreen */
  /* That is all. The base's padding, radius, font-weight are gone. */
}
```

```jsx
import { Button } from '@components/common/Button';
import styles from './KioskButton.module.css';

<Button replaceStyles className={styles.kioskButton}>Pay Now</Button>
```

```
Result:  only background-color and font-size are applied
         padding, border-radius, color, font-weight from base → not applied at all
```

The base component still handles its own JSX structure, event wiring, and accessibility attributes. Only the CSS is completely replaced. This is the cleanest approach.

---

#### Approach B — `all: unset` and `all: revert` in CSS

This is a pure CSS approach. Instead of the component controlling what class gets applied, the module's own CSS class cancels the base styles before adding its own.

There are two values you can use here, and they behave differently:

---

**`all: unset` — strips everything, including browser defaults**

`all: unset` resets every single CSS property on the element to absolute zero — not just your custom base class styles, but also the browser's built-in default styles. A `<button>` element in a browser has default styles (a visible border, a cursor, a display type). `all: unset` removes all of that too.

```css
.kioskButton {
  all: unset;               /* removes base class styles AND browser defaults */
  background-color: #1a1a2e;
  font-size: 22px;
  cursor: pointer;          /* must add this back — browser default was wiped */
  display: inline-block;    /* must add this back — browser default was wiped */
}
```

Use this when you want a completely clean canvas and are comfortable manually adding back the browser defaults you need.

---

**`all: revert` — strips only your custom CSS, keeps browser defaults intact**

This is the direct answer to your first doubt. `all: revert` removes only the styles that came from your own code — the base class's 5 properties — and restores the element back to what the browser would show by default. Browser defaults like the button cursor, focus outline, and display type are kept. You do not need to add them back manually.

```css
.kioskButton {
  all: revert;              /* removes base class styles only */
                            /* browser defaults are KEPT — cursor, display, etc. */
  background-color: #1a1a2e;
  font-size: 22px;
  /* Only these 2 properties apply on top of browser defaults */
}
```

```jsx
/* Module passes its class using the normal className forwarding */
<Button className={styles.kioskButton}>Pay Now</Button>
```

Because `all: revert` runs first, the base class's 5 properties are all cancelled. The browser defaults remain. Then your 2 properties are applied on top.

```
Base class has:     background, padding, border-radius, color, font-weight
all: revert removes: all 5 of those — they no longer apply
Browser defaults:    cursor, display, focus ring — still there, untouched
Module adds:         background-color: #1a1a2e, font-size: 22px
Final result:        only your 2 properties + browser defaults
```

**`all: revert` is the better default for this POS system.** You get a clean break from the base class without losing the browser's sensible defaults, and you avoid having to manually restore `cursor: pointer` and similar properties on every element.

---

**Quick comparison of the two values:**

| | `all: unset` | `all: revert` |
|---|---|---|
| Removes base class styles | Yes | Yes |
| Removes browser default styles | Yes — you must re-add them | No — browser defaults are kept |
| How much manual restoration needed | More — add back cursor, display, etc. | Less — only add what you truly want |
| When to use | When you want absolute zero as the starting point | When you want base class gone but browser defaults kept |

This approach works well when you want a guaranteed clean break from the base CSS without touching the component's JSX or adding a prop.

---

#### Approach C — Bypass the base component entirely

Before explaining this, it is important to understand the difference between two things that both have the word "base":

- **The base React component** — this is the `Button.jsx` file. It is a JavaScript function that React calls to render the button. It may contain logic: handling disabled state, showing a loading spinner, wiring up keyboard events, setting accessibility attributes like `aria-disabled`.
- **The base CSS class** — this is the `.button` class inside `Button.module.css`. It is purely visual: colors, padding, border-radius.

In Approaches A and B, you are still using the base React component (`Button.jsx`). You import `<Button>` and render it. The component's logic runs as normal. What you are replacing is only the CSS.

In Approach C, you bypass the base React component entirely. You do not import `Button.jsx` at all. You write a plain HTML `<button>` element directly in your module's JSX, and you apply only your own CSS class to it.

```css
/* Kiosk module — KioskButton.module.css */
.kioskButton {
  background-color: #1a1a2e;
  font-size: 22px;
  /* Only these 2 properties. Nothing from base. Ever. */
}
```

```jsx
import styles from './KioskButton.module.css';

/* No import of Button.jsx at all — this is a raw HTML button element */
<button className={styles.kioskButton}>Pay Now</button>
```

To make the distinction completely clear:

```
Approach A:  import { Button } from '@components/common/Button'   ← uses Button.jsx
             <Button replaceStyles className={styles.kioskButton}>
             React component runs. Logic runs. Only CSS is replaced.

Approach B:  import { Button } from '@components/common/Button'   ← uses Button.jsx
             <Button className={styles.kioskButton}>
             React component runs. Logic runs. CSS cancelled by all: revert.

Approach C:  No import of Button.jsx
             <button className={styles.kioskButton}>              ← raw HTML element
             No React component. No logic. Only your CSS.
```

You are not creating a new React component called `KioskButton`. You are simply writing a raw HTML `<button>` tag the same way you would in a plain HTML file. The only thing on it is your module's CSS class.

**What you lose:** Everything that `Button.jsx` did beyond styling. If the base Button component automatically adds `aria-disabled` when disabled, handles keyboard Enter/Space events, shows a spinner during loading, or normalises onClick behaviour — none of that happens when you write a raw `<button>`. You have to implement any of that yourself if your module needs it.

**When this is the right choice:** When the base component's JSX structure itself does not fit your module's needs — not just the styling, but the HTML structure. For example, if the base Button renders a `<button>` but your module needs a `<div role="button">` for a specific hardware touchscreen reason. Or when the base component is truly just a styled wrapper with no logic worth keeping.

---

#### Which Approach to Use for Complete Replacement

| | Approach A — `replaceStyles` prop | Approach B — `all: revert` | Approach B — `all: unset` | Approach C — Bypass component |
|---|---|---|---|---|
| Base class styles removed | Yes — base class not applied | Yes — cancelled by revert | Yes — cancelled by unset | Yes — component not used |
| Browser defaults kept | Yes | Yes — untouched | No — must re-add manually | Yes |
| Base component logic kept | Yes | Yes | Yes | No |
| How clean it is | Very clean | Clean, minimal manual work | Clean but requires manual restoration | Simple but loses base behaviour |
| Best for | Base component has useful logic | Most cases — clean break + keep browser defaults | Absolute zero starting point needed | Base component structure itself doesn't fit |

**Use Approach A** as the default in this POS system. The base component handles more than just styling — it wires up accessibility, keyboard events, and loading states. Replacing only the CSS while keeping the component logic is the right separation. The `replaceStyles` prop makes the intent explicit and readable.

**Use Approach B with `all: revert`** when you want the base class's styles gone but do not want to manually restore browser defaults. This is the most practical pure-CSS reset for most situations in this system.

**Use Approach B with `all: unset`** only when you need absolute zero as your starting point and you are intentionally rebuilding every property from scratch, including browser defaults.

**Use Approach C** only when the base component's HTML structure itself does not fit — not just its styling, but the actual element type or behaviour that the React component renders.

---

### Comparison of All Four Ways

| | className Forwarding | CSS Variables | CSS Composes | Complete Replacement |
|---|---|---|---|---|
| What it does | Adds/overrides some properties | Overrides design tokens for a scope | Inherits base + adds new properties | Discards base styles entirely |
| Base styles kept | Yes — merged | Yes — changed via tokens | Yes — inherited | No |
| Scope of change | Narrow — one instance | Broad — section or app | Medium — all uses of that variant | Narrow — one instance |
| Base file touched? | No | No | No | No |
| Works at runtime? | Yes | Yes | No — build time | Yes |
| Best for | Changing some properties | Theming and branding | Building style variants | Completely different visual design |

---

### Which Way Should You Use — and When

There is no single answer because each way is designed for a different situation. In practice, all four are used together in the same project, for different jobs.

Here is a simple rule of thumb:

**Use className forwarding** when a module needs to change some properties of a component in one specific place — adjust a color, change a border, tweak spacing. This is the most common case — roughly 70% of module overrides will use this.

**Use CSS Variables** when a module needs to change the visual identity of a broad area — the whole POS screen, a specific panel, or apply a customer's brand colors. This is how you build dark mode or multi-brand support. Never hard-code colors in any component; always use a variable so this stays possible.

**Use CSS Composes** when a module is creating a new permanent variant of an existing component — not just a one-off change in one place, but a new type of button or badge that will be reused across the module. Composes keeps variants clean and avoids copying base styles everywhere.

**Use Complete Replacement (Approach A — `replaceStyles` prop)** when a module's design is so different from the base that keeping any of the base styles would cause problems. The module starts from a clean slate visually while still using the base component's logic and behaviour.

If you follow one rule across the entire codebase, it is this: **never hard-code color, spacing, or sizing values in component stylesheets.** Always use a CSS Variable. This keeps Way 2 always available and ensures the theming system is never accidentally locked out by a hard-coded value somewhere.

### How Tailwind handles this — and why it is a problem

With Tailwind, styles are utility class name strings written directly inside JSX. There is no separate style file — the styling is embedded in the component code itself. When a module tries to override these styles, it runs into four concrete problems.

---

#### Problem 1 — Class conflicts need an extra library to resolve

When a module wants to change the background of a button from green to gold, both the base class and the module's class end up on the same element at the same time:

```
Base class:   bg-green-500
Module class: bg-gold-400
Both applied: bg-green-500 bg-gold-400  ← which one wins?
```

CSS cannot reliably decide which one wins. The winner depends on the order in which Tailwind happened to generate those two classes in its output file — not on which class was intended to take priority. This is unpredictable and changes if you add or remove other components.

To fix this, a separate library called `tailwind-merge` must be added to every component that needs to be overridable. This library intelligently resolves which class wins. But if even one component in the codebase forgets to use it, the override silently breaks and the wrong style is shown — with no error, no warning, and no obvious way to diagnose why.

In a codebase with dozens of components across multiple modules, enforcing `tailwind-merge` everywhere is a real and growing maintenance burden.

---

#### Problem 2 — Style conflicts are invisible until the app is running

With CSS Modules, every style belongs to a specific named file. When something looks wrong, you open the component, find the `.module.css` file next to it, and see exactly which rule is responsible. The ownership is always clear.

With Tailwind, there is no file to open. When two modules conflict on the same element, there is no explicit rule that says which one wins — it is determined by Tailwind's internal CSS generation order. Figuring out why a button is the wrong color requires inspecting the generated CSS output, understanding which class came first in that output, and then working backwards to find which piece of code caused it.

In a complex POS component — a receipt panel, a numpad layout, a multi-column product grid — this kind of invisible conflict is very hard to diagnose under time pressure.

---

#### Problem 3 — Themes cannot be changed at runtime from a module

Tailwind's theming system works through a configuration file (`tailwind.config.js`). You define your colors, spacing, and font sizes there, and Tailwind bakes those values into the generated CSS at build time.

This means a module cannot change the theme while the app is running. If you want to add a dark mode, or support multiple customer brandings, or let a module override the primary color for its section of the screen — none of that is possible with Tailwind's built-in system without rebuilding the entire app.

With CSS Variables, a module can redefine `--color-primary` for a specific section of the screen at any point while the app is running. Tailwind has no equivalent of this.

---

#### Problem 4 — Custom POS layouts force you to write plain CSS anyway

Tailwind provides utilities for common cases — padding, flexbox, standard colors, typical border radii. But a POS UI has many requirements that fall outside these presets: an exact receipt width, a numpad grid with hardware-specific button dimensions, a product card with a custom aspect ratio, a billing panel aligned to a specific pixel.

For these cases, Tailwind requires you to write either arbitrary value syntax (which looks like `w-[347px]` and `grid-cols-[repeat(4,_minmax(0,1fr))]`) or a separate plain CSS file alongside the Tailwind code.

You end up with a hybrid system — some styles in Tailwind utilities, some in plain CSS files — which is harder to navigate and maintain than just using CSS Modules consistently from the start. The supposed simplicity of Tailwind disappears when the UI is this custom.

### Summary of modularity comparison

| | CSS Modules | Tailwind |
|---|---|---|
| Override a component from a module | Clean — base file untouched | Requires `tailwind-merge` in every component |
| Change theme colors from a module | Yes — CSS Variables scoping | No — build-time only |
| Conflict between two modules | Impossible — scoped files | Possible if `tailwind-merge` is missed |
| Remove a module cleanly | No trace left in base code | May leave leftover class strings |
| Works naturally with the module pattern | Yes | Needs extra conventions enforced by the team |

Modularity is the case that most strongly favors CSS Modules.

---

## 7. Summary of All Cases

| Case | CSS Modules | Tailwind | Winner |
|---|---|---|---|
| Performance | No runtime cost | No runtime cost | Tie |
| Maintainability | High | Medium | CSS Modules |
| POS UI precision | Full control | Limited to presets | CSS Modules |
| Theming | Runtime-switchable | Build-time only | CSS Modules |
| Team collaboration | Naturally consistent | Needs discipline | CSS Modules |
| Modularity | Clean override system | Fragile without extra tooling | CSS Modules |

---

## Final Decision

### CSS Modules is the correct choice for this POS system.

Not because Tailwind is a bad tool — it is excellent for projects where the UI is built quickly by a small team and long-term extensibility is not the priority. But this system has specific requirements that Tailwind does not fit well:

- The UI is highly custom with precision layout requirements
- The system is designed around modularity — features must override styles safely
- It will be maintained by a team over a long time
- Runtime theming needs to work without rebuilding the app

CSS Modules satisfies every one of these requirements naturally. Tailwind would require workarounds for at least three of them.

---

## When Tailwind Would Be Acceptable

Tailwind is a reasonable choice if:

- Your team already knows Tailwind well and is comfortable with it
- You are building a simpler, more dashboard-like UI
- You do not need the override/module pattern
- Rapid initial development is more important than long-term maintainability

None of these conditions apply to this POS system.

---

## Bottom Line

> CSS Modules is not just the safer choice — it is the choice that aligns with how this system is architecturally designed to grow.
