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
