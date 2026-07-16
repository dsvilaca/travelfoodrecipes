/* Estimativas nutricionais com base na TCA INSA / PortFIR */
(function (global) {
  const SKIP = new Set([
    "sal", "pimenta", "pimenta preta", "pimenta branca", "sal e pimenta",
    "agua", "agua morna", "qb", "q b", "a gosto", "para provar", "provar",
    "enrolar", "opcional",
  ]);

  // Preferências de correspondência → nomes da TCA (normalizados)
  const PREFER = {
    ovo: "ovo de galinha inteiro cru",
    ovos: "ovo de galinha inteiro cru",
    "ovos grandes": "ovo de galinha inteiro cru",
    "ovo grande": "ovo de galinha inteiro cru",
    "gemas de ovo": "gema de ovo de galinha crua",
    "gema de ovo": "gema de ovo de galinha crua",
    "clara de ovo": "clara de ovo de galinha crua",
    manteiga: "manteiga sem sal",
    "manteiga sem sal": "manteiga sem sal",
    azeite: "azeite 4 marcas",
    leite: "leite meio gordo uht",
    "leite meio gordo": "leite meio gordo uht",
    farinha: "farinha de trigo tipo 65",
    "farinha simples": "farinha de trigo tipo 65",
    "farinha multiuso": "farinha de trigo tipo 65",
    "farinha de trigo": "farinha de trigo tipo 65",
    acucar: "acucar branco",
    "acucar refinado": "acucar branco",
    "acucar mascavo": "acucar amarelo",
    frango: "frango peito sem pele cru",
    "peito de frango": "frango peito sem pele cru",
    "coxas de frango": "frango coxa com pele crua",
    atum: "atum conserva em oleo",
    "atum em conserva": "atum conserva em oleo",
    pao: "pao de trigo",
    "pao de forma": "pao de trigo",
    banana: "banana",
    mel: "mel",
    alho: "alho cru",
    cebola: "cebola crua",
    tomate: "tomate cru",
    arroz: "arroz agulha cru",
    aveia: "flocos de aveia",
    "flocos de aveia": "flocos de aveia",
    granola: "flocos de cereais e frutos secos tipo muesli",
    muesli: "flocos de cereais e frutos secos tipo muesli",
    amendoim: "amendoim miolo",
    "pasta amendoim": "amendoim miolo",
    "manteiga de amendoim": "amendoim miolo",
    bacon: "bacon",
    fiambre: "fiambre perna",
    natas: "nata pasteurizada 33 gordura",
    nata: "nata pasteurizada 33 gordura",
    creme: "nata pasteurizada 33 gordura",
    "iogurte grego": "iogurte grego natural",
    iogurte: "iogurte meio gordo natural",
    chocolate: "chocolate de leite tablete",
    nutella: "creme para barrar de cacau e avelas",
    nutela: "creme para barrar de cacau e avelas",
    cacau: "cacau em po",
    canela: "canela moida",
    limao: "limao",
    "sumo de limao": "limao",
    massa: "massa com ovo crua",
    esparguete: "esparguete cru",
    batata: "batata crua",
    azeitonas: "azeitona",
    azeitona: "azeitona",
    "carne picada": "carne de vaca picada crua",
    "carne bovina": "carne de vaca picada crua",
    salmao: "salmao cru",
    "iogurte grego": "iogurte grego natural",
    abacate: "abacate hass",
    maionese: "maionese",
    mostarda: "mostarda",
    alface: "alface",
    cogumelos: "cogumelos generico",
    salsa: "salsa",
    "queijo fresco": "queijo fresco meio gordo",
    queijo: "queijo flamengo 1 4 gordo",
    mozzarella: "queijo mozzarella fresco",
    mussarela: "queijo mozzarella fresco",
    parmesao: "queijo parmesao",
    cheddar: "queijo cheddar",
    ricota: "requeijao",
    wrap: "pao de trigo",
    tortilha: "pao de trigo",
  };

  const UNIT_G = {
    g: 1,
    gr: 1,
    grama: 1,
    gramas: 1,
    kg: 1000,
    ml: 1,
    cl: 10,
    dl: 100,
    l: 1000,
    litro: 1000,
    litros: 1000,
    tsp: 5,
    tbsp: 15,
    oz: 28,
    lb: 454,
    libra: 454,
    libras: 454,
  };

  let index = null;
  let foodsNorm = null;

  function normalize(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getTca() {
    return global.MARE_TCA || null;
  }

  function ensureIndex() {
    if (foodsNorm) return;
    const tca = getTca();
    foodsNorm = [];
    index = new Map();
    if (!tca?.foods) return;
    for (const f of tca.foods) {
      const key = normalize(f.name);
      const row = { ...f, key, tokens: key.split(" ").filter((t) => t.length >= 2) };
      foodsNorm.push(row);
      for (const t of row.tokens) {
        if (!index.has(t)) index.set(t, []);
        index.get(t).push(row);
      }
    }
  }

  function parseFraction(s) {
    if (!s) return null;
    s = String(s).trim().replace(",", ".");
    if (/^\d+\s+\d+\/\d+$/.test(s)) {
      const [w, frac] = s.split(/\s+/);
      const [a, b] = frac.split("/").map(Number);
      return Number(w) + a / b;
    }
    if (/^\d+\/\d+$/.test(s)) {
      const [a, b] = s.split("/").map(Number);
      return a / b;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function parseIngredient(line) {
    const raw = String(line || "").trim();
    if (!raw) return null;
    let text = normalize(raw);
    if (!text || SKIP.has(text)) return null;

    // "sal e pimenta", "a gosto"
    if (/^(sal|pimenta)\b/.test(text) && text.length < 24) return null;
    if (/\b(a gosto|qb|q b|para provar)\b/.test(text)) {
      text = text.replace(/\b(a gosto|qb|q b|para provar).*$/, "").trim();
      if (!text || SKIP.has(text)) return null;
    }

    let grams = null;
    let foodText = text;

    // N g / N ml
    let m = text.match(/^(\d+[\d\s\/\.]*?)\s*(g|gr|gramas?|kg|ml|cl|dl|l|litros?|oz|lb|libras?)\b\s*(?:de\s+)?(.+)$/);
    if (m) {
      const qty = parseFraction(m[1].replace(/\s+/g, " "));
      const unit = m[2];
      foodText = m[3];
      if (qty != null) grams = qty * (UNIT_G[unit] || 1);
    }

    // N colher(es) de sopa/chá de X
    if (grams == null) {
      m = text.match(/^(\d+[\d\s\/\.]*)\s*colheres?\s+de\s+(sopa|cha)\s+(?:de\s+)?(.+)$/);
      if (m) {
        const qty = parseFraction(m[1]);
        foodText = m[3];
        if (qty != null) grams = qty * (m[2] === "sopa" ? 15 : 5);
      }
    }

    // N xícara(s) / chávena(s) de X
    if (grams == null) {
      m = text.match(/^(\d+[\d\s\/\.]*)\s*(?:xicaras?|chavenas?|cups?)\s+(?:de\s+)?(.+)$/);
      if (m) {
        const qty = parseFraction(m[1]);
        foodText = m[2];
        // farinha ~120g; líquidos/açúcar ~200g; genérico 150g
        const dens = /\b(farinha|aveia|flocos)\b/.test(foodText) ? 120
          : /\b(acucar|leite|agua|oleo|azeite)\b/.test(foodText) ? 200
          : 150;
        if (qty != null) grams = qty * dens;
      }
    }

    // N dente(s) de alho
    if (grams == null) {
      m = text.match(/^(\d+[\d\s\/\.]*)\s*dentes?\s+(?:de\s+)?(.+)$/);
      if (m) {
        const qty = parseFraction(m[1]);
        foodText = m[2];
        if (qty != null) grams = qty * 3;
      }
    }

    // N fatia(s) de X
    if (grams == null) {
      m = text.match(/^(\d+[\d\s\/\.]*)\s*fatias?\s+(?:de\s+)?(.+)$/);
      if (m) {
        const qty = parseFraction(m[1]);
        foodText = m[2];
        if (qty != null) grams = qty * (/pao|wrap|tortilha/.test(foodText) ? 30 : 25);
      }
    }

    // N ovos / N ovo
    if (grams == null) {
      m = text.match(/^(\d+[\d\s\/\.]*)\s+(ovos?|gemas?|claras?)(?:\s+(.+))?$/);
      if (m) {
        const qty = parseFraction(m[1]);
        const kind = m[2];
        foodText = (kind + (m[3] ? " " + m[3] : "")).trim();
        const each = kind.startsWith("gema") ? 18 : kind.startsWith("clara") ? 33 : 55;
        if (qty != null) grams = qty * each;
      }
    }

    // bare "ovos" / "ovo"
    if (grams == null && /^(ovos?|gemas?|claras?)(\s|$)/.test(text)) {
      m = text.match(/^(ovos?|gemas?|claras?)(?:\s+(.+))?$/);
      if (m) {
        foodText = text;
        const kind = m[1];
        const each = kind.startsWith("gema") ? 18 : kind.startsWith("clara") ? 33 : 55;
        grams = each;
      }
    }

    // leading number without unit → count heuristic
    if (grams == null) {
      m = text.match(/^(\d+[\d\s\/\.]*)\s+(.+)$/);
      if (m) {
        const qty = parseFraction(m[1].replace(/\s+/g, " "));
        foodText = m[2];
        if (qty != null && qty <= 20) {
          if (/\b(ovos?)\b/.test(foodText)) grams = qty * 55;
          else if (/\b(dentes?|alho)\b/.test(foodText)) grams = qty * 3;
          else if (/\b(banana|abacate|tomate|cebola)\b/.test(foodText)) grams = qty * 100;
          else if (/\b(limao|lima)\b/.test(foodText)) grams = qty * 60;
          else grams = qty * 50; // fallback count
        } else if (qty != null && qty > 20) {
          // assume grams if large number without unit
          grams = qty;
        }
      }
    }

    foodText = foodText
      .replace(/^(de|do|da|dos|das)\s+/, "")
      .replace(/\b(picad[oa]s?|ralad[oa]s?|frescos?|grandes?|medios?|pequenos?|derretid[oa]|sem sal|com sal)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!foodText || foodText.length < 2 || SKIP.has(foodText)) return null;
    if (grams == null || !(grams > 0)) {
      // quantidades típicas quando a receita não indica peso
      if (/\b(manteiga|margarina|azeite|oleo|óleo)\b/.test(foodText)) grams = 10;
      else if (/\b(mel|xarope|molho|maionese|mostarda)\b/.test(foodText)) grams = 15;
      else if (/\b(alho|canela|orégão|oregao|tomilho|cominhos|pimentao|paprika)\b/.test(foodText)) grams = 2;
      else if (/\b(ovos?)\b/.test(foodText)) grams = 55;
      else if (/\b(pao|wrap|tortilha)\b/.test(foodText)) grams = 40;
      else if (/\b(leite|iogurte|nata|natas|agua)\b/.test(foodText)) grams = 100;
      else grams = 40;
    }

    return { raw, foodText, grams };
  }

  function candidatePool(tokens) {
    ensureIndex();
    const seen = new Set();
    const out = [];
    for (const t of tokens) {
      const list = index.get(t);
      if (!list) continue;
      for (const f of list) {
        if (seen.has(f.id)) continue;
        seen.add(f.id);
        out.push(f);
      }
    }
    return out.length ? out : foodsNorm;
  }

  function scoreFood(food, tokens, preferKey) {
    const key = food.key;
    let sc = 0;
    if (preferKey && key === preferKey) return 1000;
    if (preferKey && key.includes(preferKey)) sc += 40;

    let hits = 0;
    for (const t of tokens) {
      if (t.length < 2) continue;
      if (key === t) { sc += 20; hits++; }
      else if (key.startsWith(t + " ")) { sc += 12; hits++; }
      else if (new RegExp("(?:^|\\s)" + t + "(?:\\s|$)").test(key)) { sc += 8; hits++; }
      else if (key.includes(t)) { sc += 2; hits++; }
    }
    if (!hits) return -1;

    if (/\bcru\b/.test(key)) sc += 4;
    if (/\b(com | a |ao |à |estufad|frit|grelhad|assado|cozid|bolo|sopa|arroz de)\b/.test(key)
      && tokens.length <= 2) sc -= 6;
    if (tokens[0] && key.startsWith(tokens[0])) sc += 3;
    sc -= Math.min(key.length, 80) / 40;
    return sc;
  }

  function matchFood(foodText) {
    ensureIndex();
    if (!foodsNorm?.length) return null;
    const normFood = normalize(foodText);
    let preferKey = PREFER[normFood] || null;
    if (!preferKey) {
      // tentar primeiras 1–3 palavras
      const parts = normFood.split(" ");
      for (let n = Math.min(3, parts.length); n >= 1; n--) {
        const k = parts.slice(0, n).join(" ");
        if (PREFER[k]) { preferKey = PREFER[k]; break; }
      }
    }

    const tokens = normFood.split(" ").filter((t) => t.length >= 2 && !["de", "do", "da", "com", "sem", "para", "e"].includes(t));
    if (!tokens.length) return null;

    const pool = candidatePool(preferKey ? preferKey.split(" ").concat(tokens) : tokens);
    let best = null;
    let bestScore = -1;
    for (const f of pool) {
      const sc = scoreFood(f, tokens, preferKey);
      if (sc > bestScore) {
        bestScore = sc;
        best = f;
      }
    }
    if (!best || bestScore < 6) return null;
    return best;
  }

  function estimateRecipe(recipe) {
    const tca = getTca();
    const ingredients = recipe?.ingredients || [];
    const lines = [];
    let matched = 0;
    let totalG = 0;
    let kcal = 0;
    let protein = 0;
    let carbs = 0;
    let fat = 0;

    for (const ing of ingredients) {
      const parsed = parseIngredient(ing);
      if (!parsed) {
        lines.push({ raw: ing, skipped: true });
        continue;
      }
      const food = matchFood(parsed.foodText);
      if (!food) {
        lines.push({ raw: ing, foodText: parsed.foodText, grams: parsed.grams, unmatched: true });
        continue;
      }
      const factor = parsed.grams / 100;
      const row = {
        raw: ing,
        foodText: parsed.foodText,
        grams: Math.round(parsed.grams),
        match: food.name,
        kcal: food.kcal * factor,
        protein: food.protein * factor,
        carbs: food.carbs * factor,
        fat: food.fat * factor,
      };
      lines.push(row);
      matched++;
      totalG += parsed.grams;
      kcal += row.kcal;
      protein += row.protein;
      carbs += row.carbs;
      fat += row.fat;
    }

    const totalLines = ingredients.length;
    const coverage = totalLines ? Math.round((matched / totalLines) * 100) : 0;
    const ok = matched > 0 && coverage >= 30;

    return {
      ok,
      coverage,
      matched,
      totalLines,
      totalG: Math.round(totalG),
      kcal: Math.round(kcal),
      protein: Math.round(protein),
      carbs: Math.round(carbs),
      fat: Math.round(fat),
      lines,
      source: tca?.source || "",
      url: tca?.url || "https://portfir.insa.min-saude.pt/",
      version: tca?.version || "",
    };
  }

  function formatBlock(est) {
    if (!est?.ok) {
      return `<div class="nutrition">
        <h3>Nutrição</h3>
        <p class="nutrition-miss">Ainda sem estimativa fiável para esta receita (${est?.coverage || 0}% dos ingredientes reconhecidos).</p>
        <p class="nutrition-source">Fonte de referência: <a href="https://portfir.insa.min-saude.pt/" target="_blank" rel="noopener">TCA INSA / PortFIR</a></p>
      </div>`;
    }
    return `<div class="nutrition">
      <h3>Nutrição <span class="nutrition-tag">estimativa</span></h3>
      <div class="nutrition-grid">
        <div><strong>${est.kcal}</strong><span>kcal</span></div>
        <div><strong>${est.protein} g</strong><span>Proteína</span></div>
        <div><strong>${est.carbs} g</strong><span>Hidratos</span></div>
        <div><strong>${est.fat} g</strong><span>Lípidos</span></div>
      </div>
      <p class="nutrition-note">Valores para a receita completa · ${est.coverage}% dos ingredientes mapeados</p>
      <p class="nutrition-source">Fonte: ${escape(est.source)} · <a href="${escape(est.url)}" target="_blank" rel="noopener">PortFIR</a></p>
    </div>`;
  }

  function escape(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  global.MareNutrition = {
    estimateRecipe,
    formatBlock,
    parseIngredient,
    matchFood,
  };
})(window);
