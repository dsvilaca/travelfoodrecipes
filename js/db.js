(function (global) {
  const { createClient } = supabase;

  function getConfig() {
    const cfg = global.MARE_CONFIG || {};
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || cfg.supabaseAnonKey.includes("COLA_AQUI")) {
      throw new Error("Config em falta: cola a anon key em js/config.js");
    }
    return cfg;
  }

  let client = null;

  function getClient() {
    if (client) return client;
    const cfg = getConfig();
    client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    return client;
  }

  async function getSession() {
    const { data, error } = await getClient().auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function signIn(email, password) {
    const { data, error } = await getClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signUp(email, password) {
    const { data, error } = await getClient().auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const { error } = await getClient().auth.signOut();
    if (error) throw error;
  }

  async function listRecipes() {
    const { data, error } = await getClient()
      .from("recipes")
      .select("*")
      .order("section")
      .order("sort_order")
      .order("created_at");
    if (error) throw error;
    return data || [];
  }

  async function upsertRecipe(recipe) {
    const session = await getSession();
    if (!session) throw new Error("Sem sessão");
    const payload = {
      ...recipe,
      user_id: session.user.id,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await getClient()
      .from("recipes")
      .upsert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function deleteRecipe(id) {
    const { error } = await getClient().from("recipes").delete().eq("id", id);
    if (error) throw error;
  }

  async function toggleFavorite(id, isFavorite) {
    const { data, error } = await getClient()
      .from("recipes")
      .update({ is_favorite: isFavorite })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function listShopping() {
    const { data, error } = await getClient()
      .from("shopping_items")
      .select("*")
      .order("category")
      .order("sort_order")
      .order("created_at");
    if (error) throw error;
    return data || [];
  }

  async function addShoppingItem(item) {
    const session = await getSession();
    if (!session) throw new Error("Sem sessão");
    const { data, error } = await getClient()
      .from("shopping_items")
      .insert({ ...item, user_id: session.user.id })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function updateShoppingItem(id, patch) {
    const { data, error } = await getClient()
      .from("shopping_items")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function deleteShoppingItem(id) {
    const { error } = await getClient().from("shopping_items").delete().eq("id", id);
    if (error) throw error;
  }

  async function seedIfEmpty() {
    const session = await getSession();
    if (!session) return false;
    const recipes = await listRecipes();
    const shopping = await listShopping();
    if (recipes.length || shopping.length) return false;

    const seed = global.MARE_SEED || { recipes: [], shopping: [] };
    const uid = session.user.id;

    const recipeRows = seed.recipes.map((r, i) => ({
      user_id: uid,
      section: r.section,
      title: r.title,
      subtitle: r.subtitle || "",
      protein_note: r.protein_note || "",
      tags: r.tags || [],
      ingredients: r.ingredients || [],
      steps: r.steps || [],
      note: r.note || "",
      is_favorite: false,
      sort_order: i,
    }));

    const shopRows = seed.shopping.map((s, i) => ({
      user_id: uid,
      label: s.label,
      category: s.category,
      checked: false,
      sort_order: i,
    }));

    if (recipeRows.length) {
      const { error } = await getClient().from("recipes").insert(recipeRows);
      if (error) throw error;
    }
    if (shopRows.length) {
      const { error } = await getClient().from("shopping_items").insert(shopRows);
      if (error) throw error;
    }
    return true;
  }

  function cacheSet(key, value) {
    try {
      localStorage.setItem("mare-cache-" + key, JSON.stringify(value));
    } catch (_) { /* ignore */ }
  }

  function cacheGet(key, fallback) {
    try {
      const raw = localStorage.getItem("mare-cache-" + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  global.MareDB = {
    getClient,
    getSession,
    signIn,
    signUp,
    signOut,
    listRecipes,
    upsertRecipe,
    deleteRecipe,
    toggleFavorite,
    listShopping,
    addShoppingItem,
    updateShoppingItem,
    deleteShoppingItem,
    seedIfEmpty,
    cacheSet,
    cacheGet,
  };
})(window);
