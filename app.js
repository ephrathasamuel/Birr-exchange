// Birr Watch — state -> render -> events loop.
// All UI updates flow through render(state); event handlers only ever
// mutate `state` and then call render() - nothing reads its data back
// out of the DOM.

const RATES_URL = "https://open.er-api.com/v6/latest/ETB";
const STORAGE_KEY = "birr-watch";

// --- state -------------------------------------------------------------
const state = {
  status: "loading",      // "loading" | "success" | "error"
  statusMessage: "Loading rates...",
  rates: {},               // { USD: 0.0177, KES: 2.29, ... } - units per 1 ETB
  currency: "",            // currently selected / last used currency, persisted
  watchlist: [],           // array of currency codes, persisted
  convertError: "",
  result: "",
};

// --- DOM references (read once; never used as a data source) -----------
const statusEl = document.querySelector("#status");
const form = document.querySelector("#convert-form");
const amountInput = document.querySelector("#amount-input");
const currencySelect = document.querySelector("#currency-select");
const convertBtn = document.querySelector("#convert-btn");
const watchBtn = document.querySelector("#watch-btn");
const errorArea = document.querySelector("#convert-error");
const resultEl = document.querySelector("#result");
const watchlistEl = document.querySelector("#watchlist");

// --- pure helpers (no DOM - easy to test in isolation) ------------------

/**
 * Converts an ETB amount into another currency given a rates map.
 * Returns { ok: true, value } or { ok: false, error }.
 */
function convertAmount(amountStr, currencyCode, rates) {
  const amount = Number(amountStr);

  if (!amountStr || Number.isNaN(amount) || amount <= 0) {
    return { ok: false, error: "Enter a valid amount greater than 0." };
  }
  if (!currencyCode) {
    return { ok: false, error: "Choose a currency." };
  }
  const rate = rates[currencyCode];
  if (typeof rate !== "number") {
    return { ok: false, error: "Unknown currency." };
  }
  return { ok: true, value: amount * rate };
}

function addToWatchlist(watchlist, currencyCode) {
  if (!currencyCode) return watchlist;
  if (watchlist.includes(currencyCode)) return watchlist; // no duplicates
  return [...watchlist, currencyCode];
}

function removeFromWatchlist(watchlist, currencyCode) {
  return watchlist.filter((c) => c !== currencyCode);
}

/**
 * Reads { watchlist, currency } back from localStorage, guarding a
 * missing key and corrupted/invalid JSON. Never throws.
 */
function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { watchlist: [], currency: "" };

    const parsed = JSON.parse(raw);
    const watchlist = Array.isArray(parsed.watchlist) ? parsed.watchlist : [];
    const currency = typeof parsed.currency === "string" ? parsed.currency : "";

    return { watchlist, currency };
  } catch (err) {
    console.error("Could not read saved state:", err);
    return { watchlist: [], currency: "" };
  }
}

function savePersisted(watchlist, currency) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ watchlist, currency }));
}

// --- the one render function --------------------------------------------

/**
 * Renders the entire UI from `state`. Called after every state change -
 * nothing else touches the DOM directly.
 */
function render() {
  // Status line
  statusEl.textContent = state.statusMessage;
  statusEl.className = `status ${state.status}`;

  // Currency dropdown - rebuilt from state.rates every render
  const codes = Object.keys(state.rates).sort();
  currencySelect.innerHTML = "";

  if (codes.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent =
      state.status === "error" ? "Rates unavailable" : "Loading currencies...";
    currencySelect.appendChild(option);
  } else {
    codes.forEach((code) => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = code;
      currencySelect.appendChild(option);
    });
  }

  currencySelect.value = state.currency;
  currencySelect.disabled = codes.length === 0;
  convertBtn.disabled = codes.length === 0;
  watchBtn.disabled = codes.length === 0 || !state.currency;

  // Convert error / result
  errorArea.textContent = state.convertError;
  resultEl.textContent = state.result;

  // Watchlist
  watchlistEl.innerHTML = "";

  if (state.watchlist.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = 'No currencies watched yet. Convert one above, then hit "+ Watch".';
    watchlistEl.appendChild(li);
  } else {
    state.watchlist.forEach((code) => {
      const li = document.createElement("li");
      li.dataset.currency = code;

      const label = document.createElement("span");
      const rate = state.rates[code];
      label.className = "watch-rate";
      label.textContent =
        typeof rate === "number"
          ? `1 ETB = ${rate.toFixed(6)} ${code}`
          : `${code} (rate unavailable)`;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "watch-remove";
      removeBtn.textContent = "Remove";
      removeBtn.dataset.currency = code;

      li.appendChild(label);
      li.appendChild(removeBtn);
      watchlistEl.appendChild(li);
    });
  }
}

// --- fetching ------------------------------------------------------------

async function loadRates() {
  state.status = "loading";
  state.statusMessage = "Loading rates...";
  render();

  try {
    const res = await fetch(RATES_URL);

    if (!res.ok) {
      throw new Error(`Server responded with ${res.status}`);
    }

    const data = await res.json();

    if (!data.rates || typeof data.rates !== "object") {
      throw new Error("Unexpected response shape from rates API.");
    }

    state.rates = data.rates;

    // Pick a starting currency: whatever was persisted (if it still
    // exists in the fresh rates), else USD, else the first available.
    const codes = Object.keys(state.rates).sort();
    if (!state.currency || !(state.currency in state.rates)) {
      state.currency = codes.includes("USD") ? "USD" : codes[0] || "";
    }

    state.status = "success";
    state.statusMessage = `Rates loaded (base: ETB, ${codes.length} currencies).`;
  } catch (err) {
    state.status = "error";
    state.statusMessage = `Couldn't load rates: ${err.message}`;
  }

  render();
}

// --- events: mutate state, then render() ----------------------------------

form.addEventListener("submit", (e) => {
  e.preventDefault();

  if (state.status !== "success") {
    state.convertError = "Rates haven't loaded yet.";
    state.result = "";
    render();
    return;
  }

  const amount = amountInput.value.trim();
  const outcome = convertAmount(amount, state.currency, state.rates);

  if (!outcome.ok) {
    state.convertError = outcome.error;
    state.result = "";
  } else {
    state.convertError = "";
    state.result = `${amount} ETB = ${outcome.value.toFixed(4)} ${state.currency}`;
  }

  render();
});

currencySelect.addEventListener("change", () => {
  state.currency = currencySelect.value;
  savePersisted(state.watchlist, state.currency);
  render();
});

watchBtn.addEventListener("click", () => {
  state.watchlist = addToWatchlist(state.watchlist, state.currency);
  savePersisted(state.watchlist, state.currency);
  render();
});

// Event delegation: one listener on the list handles every "Remove"
// click, including ones added after this listener was set up.
watchlistEl.addEventListener("click", (e) => {
  if (!e.target.classList.contains("watch-remove")) return;

  const currency = e.target.dataset.currency;
  state.watchlist = removeFromWatchlist(state.watchlist, currency);
  savePersisted(state.watchlist, state.currency);
  render();
});

// --- startup ------------------------------------------------------------

const persisted = loadPersisted();
state.watchlist = persisted.watchlist;
state.currency = persisted.currency;

render();     // draw the loading state + restored watchlist immediately
loadRates();  // then fetch, updating state and re-rendering when it resolves