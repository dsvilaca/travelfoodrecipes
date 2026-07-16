(function (global) {
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
  let clientFailed = false;
  let lastStatus = null;

  function hasSupabaseLib() {
    return !!(global.supabase && typeof global.supabase.createClient === "function");
  }

  function getClient() {
    if (client) return client;
    if (clientFailed || !hasSupabaseLib()) {
      throw new Error("Recarrega a página e tenta outra vez.");
    }
    const cfg = getConfig();
    try {
      client = global.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    } catch (err) {
      clientFailed = true;
      throw err;
    }
    return client;
  }

  function authMode() {
    return localStorage.getItem(MODE_KEY) || null;
  }

  function setAuthMode(mode) {
    if (mode) localStorage.setItem(MODE_KEY, mode);
    else localStorage.removeItem(MODE_KEY);
  }

  function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label || ("Timeout (" + ms + "ms)"))), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function readLocalDb() {
    try {
      const raw = localStorage.getItem(LOCAL_DB_KEY);
      if (!raw) return { users: [], sessionEmail: null, recipes: [], shopping: [] };
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

  function authErrorCode(err) {
    return err?.code || err?.error_code || "";
  }

  function mapAuthError(err) {
    const code = authErrorCode(err);
    const msg = String(err?.message || err?.msg || err || "");
    if (code === "over_email_send_rate_limit" || /rate limit/i.test(msg)) {
      return new Error("Demasiadas tentativas. Espera um pouco e tenta outra vez.");
    }
    if (code === "email_not_confirmed" || /not confirmed/i.test(msg)) {
      return new Error("Confirma o email ou recupera a password.");
    }
    if (code === "invalid_credentials" || /invalid login/i.test(msg)) {
      return new Error("Email ou password incorretos.");
    }
    if (code === "user_already_exists" || /already registered|already exists/i.test(msg)) {
      return new Error("Este email já tem conta. Toca em Entrar ou recupera a password.");
    }
    if (/Timeout/i.test(msg)) {
      return new Error("Ligação lenta. Tenta outra vez.");
    }
    return new Error("Não foi possível entrar. Tenta outra vez.");
  }

  function siteRedirectTo() {
    const cfg = getConfig();
    if (cfg.siteUrl) {
      try {
        const u = new URL(cfg.siteUrl);
        return u.toString().replace(/\/?$/, "/");
      } catch (_) { /* fall through */ }
    }
    try {
      const u = new URL(global.location.href);
      u.hash = "";
      u.search = "";
      // Nunca devolver localhost para emails de reset
      if (/localhost|127\.0\.0\.1/i.test(u.hostname)) {
        return "https://dsvilaca.github.io/travelfoodrecipes/";
      }
      return u.origin + u.pathname.replace(/\/?$/, "/");
    } catch (_) {
      return "https://dsvilaca.github.io/travelfoodrecipes/";
    }
  }

  async function probeStatus() {
    const cfg = getConfig();
    const status = {
      ok: false,
      emailEnabled: false,
      autoconfirm: false,
      tablesOk: false,
      message: "",
    };
    try {
      const settingsRes = await withTimeout(
        fetch(cfg.supabaseUrl + "/auth/v1/settings", {
          headers: {
            apikey: cfg.supabaseAnonKey,
            Authorization: "Bearer " + cfg.supabaseAnonKey,
          },
        }),
        8000,
        "Timeout a contactar Supabase"
      );
      const settings = await settingsRes.json();
      status.emailEnabled = !!(settings?.external?.email);
      status.autoconfirm = !!settings?.mailer_autoconfirm;
      status.disableSignup = !!settings?.disable_signup;

      const tablesRes = await withTimeout(
        fetch(cfg.supabaseUrl + "/rest/v1/recipes?select=id&limit=1", {
          headers: {
            apikey: cfg.supabaseAnonKey,
            Authorization: "Bearer " + cfg.supabaseAnonKey,
          },
        }),
        8000,
        "Timeout nas tabelas"
      );
      status.tablesOk = tablesRes.status === 200;

      if (!status.emailEnabled) {
        status.message = "Email login desativado no Supabase.";
      } else if (!status.autoconfirm) {
        status.message =
          "BD acessível, mas «Confirm email» está LIGADO — por isso a sessão fica presa. Desliga em Authentication → Providers → Email.";
      } else if (!status.tablesOk) {
        status.message = "Auth OK, mas faltam tabelas. Corre supabase/schema.sql no SQL Editor.";
      } else {
        status.ok = true;
        status.message = "Supabase pronto (email + BD).";
      }
    } catch (err) {
      status.message = err.message || "Não foi possível contactar o Supabase.";
    }
    lastStatus = status;
    return status;
  }

  function getLastStatus() {
    return lastStatus;
  }

  async function getSession() {
    // Sessão Supabase persistida
    if (hasSupabaseLib()) {
      try {
        const { data, error } = await withTimeout(
          getClient().auth.getSession(),
          6000,
          "Timeout a ler sessão Supabase"
        );
        if (!error && data?.session) {
          setAuthMode("supabase");
          return data.session;
        }
      } catch (_) { /* tenta local */ }
    }

    if (authMode() === "local") {
      const db = readLocalDb();
      if (!db.sessionEmail) return null;
      return { user: localUserFromEmail(db.sessionEmail), access_token: "local" };
    }
    return null;
  }

  async function cloudSignIn(email, password) {
    const { data, error } = await withTimeout(
      getClient().auth.signInWithPassword({ email, password }),
      10000,
      "Timeout no login Supabase"
    );
    if (error) throw error;
    if (!data?.session) throw new Error("Não foi possível entrar.");
    setAuthMode("supabase");
    // limpa sessão local para não misturar
    const db = readLocalDb();
    db.sessionEmail = null;
    writeLocalDb(db);
    return data;
  }

  async function cloudSignUp(email, password) {
    const { data, error } = await withTimeout(
      getClient().auth.signUp({
        email,
        password,
        options: { emailRedirectTo: siteRedirectTo() },
      }),
      10000,
      "Timeout no registo"
    );
    if (error) throw error;
    if (data?.session) {
      setAuthMode("supabase");
      const db = readLocalDb();
      db.sessionEmail = null;
      writeLocalDb(db);
      return data;
    }
    throw new Error("Não foi possível criar a conta. Tenta Entrar ou recuperar a password.");
  }

  async function signIn(email, password) {
    const normalized = String(email || "").trim().toLowerCase();
    if (!hasSupabaseLib()) throw new Error("Recarrega a página e tenta outra vez.");
    try {
      return await cloudSignIn(normalized, password);
    } catch (err) {
      throw mapAuthError(err);
    }
  }

  async function signUp(email, password) {
    const normalized = String(email || "").trim().toLowerCase();
    if (!hasSupabaseLib()) throw new Error("Recarrega a página e tenta outra vez.");
    try {
      return await cloudSignUp(normalized, password);
    } catch (err) {
      const code = authErrorCode(err);
      const msg = String(err?.message || err?.msg || "");
      if (code === "user_already_exists" || /already registered|already exists/i.test(msg)) {
        try {
          return await cloudSignIn(normalized, password);
        } catch (_) {
          throw new Error("Este email já tem conta. Toca em Entrar ou recupera a password.");
        }
      }
      throw mapAuthError(err);
    }
  }

  async function recoverPassword(email) {
    const normalized = String(email || "").trim().toLowerCase();
    if (!normalized) throw new Error("Escreve o teu email.");
    if (!hasSupabaseLib()) throw new Error("Recarrega a página e tenta outra vez.");
    const { error } = await withTimeout(
      getClient().auth.resetPasswordForEmail(normalized, {
        redirectTo: siteRedirectTo(),
      }),
      10000,
      "Timeout"
    );
    if (error) throw mapAuthError(error);
    return true;
  }

  function signUpLocal(email, password, extra = {}) {
    const normalized = String(email || "").trim().toLowerCase();
    const db = readLocalDb();
    let user = db.users.find((u) => u.email === normalized);
    if (user) {
      if (user.password !== password) {
        throw new Error("Já existe conta local com outra password neste telemóvel.");
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
      notice: extra.notice || "Modo local (sem BD).",
    };
  }

  async function signInLocal(email, password) {
    const normalized = String(email || "").trim().toLowerCase();
    const db = readLocalDb();
    const user = db.users.find((u) => u.email === normalized);
    if (user && user.password !== password) {
      throw new Error("Password local incorreta.");
    }
    return signUpLocal(normalized, password, { notice: "Modo local (sem BD)." });
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
    try {
      const { error } = await withTimeout(getClient().auth.signOut(), 5000, "Timeout logout");
      if (error) throw mapAuthError(error);
    } catch (_) {
      setAuthMode(null);
    }
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
    const { data, error } = await withTimeout(
      getClient().from("recipes").select("*").order("section").order("sort_order").order("created_at"),
      10000,
      "Timeout a ler receitas"
    );
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
        db.recipes[idx] = { ...db.recipes[idx], ...recipe, user_id: session.user.id, updated_at: now };
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
    const { data, error } = await withTimeout(
      getClient().from("recipes").upsert(payload).select().single(),
      10000,
      "Timeout a guardar receita"
    );
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
    const { error } = await withTimeout(
      getClient().from("recipes").delete().eq("id", id),
      10000,
      "Timeout a apagar receita"
    );
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
    const { data, error } = await withTimeout(
      getClient().from("recipes").update({ is_favorite: isFavorite }).eq("id", id).select().single(),
      10000,
      "Timeout favorito"
    );
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
    const { data, error } = await withTimeout(
      getClient().from("shopping_items").select("*").order("category").order("sort_order").order("created_at"),
      10000,
      "Timeout a ler lista"
    );
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

    const { data, error } = await withTimeout(
      getClient().from("shopping_items").insert({ ...item, user_id: session.user.id }).select().single(),
      10000,
      "Timeout a adicionar item"
    );
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
    const { data, error } = await withTimeout(
      getClient().from("shopping_items").update(patch).eq("id", id).select().single(),
      10000,
      "Timeout a atualizar item"
    );
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
    const { error } = await withTimeout(
      getClient().from("shopping_items").delete().eq("id", id),
      10000,
      "Timeout a apagar item"
    );
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
      const { error } = await withTimeout(
        getClient().from("recipes").insert(recipeRows),
        20000,
        "Timeout no seed de receitas"
      );
      if (error) throw error;
    }
    if (shopRows.length) {
      const { error } = await withTimeout(
        getClient().from("shopping_items").insert(shopRows),
        20000,
        "Timeout no seed da lista"
      );
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
    recoverPassword,
    signOut,
    isLocalMode,
    probeStatus,
    getLastStatus,
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
