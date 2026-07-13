# Shared Supabase-Backed Shopping List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "קניות" (Shopping) page in `index.html` read/write a shared, realtime-synced shopping list stored in Supabase, instead of in-memory-only React state, without touching any other screen's UI or the app's visual design.

**Architecture:** The app is a single self-contained `index.html` using a custom template runtime (`support.js`, loads React/Babel from CDN, no build step). Supabase is added the same way React already is: a UMD script tag from a CDN, plus two new plain global-scope `<script>` files (`supabase-config.js` for the client, `shopping-api.js` for all data access). The existing `Component extends DCLogic` class calls into `window.ShoppingAPI` instead of mutating a local `shopping` array. Realtime is a single subscription, active only while the shopping screen is mounted.

**Tech Stack:** Vanilla JS (ES2019+, no bundler), React 18 + Babel standalone (already loaded by `support.js`), `@supabase/supabase-js` v2 (UMD build via CDN), Supabase Postgres + Realtime + RLS. No test framework exists in this repo; verification uses headless Playwright (Chromium) driving the real static file over `http.server`, with a hand-rolled fake Supabase client injected as `window.supabaseClient` so logic can be verified without a real project.

## Global Constraints

- Do not change any screen other than Shopping (home/family/menutype/meals/fridge/weekly/favorites stay byte-for-byte identical).
- Do not break the existing visual design (colors, fonts, RTL, spacing) — new UI must reuse existing CSS variables/patterns already in the file.
- Full Hebrew + RTL throughout, matching existing copy style.
- Site must keep working as a static site with zero build step (GitHub Pages / Render compatible).
- Never hardcode or commit a Supabase **service role** key. Client code only ever uses the **anon public** key.
- `supabase-config.js` must contain clear, unmissable placeholders for `SUPABASE_URL` and `SUPABASE_ANON_KEY` — the user does not have a Supabase project yet and will paste real values in later.
- Realtime: subscribe to `shopping_items` only, only while the shopping screen is active; unsubscribe on leaving. No other listeners anywhere else in the app.
- One single shared list today (no auth/households yet), but do not hardcode that assumption in a way that blocks adding it later: `shopping-api.js` centralizes a `CURRENT_HOUSEHOLD_ID` constant and the schema reserves a `household_id` column.
- Every place in the app that adds to the shopping list (manual form, recipe-detail "add to shopping list", weekly-plan "build shopping list") must go through the same `shopping-api.js` functions — no separate/local-only logic path.
- Duplicate rule (used everywhere items get added): if an active (`is_purchased = false`) row with the same `name` + `category` exists, update its `quantity`/`note` instead of inserting a new row, and surface "המוצר כבר קיים ברשימה – הכמות עודכנה." to the user where relevant.
- Deletion requires an inline, in-row confirm (no native `confirm()` popup, no separate modal) to preserve the existing visual design.
- **Commits:** the user must explicitly approve before any `git commit` or `git push`. Every task below ends with "stage changes" (`git add`), **not** a commit. A single commit happens only at the very end of the whole plan, after the user reviews and approves (see Task 8).

---

## File Structure

**New files:**
- `supabase-config.js` — creates `window.supabaseClient`; contains the two placeholders.
- `shopping-api.js` — all Supabase data access (`fetchShoppingItems`, `addShoppingItem`, `updateShoppingItem`, `togglePurchased`, `deleteShoppingItem`, `subscribeToShoppingChanges`), exposed as `window.ShoppingAPI`. No DOM code.
- `supabase-schema.sql` — table, index, RLS, policies, realtime publication. Pasted into Supabase's SQL Editor by the user, not executed by us (no project exists yet).

**Modified file:**
- `index.html` — new `<script>` includes in `<head>`; updated `SHOP_CATS`/`CAT_ICON`; updated initial `state`; rewritten shopping section of `renderVals()`; rewritten `toggleBought`/`removeShop`/`addManual`/`addDetailShop`/`buildShoppingFromWeekly`; lifecycle wiring in `go()` + new `componentWillUnmount`; rewritten shopping markup (categories, purchased section, loading/error states, inline delete confirm, note field).

---

### Task 1: Supabase client setup (`supabase-config.js` + CDN + wiring)

**Files:**
- Create: `c:/Users/97252/Desktop/MEAL/supabase-config.js`
- Modify: `c:/Users/97252/Desktop/MEAL/index.html:6` (add script tags after `support.js`)
- Test: manual script at `C:\Users\97252\AppData\Local\Temp\claude\c--Users-97252-Desktop-MEAL\08a48a55-c9f7-4dea-a01d-b55fdb72fd5e\scratchpad\pwcheck\task1_check.js`

**Interfaces:**
- Produces: global `window.supabase` (the SDK namespace, from the CDN script), global `window.supabaseClient` (the created client instance) — every later task's `shopping-api.js` depends on `window.supabaseClient` existing.

- [ ] **Step 1: Create `supabase-config.js`**

```js
// supabase-config.js
//
// Connect this site to your Supabase project:
//   1. Create a free project at https://supabase.com
//   2. Open the SQL Editor and run supabase-schema.sql (creates the
//      shopping_items table, indexes, RLS policies, and realtime publication)
//   3. Settings -> API -> copy the "Project URL" and the "anon public" key
//      (never the service_role key — that one must stay server-side only
//      and must never be committed to this repo)
//   4. Paste both values below, replacing the placeholder strings.

// >>> PASTE YOUR SUPABASE PROJECT URL HERE <<<
const SUPABASE_URL = 'PASTE_YOUR_SUPABASE_PROJECT_URL_HERE';

// >>> PASTE YOUR SUPABASE ANON PUBLIC KEY HERE <<<
const SUPABASE_ANON_KEY = 'PASTE_YOUR_SUPABASE_ANON_PUBLIC_KEY_HERE';

window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

- [ ] **Step 2: Wire the CDN script + config + api file into `index.html`**

Current `index.html:3-7`:
```html
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="./support.js"></script>
</head>
<body>
```

Replace with:
```html
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="./support.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
<script src="./supabase-config.js"></script>
<script src="./shopping-api.js"></script>
</head>
<body>
```

(`shopping-api.js` is created in Task 2 — this step already references it so both files land together; the include order matters: SDK, then config, then api, all before `<body>`/the component script further down the file.)

- [ ] **Step 3: Write the verification script**

```js
// task1_check.js — run with: node task1_check.js
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:8935/index.html', { waitUntil: 'networkidle' });
  const hasSupabaseSDK = await page.evaluate(() => typeof window.supabase !== 'undefined');
  const hasClient = await page.evaluate(() => typeof window.supabaseClient !== 'undefined');
  const clientIsObject = await page.evaluate(() => typeof window.supabaseClient === 'object' && window.supabaseClient !== null);
  console.log(JSON.stringify({ hasSupabaseSDK, hasClient, clientIsObject, errors }, null, 2));
  await browser.close();
})();
```

- [ ] **Step 4: Run it and verify expected output**

Run (with the static server already serving the folder on port 8935, e.g. `python -m http.server 8935`):
```bash
node task1_check.js
```
Actual/expected result while `supabase-config.js` still has placeholder strings: `{"hasSupabaseSDK": true, "hasClient": false, "clientIsObject": false, "hasShoppingAPI": true, "errors": ["Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL."]}`. `createClient` validates the URL format eagerly (this was verified empirically — it does *not* just skip validation), so it throws synchronously with placeholder text. That error is expected and harmless: it doesn't stop `shopping-api.js`'s script tag from loading (each `<script>` tag runs independently), and `shopping-api.js`'s own `client()` guard reports a friendlier "not initialized" error if anything tries to call it before real credentials are set. Once the user pastes a real URL/key, `hasClient`/`clientIsObject` become `true` and the error disappears — this is not tested here since no real project exists yet.

- [ ] **Step 5: Stage changes (no commit)**

```bash
git add supabase-config.js index.html
```

---

### Task 2: `shopping-api.js` data-access module

**Files:**
- Create: `c:/Users/97252/Desktop/MEAL/shopping-api.js`
- Test: `.../scratchpad/pwcheck/task2_check.js` (uses a fake Supabase client, no real project needed)

**Interfaces:**
- Consumes: `window.supabaseClient` (from Task 1).
- Produces: `window.ShoppingAPI = { fetchShoppingItems(), addShoppingItem({name,category,quantity,note}), updateShoppingItem(id, patch), togglePurchased(id, isPurchased), deleteShoppingItem(id), subscribeToShoppingChanges(onChange) }` — every later task in `index.html` calls these exact names.

- [ ] **Step 1: Create `shopping-api.js`**

```js
// shopping-api.js
// Data-access layer for the shared shopping list. Talks to Supabase only —
// no DOM/UI code here. Exposed as window.ShoppingAPI for the plain <script>
// component code in index.html to call.

(function () {
  const TABLE = 'shopping_items';

  // Reserved for future multi-household support (see supabase-schema.sql).
  // There is only one shared list today, so this stays null and no query
  // filters on it yet. When households ship: set this from the signed-in
  // user's household and add `.eq('household_id', CURRENT_HOUSEHOLD_ID)`
  // to the queries marked below — nothing else in this file needs to change.
  const CURRENT_HOUSEHOLD_ID = null;

  function client() {
    if (!window.supabaseClient) {
      throw new Error('supabaseClient is not initialized — check supabase-config.js');
    }
    return window.supabaseClient;
  }

  async function fetchShoppingItems() {
    const query = client().from(TABLE).select('*').order('created_at', { ascending: false });
    // Future: query.eq('household_id', CURRENT_HOUSEHOLD_ID)
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async function findActiveDuplicate(name, category) {
    const { data, error } = await client()
      .from(TABLE)
      .select('*')
      .eq('name', name)
      .eq('category', category)
      .eq('is_purchased', false)
      .limit(1);
    if (error) throw error;
    return data && data.length ? data[0] : null;
  }

  // Adds a new item, unless an active (not-yet-purchased) item with the
  // same name+category already exists — in that case it updates that
  // item's quantity/note instead of creating a duplicate row.
  // Returns { item, wasDuplicate }.
  async function addShoppingItem({ name, category, quantity, note }) {
    const cleanName = (name || '').trim();
    if (!cleanName) throw new Error('שם המוצר לא יכול להיות ריק');
    const existing = await findActiveDuplicate(cleanName, category);
    if (existing) {
      const item = await updateShoppingItem(existing.id, { quantity, note });
      return { item, wasDuplicate: true };
    }
    const { data, error } = await client()
      .from(TABLE)
      .insert({
        name: cleanName,
        category,
        quantity: quantity || null,
        note: note || null,
        household_id: CURRENT_HOUSEHOLD_ID,
      })
      .select()
      .single();
    if (error) throw error;
    return { item: data, wasDuplicate: false };
  }

  async function updateShoppingItem(id, patch) {
    const { data, error } = await client()
      .from(TABLE)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  function togglePurchased(id, isPurchased) {
    return updateShoppingItem(id, { is_purchased: isPurchased });
  }

  async function deleteShoppingItem(id) {
    const { error } = await client().from(TABLE).delete().eq('id', id);
    if (error) throw error;
  }

  // Subscribes to realtime changes on shopping_items only. Calls onChange()
  // whenever any row is inserted/updated/deleted; callers refetch the list
  // themselves (kept simple on purpose — no partial-patch merging here).
  // Returns an unsubscribe function — callers MUST call it when leaving the
  // shopping screen so no socket stays open on unrelated pages.
  function subscribeToShoppingChanges(onChange) {
    const channel = client()
      .channel('shopping_items_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, onChange)
      .subscribe();
    return () => client().removeChannel(channel);
  }

  window.ShoppingAPI = {
    fetchShoppingItems,
    addShoppingItem,
    updateShoppingItem,
    togglePurchased,
    deleteShoppingItem,
    subscribeToShoppingChanges,
  };
})();
```

- [ ] **Step 2: Write the fake Supabase client used by every test in this plan**

```js
// fake-supabase-client.js — injected into the page before shopping-api.js
// runs, so shopping-api.js's real code gets exercised against an in-memory
// table instead of a live project.
function makeFakeSupabaseClient(seedRows) {
  let rows = (seedRows || []).map(r => ({ ...r }));
  let idCounter = 1;
  const channels = [];

  function newId() { return 'fake-' + (idCounter++); }

  function applyFilters(list, filters) {
    return list.filter(row => filters.every(([col, val]) => row[col] === val));
  }

  function from(table) {
    const filters = [];
    let selectCols = '*';
    let orderCol = null, orderAsc = true;
    let limitN = null;
    let mode = 'select';
    let insertPayload = null;
    let updatePayload = null;

    const builder = {
      select(cols) { selectCols = cols || '*'; return builder; },
      eq(col, val) { filters.push([col, val]); return builder; },
      order(col, opts) { orderCol = col; orderAsc = !(opts && opts.ascending === false); return builder; },
      limit(n) { limitN = n; return builder; },
      insert(payload) { mode = 'insert'; insertPayload = payload; return builder; },
      update(payload) { mode = 'update'; updatePayload = payload; return builder; },
      delete() { mode = 'delete'; return builder; },
      single() {
        return builder.then(({ data, error }) => ({ data: data && data[0] ? data[0] : null, error }));
      },
      then(resolve) {
        let data = null, error = null;
        if (mode === 'select') {
          data = applyFilters(rows, filters);
          if (orderCol) data = data.slice().sort((a, b) => orderAsc ? (a[orderCol] > b[orderCol] ? 1 : -1) : (a[orderCol] < b[orderCol] ? 1 : -1));
          if (limitN != null) data = data.slice(0, limitN);
        } else if (mode === 'insert') {
          const now = new Date().toISOString();
          const row = { id: newId(), created_at: now, updated_at: now, ...insertPayload };
          rows.push(row);
          data = [row];
          notify('INSERT', row);
        } else if (mode === 'update') {
          const targets = applyFilters(rows, filters);
          targets.forEach(t => Object.assign(t, updatePayload));
          data = targets;
          targets.forEach(t => notify('UPDATE', t));
        } else if (mode === 'delete') {
          const targets = applyFilters(rows, filters);
          rows = rows.filter(r => !targets.includes(r));
          data = targets;
          targets.forEach(t => notify('DELETE', t));
        }
        return Promise.resolve(resolve({ data, error }));
      },
    };
    return builder;
  }

  function notify(eventType, row) {
    channels.forEach(ch => ch.callback({ eventType, new: row, old: row }));
  }

  function channel(name) {
    const ch = { name, callback: null };
    const api = {
      on(_type, _filter, cb) { ch.callback = cb; return api; },
      subscribe() { channels.push(ch); return ch; },
    };
    return api;
  }

  function removeChannel(ch) {
    const i = channels.indexOf(ch);
    if (i >= 0) channels.splice(i, 1);
  }

  return { from, channel, removeChannel, __rows: () => rows };
}
```

- [ ] **Step 3: Write `task2_check.js`**

```js
// task2_check.js — run with: node task2_check.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('about:blank');
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'fake-supabase-client.js'), 'utf8') });
  await page.evaluate(() => { window.supabaseClient = makeFakeSupabaseClient([]); });
  await page.addScriptTag({ path: 'c:/Users/97252/Desktop/MEAL/shopping-api.js' });

  const results = {};

  // 1. add a fresh item -> insert
  results.firstAdd = await page.evaluate(() =>
    window.ShoppingAPI.addShoppingItem({ name: 'יוגורט', category: 'מוצרי חלב וביצים', quantity: '2 יח\'', note: null })
  );

  // 2. add the same name+category again -> should UPDATE, not insert a second row
  results.duplicateAdd = await page.evaluate(() =>
    window.ShoppingAPI.addShoppingItem({ name: 'יוגורט', category: 'מוצרי חלב וביצים', quantity: '4 יח\'', note: 'דל שומן' })
  );

  results.allAfterDuplicate = await page.evaluate(() => window.ShoppingAPI.fetchShoppingItems());

  // 3. mark purchased, then fetch again
  const firstId = results.firstAdd.item.id;
  results.afterToggle = await page.evaluate((id) => window.ShoppingAPI.togglePurchased(id, true), firstId);

  // 4. add a purchased duplicate scenario: same name+category but the only
  // existing row is now purchased -> should insert a NEW row, not update the purchased one
  results.addAfterPurchase = await page.evaluate(() =>
    window.ShoppingAPI.addShoppingItem({ name: 'יוגורט', category: 'מוצרי חלב וביצים', quantity: '1 יח\'', note: null })
  );

  // 5. delete
  await page.evaluate((id) => window.ShoppingAPI.deleteShoppingItem(id), firstId);
  results.afterDelete = await page.evaluate(() => window.ShoppingAPI.fetchShoppingItems());

  // 6. empty name rejected
  results.emptyNameError = await page.evaluate(() =>
    window.ShoppingAPI.addShoppingItem({ name: '   ', category: 'שונות' }).then(() => null).catch(e => e.message)
  );

  // 7. realtime: subscribe, make a change, confirm callback fires, then unsubscribe
  results.realtime = await page.evaluate(() => new Promise((resolve) => {
    let fired = false;
    const unsub = window.ShoppingAPI.subscribeToShoppingChanges(() => { fired = true; });
    window.ShoppingAPI.addShoppingItem({ name: 'לחם', category: 'לחמים ומאפים' }).then(() => {
      unsub();
      resolve(fired);
    });
  }));

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
```

- [ ] **Step 4: Run it and verify expected output**

Run:
```bash
node task2_check.js
```
Expected (key assertions):
- `firstAdd.wasDuplicate === false`, `firstAdd.item.name === 'יוגורט'`
- `duplicateAdd.wasDuplicate === true`, `duplicateAdd.item.id === firstAdd.item.id`, `duplicateAdd.item.quantity === "4 יח'"`
- `allAfterDuplicate.length === 1` (no second row was created)
- `afterToggle.is_purchased === true`
- `addAfterPurchase.wasDuplicate === false` (the only existing "יוגורט" row is purchased, so a new active row is created)
- `afterDelete` no longer contains the deleted id
- `emptyNameError === 'שם המוצר לא יכול להיות ריק'`
- `realtime === true`

- [ ] **Step 5: Stage changes (no commit)**

```bash
git add shopping-api.js
```

---

### Task 3: Add the missing category + update initial state shape

**Files:**
- Modify: `c:/Users/97252/Desktop/MEAL/index.html:601-607` (initial state)
- Modify: `c:/Users/97252/Desktop/MEAL/index.html:707-708` (`SHOP_CATS`/`CAT_ICON`)
- Test: `.../scratchpad/pwcheck/task3_check.js`

**Interfaces:**
- Produces: `state.shoppingItems` (array), `state.shoppingLoading` (bool), `state.shoppingError` (string|null), `state.manualNote` (string), `state.manualMsg` (string), `state.confirmDeleteId` (string|null) — Task 5/6/7 read and write these. `state.shopping` no longer exists — grep confirms nothing references it after Task 7.

- [ ] **Step 1: Replace `SHOP_CATS`/`CAT_ICON`**

Current `index.html:707-708`:
```js
  SHOP_CATS = ['ירקות ופירות','מוצרי חלב וביצים','בשר, עוף ודגים','קטניות, דגנים ופסטה','מזווה ותבלינים','קפואים','לחמים ומאפים','מוצרים לתינוקות','שונות'];
  CAT_ICON = {'ירקות ופירות':'🥕','מוצרי חלב וביצים':'🥚','בשר, עוף ודגים':'🍗','קטניות, דגנים ופסטה':'🌾','מזווה ותבלינים':'🫙','קפואים':'❄️','לחמים ומאפים':'🥖','מוצרים לתינוקות':'🍼','שונות':'🛒'};
```

Replace with:
```js
  SHOP_CATS = ['ירקות ופירות','מוצרי חלב וביצים','בשר, עוף ודגים','לחמים ומאפים','קטניות, דגנים ופסטה','מזווה ותבלינים','קפואים','מוצרים לתינוקות','ניקיון ומשק בית','שונות'];
  CAT_ICON = {'ירקות ופירות':'🥕','מוצרי חלב וביצים':'🥚','בשר, עוף ודגים':'🍗','לחמים ומאפים':'🥖','קטניות, דגנים ופסטה':'🌾','מזווה ותבלינים':'🫙','קפואים':'❄️','מוצרים לתינוקות':'🍼','ניקיון ומשק בית':'🧹','שונות':'🛒'};
```

- [ ] **Step 2: Replace the initial `state` shopping-related fields**

Current `index.html:600-606`:
```js
    shopping: [], // {id, name, qty, cat, bought, manual}
    inFridgeList: [],
    favorites: [], history: [],
    manualItem: '', manualCat: 'שונות', manualQty: '',
    saved: false,
    aiOpen: false, aiInput: '', aiMessages: [],
  };
```

Replace with:
```js
    shoppingItems: [], // rows from Supabase's shopping_items table
    shoppingLoading: false, shoppingError: null,
    confirmDeleteId: null,
    inFridgeList: [],
    favorites: [], history: [],
    manualItem: '', manualCat: 'שונות', manualQty: '', manualNote: '', manualMsg: '',
    saved: false,
    aiOpen: false, aiInput: '', aiMessages: [],
  };
```

- [ ] **Step 3: Write `task3_check.js`**

```js
// task3_check.js — run with: node task3_check.js
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:8935/index.html', { waitUntil: 'networkidle' });
  await page.click('text=התחילו לתכנן');
  await page.click('nav >> text=קניות').catch(() => {});
  // category dropdown in the manual-add form should list all 10 categories in order
  const options = await page.locator('select >> nth=0').evaluate(async () => {
    // will be re-targeted precisely once markup lands in Task 6; for now just
    // confirm the categories exist somewhere in the page's rendered text
    return document.body.innerText;
  }).catch(() => '');
  console.log(JSON.stringify({ errors, hasCleaningCategory: options.includes('ניקיון ומשק בית') }, null, 2));
  await browser.close();
})();
```

- [ ] **Step 4: Run it and verify expected output**

Run:
```bash
node task3_check.js
```
Expected: `errors: []`. `hasCleaningCategory` may still be `false` at this point — the category only appears in the *rendered dropdown* once Task 6 rewrites the shopping markup to use `shopCatOptions` built from the new `SHOP_CATS`. This step exists to confirm Task 3 doesn't break page load; the real category-in-dropdown assertion is repeated (and must pass) in Task 6's check.

> **Deviation found during execution:** the plan assumed Task 3 alone wouldn't break page load, but `renderVals()` runs unconditionally on *every* render regardless of active screen, and it still referenced the now-removed `S.shopping` in the `shopCats` construction — this crashed the Home screen immediately. Fix: Task 6's `renderVals()` rewrite (the `shopItemVM`/`shopCats`/`purchasedItems` block and the shopping render-props block) was pulled forward and applied together with Task 3, before any verification ran. Task 6 below is effectively already done as a result — its own checklist is kept for the record and its test script still needs to run standalone to confirm the markup (Task 5) wires up correctly, but the render-prop code itself doesn't need to be reapplied.
>
> **Bonus fix (pre-existing bug, confirmed present in the original commit `871728c` before this feature branch):** `{{ family.people }}` is used in three places (shopping header, recipe detail modal x2) but the `family` render prop never actually included a `people` field — it silently rendered blank. Also found: a stray *second* `family:F` key later in the same `return {...}` object (in the family-setup section) was silently overriding any fix placed earlier in the object, since duplicate object-literal keys resolve to the last one. Fixed by changing that single existing `family:F` to `family:{...F, people}` — no other behavior changed.

- [ ] **Step 5: Stage changes (no commit)**

```bash
git add index.html
```

---

### Task 4: Screen-enter/exit lifecycle (subscribe/unsubscribe)

**Files:**
- Modify: `c:/Users/97252/Desktop/MEAL/index.html:741` (`go(s)` method)
- Test: `.../scratchpad/pwcheck/task4_check.js`

**Interfaces:**
- Consumes: `window.ShoppingAPI.fetchShoppingItems()`, `window.ShoppingAPI.subscribeToShoppingChanges(cb)` (Task 2).
- Produces: `this.enterShopping()`, `this.leaveShopping()`, `this._unsubShopping` (instance field) — no other task depends on these names, but Task 6/7 rely on `state.shoppingItems` being populated by `enterShopping()`.

- [ ] **Step 1: Replace `go(s)` and add the lifecycle methods**

Current `index.html:741`:
```js
  go(s){ this.setState({screen:s}); if(typeof window!=='undefined') window.scrollTo({top:0}); }
```

Replace with:
```js
  go(s){
    const leaving=this.state.screen;
    if(leaving==='shopping' && s!=='shopping') this.leaveShopping();
    this.setState({screen:s});
    if(s==='shopping' && leaving!=='shopping') this.enterShopping();
    if(typeof window!=='undefined') window.scrollTo({top:0});
  }
  refreshShoppingItems(){
    window.ShoppingAPI.fetchShoppingItems()
      .then(items=>this.setState({shoppingItems:items}))
      .catch(err=>console.error(err));
  }
  enterShopping(){
    this.setState({shoppingLoading:true, shoppingError:null});
    window.ShoppingAPI.fetchShoppingItems().then(items=>{
      this.setState({shoppingItems:items, shoppingLoading:false});
    }).catch(err=>{
      console.error(err);
      this.setState({shoppingLoading:false, shoppingError:'שגיאה בטעינת רשימת הקניות. נסו לרענן את הדף.'});
    });
    this._unsubShopping=window.ShoppingAPI.subscribeToShoppingChanges(()=>this.refreshShoppingItems());
  }
  leaveShopping(){
    if(this._unsubShopping){ this._unsubShopping(); this._unsubShopping=null; }
  }
  componentWillUnmount(){
    this.leaveShopping();
  }
```

(Note: `buildShoppingFromWeekly`, rewritten in Task 7, calls `this.go('shopping')` at the end — it will pick up this same lifecycle for free.)

- [ ] **Step 2: Write `task4_check.js`**

```js
// task4_check.js — run with: node task4_check.js
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Inject a fake client BEFORE index.html's scripts run, via addInitScript,
  // and count subscribe/unsubscribe calls.
  await page.addInitScript(fs.readFileSync('.../scratchpad/pwcheck/fake-supabase-client.js', 'utf8'));
  await page.addInitScript(() => {
    window.__subscribeCalls = 0;
    window.__unsubscribeCalls = 0;
    const realMake = window.makeFakeSupabaseClient;
    window.makeFakeSupabaseClient = (seed) => {
      const c = realMake(seed);
      const realChannel = c.channel.bind(c);
      c.channel = (name) => {
        const ch = realChannel(name);
        const realSub = ch.subscribe.bind(ch);
        ch.subscribe = (...a) => { window.__subscribeCalls++; return realSub(...a); };
        return ch;
      };
      const realRemove = c.removeChannel.bind(c);
      c.removeChannel = (ch) => { window.__unsubscribeCalls++; return realRemove(ch); };
      return c;
    };
    window.__origCreateClient = true;
  });
  await page.goto('http://localhost:8935/index.html', { waitUntil: 'networkidle' });
  // swap in the fake client (index.html's supabase-config.js already ran with
  // placeholder strings; replace supabaseClient before any shopping calls happen)
  await page.evaluate(() => { window.supabaseClient = window.makeFakeSupabaseClient([]); });

  await page.click('text=מה יש לי במקרר?').catch(() => {}); // go somewhere neutral first
  const subsAfterFridge = await page.evaluate(() => window.__subscribeCalls);

  await page.click('nav >> text=קניות');
  await page.waitForTimeout(300);
  const subsAfterShopping = await page.evaluate(() => window.__subscribeCalls);

  await page.click('nav >> text=דף בית');
  await page.waitForTimeout(300);
  const unsubsAfterLeaving = await page.evaluate(() => window.__unsubscribeCalls);

  console.log(JSON.stringify({ errors, subsAfterFridge, subsAfterShopping, unsubsAfterLeaving }, null, 2));
  await browser.close();
})();
```

- [ ] **Step 3: Run it and verify expected output**

Run:
```bash
node task4_check.js
```
Expected: `errors: []`, `subsAfterFridge: 0` (no subscription while on an unrelated screen), `subsAfterShopping: 1` (exactly one subscription on entering shopping), `unsubsAfterLeaving: 1` (unsubscribed on leaving). This directly proves "no unnecessary listeners."

- [ ] **Step 4: Stage changes (no commit)**

```bash
git add index.html
```

---

### Task 5: Rewrite the shopping section markup (categories, purchased area, loading/error, inline delete confirm, note field)

**Files:**
- Modify: `c:/Users/97252/Desktop/MEAL/index.html:351-422` (shopping `<section>`)
- Test: `.../scratchpad/pwcheck/task5_check.js`

**Interfaces:**
- Consumes: render props produced in Task 6 (`shopCats`, `shopCatOptions`, `shoppingLoading`, `shoppingError`, `shoppingReady`, `hasPurchased`, `purchasedCount`, `purchasedItems`, `manualItem`/`onManualItem`, `manualQty`/`onManualQty`, `manualCat`/`onManualCat`, `manualNote`/`onManualNote`, `manualMsg`, `hasInFridge`, `inFridgeItems`, `addManual`, `exportWhatsapp`). This task and Task 6 are easiest to verify together (Task 6's check script covers both).

- [ ] **Step 1: Replace the shopping section**

Current `index.html:351-422` (the whole `<!-- ============ SHOPPING ============ -->` block) is replaced with:

```html
  <!-- ============ SHOPPING ============ -->
  <sc-if value="{{ isShopping }}" hint-placeholder-val="{{ false }}">
  <section style="animation:rise .4s ease both;padding:34px 0">
    <div style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:14px;margin-bottom:20px">
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--gold);letter-spacing:.08em;margin-bottom:6px">רשימת קניות</div>
        <h2 style="font-size:30px;color:var(--olive-d)">מה צריך לקנות</h2>
        <p style="color:var(--muted);margin-top:6px;font-size:15px">הרשימה משותפת לכל בני המשפחה ומתעדכנת בזמן אמת. כמויות מחושבות ל-{{ family.people }} נפשות.</p>
      </div>
      <button onClick="{{ exportWhatsapp }}" style="padding:12px 18px;border-radius:13px;border:none;background:#25794F;color:#fff;font-size:14.5px;font-weight:700;cursor:pointer">שיתוף ל-WhatsApp</button>
    </div>

    <sc-if value="{{ shoppingLoading }}" hint-placeholder-val="{{ false }}">
      <div style="text-align:center;padding:50px 20px;color:var(--muted)">טוען את רשימת הקניות...</div>
    </sc-if>

    <sc-if value="{{ shoppingError }}" hint-placeholder-val="{{ false }}">
      <div style="background:#FBEAEA;border:1px solid #E7C6C6;color:#A34848;border-radius:14px;padding:14px 18px;margin-bottom:18px;font-size:14.5px">{{ shoppingError }}</div>
    </sc-if>

    <sc-if value="{{ shoppingReady }}" hint-placeholder-val="{{ true }}">
    <div style="display:grid;grid-template-columns:1.5fr .9fr;gap:22px">
      <div>
        <sc-for list="{{ shopCats }}" as="g" hint-placeholder-count="10">
          <div style="background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:16px 20px;margin-bottom:14px;box-shadow:var(--sh2)">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:{{ g.headGap }}">
              <div style="display:flex;align-items:center;gap:10px">
                <span style="font-size:20px">{{ g.icon }}</span>
                <span style="font-weight:700;font-size:15.5px;color:var(--brown)">{{ g.name }}</span>
              </div>
              <sc-if value="{{ g.hasItems }}" hint-placeholder-val="{{ false }}">
                <span style="background:var(--olive-soft);color:var(--olive-d);font-size:12px;font-weight:700;padding:3px 10px;border-radius:100px">{{ g.countLabel }}</span>
              </sc-if>
            </div>
            <sc-if value="{{ g.hasItems }}" hint-placeholder-val="{{ true }}">
              <div style="margin-top:12px">
                <sc-for list="{{ g.items }}" as="it" hint-placeholder-count="3">
                  <div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--paper2)">
                    <button onClick="{{ it.toggle }}" style="width:24px;height:24px;border-radius:7px;border:1.5px solid {{ it.boxBd }};background:{{ it.boxBg }};cursor:pointer;color:#fff;font-size:14px;line-height:1;flex-shrink:0">{{ it.mark }}</button>
                    <div style="flex:1;{{ it.strike }}">
                      <span style="font-weight:600;font-size:15px">{{ it.name }}</span>
                      <span style="color:var(--muted);font-size:13px;margin-right:8px">{{ it.qty }}</span>
                      <sc-if value="{{ it.hasNote }}" hint-placeholder-val="{{ false }}">
                        <div style="color:var(--muted);font-size:12.5px;margin-top:2px">{{ it.note }}</div>
                      </sc-if>
                    </div>
                    <sc-if value="{{ it.confirming }}" hint-placeholder-val="{{ false }}">
                      <div style="display:flex;gap:6px;flex-shrink:0">
                        <button onClick="{{ it.confirmRemove }}" style="padding:6px 10px;border-radius:8px;border:none;background:#B25A4E;color:#fff;font-size:12.5px;font-weight:700;cursor:pointer">מחק</button>
                        <button onClick="{{ it.cancelRemove }}" style="padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:var(--paper2);color:var(--muted);font-size:12.5px;cursor:pointer">ביטול</button>
                      </div>
                    </sc-if>
                    <sc-if value="{{ it.notConfirming }}" hint-placeholder-val="{{ true }}">
                      <button onClick="{{ it.askRemove }}" style="width:26px;height:26px;border-radius:7px;border:none;background:var(--paper2);color:#B25A4E;font-size:15px;cursor:pointer;flex-shrink:0">×</button>
                    </sc-if>
                  </div>
                </sc-for>
              </div>
            </sc-if>
            <sc-if value="{{ g.noItems }}" hint-placeholder-val="{{ false }}">
              <div style="font-size:13px;color:#B6AF9C;padding-top:4px">אין פריטים עדיין</div>
            </sc-if>
          </div>
        </sc-for>

        <sc-if value="{{ hasPurchased }}" hint-placeholder-val="{{ false }}">
          <div style="background:var(--paper2);border:1px dashed var(--line);border-radius:18px;padding:16px 20px;margin-top:8px">
            <div style="font-weight:700;font-size:15px;color:var(--muted);margin-bottom:10px">נקנו ({{ purchasedCount }})</div>
            <sc-for list="{{ purchasedItems }}" as="it" hint-placeholder-count="3">
              <div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--paper)">
                <button onClick="{{ it.toggle }}" style="width:24px;height:24px;border-radius:7px;border:1.5px solid {{ it.boxBd }};background:{{ it.boxBg }};cursor:pointer;color:#fff;font-size:14px;line-height:1;flex-shrink:0">{{ it.mark }}</button>
                <div style="flex:1;{{ it.strike }}">
                  <span style="font-weight:600;font-size:15px">{{ it.name }}</span>
                  <span style="color:var(--muted);font-size:13px;margin-right:8px">{{ it.qty }}</span>
                </div>
                <sc-if value="{{ it.confirming }}" hint-placeholder-val="{{ false }}">
                  <div style="display:flex;gap:6px;flex-shrink:0">
                    <button onClick="{{ it.confirmRemove }}" style="padding:6px 10px;border-radius:8px;border:none;background:#B25A4E;color:#fff;font-size:12.5px;font-weight:700;cursor:pointer">מחק</button>
                    <button onClick="{{ it.cancelRemove }}" style="padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:var(--paper);color:var(--muted);font-size:12.5px;cursor:pointer">ביטול</button>
                  </div>
                </sc-if>
                <sc-if value="{{ it.notConfirming }}" hint-placeholder-val="{{ true }}">
                  <button onClick="{{ it.askRemove }}" style="width:26px;height:26px;border-radius:7px;border:none;background:var(--paper);color:#B25A4E;font-size:15px;cursor:pointer;flex-shrink:0">×</button>
                </sc-if>
              </div>
            </sc-for>
          </div>
        </sc-if>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">
        <div style="background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:18px;box-shadow:var(--sh2)">
          <div style="font-weight:700;font-size:15px;color:var(--olive-d);margin-bottom:12px">הוספת מוצר ידנית</div>
          <input value="{{ manualItem }}" onInput="{{ onManualItem }}" onKeyDown="{{ onManualKey }}" placeholder="שם המוצר..." style="width:100%;padding:12px 14px;border-radius:12px;border:1.5px solid var(--line);background:var(--paper2);font-size:14.5px;outline:none;margin-bottom:10px">
          <div style="display:flex;gap:10px;margin-bottom:10px">
            <select value="{{ manualCat }}" onChange="{{ onManualCat }}" style="flex:1.4;padding:12px;border-radius:12px;border:1.5px solid var(--line);background:var(--paper2);font-size:14px;color:var(--ink)">
              <sc-for list="{{ shopCatOptions }}" as="o" hint-placeholder-count="10"><option value="{{ o.k }}">{{ o.label }}</option></sc-for>
            </select>
            <input value="{{ manualQty }}" onInput="{{ onManualQty }}" onKeyDown="{{ onManualKey }}" placeholder="כמות" style="flex:1;min-width:0;padding:12px;border-radius:12px;border:1.5px solid var(--line);background:var(--paper2);font-size:14px;outline:none">
          </div>
          <input value="{{ manualNote }}" onInput="{{ onManualNote }}" onKeyDown="{{ onManualKey }}" placeholder="הערה (אופציונלי)..." style="width:100%;padding:12px 14px;border-radius:12px;border:1.5px solid var(--line);background:var(--paper2);font-size:14px;outline:none;margin-bottom:10px">
          <button onClick="{{ addManual }}" style="width:100%;padding:12px;border-radius:12px;border:none;background:var(--olive);color:#fff;font-size:15px;font-weight:700;cursor:pointer">הוסף לרשימה</button>
          <sc-if value="{{ manualMsg }}" hint-placeholder-val="{{ false }}">
            <div style="margin-top:10px;font-size:13px;color:var(--olive-d);text-align:center">{{ manualMsg }}</div>
          </sc-if>
        </div>
        <sc-if value="{{ hasInFridge }}" hint-placeholder-val="{{ false }}">
          <div style="background:var(--paper2);border:1px solid var(--line);border-radius:18px;padding:18px">
            <div style="font-weight:700;font-size:14px;color:var(--muted);margin-bottom:10px">כבר יש בבית ✓</div>
            <div style="display:flex;gap:7px;flex-wrap:wrap">
              <sc-for list="{{ inFridgeItems }}" as="f" hint-placeholder-count="3">
                <span style="background:var(--paper);border:1px solid var(--line);color:var(--muted);padding:5px 11px;border-radius:8px;font-size:13px;text-decoration:line-through">{{ f }}</span>
              </sc-for>
            </div>
          </div>
        </sc-if>
      </div>
    </div>
    </sc-if>
  </section>
  </sc-if>
```

- [ ] **Step 2: Stage changes (no commit)**

```bash
git add index.html
```

(Verification for this task happens together with Task 6, since the markup above needs the render props from Task 6 to produce real values — see Task 6's check script.)

---

### Task 6: Wire render props (`renderVals`) for the new shopping markup

**Files:**
- Modify: `c:/Users/97252/Desktop/MEAL/index.html:962-974` (shopping view-model construction)
- Modify: `c:/Users/97252/Desktop/MEAL/index.html:1046-1053` (shopping render props)
- Test: `.../scratchpad/pwcheck/task6_check.js`

**Interfaces:**
- Consumes: `state.shoppingItems`, `state.shoppingLoading`, `state.shoppingError`, `state.confirmDeleteId`, `state.manualNote`, `state.manualMsg` (Task 3/4), `this.toggleBought`/`this.removeShop`/`this.askRemove` (rewritten in Task 7 — this task references them by name so Task 7 must define exactly these names).
- Produces: all render props consumed by Task 5's markup.

- [ ] **Step 1: Replace the shopping view-model block**

Current `index.html:962-974`:
```js
    // shopping — fixed supermarket departments
    const shopCats=this.SHOP_CATS.map(cat=>{
      const items=S.shopping.filter(it=>it.cat===cat).map(it=>({
        name:it.name, qty:this.qtyString(it), mark:it.bought?'✓':'',
        boxBd:it.bought?'var(--olive)':'var(--line)', boxBg:it.bought?'var(--olive)':'transparent',
        strike:it.bought?'text-decoration:line-through;opacity:.5':'',
        toggle:()=>this.toggleBought(it.id), remove:()=>this.removeShop(it.id),
      }));
      return {name:cat, icon:this.CAT_ICON[cat]||'🛒', count:items.length,
        countLabel:items.length===1?'מוצר אחד':items.length+' מוצרים',
        headGap:items.length>0?'2px':'0', hasItems:items.length>0, noItems:items.length===0, items};
    });
    const shopCatOptions=this.SHOP_CATS.map(c=>({k:c, label:c}));
```

Replace with:
```js
    // shopping — fixed supermarket departments, backed by Supabase (state.shoppingItems)
    const shopItemVM=(it)=>({
      id:it.id, name:it.name, qty:it.quantity||'', note:it.note||'', hasNote:!!it.note,
      confirming:S.confirmDeleteId===it.id, notConfirming:S.confirmDeleteId!==it.id,
      mark:it.is_purchased?'✓':'',
      boxBd:it.is_purchased?'var(--olive)':'var(--line)', boxBg:it.is_purchased?'var(--olive)':'transparent',
      strike:it.is_purchased?'text-decoration:line-through;opacity:.5':'',
      toggle:()=>this.toggleBought(it.id, !it.is_purchased),
      askRemove:()=>this.setState({confirmDeleteId:it.id}),
      cancelRemove:()=>this.setState({confirmDeleteId:null}),
      confirmRemove:()=>this.removeShop(it.id),
    });
    const activeShoppingItems=S.shoppingItems.filter(it=>!it.is_purchased);
    const purchasedShoppingItems=S.shoppingItems.filter(it=>it.is_purchased);
    const shopCats=this.SHOP_CATS.map(cat=>{
      const items=activeShoppingItems.filter(it=>it.category===cat).map(shopItemVM);
      return {name:cat, icon:this.CAT_ICON[cat]||'🛒', count:items.length,
        countLabel:items.length===1?'מוצר אחד':items.length+' מוצרים',
        headGap:items.length>0?'2px':'0', hasItems:items.length>0, noItems:items.length===0, items};
    });
    const shopCatOptions=this.SHOP_CATS.map(c=>({k:c, label:c}));
    const purchasedItems=purchasedShoppingItems.map(shopItemVM);
```

- [ ] **Step 2: Replace the shopping render props**

Current `index.html:1046-1053`:
```js
      shopCats, shopCatOptions, totalShop:S.shopping.length,
      hasShopping:S.shopping.length>0, noShopping:S.shopping.length===0,
      manualItem:S.manualItem, onManualItem:(e)=>this.setState({manualItem:e.target.value}),
      manualQty:S.manualQty, onManualQty:(e)=>this.setState({manualQty:e.target.value}),
      manualCat:S.manualCat, onManualCat:(e)=>this.setState({manualCat:e.target.value}),
```

Replace with:
```js
      shopCats, shopCatOptions,
      shoppingLoading:S.shoppingLoading, shoppingError:S.shoppingError,
      shoppingReady:!S.shoppingLoading && !S.shoppingError,
      hasPurchased:purchasedItems.length>0, purchasedCount:purchasedItems.length, purchasedItems,
      manualItem:S.manualItem, onManualItem:(e)=>this.setState({manualItem:e.target.value, manualMsg:''}),
      manualQty:S.manualQty, onManualQty:(e)=>this.setState({manualQty:e.target.value}),
      manualCat:S.manualCat, onManualCat:(e)=>this.setState({manualCat:e.target.value}),
      manualNote:S.manualNote, onManualNote:(e)=>this.setState({manualNote:e.target.value}),
      manualMsg:S.manualMsg,
```

(`totalShop`/`hasShopping`/`noShopping` are confirmed unused anywhere in the template — see grep evidence in the design phase — so dropping them is safe.)

- [ ] **Step 3: Write `task6_check.js`**

```js
// task6_check.js — run with: node task6_check.js
// Injects the fake Supabase client, seeds it with a few rows, then drives
// the real Shopping page UI end to end.
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.addInitScript(fs.readFileSync('.../scratchpad/pwcheck/fake-supabase-client.js', 'utf8'));
  await page.goto('http://localhost:8935/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    window.supabaseClient = window.makeFakeSupabaseClient([
      { id: 'seed-1', name: 'עגבניות', category: 'ירקות ופירות', quantity: '1 ק"ג', note: null, is_purchased: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { id: 'seed-2', name: 'חלב', category: 'מוצרי חלב וביצים', quantity: '2 יח\'', note: 'מסוכר', is_purchased: false, created_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' },
      { id: 'seed-3', name: 'סבון כלים', category: 'ניקיון ומשק בית', quantity: null, note: null, is_purchased: true, created_at: '2026-01-03T00:00:00Z', updated_at: '2026-01-03T00:00:00Z' },
    ]);
  });

  await page.click('nav >> text=קניות');
  await page.waitForSelector('text=מה צריך לקנות');
  await page.waitForTimeout(300);

  const bodyText = await page.evaluate(() => document.body.innerText);
  const results = {
    categoryDropdownHasCleaning: bodyText.includes('ניקיון ומשק בית'),
    showsTomato: bodyText.includes('עגבניות'),
    showsMilkNote: bodyText.includes('מסוכר'),
    purchasedSectionShowsSoap: bodyText.includes('נקנו') && bodyText.includes('סבון כלים'),
    noUnresolvedBindings: (bodyText.match(/\{\{[^}]*\}\}/g) || []).length === 0,
  };

  // toggle "חלב" purchased, confirm it moves to the נקנו section
  await page.locator('text=חלב').locator('..').locator('..').locator('button').first().click();
  await page.waitForTimeout(300);
  const afterToggleText = await page.evaluate(() => document.body.innerText);
  results.milkMovedToPurchased = afterToggleText.indexOf('נקנו') < afterToggleText.indexOf('חלב');

  // delete flow: click the × on עגבניות, expect inline confirm, then confirm
  const tomatoRow = page.locator('text=עגבניות').locator('..').locator('..');
  await tomatoRow.locator('button:has-text("×")').click();
  await page.waitForTimeout(150);
  const showsInlineConfirm = await page.locator('text=מחק').first().isVisible();
  await page.locator('text=מחק').first().click();
  await page.waitForTimeout(300);
  const afterDeleteText = await page.evaluate(() => document.body.innerText);
  results.deleteConfirmShown = showsInlineConfirm;
  results.tomatoGoneAfterDelete = !afterDeleteText.includes('עגבניות');

  console.log(JSON.stringify({ errors, results }, null, 2));
  await browser.close();
})();
```

- [ ] **Step 4: Run it and verify expected output**

Run:
```bash
node task6_check.js
```
Expected: `errors: []` and every field in `results` is `true`. (Delete/toggle button wiring is finished in Task 7 — if this check fails only on the toggle/delete assertions before Task 7 lands, that's expected; re-run after Task 7.)

- [ ] **Step 5: Stage changes (no commit)**

```bash
git add index.html
```

---

### Task 7: Rewrite `toggleBought`/`removeShop`/`addManual`, plus `addDetailShop`/`buildShoppingFromWeekly`

**Files:**
- Modify: `c:/Users/97252/Desktop/MEAL/index.html:1092-1099` (`toggleBought`, `removeShop`, `addManual`)
- Modify: `c:/Users/97252/Desktop/MEAL/index.html:1101-1106` (`addDetailShop`)
- Modify: `c:/Users/97252/Desktop/MEAL/index.html:811-822` (`buildShoppingFromWeekly`)
- Modify: `c:/Users/97252/Desktop/MEAL/index.html:1108-1117` (`exportWa`)
- Test: `.../scratchpad/pwcheck/task7_check.js`

**Interfaces:**
- Consumes: `window.ShoppingAPI.*` (Task 2), `this.refreshShoppingItems()` (Task 4), `this.collectInto`/`this.qtyString` (unchanged existing helpers).
- Produces: final behavior — no other task depends on anything new here. After this task, `grep -n "state.shopping\b" index.html` must return zero matches (confirmed in Task 8).

- [ ] **Step 1: Replace `toggleBought`/`removeShop`/`addManual`**

Current `index.html:1092-1099`:
```js
  toggleBought(id){
    this.setState({shopping:this.state.shopping.map(x=>x.id===id?{...x,bought:!x.bought}:x)});
  }
  removeShop(id){ this.setState({shopping:this.state.shopping.filter(x=>x.id!==id)}); }
  addManual(){
    const v=this.state.manualItem.trim(); if(!v) return;
    const item={id:'m-'+Date.now(), name:v, qtyText:this.state.manualQty.trim(), cat:this.state.manualCat||'שונות', bought:false, manual:true};
    this.setState({shopping:[...this.state.shopping, item], manualItem:'', manualQty:''});
  }
```

Replace with:
```js
  toggleBought(id, isPurchased){
    window.ShoppingAPI.togglePurchased(id, isPurchased)
      .then(()=>this.refreshShoppingItems())
      .catch(err=>{ console.error(err); this.setState({shoppingError:'שגיאה בעדכון המוצר.'}); });
  }
  removeShop(id){
    window.ShoppingAPI.deleteShoppingItem(id)
      .then(()=>{ this.setState({confirmDeleteId:null}); this.refreshShoppingItems(); })
      .catch(err=>{ console.error(err); this.setState({shoppingError:'שגיאה במחיקת המוצר.'}); });
  }
  addManual(){
    const name=this.state.manualItem.trim();
    if(!name){ this.setState({manualMsg:'צריך להזין שם מוצר'}); return; }
    const category=this.state.manualCat||'שונות';
    const quantity=this.state.manualQty.trim()||null;
    const note=this.state.manualNote.trim()||null;
    window.ShoppingAPI.addShoppingItem({name, category, quantity, note}).then(({wasDuplicate})=>{
      this.setState({
        manualItem:'', manualQty:'', manualNote:'',
        manualMsg: wasDuplicate ? 'המוצר כבר קיים ברשימה – הכמות עודכנה.' : 'המוצר נוסף לרשימה.',
      });
      this.refreshShoppingItems();
    }).catch(err=>{
      console.error(err);
      this.setState({manualMsg:'שגיאה בהוספת המוצר. נסו שוב.'});
    });
  }
```

- [ ] **Step 2: Replace `addDetailShop`**

Current `index.html:1101-1106`:
```js
  addDetailShop(r){
    if(!r) return;
    const list=this.state.shopping.map(x=>({...x, units:{...(x.units||{})}}));
    const inFridge=this.state.inFridgeList.slice();
    this.collectInto(list, inFridge, r);
    this.setState({shopping:list, inFridgeList:inFridge, detailToast:'נוסף לרשימת הקניות ✓'});
  }
```

Replace with:
```js
  addDetailShop(r){
    if(!r) return;
    const list=[]; const inFridge=this.state.inFridgeList.slice();
    this.collectInto(list, inFridge, r);
    Promise.all(list.map(item=>window.ShoppingAPI.addShoppingItem({
      name:item.name, category:item.cat, quantity:this.qtyString(item), note:null,
    }))).then(()=>{
      this.setState({inFridgeList:inFridge, detailToast:'נוסף לרשימת הקניות ✓'});
      if(this.state.screen==='shopping') this.refreshShoppingItems();
    }).catch(err=>{
      console.error(err);
      this.setState({detailToast:'שגיאה בהוספה לרשימת הקניות'});
    });
  }
```

- [ ] **Step 3: Replace `buildShoppingFromWeekly`**

Current `index.html:811-822`:
```js
  buildShoppingFromWeekly(){
    const ids=new Set();
    Object.values(this.state.weekly).forEach(arr=>arr.forEach(id=>ids.add(id)));
    const list=[]; const inFridge=[];
    ids.forEach(id=>{ const r=this.recipe(id); if(r) this.collectInto(list, inFridge, r); });
    // preserve "bought" state for items that were already on the list
    const prev=this.state.shopping;
    list.forEach(it=>{ const p=prev.find(x=>x.name===it.name && !x.manual); if(p) it.bought=p.bought; });
    const manual=prev.filter(x=>x.manual);
    this.setState({shopping:[...list, ...manual], inFridgeList:inFridge, screen:'shopping'});
    if(typeof window!=='undefined') window.scrollTo({top:0});
  }
```

Replace with:
```js
  buildShoppingFromWeekly(){
    const ids=new Set();
    Object.values(this.state.weekly).forEach(arr=>arr.forEach(id=>ids.add(id)));
    const list=[]; const inFridge=[];
    ids.forEach(id=>{ const r=this.recipe(id); if(r) this.collectInto(list, inFridge, r); });
    Promise.all(list.map(item=>window.ShoppingAPI.addShoppingItem({
      name:item.name, category:item.cat, quantity:this.qtyString(item), note:null,
    }))).then(()=>{
      this.setState({inFridgeList:inFridge});
    }).catch(err=>{
      console.error(err);
      this.setState({shoppingError:'שגיאה בבניית רשימת הקניות מהתפריט השבועי'});
    }).finally(()=>{
      this.go('shopping');
    });
  }
```

(Behavior change from before, called out in the approved plan: this now *adds/updates* this week's ingredients into the shared list rather than replacing the whole list, since a destructive replace would be unsafe once the list is shared across devices.)

- [ ] **Step 4: Replace `exportWa`**

Current `index.html:1108-1117`:
```js
  exportWa(){
    let txt='🛒 רשימת קניות — מתכנן ארוחות משפחתי\n\n';
    this.SHOP_CATS.forEach(c=>{
      const items=this.state.shopping.filter(x=>x.cat===c);
      if(items.length){ txt+=`*${c}*\n`; items.forEach(i=>{ const q=this.qtyString(i); txt+=`▫️ ${i.name}${q?' — '+q:''}\n`; }); txt+='\n'; }
    });
    if(this.state.inFridgeList.length){ txt+=`*כבר יש בבית*\n`; this.state.inFridgeList.forEach(n=>txt+=`✓ ${n}\n`); }
    const url='https://wa.me/?text='+encodeURIComponent(txt);
    if(typeof window!=='undefined') window.open(url,'_blank');
  }
```

Replace with:
```js
  exportWa(){
    let txt='🛒 רשימת קניות — מתכנן ארוחות משפחתי\n\n';
    this.SHOP_CATS.forEach(c=>{
      const items=this.state.shoppingItems.filter(x=>x.category===c && !x.is_purchased);
      if(items.length){ txt+=`*${c}*\n`; items.forEach(i=>{ txt+=`▫️ ${i.name}${i.quantity?' — '+i.quantity:''}\n`; }); txt+='\n'; }
    });
    if(this.state.inFridgeList.length){ txt+=`*כבר יש בבית*\n`; this.state.inFridgeList.forEach(n=>txt+=`✓ ${n}\n`); }
    const url='https://wa.me/?text='+encodeURIComponent(txt);
    if(typeof window!=='undefined') window.open(url,'_blank');
  }
```

(Small deliberate improvement, in scope since it's the shopping page's own export feature: only active/not-yet-purchased items are shared, matching what the button visibly says it does.)

- [ ] **Step 5: Write `task7_check.js`**

```js
// task7_check.js — run with: node task7_check.js
// End-to-end: recipe-detail add, weekly-plan build, and manual add/duplicate/
// toggle/delete ALL going through the same fake Supabase table.
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.addInitScript(fs.readFileSync('.../scratchpad/pwcheck/fake-supabase-client.js', 'utf8'));
  await page.goto('http://localhost:8935/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => { window.supabaseClient = window.makeFakeSupabaseClient([]); });

  // 1. add an item from a recipe's detail modal
  await page.click('text=התחילו לתכנן');
  await page.click('text=המשך להעדפות');
  await page.click('text=לרעיונות למתכונים');
  await page.waitForSelector('text=מה מבשלים היום');
  await page.locator('text=קרא עוד').first().click();
  await page.waitForSelector('text=אופן ההכנה');
  await page.click('text=הוסף לרשימת קניות');
  await page.waitForTimeout(300);
  const afterRecipeAdd = await page.evaluate(() => window.ShoppingAPI.fetchShoppingItems());

  // 2. now check the Shopping page shows those same items (same data source)
  await page.locator('button:has-text("×")').first().click(); // close modal
  await page.click('nav >> text=קניות');
  await page.waitForSelector('text=מה צריך לקנות');
  await page.waitForTimeout(300);
  const shoppingPageText = await page.evaluate(() => document.body.innerText);
  const recipeIngredientsVisibleOnShoppingPage = afterRecipeAdd.every(row => shoppingPageText.includes(row.name));

  // 3. manual add of a duplicate of one of those same ingredients+category
  const first = afterRecipeAdd[0];
  await page.fill('input[placeholder="שם המוצר..."]', first.name);
  await page.selectOption('select >> nth=0', { label: first.category });
  await page.fill('input[placeholder="כמות"]', '999');
  await page.click('text=הוסף לרשימה');
  await page.waitForTimeout(300);
  const afterManualDuplicate = await page.evaluate(() => window.ShoppingAPI.fetchShoppingItems());
  const noDuplicateRowCreated = afterManualDuplicate.filter(r => r.name === first.name && r.category === first.category).length === 1;
  const bodyAfterDuplicate = await page.evaluate(() => document.body.innerText);
  const showsDuplicateMessage = bodyAfterDuplicate.includes('המוצר כבר קיים ברשימה');

  console.log(JSON.stringify({
    errors,
    recipeIngredientsVisibleOnShoppingPage,
    noDuplicateRowCreated,
    showsDuplicateMessage,
  }, null, 2));
  await browser.close();
})();
```

- [ ] **Step 6: Run it and verify expected output**

Run:
```bash
node task7_check.js
```
Expected: `errors: []`, `recipeIngredientsVisibleOnShoppingPage: true`, `noDuplicateRowCreated: true`, `showsDuplicateMessage: true`.

- [ ] **Step 7: Confirm no references to the old local array remain**

Run:
```bash
grep -n "state\.shopping\b\|\.shopping:\|S\.shopping\b" index.html
```
Expected: no output (zero matches). If anything remains, fix it before moving on.

- [ ] **Step 8: Stage changes (no commit)**

```bash
git add index.html
```

---

### Task 8: Full regression pass + SQL review + final report

**Files:**
- No new file changes — this task only verifies Tasks 1–7 together and prepares the summary for the user.
- Review: `c:/Users/97252/Desktop/MEAL/supabase-schema.sql` (already written; not created by a task above because it's pasted into Supabase, not loaded by the site — see note below)
- Test: `.../scratchpad/pwcheck/task8_full_regression.js`

- [ ] **Step 1: Create `supabase-schema.sql`** (if not already created — this is the file from the approved design, reproduced here so this task is self-contained)

```sql
-- ============================================================
-- shopping_items — רשימת קניות משפחתית משותפת (FamilyMealPlanner)
-- ============================================================

create table if not exists public.shopping_items (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category      text not null,
  quantity      text,
  note          text,
  is_purchased  boolean not null default false,
  -- שמור לעתיד: כשתתווסף תמיכה במשפחות (households) מרובות, כל שורה
  -- תשויך למשפחה. כרגע נשאר ריק כי יש רשימה משותפת אחת בלבד.
  household_id  uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists shopping_items_created_at_idx
  on public.shopping_items (created_at desc);

alter table public.shopping_items enable row level security;

-- ------------------------------------------------------------
-- ⚠️  אזהרה: ה-policies הבאות פתוחות לכל אחד (ללא התחברות משתמשים),
-- מתאימות אך ורק לגרסת דמו/רשימה משפחתית פשוטה אחת.
-- אסור להשתמש בתבנית הזו במערכת אמיתית עם מידע רגיש או משתמשים מרובים.
--
-- כשתתווסף מערכת household/auth, הן יוחלפו במשהו בסגנון:
--   using (household_id = (select household_id from household_members
--                           where user_id = auth.uid()))
-- ------------------------------------------------------------

create policy "public can read shopping items"
  on public.shopping_items for select
  using (true);

create policy "public can insert shopping items"
  on public.shopping_items for insert
  with check (true);

create policy "public can update shopping items"
  on public.shopping_items for update
  using (true) with check (true);

create policy "public can delete shopping items"
  on public.shopping_items for delete
  using (true);

-- מפעיל Realtime על הטבלה הזו בלבד
alter publication supabase_realtime add table public.shopping_items;
```

- [ ] **Step 2: Write the full-app regression script**

Reuse the exact same comprehensive click-through approach already proven earlier in this project (every nav tab, every button, a recipe detail open/close, fridge search/toggle/suggest, weekly swap/build/save, shopping toggle/delete/manual-add, WhatsApp export, AI assistant, then a hard reload with cache disabled) — with the fake Supabase client injected via `addInitScript`, and the fridge/family/meals/weekly/favorites screens asserted to render **identically** to the pre-Supabase baseline (no visual/behavioral change outside Shopping).

```js
// task8_full_regression.js — run with: node task8_full_regression.js
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await context.newPage();
  const log = { steps: [], consoleErrors: [], pageErrors: [] };
  page.on('console', (m) => { if (m.type() === 'error') log.consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => log.pageErrors.push(e.message));

  await page.addInitScript(fs.readFileSync('.../scratchpad/pwcheck/fake-supabase-client.js', 'utf8'));
  await page.addInitScript(() => { window.__fakeSeed = []; });

  async function step(label, fn) {
    try {
      await fn();
      await page.waitForTimeout(300);
      const text = await page.evaluate(() => document.body.innerText);
      const unresolved = (text.match(/\{\{[^}]*\}\}/g) || []);
      log.steps.push({ label, ok: true, unresolved });
    } catch (e) {
      log.steps.push({ label, ok: false, error: e.message });
    }
  }

  await step('load', async () => {
    await page.goto('http://localhost:8935/index.html', { waitUntil: 'networkidle' });
    await page.evaluate(() => { window.supabaseClient = window.makeFakeSupabaseClient([]); });
    await page.waitForSelector('text=תכנון ארוחות חכם');
  });

  await step('family_screen_unchanged', async () => {
    await page.click('text=התחילו לתכנן');
    await page.waitForSelector('text=כמה אנחנו בבית');
  });
  await step('menutype_screen_unchanged', async () => {
    await page.click('text=המשך להעדפות');
    await page.waitForSelector('text=איזה תפריט מתאים לכם');
  });
  await step('meals_screen_and_recipe_detail_unchanged', async () => {
    await page.click('text=לרעיונות למתכונים');
    await page.waitForSelector('text=מה מבשלים היום');
    await page.locator('text=קרא עוד').first().click();
    await page.waitForSelector('text=אופן ההכנה');
    await page.click('text=הוסף לתפריט השבועי');
    await page.locator('button:has-text("×")').first().click();
  });
  await step('fridge_screen_unchanged', async () => {
    await page.click('nav >> text=מקרר');
    await page.waitForSelector('text=סמנו מה כבר יש בבית');
  });
  await step('weekly_build_shopping_via_supabase', async () => {
    await page.click('nav >> text=שבועי');
    await page.waitForSelector('text=הלוח השבועי שלכם');
    await page.click('text=בנה רשימת קניות');
    await page.waitForSelector('text=מה צריך לקנות');
  });
  await step('shopping_page_loading_then_ready', async () => {
    // by now shoppingLoading should have resolved
    await page.waitForSelector('text=טוען את רשימת הקניות...', { state: 'detached', timeout: 3000 }).catch(() => {});
  });
  await step('favorites_screen_unchanged', async () => {
    await page.click('nav >> text=מועדפים');
    await page.waitForSelector('text=המתכונים שאהבתם');
  });
  await step('hard_reload_cache_disabled', async () => {
    const client = await context.newCDPSession(page);
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => { window.supabaseClient = window.makeFakeSupabaseClient([]); });
    await page.waitForSelector('text=תכנון ארוחות חכם');
  });

  console.log(JSON.stringify(log, null, 2));
  await browser.close();
})();
```

- [ ] **Step 3: Run it and verify expected output**

Run:
```bash
node task8_full_regression.js
```
Expected: every step `ok: true`, every `unresolved: []`, `consoleErrors: []`, `pageErrors: []`.

- [ ] **Step 4: Report to the user and hold for approval**

Summarize to the user: all 8 tasks complete, every automated check passed against a mocked Supabase backend, list any deltas from the original design (the `buildShoppingFromWeekly` behavior change, the `exportWa` active-items-only tweak). Explicitly state that real-project testing (persistence across refresh against a live database, two-browser-window realtime sync) still needs the user's actual Supabase URL/anon key, since none of this was tested against a real project. Do **not** run `git commit` — wait for the user's explicit go-ahead first.

- [ ] **Step 5: Only once the user approves — stage everything and commit once**

```bash
git add index.html supabase-config.js shopping-api.js supabase-schema.sql
git commit -m "Add shared Supabase-backed shopping list with realtime sync"
```

(`git push` still requires a separate, explicit approval per the user's instructions — do not push as part of this step.)

---

## Self-Review Notes

- **Spec coverage:** loading state (Task 5/6), categories (Task 3), duplicate handling (Task 2/7), purchased/unpurchased split with undo (Task 5/6/7), delete with inline confirm (Task 5/6/7), Realtime scoped to shopping screen only (Task 4), all 10 categories incl. new one (Task 3), full SQL with RLS + realtime publication (Task 8), file separation (Tasks 1/2), household-ready schema/API (Tasks 1/2/2's `CURRENT_HOUSEHOLD_ID`) — all covered.
- **Type consistency checked:** `addShoppingItem`/`updateShoppingItem`/`togglePurchased`/`deleteShoppingItem`/`fetchShoppingItems`/`subscribeToShoppingChanges` names match exactly between Task 2's implementation and every call site in Tasks 4/6/7.
- **No placeholders** other than the two intentional ones in `supabase-config.js` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`), which the user explicitly asked for since they don't have a project yet.
