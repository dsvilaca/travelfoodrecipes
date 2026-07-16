/* Estimativas nutricionais (macros) com base na TCA INSA / PortFIR */
(function (global) {
  const SKIP = new Set([
    "sal", "pimenta", "pimenta preta", "pimenta branca", "sal e pimenta",
    "agua", "agua morna", "qb", "q b", "a gosto", "para provar", "provar",
    "enrolar", "opcional", "pitada", "pitada de sal", "pitada de sal e pimenta",
    "1 pitada de sal e pimenta",
  ]);

  // Preferências → nomes TCA normalizados (sem acentos/pontuação)
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
    "oleo": "oleo alimentar",
    "oleo vegetal": "oleo alimentar",
    "oleo alimentar": "oleo alimentar",
    "oleo de girassol": "oleo de girassol",
    leite: "leite meio gordo uht",
    "leite meio gordo": "leite meio gordo uht",
    farinha: "farinha de trigo tipo 65",
    "farinha simples": "farinha de trigo tipo 65",
    "farinha multiuso": "farinha de trigo tipo 65",
    "farinha de trigo": "farinha de trigo tipo 65",
    acucar: "acucar branco",
    "acucar refinado": "acucar branco",
    "acucar mascavo": "acucar amarelo",
    "acucar de confeiteiro": "acucar branco",
    "acucar em po": "acucar branco",
    frango: "frango peito sem pele cru",
    "peito de frango": "frango peito sem pele cru",
    "coxas de frango": "frango perna sem pele crua",
    "coxa de frango": "frango perna sem pele crua",
    atum: "atum conserva em oleo",
    "atum escorrido": "atum conserva em oleo",
    "atum em conserva": "atum conserva em oleo",
    "lata de atum": "atum conserva em oleo",
    paprika: "colorau",
    paprica: "colorau",
    colorau: "colorau",
    cominhos: "cominhos",
    pao: "pao de trigo",
    "pao de forma": "pao de trigo",
    banana: "banana",
    bananas: "banana",
    mel: "mel",
    alho: "alho cru",
    "alho em po": "alho em po",
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
    amendoa: "amendoa miolo com pele",
    amendoas: "amendoa miolo com pele",
    noz: "noz miolo",
    nozes: "noz miolo",
    morango: "morango",
    morangos: "morango",
    framboesa: "framboesa",
    framboesas: "framboesa",
    amora: "amora",
    amoras: "amora",
    cenoura: "cenoura crua",
    cenouras: "cenoura crua",
    bacon: "bacon",
    fiambre: "fiambre perna",
    natas: "nata pasteurizada 33 gordura",
    nata: "nata pasteurizada 33 gordura",
    "creme duplo": "nata pasteurizada 33 gordura",
    "creme de leite": "nata pasteurizada 33 gordura",
    "creme fraiche": "nata pasteurizada 33 gordura",
    "creme de coco": "leite de coco enlatado",
    "leite de coco": "leite de coco enlatado",
    "iogurte grego": "iogurte grego natural",
    iogurte: "iogurte meio gordo natural",
    chocolate: "chocolate de leite tablete",
    nutella: "creme para barrar de cacau e avelas",
    nutela: "creme para barrar de cacau e avelas",
    cacau: "cacau em po",
    canela: "canela moida",
    "canela em po": "canela moida",
    "canela moida": "canela moida",
    "fermento em po": "fermento em po",
    fermento: "fermento em po",
    limao: "limao",
    "sumo de limao": "limao",
    "suco de limao": "limao",
    massa: "massa com ovo crua",
    esparguete: "esparguete cru",
    batata: "batata crua",
    batatas: "batata crua",
    azeitonas: "azeitona",
    azeitona: "azeitona",
    "carne picada": "vaca hamburguer cru",
    "carne bovina": "vaca hamburguer cru",
    "carne de vaca": "vaca hamburguer cru",
    salmao: "salmao cru",
    abacate: "abacate hass",
    maionese: "maionese caseira com ovo e azeite",
    mostarda: "condimento de mostarda",
    alface: "alface",
    cogumelos: "cogumelos generico",
    salsa: "salsa fresca",
    "queijo fresco": "queijo fresco meio gordo",
    queijo: "queijo flamengo",
    mozzarella: "queijo mozzarella fresco",
    mussarela: "queijo mozzarella fresco",
    parmesao: "queijo parmesao",
    cheddar: "queijo cheddar",
    ricota: "requeijao de vaca",
    requeijao: "requeijao de vaca",
    wrap: "pao de trigo",
    tortilha: "pao de trigo",
    tortilhas: "pao de trigo",
  };

  const UNIT_G = {
    g: 1,
    gr: 1,
    grama: 1,
    gramas: 1,
    kg: 1000,
    // ml/cl/dl/l convertidos via densityMl()
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

  const STOP_TOKENS = new Set([
    "de", "do", "da", "dos", "das", "com", "sem", "para", "e", "ou",
    "em", "ao", "a", "o", "as", "os", "um", "uma", "tipo",
    "colher", "colheres", "sopa", "cha", "xicara", "xicaras", "chavena", "chavenas",
    "fatia", "fatias", "dente", "dentes", "unidade", "unidades", "lata", "latas",
  ]);

  let index = null;
  let foodsNorm = null;

  /** Normaliza nomes de alimentos (sem barras — usado no índice TCA). */
  function normalize(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Normaliza texto de quantidade preservando frações 1/2 e decimais 7.5 / 7,5. */
  function normalizeQty(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/½/g, " 1/2 ")
      .replace(/¼/g, " 1/4 ")
      .replace(/¾/g, " 3/4 ")
      .replace(/⅓/g, " 1/3 ")
      .replace(/⅔/g, " 2/3 ")
      // preservar . e , (decimais) — senão "7.5 g" vira "7 5 g" e explode as macros
      .replace(/[^a-z0-9\s\/.,]/g, " ")
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
      if (!b) return null;
      return Number(w) + a / b;
    }
    if (/^\d+\/\d+$/.test(s)) {
      const [a, b] = s.split("/").map(Number);
      if (!b) return null;
      return a / b;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  /** Densidade aproximada g/ml para converter volume → massa. */
  function densityMl(foodText) {
    const t = foodText || "";
    if (/\b(azeite|oleo|óleo|oil)\b/.test(t)) return 0.91;
    if (/\b(mel|xarope|maple|agave)\b/.test(t)) return 1.4;
    if (/\b(nata|natas|creme|chantilly)\b/.test(t)) return 1.0;
    if (/\b(leite|iogurte|agua|vinagre|sumo|suco|vinho|cerveja)\b/.test(t)) return 1.03;
    return 1.0;
  }

  function volumeToGrams(qty, unit, foodText) {
    const ml = qty * (UNIT_G[unit] || 1);
    if (unit === "g" || unit === "gr" || unit === "grama" || unit === "gramas" || unit === "kg"
      || unit === "oz" || unit === "lb" || unit === "libra" || unit === "libras"
      || unit === "tsp" || unit === "tbsp") {
      return qty * (UNIT_G[unit] || 1);
    }
    // ml, cl, dl, l — aplicar densidade
    if (unit === "ml" || unit === "cl" || unit === "dl" || unit === "l" || unit === "litro" || unit === "litros") {
      return ml * densityMl(foodText);
    }
    return ml;
  }

  function cleanFoodText(text) {
    return String(text || "")
      .replace(/^(de|do|da|dos|das)\s+/, "")
      // não remover "picad*" — faz parte de nomes como "carne picada"
      .replace(/\b(ralad[oa]s?|frescos?|grandes?|medios?|pequenos?|derretid[oa]|sem sal|com sal|escorrid[oa]s?)\b/g, " ")
      .replace(/\b(colher(?:es)?|xicaras?|chavenas?|cups?|fatias?|dentes?|unidades?)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseIngredient(line) {
    const raw = String(line || "").trim();
    if (!raw) return null;

    let grams = null;
    let parenFood = null;
    let parenUnit = null;
    const paren = raw.match(/\((\d+[.,]?\d*)\s*(g|ml)\)/i);
    if (paren) {
      const pq = Number(String(paren[1]).replace(",", "."));
      parenUnit = paren[2].toLowerCase();
      parenFood = normalizeQty(raw.replace(/\([^)]*\)/g, " "));
      // gramas do parênteses — densidade se ml
      grams = parenUnit === "ml" ? pq * densityMl(parenFood) : pq;
    }

    let text = normalizeQty(raw);
    if (!text || SKIP.has(normalize(text))) return null;

    if (/\bpitada\b/.test(text)) return null;
    if (/^(sal|pimenta)\b/.test(text) && text.length < 28) return null;
    if (/\b(a gosto|qb|q b|para provar)\b/.test(text)) {
      text = text.replace(/\b(a gosto|qb|q b|para provar).*$/, "").trim();
      if (!text || SKIP.has(normalize(text))) return null;
    }

    // Água — irrelevante para macros
    if (/^\d[\d\s\/\.]*\s*(ml|cl|dl|l|litros?|xicaras?|chavenas?|cups?)?\s*(de\s+)?agua\b/.test(text)
      || /\bagua\b/.test(text) && !/\b(de coco|tonica|com gas)\b/.test(text) && text.split(/\s+/).length <= 5) {
      if (/\bagua\b/.test(text) && !/\b(de coco|tonica)\b/.test(text)) return null;
    }

    let foodText = parenFood || text;
    let m;

    if (grams != null && parenFood) {
      foodText = parenFood
        .replace(/^\d+[\d\s\/\.]*\s*/, "")
        .replace(/^(fatias?|unidades?|latas?|colher(?:es)?)\s+(de\s+)?/, "")
        .replace(/^(sopa|cha)\s+(de\s+)?/, "")
        .replace(/^colher(?:es)?\s+de\s+(?:cha|sopa)\s+(?:de\s+)?/, "")
        .replace(/^(ovos?|ovo)\b/, "ovo")
        .replace(/\b\d+[.,]?\d*\s*(g|ml)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (parenUnit === "ml") grams = Number(String(paren[1]).replace(",", ".")) * densityMl(foodText);
    }

    // N g / N ml / …
    if (grams == null) {
      m = text.match(/^(\d+(?:\s+\d+\/\d+|\/\d+)?|\d+[.,]\d+)\s*(g|gr|gramas?|kg|ml|cl|dl|l|litros?|oz|lb|libras?)\b\s*(?:de\s+)?(.+)$/);
      if (m) {
        const qty = parseFraction(m[1].replace(/\s+/g, " "));
        const unit = m[2];
        foodText = m[3];
        if (qty != null) grams = volumeToGrams(qty, unit, foodText);
      }
    }

    // N colher(es) de sopa/chá de X  — singular e plural
    if (grams == null) {
      m = text.match(/^(\d+(?:\s+\d+\/\d+|\/\d+)?|\d+[.,]\d+)\s*colher(?:es)?\s+de\s+(sopa|cha)\s+(?:de\s+)?(.+)$/);
      if (m) {
        const qty = parseFraction(m[1].replace(/\s+/g, " "));
        foodText = m[3];
        if (qty != null) grams = qty * (m[2] === "sopa" ? 15 : 5);
      }
    } else if (/\bcolher(?:es)?\s+de\s+(sopa|cha)\b/.test(text)) {
      m = text.match(/colher(?:es)?\s+de\s+(?:sopa|cha)\s+(?:de\s+)?(.+)$/);
      if (m) foodText = m[1].replace(/\b\d+[.,]?\d*\s*(g|ml)\b/g, " ").replace(/\s+/g, " ").trim();
    }

    // N xícara(s) / chávena(s) de X
    if (grams == null) {
      m = text.match(/^(\d+(?:\s+\d+\/\d+|\/\d+)?|\d+[.,]\d+)\s*(?:xicaras?|chavenas?|cups?)\s+(?:de\s+)?(.+)$/);
      if (m) {
        const qty = parseFraction(m[1].replace(/\s+/g, " "));
        foodText = m[2];
        const dens = /\b(farinha|aveia|flocos)\b/.test(foodText) ? 120
          : /\b(acucar|leite|agua|oleo|azeite)\b/.test(foodText) ? 200
          : 150;
        if (qty != null) grams = qty * dens;
      }
    }

    // N dente(s) de alho
    if (grams == null) {
      m = text.match(/^(\d+(?:\s+\d+\/\d+|\/\d+)?|\d+[.,]\d+)\s*dentes?\s+(?:de\s+)?(.+)$/);
      if (m) {
        const qty = parseFraction(m[1].replace(/\s+/g, " "));
        foodText = m[2];
        if (qty != null) grams = qty * 3;
      }
    }

    // N fatia(s) de X
    if (grams == null) {
      m = text.match(/^(\d+(?:\s+\d+\/\d+|\/\d+)?|\d+[.,]\d+)\s*fatias?\s+(?:de\s+)?(.+)$/);
      if (m) {
        const qty = parseFraction(m[1].replace(/\s+/g, " "));
        foodText = m[2];
        if (qty != null) grams = qty * (/pao|wrap|tortilha/.test(foodText) ? 30 : 25);
      }
    }

    // N ovos / gemas / claras
    if (grams == null) {
      m = text.match(/^(\d+(?:\s+\d+\/\d+|\/\d+)?|\d+[.,]\d+)\s+(ovos?|gemas?|claras?)(?:\s+(.+))?$/);
      if (m) {
        const qty = parseFraction(m[1].replace(/\s+/g, " "));
        const kind = m[2];
        foodText = (kind + (m[3] ? " " + m[3] : "")).trim();
        const each = kind.startsWith("gema") ? 18 : kind.startsWith("clara") ? 33 : 55;
        if (qty != null) grams = qty * each;
      }
    }

    if (grams == null && /^(ovos?|gemas?|claras?)(\s|$)/.test(text)) {
      m = text.match(/^(ovos?|gemas?|claras?)(?:\s+(.+))?$/);
      if (m) {
        foodText = text;
        const kind = m[1];
        const each = kind.startsWith("gema") ? 18 : kind.startsWith("clara") ? 33 : 55;
        grams = each;
      }
    }

    // número inicial sem unidade → heurística de contagem
    if (grams == null) {
      m = text.match(/^(\d+(?:\s+\d+\/\d+|\/\d+)?|\d+[.,]\d+)\s+(.+)$/);
      if (m) {
        const qty = parseFraction(m[1].replace(/\s+/g, " "));
        foodText = m[2];
        if (qty != null && qty <= 20) {
          if (/\b(ovos?)\b/.test(foodText)) grams = qty * 55;
          else if (/\b(dentes?|alho)\b/.test(foodText)) grams = qty * 3;
          else if (/\b(banana|abacate|tomate|cebola)\b/.test(foodText)) grams = qty * 100;
          else if (/\b(limao|lima)\b/.test(foodText)) grams = qty * 60;
          else if (/\b(folhas?)\b/.test(foodText)) grams = qty * 1; // louro etc. — massa residual
          else grams = qty * 50;
        } else if (qty != null && qty > 20) {
          grams = qty;
        }
      }
    }

    foodText = cleanFoodText(foodText)
      .replace(/\b\d+[.,]?\d*\s*(g|ml|kg|cl|dl|l)\b/g, " ")
      .replace(/\s+\d+[.,]?\d*\s*$/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!foodText || foodText.length < 2 || SKIP.has(normalize(foodText))) return null;
    if (grams == null || !(grams > 0)) {
      if (/\b(manteiga|margarina|azeite|oleo)\b/.test(foodText)) grams = 10;
      else if (/\b(mel|xarope|molho|maionese|mostarda)\b/.test(foodText)) grams = 15;
      else if (/\b(alho|canela|oregao|tomilho|cominhos|pimentao|paprika|fermento)\b/.test(foodText)) grams = 2;
      else if (/\b(ovos?)\b/.test(foodText)) grams = 55;
      else if (/\b(pao|wrap|tortilha)\b/.test(foodText)) grams = 40;
      else if (/\b(leite|iogurte|nata|natas)\b/.test(foodText)) grams = 100;
      else grams = 40;
    }

    return { raw, foodText: normalize(foodText), grams };
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

  function scoreFood(food, tokens, preferKey, normFood) {
    const key = food.key;
    let sc = 0;
    if (preferKey && key === preferKey) return 1000;
    if (preferKey && key.includes(preferKey)) sc += 50;

    // Evitar "alho em pó" para qualquer "* em pó"
    if (/\balho em po\b/.test(key) && !/\balho\b/.test(normFood)) return -1;
    // Evitar pratos "sopa …" quando o utilizador não pediu sopa
    if (/\bsopa\b/.test(key) && !/\bsopa\b/.test(normFood)) sc -= 20;
    // Evitar chá infusão quando não é chá como bebida
    if (/\bcha\b/.test(key) && /\binfus/.test(key) && !/\bcha\b/.test(normFood)) sc -= 25;
    // Evitar nata genérica para creme de coco
    if (/\bnata\b/.test(key) && /\bcoco\b/.test(normFood) && !/\bcoco\b/.test(key)) return -1;
    // Preferir ingredientes simples a pratos compostos
    if (/\b(estufad|frit|grelhad|assado|cozid|bolo|arroz de|com azeite|com margarina)\b/.test(key)
      && tokens.length <= 3) sc -= 8;

    let hits = 0;
    let strongHits = 0;
    for (const t of tokens) {
      if (t.length < 2 || STOP_TOKENS.has(t)) continue;
      // "po" / "folhas" sozinhos são demasiado genéricos
      if (t === "po" || t === "folhas" || t === "folha") continue;
      if (key === t) { sc += 22; hits++; strongHits++; }
      else if (key.startsWith(t + " ")) { sc += 14; hits++; strongHits++; }
      else if (new RegExp("(?:^|\\s)" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:\\s|$)").test(key)) {
        sc += 9; hits++; strongHits++;
      } else if (key.includes(t)) { sc += 2; hits++; }
    }
    if (!hits) return -1;
    if (strongHits === 0 && hits <= 1) return -1;
    // extrato/essência não deve mapear para bolacha/bolo
    if (/\b(extrato|essencia)\b/.test(normFood) && /\b(bolacha|bolo|gelado|waffer|wafer)\b/.test(key)) return -1;
    if (/\b(folhas?)\b/.test(normFood) && /\b(rabanete|nabiças|nabiça|alface)\b/.test(key) && !/\b(rabanete|nabiças|alface)\b/.test(normFood)) return -1;

    if (/\bcru\b/.test(key)) sc += 4;
    if (tokens[0] && key.startsWith(tokens[0])) sc += 3;
    // nomes curtos / mais específicos ganham ligeiramente
    sc -= Math.min(key.length, 80) / 50;
    return sc;
  }

  function matchFood(foodText) {
    ensureIndex();
    if (!foodsNorm?.length) return null;
    const normFood = normalize(foodText);
    if (!normFood) return null;

    let preferKey = PREFER[normFood] || null;
    if (!preferKey) {
      const parts = normFood.split(" ");
      for (let n = Math.min(4, parts.length); n >= 1; n--) {
        const k = parts.slice(0, n).join(" ");
        if (PREFER[k]) { preferKey = PREFER[k]; break; }
      }
    }
    // sufixos comuns
    if (!preferKey && /\bem po\b/.test(normFood)) {
      if (/\bcanela\b/.test(normFood)) preferKey = PREFER["canela em po"];
      else if (/\bfermento\b/.test(normFood)) preferKey = PREFER["fermento em po"];
      else if (/\balho\b/.test(normFood)) preferKey = PREFER["alho em po"];
      else if (/\bacucar\b/.test(normFood)) preferKey = PREFER["acucar em po"];
    }

    const tokens = normFood.split(" ").filter((t) => t.length >= 2 && !STOP_TOKENS.has(t));
    if (!tokens.length && !preferKey) return null;

    const pool = candidatePool(
      preferKey ? preferKey.split(" ").concat(tokens) : tokens
    );
    let best = null;
    let bestScore = -1;
    for (const f of pool) {
      const sc = scoreFood(f, tokens, preferKey, normFood);
      if (sc > bestScore) {
        bestScore = sc;
        best = f;
      }
    }
    // Se PREFER aponta para um alimento exacto, usar mesmo com score baixo
    if (preferKey) {
      const exact = foodsNorm.find((f) => f.key === preferKey);
      if (exact) return exact;
      const fuzzy = foodsNorm.find((f) => f.key.includes(preferKey) || preferKey.includes(f.key));
      if (fuzzy && (!best || bestScore < 20)) return fuzzy;
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
        lines.push({
          raw: ing,
          foodText: parsed.foodText,
          grams: parsed.grams,
          unmatched: true,
        });
        continue;
      }
      const factor = parsed.grams / 100;
      const row = {
        raw: ing,
        foodText: parsed.foodText,
        grams: parsed.grams,
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
      totalG,
      kcal,
      protein,
      carbs,
      fat,
      lines,
      source: tca?.source || "",
      url: tca?.url || "https://portfir.insa.min-saude.pt/",
      version: tca?.version || "",
    };
  }

  function round1(n) {
    return Math.round(Number(n) || 0);
  }

  function formatQtyNumber(n, { asInt = false, style = "count" } = {}) {
    if (!Number.isFinite(n) || n <= 0) return null;
    if (asInt || style === "count") {
      if (n < 0.9) {
        if (Math.abs(n - 0.5) <= 0.12) return "1/2";
        if (Math.abs(n - 0.25) <= 0.08) return "1/4";
        if (Math.abs(n - 0.75) <= 0.08) return "3/4";
      }
      return String(Math.max(1, Math.round(n)));
    }
    // pesos/volumes: números simples (sem "7 1/2 g")
    if (n < 10) {
      const r = Math.round(n * 2) / 2;
      return Number.isInteger(r) ? String(r) : String(r);
    }
    if (n < 50) return String(Math.round(n));
    return String(Math.round(n / 5) * 5);
  }

  /** Escala quantidades num texto de ingrediente (factor = pessoasAlvo / pessoasBase). */
  function scaleIngredientLine(line, factor) {
    const raw = String(line || "");
    if (!raw.trim() || !Number.isFinite(factor) || Math.abs(factor - 1) < 1e-9) return raw;
    if (/\b(pitada|a gosto|qb|q\.?\s*b\.?|provar|opcional)\b/i.test(raw) && !/\d/.test(raw)) return raw;

    let out = raw;

    const scaleNum = (numStr, opts = {}) => {
      let n;
      const s = String(numStr).trim().replace(",", ".");
      if (/^\d+\s+\d+\/\d+$/.test(s)) {
        const [w, fr] = s.split(/\s+/);
        const [a, b] = fr.split("/").map(Number);
        n = Number(w) + a / b;
      } else if (/^\d+\/\d+$/.test(s)) {
        const [a, b] = s.split("/").map(Number);
        n = a / b;
      } else {
        n = Number(s);
      }
      if (!Number.isFinite(n)) return numStr;
      return formatQtyNumber(n * factor, opts) ?? numStr;
    };

    const pluralWord = (nStr, word) => {
      let n = Number(String(nStr).replace(",", "."));
      if (!Number.isFinite(n) && /^\d+\/\d+$/.test(String(nStr))) {
        const [a, b] = String(nStr).split("/").map(Number);
        n = a / b;
      }
      const w = word;
      const one = Number.isFinite(n) && n > 0 && n <= 1;
      const map = [
        [/^ovos?$/i, one ? "ovo" : "ovos"],
        [/^gemas?$/i, one ? "gema" : "gemas"],
        [/^claras?$/i, one ? "clara" : "claras"],
        [/^fatias?$/i, one ? "fatia" : "fatias"],
        [/^dentes?$/i, one ? "dente" : "dentes"],
        [/^wraps?$/i, one ? "wrap" : "wraps"],
        [/^tortilhas?$/i, one ? "tortilha" : "tortilhas"],
        [/^unidades?$/i, one ? "unidade" : "unidades"],
        [/^latas?$/i, one ? "lata" : "latas"],
        [/^cebolas?$/i, one ? "cebola" : "cebolas"],
        [/^tomates?$/i, one ? "tomate" : "tomates"],
        [/^bananas?$/i, one ? "banana" : "bananas"],
        [/^abacates?$/i, one ? "abacate" : "abacates"],
        [/^pimentos?$/i, one ? "pimento" : "pimentos"],
        [/^cenouras?$/i, one ? "cenoura" : "cenouras"],
        [/^colher(?:es)?$/i, one ? "colher" : "colheres"],
      ];
      for (const [re, out] of map) {
        if (re.test(w)) return out;
      }
      return w;
    };

    // (N g) / (N ml)
    out = out.replace(/\((\d+[.,]?\d*)\s*(g|ml)\)/gi, (_, n, u) => `(${scaleNum(n, { style: "mass" })} ${u.toLowerCase()})`);

    // N g / N ml no início
    out = out.replace(
      /^(\d+[.,]?\d*|\d+\/\d+|\d+\s+\d+\/\d+)\s*(g|kg|ml|cl|dl|l)\b/i,
      (_, n, u) => `${scaleNum(n, { style: "mass" })} ${u}`
    );

    // N ovos / fatias / dentes / wraps / unidades
    out = out.replace(
      /^(\d+[.,]?\d*|\d+\/\d+|\d+\s+\d+\/\d+)\s+(ovos?|gemas?|claras?|fatias?|dentes?|wraps?|tortilhas?|unidades?|latas?)\b/i,
      (_, n, word) => {
        const q = scaleNum(n, { style: "count" });
        return `${q} ${pluralWord(q, word)}`;
      }
    );

    // N colheres de sopa/chá  (evitar \\b após "chá" — \\b ASCII falha com acentos)
    out = out.replace(
      /^(\d+[.,]?\d*|\d+\/\d+|\d+\s+\d+\/\d+)\s+(colher(?:es)?)(\s+de\s+(?:sopa|chá|cha))(?=\s|$)/i,
      (_, n, word, rest) => {
        const q = scaleNum(n, { style: "count" });
        return `${q} ${pluralWord(q, word)}${rest}`;
      }
    );

    // N xícaras
    out = out.replace(
      /^(\d+[.,]?\d*|\d+\/\d+|\d+\s+\d+\/\d+)\s+(xícaras?|xicaras?|chávenas?|chavenas?|cups?)\b/i,
      (_, n, rest) => `${scaleNum(n, { style: "count" })} ${rest}`
    );

    // cebola/tomate/etc. contados
    out = out.replace(
      /^(\d+[.,]?\d*|\d+\/\d+)\s+(cebolas?|tomates?|bananas?|abacates?|lim[aã]o|lim[oõ]es|pimentos?|maçãs?|macas?|cenouras?)\b/i,
      (_, n, word) => {
        const q = scaleNum(n, { style: "count" });
        return `${q} ${pluralWord(q, word)}`;
      }
    );

    return out;
  }

  function scaleIngredients(lines, factor) {
    return (lines || []).map((line) => scaleIngredientLine(line, factor));
  }

  function formatBlock(est, opts = {}) {
    if (!est?.ok) {
      return `<div class="nutrition">
        <h3>Nutrição</h3>
        <p class="nutrition-miss">Ainda sem estimativa fiável para esta receita (${est?.coverage || 0}% dos ingredientes reconhecidos).</p>
        <p class="nutrition-source">Fonte de referência: <a href="https://portfir.insa.min-saude.pt/" target="_blank" rel="noopener">TCA INSA / PortFIR</a></p>
      </div>`;
    }

    // Quantidades dos ingredientes são para N pessoas → macros da receita ÷ N = sempre 1 pessoa.
    const servings = Math.max(1, Math.min(12, Math.round(Number(opts.servings) || 1)));
    const perKcal = est.kcal / servings;
    const perProtein = est.protein / servings;
    const perCarbs = est.carbs / servings;
    const perFat = est.fat / servings;
    const picks = [1, 2, 3, 4];
    if (!picks.includes(servings)) picks.push(servings);
    picks.sort((a, b) => a - b);
    const pickBtns = picks.map((n) => (
      `<button type="button" class="servings-btn${n === servings ? " active" : ""}" data-set-servings="${n}" aria-pressed="${n === servings ? "true" : "false"}">${n}</button>`
    )).join("");
    const pessoaLabel = servings === 1 ? "1 pessoa" : `${servings} pessoas`;

    return `<div class="nutrition" data-nutrition-per-person
        data-kcal="${round1(perKcal)}" data-protein="${round1(perProtein)}" data-carbs="${round1(perCarbs)}" data-fat="${round1(perFat)}"
        data-servings="${servings}" data-coverage="${est.coverage}">
      <div class="servings-row">
        <div class="servings-ref">
          <span class="servings-ref-label">Ingredientes para</span>
          <span class="servings-ref-value" data-n="serve-label">${escape(pessoaLabel)}</span>
        </div>
        <div class="servings-picker" role="group" aria-label="Alterar ingredientes para quantas pessoas">${pickBtns}</div>
      </div>
      <h3>Nutrição <span class="nutrition-tag">por 1 pessoa</span></h3>
      <div class="nutrition-grid">
        <div><strong data-n="kcal">${round1(perKcal)}</strong><span>kcal</span></div>
        <div><strong data-n="protein">${round1(perProtein)} g</strong><span>Proteína</span></div>
        <div><strong data-n="carbs">${round1(perCarbs)} g</strong><span>Hidratos</span></div>
        <div><strong data-n="fat">${round1(perFat)} g</strong><span>Lípidos</span></div>
      </div>
      <p class="nutrition-note" data-n="note">Valores sempre por 1 pessoa. Ao mudar o número de pessoas, só os ingredientes mudam.</p>
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
    scaleIngredientLine,
    scaleIngredients,
    round1,
  };
})(typeof window !== "undefined" ? window : globalThis);
