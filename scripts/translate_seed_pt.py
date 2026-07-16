#!/usr/bin/env python3
"""Traduz js/seed-data.js para português com cache e checkpoints."""
from __future__ import annotations

import json
import re
import subprocess
import time
from pathlib import Path

from deep_translator import GoogleTranslator

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "js" / "seed-data.js"
CACHE = ROOT / "scripts" / ".translate-cache.json"
CHECKPOINT = ROOT / "scripts" / ".translate-checkpoint.json"

translator = GoogleTranslator(source="auto", target="pt")


def load_json(path: Path, default):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


cache = load_json(CACHE, {})


def looks_pt(text: str) -> bool:
    if not text or not str(text).strip():
        return True
    t = str(text).lower()
    pt_hits = len(
        re.findall(
            r"\b(com|para|em|de|do|da|dos|das|uma|ovos?|farinha|açúcar|acucar|manteiga|aquece|mistura|junta|forno|frigideira|colheres?|minutos?|receita|massa|queijo)\b",
            t,
        )
    )
    en_hits = len(
        re.findall(
            r"\b(the|and|with|into|your|mix|add|bake|cook|until|minutes?|cups?|tablespoons?|teaspoons?|preheat|flour|butter|sugar|egg|cream|heat|oven)\b",
            t,
        )
    )
    if en_hits >= 2 and en_hits > pt_hits:
        return False
    if pt_hits >= 2 and pt_hits >= en_hits:
        return True
    if en_hits == 0 and re.search(r"[áàâãéêíóôõúç]", t):
        return True
    return False


def translate(text: str) -> str:
    s = "" if text is None else str(text)
    raw = s
    s = s.strip()
    if not s:
        return raw if raw == "" else s
    if re.fullmatch(r"https?://\S+", s):
        return s
    if looks_pt(s):
        return s
    if s in cache:
        return cache[s]

    urls = re.findall(r"https?://\S+", s)
    protected = s
    for i, u in enumerate(urls):
        protected = protected.replace(u, f"__URL{i}__")

    chunks = []
    buf = ""
    for part in re.split(r"(\n+)", protected):
        if len(buf) + len(part) > 4200:
            chunks.append(buf)
            buf = part
        else:
            buf += part
    if buf:
        chunks.append(buf)

    out_parts = []
    for ch in chunks:
        if not ch.strip():
            out_parts.append(ch)
            continue
        ok = False
        for attempt in range(5):
            try:
                tr = translator.translate(ch)
                out_parts.append(tr or ch)
                ok = True
                break
            except Exception as exc:
                time.sleep(1.5 * (attempt + 1))
                if attempt == 4:
                    print("FAIL", exc, repr(ch[:70]))
                    out_parts.append(ch)
        if ok:
            time.sleep(0.12)
    out = "".join(out_parts)
    for i, u in enumerate(urls):
        out = out.replace(f"__URL{i}__", u)
    cache[s] = out
    if len(cache) % 40 == 0:
        save_json(CACHE, cache)
    return out


def emit(seed: dict) -> str:
    out = [
        "/* Seed em português (TheMealDB + comfort traduzidos) */\n",
        "window.MARE_SEED = {\n  recipes: [\n",
    ]
    for r in seed["recipes"]:
        out.append("    " + json.dumps(r, ensure_ascii=False) + ",\n")
    out.append("  ],\n\n  shoppingLists: ")
    out.append(json.dumps(seed.get("shoppingLists", []), ensure_ascii=False, indent=2))
    out.append("\n};\n")
    return "".join(out)


def main():
    seed = json.loads(
        subprocess.check_output(
            [
                "node",
                "-e",
                "const fs=require('fs'); eval(fs.readFileSync('js/seed-data.js','utf8').replace('window.MARE_SEED','global.MARE_SEED')); process.stdout.write(JSON.stringify(global.MARE_SEED))",
            ],
            cwd=str(ROOT),
        )
    )
    recipes = seed["recipes"]
    start = int(load_json(CHECKPOINT, {"i": 0}).get("i", 0))
    print(f"start={start} total={len(recipes)} cache={len(cache)}")

    for i in range(start, len(recipes)):
        r = recipes[i]
        r["title"] = translate(r.get("title", ""))
        r["subtitle"] = translate(r.get("subtitle", ""))
        r["protein_note"] = translate(r.get("protein_note", ""))
        r["note"] = translate(r.get("note", ""))
        tags = [translate(t) for t in (r.get("tags") or [])]
        r["tags"] = ["themealdb" if t.lower().startswith("themeal") else t for t in tags]
        r["ingredients"] = [translate(x) for x in (r.get("ingredients") or [])]
        r["steps"] = [translate(x) for x in (r.get("steps") or [])]
        recipes[i] = r

        if i % 10 == 0:
            save_json(CHECKPOINT, {"i": i + 1})
            save_json(CACHE, cache)
            # checkpoint file of partial seed
            SEED.write_text(emit(seed), encoding="utf-8")
            print(f"... {i}/{len(recipes)} | {r['title'][:60]}")

    for lst in seed.get("shoppingLists") or []:
        lst["name"] = translate(lst.get("name", ""))
        lst["items"] = [translate(x) for x in (lst.get("items") or [])]

    SEED.write_text(emit(seed), encoding="utf-8")
    save_json(CACHE, cache)
    save_json(CHECKPOINT, {"i": len(recipes)})
    print("DONE", SEED.stat().st_size)


if __name__ == "__main__":
    main()
