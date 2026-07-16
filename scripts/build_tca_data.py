#!/usr/bin/env python3
"""Gera js/tca-data.js a partir do Excel oficial PortFIR/INSA."""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

try:
    import openpyxl
except ImportError:
    import subprocess

    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "openpyxl"])
    import openpyxl

ROOT = Path(__file__).resolve().parents[1]
XLSX_URL = "https://portfir.insa.min-saude.pt/wp-content/uploads/2025/11/insa_tca.xlsx"
OUT = ROOT / "js" / "tca-data.js"


def num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", ".")
    if s in ("", "-", "tr", "Tr", "NA", "n.d.", "nd"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def load_foods(xlsx: Path):
    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    ws = wb["INSA - BDCA_v 7.1 - 2026"]
    foods = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i < 2 or not row or not row[1]:
            continue
        kcal = num(row[5])
        fat = num(row[7])
        carbs = num(row[13])
        protein = num(row[19])
        foods.append(
            {
                "id": str(row[0]) if row[0] is not None else "",
                "name": str(row[1]).strip(),
                "kcal": round(kcal or 0, 1),
                "protein": round(protein or 0, 1),
                "carbs": round(carbs or 0, 1),
                "fat": round(fat or 0, 1),
            }
        )
    return foods


def main():
    import urllib.request

    xlsx = Path("/tmp/insa_tca.xlsx")
    if not xlsx.exists():
        print("A descarregar TCA…")
        urllib.request.urlretrieve(XLSX_URL, xlsx)
    foods = load_foods(xlsx)
    payload = {
        "version": "7.1-2026",
        "source": (
            "Base de Dados da Composição de Alimentos. "
            "Instituto Nacional de Saúde Doutor Ricardo Jorge, I. P.- INSA. v 7.1 - 2026"
        ),
        "url": "https://portfir.insa.min-saude.pt/",
        "unit": "per_100g",
        "foods": foods,
    }
    js = (
        "/* Gerado por scripts/build_tca_data.py — não editar à mão */\n"
        "window.MARE_TCA = "
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    OUT.write_text(js, encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes, {len(foods)} foods)")


if __name__ == "__main__":
    main()
