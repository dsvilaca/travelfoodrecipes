#!/usr/bin/env node
/**
 * Acrescenta quantidades concretas aos ingredientes sem peso/volume
 * e normaliza alguns formatos para o cálculo nutricional (TCA).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const SEED_PATH = path.join(ROOT, "js", "seed-data.js");

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasQuantity(ing) {
  const s = String(ing).trim();
  if (!s) return false;
  if (/^\d/.test(s) || /^[½¼¾]/.test(s)) return true;
  if (/\b\d+([.,]\d+)?\s*(g|kg|ml|cl|dl|l|lt|oz|lb)\b/i.test(s)) return true;
  if (/\b\d+\s*(colher|colheres|xicara|xicaras|chavena|fatia|fatias|dente|dentes|unidade|unidades|pitada)\b/i.test(s)) return true;
  if (/\(\s*\d+\s*g\s*\)/i.test(s)) return true;
  return false;
}

/** defaults: chave normalizada → texto com quantidade */
const DEFAULTS = [
  [/^(sal e pimenta|sal|pimenta|pimenta preta|pimenta branca)$/, "1 pitada de sal e pimenta"],
  [/^manteiga derretida$/, "20 g manteiga derretida"],
  [/^manteiga( sem sal)?$/, "15 g manteiga"],
  [/^azeite$/, "1 colher de sopa de azeite (10 g)"],
  [/^oleo( alimentar| de cozinha)?$/, "1 colher de sopa de óleo (10 g)"],
  [/^pao$/, "2 fatias de pão (80 g)"],
  [/^pao grosso$/, "2 fatias de pão grosso (100 g)"],
  [/^tortilha$/, "1 tortilha (60 g)"],
  [/^enrolar$/, "1 wrap / tortilha (60 g)"],
  [/^wrap$/, "1 wrap (60 g)"],
  [/^mel$/, "1 colher de sopa de mel (20 g)"],
  [/^acucar( refinado| mascavo)?$/, "20 g açúcar"],
  [/^fermento$/, "1 colher de chá de fermento (5 g)"],
  [/^baunilha$/, "1 colher de chá de extrato de baunilha (5 ml)"],
  [/^canela$/, "1 colher de chá de canela (3 g)"],
  [/^chia$/, "20 g sementes de chia"],
  [/^fruta$/, "100 g fruta"],
  [/^frutos vermelhos$/, "80 g frutos vermelhos"],
  [/^iogurte grego$/, "150 g iogurte grego"],
  [/^iogurte$/, "150 g iogurte"],
  [/^granola$/, "40 g granola"],
  [/^limao$/, "1 limão (60 g)"],
  [/^sumo de limao$/, "2 colheres de sopa de sumo de limão (30 ml)"],
  [/^batata$/, "200 g batata"],
  [/^batatas raladas$/, "250 g batata ralada"],
  [/^batata cozida$/, "200 g batata cozida"],
  [/^queijo$/, "40 g queijo"],
  [/^queijo fresco$/, "80 g queijo fresco"],
  [/^requeijao cremoso|cream cheese$/, "40 g requeijão cremoso"],
  [/^mozzarella|mussarela$/, "60 g mozzarella"],
  [/^parmesao$/, "20 g parmesão"],
  [/^cebola$/, "1 cebola média (100 g)"],
  [/^alho$/, "2 dentes de alho (6 g)"],
  [/^pimento$/, "1 pimento (120 g)"],
  [/^tomate$/, "1 tomate (120 g)"],
  [/^tomate pelado$/, "400 g tomate pelado"],
  [/^espinafres$/, "80 g espinafres"],
  [/^alface$/, "40 g alface"],
  [/^pepino|pepinos$/, "100 g pepino"],
  [/^cogumelos$/, "150 g cogumelos"],
  [/^abacate$/, "1 abacate (200 g)"],
  [/^banana$/, "1 banana (120 g)"],
  [/^bananas congeladas$/, "2 bananas congeladas (240 g)"],
  [/^cominhos$/, "1 colher de chá de cominhos (3 g)"],
  [/^(paprika|pimentao doce)$/, "1 colher de chá de páprica (3 g)"],
  [/^salsa$/, "10 g salsa"],
  [/^ervas$/, "5 g ervas aromáticas"],
  [/^maionese$/, "2 colheres de sopa de maionese (30 g)"],
  [/^mostarda$/, "1 colher de chá de mostarda (5 g)"],
  [/^atum escorrido$/, "1 lata de atum escorrido (120 g)"],
  [/^atum$/, "1 lata de atum (120 g)"],
  [/^salmao fumado$/, "80 g salmão fumado"],
  [/^salmao$/, "150 g salmão"],
  [/^frango$/, "200 g frango"],
  [/^peito de frango$/, "200 g peito de frango"],
  [/^coxas de frango$/, "300 g coxas de frango"],
  [/^bacon$/, "60 g bacon"],
  [/^fiambre$/, "40 g fiambre"],
  [/^carne picada$/, "250 g carne picada"],
  [/^carne bovina$/, "250 g carne bovina"],
  [/^arroz$/, "80 g arroz cru"],
  [/^massa$/, "100 g massa crua"],
  [/^esparguete$/, "100 g esparguete cru"],
  [/^farinha$/, "100 g farinha"],
  [/^aveia$/, "80 g aveia"],
  [/^leite$/, "200 ml leite"],
  [/^natas|nata$/, "50 ml natas"],
  [/^creme$/, "50 ml natas / creme"],
  [/^cacau$/, "10 g cacau em pó"],
  [/^chocolate$/, "40 g chocolate"],
  [/^nutella|nutela$/, "30 g Nutella"],
  [/^pasta amendoim$/, "30 g pasta de amendoim"],
  [/^amendoim$/, "30 g amendoim"],
  [/^amendoas$/, "30 g amêndoas"],
  [/^nozes$/, "30 g nozes"],
  [/^azeitonas$/, "30 g azeitonas"],
  [/^hummus|homus$/, "80 g hummus"],
  [/^feijao$/, "150 g feijão"],
  [/^grao|grao de bico$/, "150 g grão-de-bico"],
  [/^ovos? cozidos?( opcional)?$/, "1 ovo cozido (55 g)"],
  [/^ovo batido$/, "1 ovo batido (55 g)"],
  [/^ovos?$/, "2 ovos (110 g)"],
  [/^gemas de ovo$/, "2 gemas de ovo (36 g)"],
  [/^clara de ovo$/, "2 claras de ovo (66 g)"],
  [/^duro$/, "40 g queijo duro"],
  [/^cabana|cottage|fugir$/, "150 g queijo cottage / skyr"],
  [/^sementes$/, "15 g sementes"],
  [/^vinagre$/, "1 colher de sopa de vinagre (15 ml)"],
  [/^molho de soja$/, "1 colher de sopa de molho de soja (15 ml)"],
  [/^agua( morna)?$/, "100 ml água"],
  [/^tomilho|raminhos de tomilho$/, "2 g tomilho"],
  [/^pau de canela$/, "1 pau de canela"],
  [/^massa de waffle$/, "150 g massa de waffle"],
  [/^vegetais$/, "150 g vegetais"],
  [/^alface$/, "40 g alface"],
];

function quantify(ing) {
  const raw = String(ing || "").trim();
  if (!raw) return raw;
  if (hasQuantity(raw)) {
    if (/\(\s*\d+([.,]\d+)?\s*(g|ml)\s*\)/i.test(raw)) return raw;
    let m = raw.match(/^(\d+)\s+ovos\b(.*)$/i);
    if (m) return `${m[1]} ovos (${Number(m[1]) * 55} g)${m[2] || ""}`.trim();
    m = raw.match(/^(\d+)\s+ovo\b(.*)$/i);
    if (m) return `${m[1]} ovo (${Number(m[1]) * 55} g)${m[2] || ""}`.trim();
    m = raw.match(/^(\d+)\s+bananas?\b(.*)$/i);
    if (m) {
      const n = Number(m[1]);
      return `${n} banana${n > 1 ? "s" : ""} (${n * 120} g)${m[2] || ""}`.trim();
    }
    m = raw.match(/^(\d+)\s+abacate\b(.*)$/i);
    if (m) return `${m[1]} abacate (${Number(m[1]) * 200} g)${m[2] || ""}`.trim();
    m = raw.match(/^(\d+)\s+fatias?\s+(?:de\s+)?(.+)$/i);
    if (m && /p[aã]o/i.test(m[2])) {
      return `${m[1]} fatias de ${m[2]} (${Number(m[1]) * 40} g)`;
    }
    // "150 g farinha" → ok; "120 ml de leite" → ok
    return raw;
  }

  const key = normalize(raw);
  for (const [re, value] of DEFAULTS) {
    if (re.test(key)) return value;
  }

  // fallback: 1 unidade / 40 g do alimento
  return `40 g ${raw}`;
}

function main() {
  const code = fs.readFileSync(SEED_PATH, "utf8");
  const g = { window: {} };
  vm.runInNewContext(code, g);
  const seed = g.window.MARE_SEED;
  if (!seed?.recipes?.length) throw new Error("MARE_SEED.recipes em falta");

  let changedLines = 0;
  for (const r of seed.recipes) {
    const next = (r.ingredients || []).map((ing) => {
      const q = quantify(ing);
      if (q !== ing) changedLines++;
      return q;
    });
    r.ingredients = next;
  }

  const out =
    "window.MARE_SEED = " +
    JSON.stringify(seed, null, 2) +
    ";\n";
  fs.writeFileSync(SEED_PATH, out, "utf8");
  console.log(`Updated ${SEED_PATH}`);
  console.log(`Ingredient lines changed: ${changedLines}`);
  console.log(`Recipes: ${seed.recipes.length}`);
}

main();
