#!/usr/bin/env python3
"""
firecrawl_issue.py

Genera un nuovo "numero" dell'archivio del sito (stile rivista) interrogando
Firecrawl su una lista di fonti configurabili (concorrenti, bandi/annunci di
lavoro, avvisi di sicurezza) e scrivendo il risultato in:

    data/issues/index.json          <- indice di tutti i numeri
    data/issues/<anno>-<mese>.json  <- contenuto del singolo numero

Pensato per girare via GitHub Actions una volta al mese (vedi
.github/workflows/monthly-issue.yml), con FIRECRAWL_API_KEY nei Secrets del
repo — mai nel codice, mai nel browser.

Uso locale:
    export FIRECRAWL_API_KEY=fc-xxxxxxxx
    python firecrawl_issue.py
"""

from __future__ import annotations

import json
import os
import sys
from datetime import date
from pathlib import Path

try:
    from firecrawl import FirecrawlApp
except ImportError:
    print("Manca il pacchetto 'firecrawl-py'. Installa con: pip install firecrawl-py", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# Configurazione: personalizza queste liste con le fonti che ti interessano
# ---------------------------------------------------------------------------

SOURCES = [
    {
        "url": "https://www.troyhunt.com/",
        "category": "competitor",
        "label": "Concorrenza",
        "source_name": "Troy Hunt — Blog",
    },
    {
        "url": "https://jvns.ca/",
        "category": "competitor",
        "label": "Concorrenza",
        "source_name": "Julia Evans — Blog",
    },
    {
        "url": "https://simonwillison.net/",
        "category": "competitor",
        "label": "Concorrenza",
        "source_name": "Simon Willison — Weblog",
    },
    {
        "url": "https://www.lastweekinaws.com/blog/",
        "category": "competitor",
        "label": "Concorrenza",
        "source_name": "Corey Quinn — Last Week in AWS",
    },
    {
        "url": "https://www.indeed.com/q-devops-cloud-security-jobs.html",
        "category": "market",
        "label": "Mercato del lavoro",
        "source_name": "Indeed — DevOps/Cloud/Security IT",
    },
    {
        "url": "https://www.enisa.europa.eu/news",
        "category": "security",
        "label": "Sicurezza & Normativa",
        "source_name": "ENISA — News",
    },
]

DATA_DIR = Path(__file__).resolve().parent / "public" / "data" / "issues"
MAX_SUMMARY_CHARS = 320


def load_index() -> dict:
    index_path = DATA_DIR / "index.json"
    if index_path.exists():
        return json.loads(index_path.read_text(encoding="utf-8"))
    return {"issues": []}


def next_issue_number(index: dict) -> int:
    if not index["issues"]:
        return 1
    return max(item["number"] for item in index["issues"]) + 1


def summarize(markdown_or_text: str) -> str:
    text = " ".join(markdown_or_text.split())
    if len(text) <= MAX_SUMMARY_CHARS:
        return text
    return text[:MAX_SUMMARY_CHARS].rsplit(" ", 1)[0] + "…"


def scrape_source(app: FirecrawlApp, source: dict) -> dict | None:
    try:
        result = app.scrape_url(source["url"], params={"formats": ["markdown"]})
    except Exception as exc:  # noqa: BLE001 - vogliamo continuare sugli altri source
        print(f"[warn] scraping fallito per {source['url']}: {exc}", file=sys.stderr)
        return None

    markdown = result.get("markdown") or result.get("content") or ""
    metadata = result.get("metadata") or {}
    title = metadata.get("title") or source["source_name"]

    if not markdown.strip():
        return None

    return {
        "category": source["category"],
        "label": source["label"],
        "headline": title.strip()[:140],
        "summary": summarize(markdown),
        "source_name": source["source_name"],
        "source_url": source["url"],
    }


def main() -> None:
    api_key = os.environ.get("FIRECRAWL_API_KEY")
    if not api_key:
        print("FIRECRAWL_API_KEY non impostata.", file=sys.stderr)
        sys.exit(1)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    app = FirecrawlApp(api_key=api_key)

    signals = []
    for source in SOURCES:
        signal = scrape_source(app, source)
        if signal:
            signals.append(signal)

    if not signals:
        print("Nessun segnale raccolto: nessun numero generato questo mese.", file=sys.stderr)
        sys.exit(0)

    today = date.today()
    issue_id = f"{today.year}-{today.month:02d}"

    index = load_index()
    number = next_issue_number(index)
    month_name = today.strftime("%B %Y").capitalize()

    issue = {
        "id": issue_id,
        "number": number,
        "title": f"Cloud & Security Watch — {month_name}",
        "date": today.isoformat(),
        "signals": signals,
    }

    (DATA_DIR / f"{issue_id}.json").write_text(
        json.dumps(issue, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    index["issues"] = [item for item in index["issues"] if item["id"] != issue_id]
    index["issues"].append(
        {"id": issue_id, "number": number, "title": issue["title"], "date": issue["date"]}
    )
    (DATA_DIR / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"Numero {number} ({issue_id}) generato con {len(signals)} segnali.")


if __name__ == "__main__":
    main()
