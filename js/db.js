(function (global) {
  const { createClient } = supabase;
  const LOCAL_DB_KEY = "mare-local-db-v1";
  const MODE_KEY = "mare-auth-mode"; // "supabase" | "local"

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

  function authMode() {
    return localStorage.getItem(MODE_KEY) || null;
  }

  function setAuthMode(mode) {
    if (mode) localStorage.setItem(MODE_KEY, mode);
    else localStorage.removeItem(MODE_KEY);
  }

  function readLocalDb() {
    try {
      const raw = localStorage.getItem(LOCAL_DB_KEY);
      if (!raw) {
        return { users: [], sessionEmail: null, recipes: [], shopping: [] };
      }
      const db = JSON.parse(raw);
      return {
        users: db.users || [],
        sessionEmail: db.sessionEmail || null,
        recipes: db.recipes || [],
        shopping: db.shopping || [],
      };
    } catch (_) {
      return { users: [], sessionEmail: null, recipes: [], shopping: [] };
    }
  }

  function writeLocalDb(db) {
    localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
  }

  function uid() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function localUserFromEmail(email) {
    return {
      id: "local-" + String(email || "user").toLowerCase(),
      email: String(email || "").toLowerCase(),
    };
  }

  function mapAuthError(err) {
    const code = err?.code || err?.error_code || "";
    const msg = String(err?.message || err?.msg || err || "Erro de autenticação");
    if (code === "over_email_send_rate_limit" || /rate limit/i.test(msg)) {
      return new Error("Limite de emails do Supabase. Espera 1 hora ou usa «Neste telemóvel».");
    }
    if (code === "email_not_confirmed" || /not confirmed|confirm/i.test(msg)) {
      return new Error("Email ainda não confirmado. No Supabase: Authentication → Providers → Email → desliga Confirm email. Ou usa «Neste telemóvel».");
    }
    if (code === "invalid_credentials" || /invalid login/i.test(msg)) {
      return new Error("Email ou password incorretos (ou a conta ainda não está confirmada).");
    }
    if (code === "user_already_exists" || /already registered|already exists/i.test(msg)) {
      return new Error("Esta conta já existe — tenta Entrar, ou «Neste telemóvel».");
    }
    if (code === "email_provider_disabled") {
      return new Error("Registo por email desativado no Supabase.");
    }
    return new Error(msg);
  }

  function siteRedirectTo() {
    try {
      const u = new URL(global.location.href);
      u.hash = "";
      u.search = "";
      return u.toString().replace(/\/$/, "/") || u.origin + u.pathname;
    } catch (_) {
      return undefined;
    }
  }

  async function getSession() {
    if (authMode() === "local") {
      const db = readLocalDb();
      if (!db.sessionEmail) return null;
      const user = localUserFromEmail(db.sessionEmail);
      return { user, access_token: "local" };
    }
    const { data, error } = await getClient().auth.getSession();
    if (error) throw mapAuthError(error);
    return data.session;
  }

  async function trySupabaseSignIn(email, password) {
    try {
      const { data, error } = await getClient().auth.signInWithPassword({
        email,
        password,
      });
      if (error || !data?.session) return null;
      setAuthMode("supabase");
      return data;
    } catch (_) {
      return null;
    }
  }

  async function trySupabaseSignUp(email, password) {
    try {
      const { data, error } = await getClient().auth.signUp({
        email,
        password,
        options: { emailRedirectTo: siteRedirectTo() },
      });
      if (error) return null;
      if (data?.session) {
        setAuthMode("supabase");
        return data;
      }
      return trySupabaseSignIn(email, password);
    } catch (_) {
      return null;
    }
  }

  async function signIn(email, password) {
    const normalized = String(email || "").trim().toLowerCase();
    const cloud = await trySupabaseSignIn(normalized, password);
    if (cloud?.session) return cloud;

    // Sempre funciona neste dispositivo (a cloud pode estar com rate limit / confirm email)
    const db = readLocalDb();
    const local = db.users.find((u) => u.email === normalized);
    if (local && local.password !== password) {
      throw new Error("Password incorreta para esta conta neste telemóvel.");
    }
    return signInLocal(normalized, password);
  }

  async function signUp(email, password) {
    const normalized = String(email || "").trim().toLowerCase();

    // Conta local primeiro — os botões têm de funcionar mesmo com Supabase bloqueado
    const local = signUpLocal(normalized, password, {
      notice: "Conta pronta. Podes usar a app já neste telemóvel.",
    });

    const cloud = await trySupabaseSignUp(normalized, password);
    if (cloud?.session) {
      return {
        ...cloud,
        notice: "Conta cloud ativa — dados sincronizam no Supabase.",
      };
    }
    return local;
  }

  function signUpLocal(email, password, extra = {}) {
    const normalized = String(email || "").trim().toLowerCase();
    const db = readLocalDb();
    let user = db.users.find((u) => u.email === normalized);
    if (user) {
      if (user.password !== password) {
        throw new Error("Já existe uma conta local com este email e outra password.");
      }
    } else {
      user = { email: normalized, password, id: "local-" + normalized };
      db.users.push(user);
    }
    db.sessionEmail = normalized;
    writeLocalDb(db);
    setAuthMode("local");
    const sessionUser = localUserFromEmail(normalized);
    return {
      user: sessionUser,
      session: { user: sessionUser },
      local: true,
      notice: extra.notice || null,
    };
  }

  async function signInLocal(email, password) {
    const normalized = String(email || "").trim().toLowerCase();
    const db = readLocalDb();
    const user = db.users.find((u) => u.email === normalized);
    if (!user || user.password !== password) {
      // cria se não existir (atalho «neste telemóvel»)
      return signUpLocal(normalized, password);
    }
    db.sessionEmail = normalized;
    writeLocalDb(db);
    setAuthMode("local");
    const sessionUser = localUserFromEmail(normalized);
    return { user: sessionUser, session: { user: sessionUser }, local: true };
  }

  async function signOut() {
    const mode = authMode();
    if (mode === "local") {
      const db = readLocalDb();
      db.sessionEmail = null;
      writeLocalDb(db);
      setAuthMode(null);
      return;
    }
    setAuthMode(null);
    const { error } = await getClient().auth.signOut();
    if (error) throw mapAuthError(error);
  }

  function isLocalMode() {
    return authMode() === "local";
  }

  async function listRecipes() {
    if (isLocalMode()) {
      const db = readLocalDb();
      return [...db.recipes].sort((a, b) =>
        (a.section || "").localeCompare(b.section || "")
        || (a.sort_order || 0) - (b.sort_order || 0)
        || String(a.created_at || "").localeCompare(String(b.created_at || ""))
      );
    }
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

    if (isLocalMode()) {
      const db = readLocalDb();
      const now = new Date().toISOString();
      if (recipe.id) {
        const idx = db.recipes.findIndex((r) => r.id === recipe.id);
        if (idx < 0) throw new Error("Receita não encontrada");
        db.recipes[idx] = {
          ...db.recipes[idx],
          ...recipe,
          user_id: session.user.id,
          updated_at: now,
        };
        writeLocalDb(db);
        return db.recipes[idx];
      }
      const row = {
        id: uid(),
        user_id: session.user.id,
        section: recipe.section,
        title: recipe.title,
        subtitle: recipe.subtitle || "",
        protein_note: recipe.protein_note || "",
        tags: recipe.tags || [],
        ingredients: recipe.ingredients || [],
        steps: recipe.steps || [],
        note: recipe.note || "",
        is_favorite: !!recipe.is_favorite,
        sort_order: recipe.sort_order ?? db.recipes.length,
        created_at: now,
        updated_at: now,
      };
      db.recipes.push(row);
      writeLocalDb(db);
      return row;
    }

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
    if (isLocalMode()) {
      const db = readLocalDb();
      db.recipes = db.recipes.filter((r) => r.id !== id);
      writeLocalDb(db);
      return;
    }
    const { error } = await getClient().from("recipes").delete().eq("id", id);
    if (error) throw error;
  }

  async function toggleFavorite(id, isFavorite) {
    if (isLocalMode()) {
      const db = readLocalDb();
      const row = db.recipes.find((r) => r.id === id);
      if (!row) throw new Error("Receita não encontrada");
      row.is_favorite = !!isFavorite;
      row.updated_at = new Date().toISOString();
      writeLocalDb(db);
      return row;
    }
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
    if (isLocalMode()) {
      const db = readLocalDb();
      return [...db.shopping].sort((a, b) =>
        (a.category || "").localeCompare(b.category || "")
        || (a.sort_order || 0) - (b.sort_order || 0)
        || String(a.created_at || "").localeCompare(String(b.created_at || ""))
      );
    }
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

    if (isLocalMode()) {
      const db = readLocalDb();
      const row = {
        id: uid(),
        user_id: session.user.id,
        label: item.label,
        category: item.category,
        checked: !!item.checked,
        sort_order: item.sort_order ?? db.shopping.length,
        created_at: new Date().toISOString(),
      };
      db.shopping.push(row);
      writeLocalDb(db);
      return row;
    }

    const { data, error } = await getClient()
      .from("shopping_items")
      .insert({ ...item, user_id: session.user.id })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function updateShoppingItem(id, patch) {
    if (isLocalMode()) {
      const db = readLocalDb();
      const row = db.shopping.find((s) => s.id === id);
      if (!row) throw new Error("Item não encontrado");
      Object.assign(row, patch);
      writeLocalDb(db);
      return row;
    }
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
    if (isLocalMode()) {
      const db = readLocalDb();
      db.shopping = db.shopping.filter((s) => s.id !== id);
      writeLocalDb(db);
      return;
    }
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
    const userId = session.user.id;

    if (isLocalMode()) {
      const db = readLocalDb();
      const now = new Date().toISOString();
      db.recipes = seed.recipes.map((r, i) => ({
        id: uid(),
        user_id: userId,
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
        created_at: now,
        updated_at: now,
      }));
      db.shopping = seed.shopping.map((s, i) => ({
        id: uid(),
        user_id: userId,
        label: s.label,
        category: s.category,
        checked: false,
        sort_order: i,
        created_at: now,
      }));
      writeLocalDb(db);
      return true;
    }

    const recipeRows = seed.recipes.map((r, i) => ({
      user_id: userId,
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
      user_id: userId,
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
    signInLocal,
    signUpLocal,
    signOut,
    isLocalMode,
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
