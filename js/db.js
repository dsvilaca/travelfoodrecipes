(function (global) {
  const LOCAL_DB_KEY = "mare-local-db-v1";
  const MODE_KEY = "mare-auth-mode"; // "supabase" | "local"
  const SESSION_KEY = "tfr-session-v1";

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
  let refreshPromise = null;

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
          persistSession: false,
          autoRefreshToken: false,
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

  function readStoredSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s?.access_token || !s?.user?.id) return null;
      return s;
    } catch (_) {
      return null;
    }
  }

  function writeStoredSession(session) {
    if (!session?.access_token || !session?.user) {
      localStorage.removeItem(SESSION_KEY);
      return;
    }
    const payload = {
      access_token: session.access_token,
      refresh_token: session.refresh_token || "",
      expires_at: session.expires_at || null,
      user: session.user,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  }

  function clearStoredSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function sessionFromTokenResponse(json) {
    const expiresAt = json.expires_at
      || (json.expires_in ? Math.floor(Date.now() / 1000) + Number(json.expires_in) : null);
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: expiresAt,
      user: json.user,
    };
  }

  function isExpired(session) {
    if (!session?.expires_at) return false;
    // Renova 60s antes do fim
    return Number(session.expires_at) * 1000 <= Date.now() + 60000;
  }

  async function refreshStoredSession() {
    const current = readStoredSession();
    if (!current?.refresh_token) return current;
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      const cfg = getConfig();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(cfg.supabaseUrl + "/auth/v1/token?grant_type=refresh_token", {
          method: "POST",
          signal: controller.signal,
          headers: {
            apikey: cfg.supabaseAnonKey,
            Authorization: "Bearer " + cfg.supabaseAnonKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refresh_token: current.refresh_token }),
        });
        const json = await res.json();
        if (!res.ok || !json.access_token) {
          clearStoredSession();
          setAuthMode(null);
          return null;
        }
        const next = sessionFromTokenResponse(json);
        writeStoredSession(next);
        setAuthMode("supabase");
        return next;
      } catch (_) {
        // Mantém a sessão atual se o refresh falhar por rede
        return current;
      } finally {
        clearTimeout(timer);
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  async function getCloudSession() {
    let session = readStoredSession();
    if (!session) return null;
    if (isExpired(session)) {
      session = await refreshStoredSession();
    }
    return session;
  }

  function readLocalDb() {
    try {
      const raw = localStorage.getItem(LOCAL_DB_KEY);
      if (!raw) {
        return { users: [], sessionEmail: null, recipes: [], shoppingLists: [], shopping: [] };
      }
      const db = JSON.parse(raw);
      return {
        users: db.users || [],
        sessionEmail: db.sessionEmail || null,
        recipes: db.recipes || [],
        shoppingLists: db.shoppingLists || [],
        shopping: db.shopping || [],
      };
    } catch (_) {
      return { users: [], sessionEmail: null, recipes: [], shoppingLists: [], shopping: [] };
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
      if (/localhost|127\.0\.0\.1/i.test(u.hostname)) {
        return "https://dsvilaca.github.io/travelfoodrecipes/";
      }
      return u.origin + u.pathname.replace(/\/?$/, "/");
    } catch (_) {
      return "https://dsvilaca.github.io/travelfoodrecipes/";
    }
  }

  async function rest(path, options = {}) {
    const session = await getCloudSession();
    if (!session?.access_token) throw new Error("Sem sessão");
    const cfg = getConfig();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 12000);
    try {
      const res = await fetch(cfg.supabaseUrl + "/rest/v1/" + path, {
        method: options.method || "GET",
        signal: controller.signal,
        headers: {
          apikey: cfg.supabaseAnonKey,
          Authorization: "Bearer " + session.access_token,
          "Content-Type": "application/json",
          Prefer: options.prefer || "return=representation",
          ...(options.headers || {}),
        },
        body: options.body != null ? JSON.stringify(options.body) : undefined,
      });
      if (res.status === 204) return null;
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch (_) { json = text; }
      if (!res.ok) {
        const err = new Error(json?.message || json?.error_description || ("HTTP " + res.status));
        err.code = json?.code;
        throw err;
      }
      return json;
    } catch (err) {
      if (err.name === "AbortError") throw new Error("Ligação lenta. Tenta outra vez.");
      throw err;
    } finally {
      clearTimeout(timer);
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
    const cloud = await getCloudSession();
    if (cloud) {
      setAuthMode("supabase");
      return cloud;
    }

    if (authMode() === "local") {
      const db = readLocalDb();
      if (!db.sessionEmail) return null;
      return { user: localUserFromEmail(db.sessionEmail), access_token: "local" };
    }
    return null;
  }

  function adoptSession(session) {
    if (!session?.access_token || !session?.user) return null;
    const normalized = {
      access_token: session.access_token,
      refresh_token: session.refresh_token || "",
      expires_at: session.expires_at || null,
      user: session.user,
    };
    writeStoredSession(normalized);
    setAuthMode("supabase");
    return normalized;
  }

  async function cloudSignIn(email, password) {
    const cfg = getConfig();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let json;
    try {
      const res = await fetch(cfg.supabaseUrl + "/auth/v1/token?grant_type=password", {
        method: "POST",
        signal: controller.signal,
        headers: {
          apikey: cfg.supabaseAnonKey,
          Authorization: "Bearer " + cfg.supabaseAnonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      json = await res.json();
      if (!res.ok || !json.access_token) {
        const err = new Error(json.msg || json.error_description || "Login falhou");
        err.code = json.error_code || json.error;
        throw err;
      }
    } catch (err) {
      if (err.name === "AbortError") throw new Error("Ligação lenta. Tenta outra vez.");
      throw err;
    } finally {
      clearTimeout(timer);
    }

    const session = sessionFromTokenResponse(json);
    writeStoredSession(session);
    setAuthMode("supabase");
    const db = readLocalDb();
    db.sessionEmail = null;
    writeLocalDb(db);

    // Nunca bloquear a UI no setSession do supabase-js (trava em Safari/iOS)
    return { user: session.user, session };
  }

  async function cloudSignUp(email, password) {
    const cfg = getConfig();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let json;
    try {
      const res = await fetch(cfg.supabaseUrl + "/auth/v1/signup", {
        method: "POST",
        signal: controller.signal,
        headers: {
          apikey: cfg.supabaseAnonKey,
          Authorization: "Bearer " + cfg.supabaseAnonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          gotrue_meta_security: {},
        }),
      });
      json = await res.json();
      if (!res.ok) {
        const err = new Error(json.msg || json.error_description || "Registo falhou");
        err.code = json.error_code || json.error;
        throw err;
      }
    } catch (err) {
      if (err.name === "AbortError") throw new Error("Ligação lenta. Tenta outra vez.");
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (json.access_token && json.user) {
      const session = sessionFromTokenResponse(json);
      writeStoredSession(session);
      setAuthMode("supabase");
      const db = readLocalDb();
      db.sessionEmail = null;
      writeLocalDb(db);
      return { user: session.user, session };
    }

    return cloudSignIn(email, password);
  }

  async function signIn(email, password) {
    const normalized = String(email || "").trim().toLowerCase();
    const raw = String(password || "");
    try {
      return await cloudSignIn(normalized, raw);
    } catch (err) {
      // Autofill no telemóvel por vezes mete espaços no fim
      const trimmed = raw.trim();
      if (trimmed && trimmed !== raw) {
        try {
          return await cloudSignIn(normalized, trimmed);
        } catch (_) { /* keep original error */ }
      }
      throw mapAuthError(err);
    }
  }

  async function signUp(email, password) {
    const normalized = String(email || "").trim().toLowerCase();
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
    const cfg = getConfig();
    const redirectTo = siteRedirectTo();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      // redirect_to no query + body — o Supabase só o usa se estiver na Allow List;
      // senão cai no Site URL do dashboard (por isso localhost:3000 aparece).
      const res = await fetch(
        cfg.supabaseUrl + "/auth/v1/recover?redirect_to=" + encodeURIComponent(redirectTo),
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            apikey: cfg.supabaseAnonKey,
            Authorization: "Bearer " + cfg.supabaseAnonKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: normalized,
            redirect_to: redirectTo,
            gotrue_meta_security: {},
          }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(json.msg || json.error_description || "Recuperação falhou");
        err.code = json.error_code || json.error;
        throw err;
      }
      return true;
    } catch (err) {
      if (err.name === "AbortError") throw new Error("Ligação lenta. Tenta outra vez.");
      throw mapAuthError(err);
    } finally {
      clearTimeout(timer);
    }
  }

  async function updatePassword(newPassword) {
    const password = String(newPassword || "");
    if (password.length < 6) throw new Error("A password precisa de pelo menos 6 caracteres.");
    const session = await getCloudSession();
    if (!session?.access_token) throw new Error("Sessão de recuperação em falta. Abre o link do email outra vez.");
    const cfg = getConfig();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(cfg.supabaseUrl + "/auth/v1/user", {
        method: "PUT",
        signal: controller.signal,
        headers: {
          apikey: cfg.supabaseAnonKey,
          Authorization: "Bearer " + session.access_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(json.msg || json.error_description || "Não foi possível atualizar a password.");
        err.code = json.error_code || json.error;
        throw err;
      }
      return true;
    } catch (err) {
      if (err.name === "AbortError") throw new Error("Ligação lenta. Tenta outra vez.");
      throw mapAuthError(err);
    } finally {
      clearTimeout(timer);
    }
  }

  function parseAuthParamsFromUrl() {
    const out = {};
    try {
      const hash = String(global.location.hash || "").replace(/^#/, "");
      const search = String(global.location.search || "").replace(/^\?/, "");
      const raw = [hash, search].filter(Boolean).join("&");
      if (!raw) return null;
      for (const part of raw.split("&")) {
        if (!part) continue;
        const eq = part.indexOf("=");
        const k = decodeURIComponent(eq >= 0 ? part.slice(0, eq) : part);
        const v = decodeURIComponent(eq >= 0 ? part.slice(eq + 1) : "");
        out[k] = v;
      }
      if (!out.access_token && !out.error) return null;
      return out;
    } catch (_) {
      return null;
    }
  }

  function clearAuthParamsFromUrl() {
    try {
      const u = new URL(global.location.href);
      u.hash = "";
      // remove common auth query params
      ["access_token", "refresh_token", "expires_in", "expires_at", "token_type", "type", "error", "error_description"].forEach((k) => {
        u.searchParams.delete(k);
      });
      global.history.replaceState({}, "", u.pathname + u.search);
    } catch (_) { /* ignore */ }
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
    clearStoredSession();
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
    clearStoredSession();
    setAuthMode(null);
    if (mode === "local") {
      const db = readLocalDb();
      db.sessionEmail = null;
      writeLocalDb(db);
      return;
    }
    // Logout do cliente Supabase em background (não bloquear UI)
    try {
      if (hasSupabaseLib()) {
        getClient().auth.signOut().catch(() => {});
      }
    } catch (_) { /* ignore */ }
  }

  function isLocalMode() {
    return authMode() === "local";
  }

  function sortRecipes(rows) {
    return [...rows].sort((a, b) =>
      (a.section || "").localeCompare(b.section || "")
      || (a.sort_order || 0) - (b.sort_order || 0)
      || String(a.created_at || "").localeCompare(String(b.created_at || ""))
    );
  }

  function sortShopping(rows) {
    return [...rows].sort((a, b) =>
      (a.sort_order || 0) - (b.sort_order || 0)
      || String(a.created_at || "").localeCompare(String(b.created_at || ""))
    );
  }

  function sortLists(rows) {
    return [...rows].sort((a, b) =>
      (a.sort_order || 0) - (b.sort_order || 0)
      || String(a.created_at || "").localeCompare(String(b.created_at || ""))
    );
  }

  async function listRecipes() {
    if (isLocalMode()) {
      return sortRecipes(readLocalDb().recipes);
    }
    const data = await rest(
      "recipes?select=*&order=section.asc,sort_order.asc,created_at.asc"
    );
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
    if (recipe.id) {
      const data = await rest("recipes?id=eq." + encodeURIComponent(recipe.id), {
        method: "PATCH",
        body: payload,
      });
      return Array.isArray(data) ? data[0] : data;
    }
    const data = await rest("recipes", {
      method: "POST",
      body: payload,
    });
    return Array.isArray(data) ? data[0] : data;
  }

  async function deleteRecipe(id) {
    if (isLocalMode()) {
      const db = readLocalDb();
      db.recipes = db.recipes.filter((r) => r.id !== id);
      writeLocalDb(db);
      return;
    }
    await rest("recipes?id=eq." + encodeURIComponent(id), {
      method: "DELETE",
      prefer: "return=minimal",
    });
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
    const data = await rest("recipes?id=eq." + encodeURIComponent(id), {
      method: "PATCH",
      body: { is_favorite: !!isFavorite },
    });
    return Array.isArray(data) ? data[0] : data;
  }

  async function listShoppingLists() {
    if (isLocalMode()) {
      return sortLists(readLocalDb().shoppingLists);
    }
    const data = await rest(
      "shopping_lists?select=*&order=sort_order.asc,created_at.asc"
    );
    return data || [];
  }

  async function createShoppingList(name) {
    const session = await getSession();
    if (!session) throw new Error("Sem sessão");
    const trimmed = String(name || "").trim();
    if (!trimmed) throw new Error("Escreve um nome para a lista.");

    if (isLocalMode()) {
      const db = readLocalDb();
      const row = {
        id: uid(),
        user_id: session.user.id,
        name: trimmed,
        sort_order: db.shoppingLists.length,
        created_at: new Date().toISOString(),
      };
      db.shoppingLists.push(row);
      writeLocalDb(db);
      return row;
    }

    const data = await rest("shopping_lists", {
      method: "POST",
      body: {
        user_id: session.user.id,
        name: trimmed,
        sort_order: 0,
      },
    });
    return Array.isArray(data) ? data[0] : data;
  }

  async function renameShoppingList(id, name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) throw new Error("Escreve um nome para a lista.");
    if (isLocalMode()) {
      const db = readLocalDb();
      const row = db.shoppingLists.find((l) => l.id === id);
      if (!row) throw new Error("Lista não encontrada");
      row.name = trimmed;
      writeLocalDb(db);
      return row;
    }
    const data = await rest("shopping_lists?id=eq." + encodeURIComponent(id), {
      method: "PATCH",
      body: { name: trimmed },
    });
    return Array.isArray(data) ? data[0] : data;
  }

  async function deleteShoppingList(id) {
    if (isLocalMode()) {
      const db = readLocalDb();
      db.shoppingLists = db.shoppingLists.filter((l) => l.id !== id);
      db.shopping = db.shopping.filter((s) => s.list_id !== id);
      writeLocalDb(db);
      return;
    }
    // cascade apaga itens se a FK estiver bem; apaga itens primeiro por segurança
    await rest("shopping_items?list_id=eq." + encodeURIComponent(id), {
      method: "DELETE",
      prefer: "return=minimal",
    });
    await rest("shopping_lists?id=eq." + encodeURIComponent(id), {
      method: "DELETE",
      prefer: "return=minimal",
    });
  }

  async function listShopping(listId) {
    if (isLocalMode()) {
      const rows = readLocalDb().shopping.filter((s) => !listId || s.list_id === listId);
      return sortShopping(rows);
    }
    let path = "shopping_items?select=*&order=sort_order.asc,created_at.asc";
    if (listId) path += "&list_id=eq." + encodeURIComponent(listId);
    const data = await rest(path);
    return data || [];
  }

  async function addShoppingItem(item) {
    const session = await getSession();
    if (!session) throw new Error("Sem sessão");
    if (!item?.list_id) throw new Error("Escolhe uma lista primeiro.");

    if (isLocalMode()) {
      const db = readLocalDb();
      const row = {
        id: uid(),
        user_id: session.user.id,
        list_id: item.list_id,
        label: item.label,
        category: "",
        checked: !!item.checked,
        sort_order: item.sort_order ?? db.shopping.filter((s) => s.list_id === item.list_id).length,
        created_at: new Date().toISOString(),
      };
      db.shopping.push(row);
      writeLocalDb(db);
      return row;
    }

    const data = await rest("shopping_items", {
      method: "POST",
      body: {
        user_id: session.user.id,
        list_id: item.list_id,
        label: item.label,
        category: "",
        checked: !!item.checked,
        sort_order: item.sort_order ?? 0,
      },
    });
    return Array.isArray(data) ? data[0] : data;
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
    const data = await rest("shopping_items?id=eq." + encodeURIComponent(id), {
      method: "PATCH",
      body: patch,
    });
    return Array.isArray(data) ? data[0] : data;
  }

  async function deleteShoppingItem(id) {
    if (isLocalMode()) {
      const db = readLocalDb();
      db.shopping = db.shopping.filter((s) => s.id !== id);
      writeLocalDb(db);
      return;
    }
    await rest("shopping_items?id=eq." + encodeURIComponent(id), {
      method: "DELETE",
      prefer: "return=minimal",
    });
  }

  async function seedIfEmpty() {
    const session = await getSession();
    if (!session) return false;

    const seed = global.MARE_SEED || { recipes: [], shoppingLists: [] };
    const userId = session.user.id;
    let changed = false;

    const recipes = await listRecipes();
    let lists = [];
    try {
      lists = await listShoppingLists();
    } catch (err) {
      // Tabela ainda não migrada
      console.warn(err);
      lists = null;
    }

    // Acrescenta receitas seed cujos títulos ainda não existem na conta
    if (seed.recipes?.length) {
      const have = new Set(recipes.map((r) => (r.section + "::" + r.title).toLowerCase()));
      const missing = seed.recipes.filter(
        (r) => !have.has((r.section + "::" + r.title).toLowerCase())
      );
      if (missing.length) {
        if (isLocalMode()) {
          const db = readLocalDb();
          const now = new Date().toISOString();
          const start = db.recipes.length;
          missing.forEach((r, i) => {
            db.recipes.push({
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
              sort_order: start + i,
              created_at: now,
              updated_at: now,
            });
          });
          writeLocalDb(db);
        } else {
          const recipeRows = missing.map((r, i) => ({
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
            sort_order: recipes.length + i,
          }));
          // Inserir em lotes para não rebentar o payload
          for (let i = 0; i < recipeRows.length; i += 25) {
            const chunk = recipeRows.slice(i, i + 25);
            await rest("recipes", { method: "POST", body: chunk, timeoutMs: 30000 });
          }
        }
        changed = true;
      }
    }

    if (lists && !lists.length && seed.shoppingLists?.length) {
      for (let i = 0; i < seed.shoppingLists.length; i++) {
        const listSeed = seed.shoppingLists[i];
        const list = await createShoppingList(listSeed.name);
        const items = listSeed.items || [];
        for (let j = 0; j < items.length; j++) {
          await addShoppingItem({
            list_id: list.id,
            label: items[j],
            checked: false,
            sort_order: j,
          });
        }
      }
      changed = true;
    }

    return changed;
  }

  async function shoppingListsReady() {
    try {
      await listShoppingLists();
      return true;
    } catch (_) {
      return false;
    }
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
    adoptSession,
    signIn,
    signUp,
    signInLocal,
    signUpLocal,
    recoverPassword,
    updatePassword,
    parseAuthParamsFromUrl,
    clearAuthParamsFromUrl,
    signOut,
    isLocalMode,
    probeStatus,
    getLastStatus,
    listRecipes,
    upsertRecipe,
    deleteRecipe,
    toggleFavorite,
    listShoppingLists,
    createShoppingList,
    renameShoppingList,
    deleteShoppingList,
    listShopping,
    addShoppingItem,
    updateShoppingItem,
    deleteShoppingItem,
    shoppingListsReady,
    seedIfEmpty,
    cacheSet,
    cacheGet,
  };
})(window);
