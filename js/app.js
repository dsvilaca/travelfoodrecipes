(function () {
  const SECTIONS = {
    manha: { label: "Pequeno-almoço", title: "Arrancar o dia", blurb: "Rápido, com proteína, sem complicar." },
    praia: { label: "Almoço na praia", title: "Sandes & wraps", blurb: "Leve, frio, estilo patê." },
    lanches: { label: "Lanches", title: "Soft & fáceis", blurb: "Textura macia, com proteína." },
    jantar: { label: "Jantar", title: "Pode ser pesado", blurb: "Burgers, massa, carne.", accent: true },
  };

  const state = {
    user: null,
    recipes: [],
    shoppingLists: [],
    shopping: [],
    activeListId: null,
    shoppingReady: true,
    prefsReady: true,
    diet: [], // restriction ids
    screen: "manha",
    busy: false,
    authBusy: false,
    searchQuery: "",
    searchTerms: [],
    searchMethods: [], // forno | fogao | micro | frio | airfryer | grelha
  };

  const SEARCH_SUGGESTIONS = [
    "ovos", "atum", "frango", "nutella", "queijo", "banana",
    "massa", "bacon", "salmão", "chocolate", "batata", "iogurte",
  ];

  const COOK_METHODS = [
    { id: "forno", label: "Forno" },
    { id: "fogao", label: "Fogão / frigideira" },
    { id: "micro", label: "Micro-ondas" },
    { id: "frio", label: "Sem aquecer" },
    { id: "airfryer", label: "Airfryer" },
    { id: "grelha", label: "Grelha / BBQ" },
  ];

  const COOK_METHOD_LABEL = Object.fromEntries(COOK_METHODS.map((m) => [m.id, m.label]));

  const DIET_OPTIONS = [
    { id: "vegetarian", label: "Vegetariano" },
    { id: "vegan", label: "Vegan" },
    { id: "gluten_free", label: "Sem glúten" },
    { id: "lactose_free", label: "Sem lactose" },
    { id: "nut_free", label: "Sem frutos secos" },
    { id: "shellfish_free", label: "Sem marisco" },
    { id: "no_pork", label: "Sem porco" },
  ];

  const DIET_LABEL = Object.fromEntries(DIET_OPTIONS.map((d) => [d.id, d.label]));

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function toast(msg) {
    const el = $("#toast");
    if (!el) return;
    el.hidden = false;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2800);
  }

  function authMessage(msg) {
    const hint = $("#authHint");
    if (hint) {
      hint.textContent = msg;
      hint.hidden = false;
    }
    toast(msg);
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
    if (name === "conta") renderAccount();
    if (name === "pesquisa") {
      renderSearch();
      setTimeout(() => $("#searchInput")?.focus(), 50);
    }
    if (SECTIONS[name]) renderSection(name);
  }

  function normalizeText(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseSearchTerms(query) {
    return String(query || "")
      .split(/[,;]+|\s+e\s+|\s+/i)
      .map((t) => normalizeText(t))
      .filter((t) => t.length >= 2);
  }

  function recipeSearchBlob(r) {
    const ings = (r.ingredients || []).join(" ");
    const steps = (r.steps || []).join(" ");
    return normalizeText([
      r.title, r.subtitle, r.protein_note, ings, steps, (r.tags || []).join(" "), r.note || "",
    ].join(" "));
  }

  function recipeContains(blob, patterns) {
    return patterns.some((re) => re.test(blob));
  }

  function detectDietFlags(r) {
    const blob = recipeSearchBlob(r);
    const tags = normalizeText((r.tags || []).join(" "));

    const plantMilk = /\b(leite de coco|leite de amendoa|leite de aveia|leite de soja|leite vegetal|bebida de aveia|bebida de soja|bebida de amendoa)\b/;
    const dairyFoods = recipeContains(blob, [
      /\b(manteiga|queijo|iogurte|natas|cream cheese|mascarpone|ricota|mozzarella|mussarela|parmesao|cheddar|ghee|whey|lactose|leite condensado|leite evaporado|chantilly)\b/,
      /\b(butter|cheese|yogurt|yoghurt|cream)\b/,
    ]);
    const hasCowMilk = /\bleite\b/.test(blob) && !plantMilk.test(blob);
    const hasDairy = dairyFoods || hasCowMilk;

    const hasEgg = recipeContains(blob, [/\b(ovo|ovos|gemas?|claras?|egg|eggs)\b/]);
    const hasHoney = recipeContains(blob, [/\b(mel|honey)\b/]);

    const hasPork = recipeContains(blob, [
      /\b(porco|bacon|fiambre|presunto|chourico|chouriço|pancetta|lardo|entrecosto|secreto|cachaço|salsicha de porco|pork|ham|prosciutto|pepperoni)\b/,
    ]);

    const hasShellfish = recipeContains(blob, [
      /\b(camarao|camaroes|gambas?|mexilhao|mexilhoes|ameijoa|ameijoas|lagosta|lavagante|caranguejo|sapateira|marisco|mariscos|polvo|lula|chocos?|ostra|ostras|vieira|shrimp|prawn|mussel|clam|lobster|crab|squid|octopus|shellfish)\b/,
    ]);

    const hasFish = hasShellfish || recipeContains(blob, [
      /\b(peixe|salm[aã]o|atum|bacalhau|sardinha|sardinhas|cavala|truta|pescada|dourada|robalo|anchova|anchovas|fish|salmon|tuna|cod|sardine)\b/,
    ]);

    const hasMeat = hasPork || recipeContains(blob, [
      /\b(carne|frango|peru|vaca|vitela|borrego|cordeiro|bovina|beef|chicken|turkey|lamb|veal|steak|bife|almondegas|hamburger|burger|chourico|salsicha|linguiça|linguica|bacon)\b/,
      /\b(carne mo[ií]da|carne picada|peito de frango|coxas? de frango)\b/,
    ]);

    const hasGluten = recipeContains(blob, [
      /\b(farinha|trigo|pao|broa|massa|esparguete|espaguete|spaghetti|macarrao|lasanha|ravioli|cuscuz|couscous|seitan|panko|bolo|biscoito|cookie|waffle|pancake|panqueca|torta|tarte|croissant|brioche|pizza|baguete|baguette|molho de soja|soy sauce|cevada|centeio|flour|bread|wheat|pasta|noodle|noodles|granola|burrito|tortilha|tortilla|wrap|tostas?|torrada|crouton|pao rala|breadcrumb)\b/,
    ]);

    const hasNuts = recipeContains(blob, [
      /\b(amendoa|amendoas|amendoim|amendoins|noz|nozes|avela|avelas|caju|pistacho|pistache|castanha|castanhas|nutella|peanut|almond|walnut|hazelnut|cashew|pistachio|pecan|macadamia|praline)\b/,
      /\b(manteiga de amendoim|pasta de amendoim|creme de avela)\b/,
    ]);

    // tags explícitas atenuam falsos positivos
    const taggedVegan = /\b(vegan|vegano|vegana)\b/.test(tags);
    const taggedVeg = taggedVegan || /\bvegetariano\b/.test(tags);
    const taggedGF = /\b(sem gluten|gluten free|semgluten)\b/.test(tags);
    const taggedLF = /\b(sem lactose|lactose free|semlactose)\b/.test(tags);

    return {
      meat: taggedVeg ? false : hasMeat,
      fish: taggedVeg ? false : hasFish,
      shellfish: taggedVeg ? false : hasShellfish,
      pork: taggedVeg ? false : hasPork,
      dairy: taggedVegan || taggedLF ? false : hasDairy,
      egg: taggedVegan ? false : hasEgg,
      honey: taggedVegan ? false : hasHoney,
      gluten: taggedGF ? false : hasGluten,
      nuts: hasNuts,
    };
  }

  function recipeMatchesDiet(r, dietPrefs) {
    const prefs = Array.isArray(dietPrefs) ? dietPrefs : state.diet;
    if (!prefs.length) return true;
    const f = detectDietFlags(r);
    for (const id of prefs) {
      if (id === "vegetarian" && (f.meat || f.fish || f.shellfish)) return false;
      if (id === "vegan" && (f.meat || f.fish || f.shellfish || f.dairy || f.egg || f.honey)) return false;
      if (id === "gluten_free" && f.gluten) return false;
      if (id === "lactose_free" && f.dairy) return false;
      if (id === "nut_free" && f.nuts) return false;
      if (id === "shellfish_free" && f.shellfish) return false;
      if (id === "no_pork" && f.pork) return false;
    }
    return true;
  }

  function visibleRecipes(list) {
    if (!state.diet.length) return list;
    return list.filter((r) => recipeMatchesDiet(r, state.diet));
  }

  function dietFilterNote(total, shown) {
    if (!state.diet.length) return "";
    const labels = state.diet.map((id) => DIET_LABEL[id] || id).join(", ");
    if (shown < total) {
      return `Perfil: ${labels} · a mostrar ${shown} de ${total}`;
    }
    return `Perfil: ${labels}`;
  }

  function detectCookMethods(r) {
    // blob já vem sem acentos (normalizeText)
    const blob = recipeSearchBlob(r);
    const tags = normalizeText((r.tags || []).join(" "));
    const methods = new Set();
    const has = (re) => re.test(blob);

    if (has(/\b(forno|assar|assado|assada|assados|assadas|pre aquece|preaquece|bake|baked|oven|graus)\b/)
      || has(/\b\d{2,3}\s*c\b/) || has(/\b\d{2,3}\s*f\b/)) {
      methods.add("forno");
    }
    if (has(/\b(microondas|micro ondas|microwave)\b/) || tags.includes("micro")) {
      methods.add("micro");
    }
    if (has(/\b(airfryer|air fryer|fritadeira de ar|air fry)\b/)) {
      methods.add("airfryer");
    }
    if (has(/\b(grelha|grelhar|grelhado|grelhada|bbq|barbecue|churrasco|grill|grilled)\b/)) {
      methods.add("grelha");
    }
    // fogão: equipamento / técnicas de lume — evitar "cozinhar" genérico
    if (has(/\b(frigideira|fogao|panela|tacho|refoga|refogar|fritar|frita|fritas|saltear|salteia|ferver|ferve|lume|stove|skillet|saucepan|saute|frying|boil|simmer|wok)\b/)
      || has(/\b(ovos mexidos|omelete|estufar|estufa|reduzir o caldo)\b/)) {
      methods.add("fogao");
    }

    const needsHeat = methods.has("forno") || methods.has("fogao") || methods.has("micro")
      || methods.has("airfryer") || methods.has("grelha");

    const noHeatHint = has(/\b(sem fogao|sem forno|sem aquecer|sem lume|no cook|nocook|sem cozedura|overnight oats|smoothie|ceviche|carpaccio|tartare|chia pudding)\b/)
      || tags.includes("sem fogao") || tags.includes("frio") || tags.includes("no cook");

    if (noHeatHint && !needsHeat) methods.add("frio");

    // sanduíches / wraps / saladas / lanches frios sem sinais de calor
    if (!needsHeat && !methods.has("frio")) {
      const coldStyle = has(/\b(sandes|sanduiche|wrap|pate|salada|salad|bruschetta|iogurte|granola|hummus|fruta|queijo fresco|trail mix|overnight)\b/)
        || r.section === "praia" || r.section === "lanches";
      const heatVerb = has(/\b(assar|fritar|ferver|refogar|grelhar|aquecer|esquentar|bake|boil|fry|simmer|roast|grill|microwave|forno|fogao|microondas|airfryer)\b/);
      if (coldStyle && !heatVerb) methods.add("frio");
    }

    return methods;
  }

  function recipeMatchesTerms(r, terms) {
    if (!terms.length) return { ok: true, score: 0, hits: [] };
    const ingsNorm = (r.ingredients || []).map((i) => normalizeText(i));
    const titleNorm = normalizeText(r.title + " " + (r.subtitle || ""));
    const blob = recipeSearchBlob(r);
    const hits = [];
    let score = 0;
    for (const term of terms) {
      const inIng = ingsNorm.some((i) => i.includes(term));
      const inTitle = titleNorm.includes(term);
      if (!inIng && !inTitle && !blob.includes(term)) {
        return { ok: false, score: 0, hits: [] };
      }
      if (inIng) {
        hits.push(term);
        score += 3;
      } else if (inTitle) {
        hits.push(term);
        score += 2;
      } else {
        hits.push(term);
        score += 1;
      }
    }
    return { ok: true, score, hits };
  }

  function searchRecipes(query, methods) {
    const terms = parseSearchTerms(query);
    state.searchTerms = terms;
    const methodFilter = Array.isArray(methods) ? methods : state.searchMethods;
    if (!terms.length && !methodFilter.length) return [];

    return state.recipes
      .map((r) => {
        const m = recipeMatchesTerms(r, terms);
        if (!m.ok) return null;
        if (!recipeMatchesDiet(r, state.diet)) return null;
        const cook = detectCookMethods(r);
        if (methodFilter.length && !methodFilter.some((id) => cook.has(id))) return null;
        const methodScore = methodFilter.length
          ? methodFilter.reduce((acc, id) => acc + (cook.has(id) ? 1 : 0), 0)
          : 0;
        return {
          recipe: r,
          score: m.score + methodScore,
          hits: m.hits,
          methods: [...cook],
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.recipe.title.localeCompare(b.recipe.title, "pt"));
  }

  function renderSearch() {
    const input = $("#searchInput");
    const listEl = $("#searchList");
    const countEl = $("#searchCountPill");
    const hintsEl = $("#searchHints");
    const methodsEl = $("#searchMethods");
    if (!listEl) return;

    if (input && state.searchQuery && !input.value) {
      input.value = state.searchQuery;
    }

    if (hintsEl) {
      hintsEl.innerHTML = SEARCH_SUGGESTIONS.map((s) =>
        `<button type="button" class="search-chip" data-search-chip="${escapeHtml(s)}">${escapeHtml(s)}</button>`
      ).join("");
    }

    if (methodsEl) {
      methodsEl.innerHTML = COOK_METHODS.map((m) => {
        const on = state.searchMethods.includes(m.id);
        return `<button type="button" class="search-chip method${on ? " active" : ""}" data-method="${m.id}" aria-pressed="${on ? "true" : "false"}">${escapeHtml(m.label)}</button>`;
      }).join("");
    }

    const q = state.searchQuery || input?.value || "";
    const results = searchRecipes(q, state.searchMethods);
    const terms = state.searchTerms;
    const hasFilter = terms.length || state.searchMethods.length;
    const dietNote = state.diet.length
      ? `<p class="diet-filter-note">${escapeHtml("Perfil: " + state.diet.map((id) => DIET_LABEL[id] || id).join(", "))}</p>`
      : "";

    if (countEl) {
      if (!hasFilter) countEl.textContent = "Escreve um alimento ou escolhe um método";
      else countEl.textContent = results.length + " receita" + (results.length === 1 ? "" : "s");
    }

    if (!hasFilter) {
      listEl.innerHTML = `${dietNote}<div class="empty-fav">Experimenta: <strong>atum</strong>, <strong>ovos</strong> ou <strong>nutella</strong>.<br />Ou filtra por <strong>Forno</strong>, <strong>Fogão</strong>, <strong>Micro-ondas</strong> ou <strong>Sem aquecer</strong>.</div>`;
      return;
    }

    if (!results.length) {
      const bits = [];
      if (terms.length) bits.push(`“${terms.join(", ")}”`);
      if (state.searchMethods.length) {
        bits.push(state.searchMethods.map((id) => COOK_METHOD_LABEL[id] || id).join(", "));
      }
      if (state.diet.length) {
        bits.push(state.diet.map((id) => DIET_LABEL[id] || id).join(", "));
      }
      listEl.innerHTML = `<div class="empty-fav">Nada encontrado com ${escapeHtml(bits.join(" · "))}.<br />Tenta outro alimento, outro método ou ajusta o perfil em Conta.</div>`;
      return;
    }

    listEl.innerHTML = dietNote + results.map((row, i) => {
      const sectionLabel = SECTIONS[row.recipe.section]?.label || row.recipe.section;
      const hitLabel = row.hits.length ? ` · tem: ${row.hits.join(", ")}` : "";
      const methodLabel = row.methods.length
        ? ` · ${row.methods.map((id) => COOK_METHOD_LABEL[id] || id).join(", ")}`
        : "";
      return recipeCard(row.recipe, {
        index: i + 1,
        subPrefix: sectionLabel + hitLabel + methodLabel,
      });
    }).join("");
  }

  function showAuth(show) {
    const auth = $("#authScreen");
    const app = $("#appShell");
    if (auth) {
      auth.hidden = !show;
      auth.setAttribute("aria-hidden", show ? "false" : "true");
    }
    if (app) {
      app.hidden = show;
      app.setAttribute("aria-hidden", show ? "true" : "false");
    }
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
    const all = state.recipes.filter((r) => r.section === section);
    const list = visibleRecipes(all);
    const root = $(`[data-screen="${section}"]`);
    const note = dietFilterNote(all.length, list.length);
    $(".screen-intro", root).innerHTML = `
      <p class="label">${meta.label}</p>
      <h1>${meta.title}</h1>
      <p>${meta.blurb}</p>
      <span class="count-pill">${list.length} receita${list.length === 1 ? "" : "s"}</span>
      ${note ? `<p class="diet-filter-note">${escapeHtml(note)}</p>` : ""}`;
    $(".list", root).innerHTML = list.map((r, i) => recipeCard(r, { index: i + 1 })).join("")
      || `<div class="empty-fav">${state.diet.length
        ? "Nenhuma receita desta secção encaixa no teu perfil.<br />Ajusta as restrições em Conta."
        : "Sem receitas aqui.<br />Toca em + para adicionar."}</div>`;
  }

  function renderFavorites() {
    const all = state.recipes.filter((r) => r.is_favorite);
    const list = visibleRecipes(all);
    const note = dietFilterNote(all.length, list.length);
    $("#favCountPill").textContent = list.length + " favorito" + (list.length === 1 ? "" : "s");
    const noteEl = $("#favDietNote");
    if (noteEl) noteEl.textContent = note;
    $("#favList").innerHTML = list.length
      ? list.map((r) => recipeCard(r, { subPrefix: SECTIONS[r.section]?.label || r.section })).join("")
      : `<div class="empty-fav">${state.diet.length && all.length
        ? "Os teus favoritos não encaixam no perfil atual.<br />Ajusta as restrições em Conta."
        : "Ainda sem favoritos.<br />Toca na ☆ numa receita para guardar."}</div>`;
  }

  function renderAccount() {
    updateAccountMeta();
    const chips = $("#dietChips");
    const status = $("#dietStatus");
    const tip = $("#dietMigrationTip");
    if (chips) {
      chips.innerHTML = DIET_OPTIONS.map((d) => {
        const on = state.diet.includes(d.id);
        return `<button type="button" class="search-chip method${on ? " active" : ""}" data-diet="${d.id}" aria-pressed="${on ? "true" : "false"}">${escapeHtml(d.label)}</button>`;
      }).join("");
    }
    if (status) {
      if (!state.diet.length) {
        status.textContent = "Sem restrições — mostram-se todas as receitas.";
      } else {
        status.textContent = "Ativo: " + state.diet.map((id) => DIET_LABEL[id] || id).join(", ")
          + ". As listas e a pesquisa já filtram por isto.";
      }
    }
    if (tip) tip.hidden = !!state.prefsReady;
  }

  function renderShopping() {
    const root = $("#shopContainer");
    if (!root) return;

    if (!state.shoppingReady) {
      root.innerHTML = `
        <div class="tip-box">
          <strong>Atualização da base de dados</strong>
          Para criares várias listas, corre no Supabase → SQL Editor o ficheiro
          <code>supabase/migration-shopping-lists.sql</code> e volta a entrar.
        </div>`;
      return;
    }

    const lists = state.shoppingLists || [];
    if (!lists.length) {
      root.innerHTML = `
        <div class="empty-fav">Ainda sem listas.<br />Toca em + Lista para criar a primeira.</div>`;
      return;
    }

    if (!state.activeListId || !lists.some((l) => l.id === state.activeListId)) {
      state.activeListId = lists[0].id;
    }

    const chips = lists.map((l) => `
      <button type="button" class="list-chip${l.id === state.activeListId ? " active" : ""}" data-list-id="${l.id}">
        ${escapeHtml(l.name)}
      </button>`).join("");

    const items = state.shopping.filter((s) => s.list_id === state.activeListId);
    const rows = items.map((item) => `
      <label class="check">
        <input type="checkbox" data-shop-id="${item.id}" ${item.checked ? "checked" : ""} />
        <span>${escapeHtml(item.label)}</span>
        <button type="button" class="del-shop" data-del-shop="${item.id}" aria-label="Apagar">✕</button>
      </label>`).join("")
      || `<p class="shop-empty">Lista vazia. Toca em + Item para adicionar.</p>`;

    const active = lists.find((l) => l.id === state.activeListId);

    root.innerHTML = `
      <div class="list-chip-row">${chips}</div>
      <div class="shop-block">
        <div class="shop-block-head">
          <h2>${escapeHtml(active?.name || "Lista")}</h2>
          <div class="shop-block-actions">
            <button type="button" class="link-btn inline" id="btnRenameList">Renomear</button>
            <button type="button" class="link-btn inline danger" id="btnDeleteList">Apagar lista</button>
          </div>
        </div>
        ${rows}
      </div>`;
  }

  async function refreshData() {
    try {
      const recipes = await MareDB.listRecipes();
      state.recipes = recipes;
      MareDB.cacheSet("recipes", recipes);

      state.shoppingReady = await MareDB.shoppingListsReady();
      if (state.shoppingReady) {
        const lists = await MareDB.listShoppingLists();
        state.shoppingLists = lists;
        if (!state.activeListId || !lists.some((l) => l.id === state.activeListId)) {
          state.activeListId = lists[0]?.id || null;
        }
        const shopping = state.activeListId
          ? await MareDB.listShopping(state.activeListId)
          : await MareDB.listShopping();
        state.shopping = shopping;
        MareDB.cacheSet("shoppingLists", lists);
        MareDB.cacheSet("shopping", shopping);
      } else {
        state.shoppingLists = [];
        state.shopping = [];
      }

      state.prefsReady = await MareDB.preferencesReady();
      try {
        const prefs = await MareDB.getPreferences();
        state.diet = prefs.diet || [];
      } catch (_) {
        state.diet = MareDB.cacheGet("preferences", { diet: [] }).diet || [];
      }
    } catch (err) {
      state.recipes = MareDB.cacheGet("recipes", []);
      state.shoppingLists = MareDB.cacheGet("shoppingLists", []);
      state.shopping = MareDB.cacheGet("shopping", []);
      state.diet = MareDB.cacheGet("preferences", { diet: [] }).diet || [];
      toast("Offline — a mostrar cache local");
      console.warn(err);
    }
    Object.keys(SECTIONS).forEach(renderSection);
    renderFavorites();
    renderShopping();
    renderAccount();
    if (state.screen === "pesquisa") renderSearch();
    updateAccountMeta();
  }

  async function toggleDiet(id) {
    if (!id) return;
    const wasOn = state.diet.includes(id);
    if (wasOn) {
      state.diet = state.diet.filter((d) => d !== id);
      if (id === "vegetarian") {
        state.diet = state.diet.filter((d) => d !== "vegan");
      }
    } else {
      state.diet = state.diet.concat(id);
      if (id === "vegan" && !state.diet.includes("vegetarian")) {
        state.diet = state.diet.concat("vegetarian");
      }
    }

    renderAccount();
    Object.keys(SECTIONS).forEach(renderSection);
    renderFavorites();
    if (state.screen === "pesquisa") renderSearch();

    try {
      await MareDB.savePreferences({ diet: state.diet });
      state.prefsReady = await MareDB.preferencesReady();
      renderAccount();
    } catch (err) {
      MareDB.cacheSet("preferences", { diet: state.diet });
      state.prefsReady = await MareDB.preferencesReady().catch(() => false);
      renderAccount();
      console.warn(err);
    }
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
    if (!state.shoppingReady) {
      toast("Corre a migração SQL das listas no Supabase primeiro.");
      return;
    }
    if (!state.activeListId) {
      toast("Cria uma lista primeiro.");
      return;
    }
    $("#shopModalTitle").textContent = "Novo item";
    $("#shopModal").hidden = false;
    $("#sLabel").value = "";
    $("#sLabel")?.focus();
  }

  function closeShopModal() {
    $("#shopModal").hidden = true;
  }

  function openListModal() {
    if (!state.shoppingReady) {
      toast("Corre a migração SQL das listas no Supabase primeiro.");
      return;
    }
    $("#listModal").hidden = false;
    $("#listName").value = "";
    $("#listName")?.focus();
  }

  function closeListModal() {
    $("#listModal").hidden = true;
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
    if (!state.activeListId) return toast("Escolhe uma lista");
    try {
      await MareDB.addShoppingItem({
        list_id: state.activeListId,
        label,
        checked: false,
        sort_order: state.shopping.filter((s) => s.list_id === state.activeListId).length,
      });
      closeShopModal();
      await refreshData();
      toast("Item adicionado");
      go("compras");
    } catch (err) {
      toast(err.message || "Erro ao adicionar");
    }
  }

  async function onListSubmit(e) {
    e.preventDefault();
    const name = $("#listName").value.trim();
    if (!name) return toast("Escreve o nome da lista");
    try {
      const list = await MareDB.createShoppingList(name);
      state.activeListId = list.id;
      closeListModal();
      await refreshData();
      toast("Lista criada");
      go("compras");
    } catch (err) {
      toast(err.message || "Erro ao criar lista");
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
    const chip = e.target.closest("[data-list-id]");
    if (chip) {
      state.activeListId = chip.dataset.listId;
      try {
        state.shopping = await MareDB.listShopping(state.activeListId);
        MareDB.cacheSet("shopping", state.shopping);
      } catch (_) { /* keep cache */ }
      renderShopping();
      return;
    }

    if (e.target.closest("#btnRenameList")) {
      const current = state.shoppingLists.find((l) => l.id === state.activeListId);
      const name = prompt("Novo nome da lista:", current?.name || "");
      if (!name || !name.trim()) return;
      try {
        await MareDB.renameShoppingList(state.activeListId, name.trim());
        await refreshData();
        toast("Lista renomeada");
      } catch (err) {
        toast(err.message || "Erro ao renomear");
      }
      return;
    }

    if (e.target.closest("#btnDeleteList")) {
      const current = state.shoppingLists.find((l) => l.id === state.activeListId);
      if (!confirm(`Apagar a lista “${current?.name || ""}” e todos os itens?`)) return;
      try {
        await MareDB.deleteShoppingList(state.activeListId);
        state.activeListId = null;
        await refreshData();
        toast("Lista apagada");
      } catch (err) {
        toast(err.message || "Erro ao apagar lista");
      }
      return;
    }

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
    if (emailEl) emailEl.textContent = state.user?.email || "";
  }

  async function afterLogin(session) {
    if (session?.access_token && MareDB.adoptSession) {
      MareDB.adoptSession(session);
    }
    state.user = session.user;
    showAuth(false);
    go("manha");
    updateAccountMeta();
    // Carrega dados em background — não bloqueia a entrada na app
    setTimeout(async () => {
      try {
        const seeded = await MareDB.seedIfEmpty();
        await refreshData();
        if (seeded) toast("Receitas e listas atualizadas");
      } catch (err) {
        console.error(err);
        toast("Não foi possível carregar os dados. Puxa para atualizar.");
      }
      updateAccountMeta();
    }, 0);
  }

  let authMode = "login"; // login | signup | recover

  function setAuthModeUi(mode) {
    authMode = mode === "signup" ? "signup" : mode === "recover" ? "recover" : "login";
    const heading = $("#authHeading");
    const sub = $("#authSub");
    const submit = $("#authSubmit");
    const alt = $("#authAltBtn");
    const pass = $("#authPassword");
    const loginBlock = $("#authLoginBlock");
    const recoverBlock = $("#authRecoverBlock");
    if ($("#authHint")) $("#authHint").hidden = true;

    if (authMode === "recover") {
      if (heading) heading.textContent = "Nova password";
      if (sub) sub.textContent = "Escolhe uma password nova para a tua conta.";
      if (loginBlock) loginBlock.hidden = true;
      if (recoverBlock) recoverBlock.hidden = false;
      return;
    }

    if (loginBlock) loginBlock.hidden = false;
    if (recoverBlock) recoverBlock.hidden = true;

    if (authMode === "signup") {
      if (heading) heading.textContent = "Criar conta";
      if (sub) sub.textContent = "Cria a tua conta para guardar receitas e a lista de compras.";
      if (submit) submit.textContent = "Criar conta";
      if (alt) alt.textContent = "Já tenho conta — Entrar";
      if (pass) pass.setAttribute("autocomplete", "new-password");
    } else {
      if (heading) heading.textContent = "Iniciar sessão";
      if (sub) sub.textContent = "Entra para ver as tuas receitas e lista de compras.";
      if (submit) submit.textContent = "Entrar";
      if (alt) alt.textContent = "Criar conta";
      if (pass) pass.setAttribute("autocomplete", "current-password");
    }
  }

  async function runAuth(mode) {
    if (state.authBusy) return;
    const email = ($("#authEmail")?.value || "").trim();
    const password = $("#authPassword")?.value || "";
    if (!email || password.length < 6) {
      authMessage("Escreve um email válido e uma password com pelo menos 6 caracteres.");
      $("#authPassword")?.focus();
      return;
    }
    if (!globalThis.MareDB) {
      authMessage("A app ainda está a carregar. Espera um segundo e tenta outra vez.");
      return;
    }
    const submit = $("#authSubmit");
    const alt = $("#authAltBtn");
    const prevLabel = submit ? submit.textContent : "Entrar";
    state.authBusy = true;
    if (submit) {
      submit.disabled = true;
      submit.textContent = mode === "signup" ? "A criar…" : "A entrar…";
    }
    if (alt) alt.disabled = true;
    if ($("#authHint")) $("#authHint").hidden = true;
    try {
      const data = mode === "signup"
        ? await MareDB.signUp(email, password)
        : await MareDB.signIn(email, password);
      if (!data?.session?.user) throw new Error("Não foi possível entrar.");
      await afterLogin(data.session);
    } catch (err) {
      console.error(err);
      authMessage(err.message || "Não foi possível entrar.");
      showAuth(true);
    } finally {
      state.authBusy = false;
      if (submit) {
        submit.disabled = false;
        submit.textContent = prevLabel;
      }
      if (alt) alt.disabled = false;
    }
  }

  function initAuthForm() {
    const form = $("#authForm");
    setAuthModeUi("login");

    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      e.stopPropagation();
      runAuth(authMode);
    });

    $("#authAltBtn")?.addEventListener("click", () => {
      if (authMode === "login") setAuthModeUi("signup");
      else setAuthModeUi("login");
    });

    $("#authForgot")?.addEventListener("click", async () => {
      const email = ($("#authEmail")?.value || "").trim();
      if (!email) {
        authMessage("Escreve o teu email primeiro.");
        return;
      }
      try {
        await MareDB.recoverPassword(email);
        authMessage(
          "Email enviado. Se o link abrir localhost:3000, troca só essa parte por https://dsvilaca.github.io/travelfoodrecipes/ e mantém o resto do link (incluindo o #...)."
        );
      } catch (err) {
        authMessage(err.message || "Não foi possível enviar o email.");
      }
    });

    $("#recoverForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (state.authBusy) return;
      const p1 = $("#recoverPassword")?.value || "";
      const p2 = $("#recoverPassword2")?.value || "";
      if (p1.length < 6) {
        authMessage("A password precisa de pelo menos 6 caracteres.");
        return;
      }
      if (p1 !== p2) {
        authMessage("As passwords não coincidem.");
        return;
      }
      const submit = $("#recoverSubmit");
      state.authBusy = true;
      if (submit) {
        submit.disabled = true;
        submit.textContent = "A guardar…";
      }
      try {
        await MareDB.updatePassword(p1);
        MareDB.clearAuthParamsFromUrl();
        const session = await MareDB.getSession();
        if (!session?.user) throw new Error("Password guardada. Entra com a nova password.");
        toast("Password atualizada");
        await afterLogin(session);
      } catch (err) {
        authMessage(err.message || "Não foi possível atualizar a password.");
        showAuth(true);
      } finally {
        state.authBusy = false;
        if (submit) {
          submit.disabled = false;
          submit.textContent = "Guardar password";
        }
      }
    });

    $("#recoverCancel")?.addEventListener("click", () => {
      MareDB.clearAuthParamsFromUrl();
      setAuthModeUi("login");
    });
  }

  async function handleAuthRedirect() {
    const params = MareDB.parseAuthParamsFromUrl?.();
    if (!params) return false;

    if (params.error) {
      authMessage(params.error_description || params.error || "Link de recuperação inválido.");
      MareDB.clearAuthParamsFromUrl();
      return false;
    }

    if (!params.access_token || !params.refresh_token) return false;

    const expiresAt = params.expires_at
      || (params.expires_in ? Math.floor(Date.now() / 1000) + Number(params.expires_in) : null);

    // Precisamos do user — pedimos /auth/v1/user
    try {
      const cfg = globalThis.MARE_CONFIG || {};
      const res = await fetch(cfg.supabaseUrl + "/auth/v1/user", {
        headers: {
          apikey: cfg.supabaseAnonKey,
          Authorization: "Bearer " + params.access_token,
        },
      });
      const user = await res.json();
      if (!res.ok || !user?.id) throw new Error("Link inválido ou expirado.");
      const session = MareDB.adoptSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
        expires_at: expiresAt,
        user,
      });
      if (params.type === "recovery") {
        setAuthModeUi("recover");
        showAuth(true);
        authMessage("Link válido. Escolhe a tua nova password.");
        return true;
      }
      await afterLogin(session);
      MareDB.clearAuthParamsFromUrl();
      return true;
    } catch (err) {
      authMessage(err.message || "Não foi possível abrir o link de recuperação.");
      MareDB.clearAuthParamsFromUrl();
      return false;
    }
  }

  function wireUi() {
    $$(".tab").forEach((tab) => tab.addEventListener("click", () => go(tab.dataset.go)));
    $("#btnAddRecipe")?.addEventListener("click", () => openRecipeModal(null));
    $("#btnSearch")?.addEventListener("click", () => go("pesquisa"));
    $("#btnAddShop")?.addEventListener("click", openShopModal);
    $("#btnAddList")?.addEventListener("click", openListModal);

    let searchTimer = null;
    const runSearch = () => {
      state.searchQuery = $("#searchInput")?.value || "";
      renderSearch();
    };
    $("#searchInput")?.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(runSearch, 160);
    });
    $("#searchInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        clearTimeout(searchTimer);
        runSearch();
      }
    });
    $("#searchHints")?.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-search-chip]");
      if (!chip) return;
      const term = chip.dataset.searchChip;
      const input = $("#searchInput");
      if (!input) return;
      const cur = (input.value || "").trim();
      const next = cur ? (cur.replace(/[,;\s]+$/, "") + ", " + term) : term;
      input.value = next;
      state.searchQuery = next;
      renderSearch();
      input.focus();
    });
    $("#searchMethods")?.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-method]");
      if (!chip) return;
      const id = chip.dataset.method;
      if (!id) return;
      const i = state.searchMethods.indexOf(id);
      if (i >= 0) state.searchMethods.splice(i, 1);
      else state.searchMethods.push(id);
      renderSearch();
    });
    $("#dietChips")?.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-diet]");
      if (!chip) return;
      toggleDiet(chip.dataset.diet);
    });
    document.addEventListener("click", (e) => {
      if (e.target.closest("#searchList")) handleListClick(e);
    });
    $("#recipeForm")?.addEventListener("submit", onRecipeSubmit);
    $("#shopForm")?.addEventListener("submit", onShopSubmit);
    $("#listForm")?.addEventListener("submit", onListSubmit);
    $("#recipeModalClose")?.addEventListener("click", closeRecipeModal);
    $("#shopModalClose")?.addEventListener("click", closeShopModal);
    $("#listModalClose")?.addEventListener("click", closeListModal);
    $("#btnLogout")?.addEventListener("click", async () => {
      try { await MareDB.signOut(); } catch (_) { /* ignore */ }
      state.user = null;
      state.diet = [];
      state.prefsReady = true;
      showAuth(true);
      toast("Sessão terminada");
    });

    document.addEventListener("click", (e) => {
      if (e.target.closest(".list, #favList")) handleListClick(e);
    });
    $("#shopContainer")?.addEventListener("click", handleShopClick);
    $("#shopContainer")?.addEventListener("change", handleShopClick);

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
    $("#statusBtn")?.addEventListener("click", () => {
      toast(navigator.onLine ? "Online" : "Offline — cache local");
    });
  }

  async function boot() {
    try {
      await initAuthForm();
      wireUi();
      updateOnline();
      showAuth(true);

      if (!globalThis.MareDB) {
        authMessage("A app ainda está a carregar. Recarrega a página.");
        return;
      }

      const fromLink = await handleAuthRedirect();
      if (fromLink) return;

      const session = await MareDB.getSession();
      if (session && !MareDB.isLocalMode()) {
        await afterLogin(session);
      } else {
        showAuth(true);
      }
    } catch (err) {
      console.error(err);
      showAuth(true);
      authMessage(err.message || "Erro ao iniciar a app");
    }
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
