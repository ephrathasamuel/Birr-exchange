# Birr Watch

A live ETB (Ethiopian Birr) exchange-rate converter with a persistent
watchlist. Built with a strict **state → render → events** loop: one
`state` object holds everything, one `render(state)` draws the whole
UI from it, and every event handler only ever mutates `state` and then
calls `render()` — nothing is read back out of the DOM.

## What it does
- On load, fetches live exchange rates with ETB as the base currency
  and shows a **loading → success/error** status line.
- Once loaded, the currency dropdown fills in with every available
  currency (rebuilt from `state.rates` on every render).
- Enter an amount in ETB, pick a currency, hit **Convert**, and see
  the converted amount — with a specific error message if the amount
  is invalid (empty, zero, negative, non-numeric) or no currency is
  available.
- Hit **+ Watch** to add the currently selected currency to your
  watchlist (no duplicates). Each watched currency shows its live
  rate and a **Remove** button, rendered entirely from
  `state.watchlist` — including an empty-state message when it's empty.
- Removing items uses **event delegation**: one click listener on the
  `<ul>` handles every "Remove" button, including ones added after the
  page first loaded.
- The watchlist **and** the last-selected currency are saved to
  `localStorage` together and restored on page load — both survive a
  full reload.

## API used
[open.er-api.com](https://www.exchangerate-api.com/docs/free) — free, no API key required.
```
GET https://open.er-api.com/v6/latest/ETB
```
Returns current exchange rates for ~160 currencies, with 1 ETB as the base unit (i.e. `rates.USD` is how many US dollars 1 ETB is worth).

## How to run
Open `index.html` in a browser. No build step, no server, no API key.

## Architecture
```js
const state = {
  status: "loading" | "success" | "error",
  statusMessage: "...",
  rates: {},        // { USD: 0.0177, KES: 2.29, ... }
  currency: "USD",  // currently selected, persisted
  watchlist: [],    // currency codes, persisted
  convertError: "",
  result: "",
};

function render() { /* redraws status, dropdown, result, watchlist from state */ }
```
Every event handler (form submit, currency change, watch, remove)
follows the same pattern: update `state`, optionally persist to
`localStorage`, call `render()`. The `render()` function is the only
place that touches the DOM to display data.

## What's verified
I tested the core logic directly in Node before delivering, not just written and assumed correct:
- **`convertAmount()`** — tested against a valid conversion, empty amount, zero, negative, non-numeric input, no currency selected, and an unknown currency code. All returned the correct result or specific error.
- **Watchlist add/remove** — confirmed adding a currency twice doesn't create a duplicate, and removing works correctly.
- **Combined persistence** (`{ watchlist, currency }`) — simulated watching a currency, switching the selected currency, and a page reload (fresh read of the same storage): both values came back correctly. Also tested a missing key, corrupted JSON, and a wrong-shaped object (`watchlist` not an array, `currency` not a string) — all fail safe to empty defaults instead of crashing.
- **File wiring** — served the folder over a real local HTTP server and confirmed `index.html`, `styles.css`, and `app.js` all resolve with HTTP 200.
- **The rates endpoint** — this is a free, no-key public API (unlike `restcountries.com`, which now requires a paid key and blocks anonymous browser calls). My own sandbox blocks general internet domains by policy, so I couldn't call it live from here — run it in your own browser to confirm the live fetch.

## Self-check
- [ ] Does it load live rates, showing both a loading state and a clear error state (try DevTools → Network → Offline)?
- [ ] Does a valid amount convert correctly, and is bad input (empty/zero/negative/non-numeric) rejected with a clear message?
- [ ] Do add and remove on the watchlist both work, including the empty-state message when it's empty?
- [ ] Does the watchlist **and** the last-selected currency survive a full page reload?
- [ ] Is every screen update driven by editing `state` and calling `render()` — check the console for errors while clicking around?