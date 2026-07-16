(function () {
  const SECTIONS = {
    manha: { label: "Pequeno-almoço", title: "Arrancar o dia", blurb: "Rápido, com proteína, sem complicar." },
    praia: { label: "Almoço na praia", title: "Sandes & wraps", blurb: "Leve, frio, estilo patê." },
    lanches: { label: "Lanches", title: "Soft & fáceis", blurb: "Textura macia, com proteína." },
    jantar: { label: "Jantar", title: "Pode ser pesado", blurb: "Burgers, massa, carne.", accent: true },
  };

  const CAT_LABELS = {
    proteina: "Proteína",
    bases: "Bases",
    frescos: "Frescos & extras",
  };

  const state = {
    user: null,
    recipes: [],
    shopping: [],
    screen: "manha",
    busy: false,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function linesToArr(text) {
    return String(text || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function arrToLines(arr) {
    return (arr || []).join("\n");
  }

  function go(name) {
    state.screen = name;
    $$(".screen").forEach((s) => s.classList.toggle("active", s.dataset.screen === name));
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.go === name));
    const active = $(".screen.active");
    if (active) active.scrollTop = 0;
    if (name === "favoritos") renderFavorites();
    if (name === "compras") renderShopping();
    if (SECTIONS[name]) renderSection(name);
  }

  function showAuth(show) {
    $("#authScreen").hidden = !show;
    $("#appShell").hidden = show;
  }

  function updateOnline() {
    $("#statusDot").classList.toggle("off", !navigator.onLine);
  }

  function recipeCard(r, opts = {}) {
    const tags = [r.protein_note, ...(r.tags || [])].filter(Boolean)
      .map((t) => `<span class="tag${t === r.protein_note ? " p" : ""}">${escapeHtml(t)}</span>`)
      .join("");

    const ingredients = (r.ingredients || []).map((i) => `<li>${escapeHtml(i)}</li>`).join("");
    const steps = (r.steps || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("");
    const note = r.note ? `<div class="note">${escapeHtml(r.note)}</div>` : "";

    return `
      <details class="recipe" data-id="${r.id}">
        <summary>
          <div class="num">${String(opts.index ?? "").padStart(2, "0") || "★"}</div>
          <div>
            <div class="recipe-title">${escapeHtml(r.title)}</div>
            <div class="recipe-sub">${escapeHtml(opts.subPrefix ? opts.subPrefix + " · " : "")}${escapeHtml(r.subtitle || "")}</div>
          </div>
          <button type="button" class="star-btn${r.is_favorite ? " on" : ""}" data-act="fav" aria-label="Favorito">${r.is_favorite ? "★" : "☆"}</button>
          <div class="chev">›</div>
        </summary>
        <div class="body">
          <div class="tags">${tags}</div>
          <div class="row-actions">
            <button type="button" class="mini-btn" data-act="edit">Editar</button>
            <button type="button" class="mini-btn danger" data-act="del">Apagar</button>
          </div>
          <h3>Ingredientes</h3>
          <ul>${ingredients || "<li>—</li>"}</ul>
          <h3>Modo de fazer</h3>
          <ol>${steps || "<li>—</li>"}</ol>
          ${note}
        </div>
      </details>`;
  }

  function renderSection(section) {
    const meta = SECTIONS[section];
    const list = state.recipes.filter((r) => r.section === section);
    const root = $(`[data-screen="${section}"]`);
    $(".screen-intro", root).innerHTML = `
      <p class="label">${meta.label}</p>
      <h1>${meta.title}</h1>
      <p>${meta.blurb}</p>
      <span class="count-pill">${list.length} receita${list.length === 1 ? "" : "s"}</span>`;
    $(".list", root).innerHTML = list.map((r, i) => recipeCard(r, { index: i + 1 })).join("")
      || `<div class="empty-fav">Sem receitas aqui.<br />Toca em + para adicionar.</div>`;
  }

  function renderFavorites() {
    const list = state.recipes.filter((r) => r.is_favorite);
    $("#favCountPill").textContent = list.length + " favorito" + (list.length === 1 ? "" : "s");
    $("#favList").innerHTML = list.length
      ? list.map((r) => recipeCard(r, { subPrefix: SECTIONS[r.section]?.label || r.section })).join("")
      : `<div class="empty-fav">Ainda sem favoritos.<br />Toca na ☆ numa receita para guardar.</div>`;
  }

  function renderShopping() {
    const root = $("#shopContainer");
    const cats = ["proteina", "bases", "frescos"];
    root.innerHTML = cats.map((cat) => {
      const items = state.shopping.filter((s) => s.category === cat);
      const rows = items.map((item) => `
        <label class="check">
          <input type="checkbox" data-shop-id="${item.id}" ${item.checked ? "checked" : ""} />
          <span>${escapeHtml(item.label)}</span>
          <button type="button" class="del-shop" data-del-shop="${item.id}" aria-label="Apagar">✕</button>
        </label>`).join("") || `<p class="shop-empty">Nada nesta categoria.</p>`;
      return `<div class="shop-block"><h2>${CAT_LABELS[cat]}</h2>${rows}</div>`;
    }).join("");
  }

  async function refreshData() {
    try {
      const [recipes, shopping] = await Promise.all([
        MareDB.listRecipes(),
        MareDB.listShopping(),
      ]);
      state.recipes = recipes;
      state.shopping = shopping;
      MareDB.cacheSet("recipes", recipes);
      MareDB.cacheSet("shopping", shopping);
    } catch (err) {
      state.recipes = MareDB.cacheGet("recipes", []);
      state.shopping = MareDB.cacheGet("shopping", []);
      toast("Offline — a mostrar cache local");
      console.warn(err);
    }
    Object.keys(SECTIONS).forEach(renderSection);
    renderFavorites();
    renderShopping();
    updateAccountMeta();
  }

  function openRecipeModal(recipe) {
    const modal = $("#recipeModal");
    $("#recipeModalTitle").textContent = recipe?.id ? "Editar receita" : "Nova receita";
    $("#fId").value = recipe?.id || "";
    let section = recipe?.section;
    if (!section) {
      section = SECTIONS[state.screen] ? state.screen : "praia";
    }
    $("#fSection").value = section;
    $("#fTitle").value = recipe?.title || "";
    $("#fSubtitle").value = recipe?.subtitle || "";
    $("#fProtein").value = recipe?.protein_note || "";
    $("#fTags").value = (recipe?.tags || []).join(", ");
    $("#fIngredients").value = arrToLines(recipe?.ingredients);
    $("#fSteps").value = arrToLines(recipe?.steps);
    $("#fNote").value = recipe?.note || "";
    modal.hidden = false;
  }

  function closeRecipeModal() {
    $("#recipeModal").hidden = true;
  }

  function openShopModal() {
    $("#shopModal").hidden = false;
    $("#sLabel").value = "";
    $("#sCategory").value = "proteina";
  }

  function closeShopModal() {
    $("#shopModal").hidden = true;
  }

  async function onRecipeSubmit(e) {
    e.preventDefault();
    const id = $("#fId").value.trim();
    const payload = {
      section: $("#fSection").value,
      title: $("#fTitle").value.trim(),
      subtitle: $("#fSubtitle").value.trim(),
      protein_note: $("#fProtein").value.trim(),
      tags: $("#fTags").value.split(",").map((s) => s.trim()).filter(Boolean),
      ingredients: linesToArr($("#fIngredients").value),
      steps: linesToArr($("#fSteps").value),
      note: $("#fNote").value.trim(),
    };
    if (id) payload.id = id;
    if (!payload.title) return toast("Mete um título");
    try {
      await MareDB.upsertRecipe(payload);
      closeRecipeModal();
      await refreshData();
      toast(id ? "Receita atualizada" : "Receita criada");
      if (SECTIONS[payload.section]) go(payload.section);
    } catch (err) {
      toast(err.message || "Erro ao guardar");
    }
  }

  async function onShopSubmit(e) {
    e.preventDefault();
    const label = $("#sLabel").value.trim();
    if (!label) return toast("Escreve o item");
    try {
      await MareDB.addShoppingItem({
        label,
        category: $("#sCategory").value,
        checked: false,
        sort_order: state.shopping.length,
      });
      closeShopModal();
      await refreshData();
      toast("Item adicionado");
      go("compras");
    } catch (err) {
      toast(err.message || "Erro ao adicionar");
    }
  }

  async function handleListClick(e) {
    const favBtn = e.target.closest("[data-act='fav']");
    const editBtn = e.target.closest("[data-act='edit']");
    const delBtn = e.target.closest("[data-act='del']");
    const recipeEl = e.target.closest("details.recipe");
    if (!recipeEl) return;
    const id = recipeEl.dataset.id;
    const recipe = state.recipes.find((r) => r.id === id);
    if (!recipe) return;

    if (favBtn) {
      e.preventDefault();
      e.stopPropagation();
      try {
        await MareDB.toggleFavorite(id, !recipe.is_favorite);
        await refreshData();
        toast(recipe.is_favorite ? "Removido dos favoritos" : "Favorito guardado");
      } catch (err) {
        toast(err.message || "Erro");
      }
      return;
    }

    if (editBtn) {
      e.preventDefault();
      e.stopPropagation();
      openRecipeModal(recipe);
      return;
    }

    if (delBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm("Apagar esta receita?")) return;
      try {
        await MareDB.deleteRecipe(id);
        await refreshData();
        toast("Receita apagada");
      } catch (err) {
        toast(err.message || "Erro ao apagar");
      }
    }
  }

  async function handleShopClick(e) {
    const del = e.target.closest("[data-del-shop]");
    if (del) {
      e.preventDefault();
      try {
        await MareDB.deleteShoppingItem(del.dataset.delShop);
        await refreshData();
        toast("Item removido");
      } catch (err) {
        toast(err.message || "Erro");
      }
      return;
    }

    const input = e.target.closest("input[data-shop-id]");
    if (input && e.type === "change") {
      try {
        await MareDB.updateShoppingItem(input.dataset.shopId, { checked: input.checked });
        const item = state.shopping.find((s) => s.id === input.dataset.shopId);
        if (item) item.checked = input.checked;
        MareDB.cacheSet("shopping", state.shopping);
      } catch (err) {
        input.checked = !input.checked;
        toast(err.message || "Erro");
      }
    }
  }

  function updateAccountMeta() {
    const emailEl = $("#userEmail");
    const modeEl = $("#authModeLabel");
    if (emailEl) emailEl.textContent = state.user?.email || "";
    if (modeEl) {
      modeEl.textContent = MareDB.isLocalMode()
        ? "Modo neste telemóvel (dados neste dispositivo)"
        : "Modo cloud (Supabase)";
    }
  }

  async function afterLogin(session, notice) {
    state.user = session.user;
    showAuth(false);
    updateAccountMeta();
    toast(notice || "A preparar dados…");
    try {
      const seeded = await MareDB.seedIfEmpty();
      if (seeded) toast("Receitas iniciais carregadas");
    } catch (err) {
      console.error(err);
      toast(MareDB.isLocalMode()
        ? (err.message || "Erro ao carregar dados iniciais")
        : "Erro no seed: corre o schema.sql no Supabase");
    }
    await refreshData();
    updateAccountMeta();
    go("manha");
  }

  async function initAuthForm() {
    $("#authForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("#authEmail").value.trim();
      const password = $("#authPassword").value;
      const mode = $("#authMode").value;
      if (!email || password.length < 6) return toast("Escreve email + password (mín. 6)");
      const submit = $("#authSubmit");
      const prevLabel = submit.textContent;
      submit.disabled = true;
      submit.textContent = "A entrar…";
      try {
        if (mode === "signup") {
          const data = await MareDB.signUp(email, password);
          if (!data.session) {
            throw new Error("Não foi possível criar sessão. Tenta outra password.");
          }
          await afterLogin(data.session, data.notice || "Conta pronta");
        } else {
          const data = await MareDB.signIn(email, password);
          if (!data.session) throw new Error("Não foi possível entrar.");
          await afterLogin(data.session, data.notice || (data.local ? "Sessão neste telemóvel" : null));
        }
      } catch (err) {
        toast(err.message || "Erro de autenticação");
        const hint = $("#authHint");
        if (hint) {
          hint.textContent = err.message || "Erro de autenticação";
          hint.hidden = false;
        }
        submit.textContent = prevLabel;
      } finally {
        submit.disabled = false;
        if ($("#appShell").hidden) submit.textContent = prevLabel;
      }
    });

    $("#authToggle").addEventListener("click", () => {
      const mode = $("#authMode");
      if (mode.value === "login") {
        mode.value = "signup";
        $("#authSubmit").textContent = "Criar conta";
        $("#authToggle").textContent = "Já tens conta? Entrar";
      } else {
        mode.value = "login";
        $("#authSubmit").textContent = "Entrar";
        $("#authToggle").textContent = "Criar conta nova";
      }
    });

  }

  function wireUi() {
    $$(".tab").forEach((tab) => tab.addEventListener("click", () => go(tab.dataset.go)));
    $("#btnAddRecipe").addEventListener("click", () => openRecipeModal(null));
    $("#btnAddShop").addEventListener("click", openShopModal);
    $("#recipeForm").addEventListener("submit", onRecipeSubmit);
    $("#shopForm").addEventListener("submit", onShopSubmit);
    $("#recipeModalClose").addEventListener("click", closeRecipeModal);
    $("#shopModalClose").addEventListener("click", closeShopModal);
    $("#btnLogout").addEventListener("click", async () => {
      await MareDB.signOut();
      state.user = null;
      showAuth(true);
      toast("Sessão terminada");
    });
    $("#btnSeed").addEventListener("click", async () => {
      if (!confirm("Isto só adiciona dados se a conta estiver vazia. Continuar?")) return;
      try {
        const seeded = await MareDB.seedIfEmpty();
        await refreshData();
        toast(seeded ? "Seed feito" : "Já tinhas dados — nada alterado");
      } catch (err) {
        toast(err.message || "Erro no seed");
      }
    });

    document.addEventListener("click", (e) => {
      if (e.target.closest(".list, #favList")) handleListClick(e);
    });
    $("#shopContainer").addEventListener("click", handleShopClick);
    $("#shopContainer").addEventListener("change", handleShopClick);

    // accordion: one open per screen
    document.addEventListener("toggle", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLDetailsElement) || !t.classList.contains("recipe") || !t.open) return;
      const screen = t.closest(".screen");
      if (!screen) return;
      screen.querySelectorAll("details.recipe[open]").forEach((d) => {
        if (d !== t) d.open = false;
      });
    }, true);

    window.addEventListener("online", () => { updateOnline(); toast("De volta online"); refreshData(); });
    window.addEventListener("offline", () => { updateOnline(); toast("Modo offline"); });
    $("#statusBtn").addEventListener("click", () => {
      toast(navigator.onLine ? "Online — dados no Supabase" : "Offline — cache local");
    });
  }

  async function boot() {
    wireUi();
    await initAuthForm();
    updateOnline();

    try {
      MareDB.getClient();
    } catch (err) {
      showAuth(true);
      $("#authHint").textContent = err.message;
      $("#authHint").hidden = false;
      return;
    }

    const session = await MareDB.getSession();
    if (session) {
      await afterLogin(session);
    } else {
      showAuth(true);
    }

    MareDB.getClient().auth.onAuthStateChange((_event, session) => {
      if (MareDB.isLocalMode()) return;
      if (!session) {
        state.user = null;
        showAuth(true);
      }
    });
  }

  // Service worker desligado por agora — estava a impedir ver atualizações no iPhone.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    }).catch(() => {});
    if (window.caches?.keys) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
    }
  }

  boot();
})();
