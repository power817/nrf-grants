#!/usr/bin/env python3
"""
Download the best '공고문' PDF per announcement and extract its text.

Usage:
  .venv/bin/python src/pdf_extract.py [--limit N] [--in data/announcements.json]
                                      [--out data/pdf_text.json] [--force]

Only announcements that have a PDF attachment are processed (~half the set;
the rest are HWP-only and handled separately). Downloaded PDFs are cached
under data/pdfs/ so re-runs are cheap.
"""
import argparse
import json
import os
import re
import sys
import time

import logging
import warnings

import requests
import pdfplumber

# pdfminer emits noisy, harmless warnings ("invalid float value" for color specs)
logging.getLogger("pdfminer").setLevel(logging.ERROR)
logging.getLogger("pdfplumber").setLevel(logging.ERROR)
warnings.filterwarnings("ignore")

BASE = "https://www.nrf.re.kr"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120 Safari/537.36")

PDFS_DIR = "data/pdfs"


def pick_announcement_pdf(attachments):
    """Choose the single attachment most likely to be the Korean 공고문 PDF."""
    best, best_score = None, -1e9
    for a in attachments:
        name = a.get("name", "")
        if not re.search(r"\.pdf$", name, re.I):
            continue
        s = 0.0
        if "공고문" in name:
            s += 10
        if re.search(r"공고|모집|공모|신규|선정", name):
            s += 5
        if re.search(r"요강|계획|안내|개요", name):
            s += 3
        # de-prioritise English versions and pure reference/appendix PDFs
        if re.search(r"영문|english|call for|proposal", name, re.I):
            s -= 8
        if re.search(r"^\s*(참고|별첨|참조)", name):
            s -= 2
        s += min(len(name), 60) * 0.01  # mild tiebreak
        if s > best_score:
            best_score, best = s, a
    return best, best_score


def download(url, referer, dest, retries=3):
    headers = {
        "User-Agent": UA,
        "Referer": referer,
        "Accept-Language": "ko,en;q=0.8",
        "Accept": "*/*",
    }
    last = None
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=headers, timeout=40)
            if r.status_code != 200:
                raise RuntimeError(f"HTTP {r.status_code}")
            if not r.content.startswith(b"%PDF"):
                raise RuntimeError("not a PDF payload")
            with open(dest, "wb") as f:
                f.write(r.content)
            return len(r.content)
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(0.8 * (attempt + 1))
    raise last


def extract_text(path):
    parts = []
    with pdfplumber.open(path) as pdf:
        npages = len(pdf.pages)
        for pg in pdf.pages:
            parts.append(pg.extract_text() or "")
    return "\n".join(parts), npages


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="data/announcements.json")
    ap.add_argument("--out", dest="out", default="data/pdf_text.json")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    os.makedirs(PDFS_DIR, exist_ok=True)
    data = json.load(open(args.inp, encoding="utf-8"))
    anns = data["announcements"]

    # only those with a candidate PDF
    targets = []
    for a in anns:
        pdf, score = pick_announcement_pdf(a.get("attachments", []))
        if pdf:
            targets.append((a, pdf, score))
    if args.limit:
        targets = targets[: args.limit]

    print(f"{len(targets)} announcements with a 공고문 PDF (of {len(anns)} total)")

    out = {}
    if os.path.exists(args.out) and not args.force:
        out = json.load(open(args.out, encoding="utf-8"))

    ok = fail = cached = 0
    for i, (a, pdf, score) in enumerate(targets, 1):
        post_no = a["postNo"]
        if post_no in out and out[post_no].get("chars", 0) > 0 and not args.force:
            cached += 1
            continue
        dest = os.path.join(PDFS_DIR, f"{post_no}_{pdf['attachNo']}.pdf")
        try:
            if not os.path.exists(dest) or args.force:
                download(pdf["url"], a["detailUrl"], dest)
            text, npages = extract_text(dest)
            out[post_no] = {
                "postNo": post_no,
                "title": a["title"],
                "pdfName": pdf["name"],
                "attachNo": pdf["attachNo"],
                "url": pdf["url"],
                "pages": npages,
                "chars": len(text),
                # heuristic: is the chosen PDF likely the real Korean 공고문?
                "isGonggomun": ("공고문" in pdf["name"]) or (score >= 5),
                "text": text,
            }
            ok += 1
        except Exception as e:  # noqa: BLE001
            out[post_no] = {"postNo": post_no, "title": a["title"],
                            "pdfName": pdf["name"], "error": str(e), "chars": 0}
            fail += 1
        if i % 10 == 0 or i == len(targets):
            print(f"  {i}/{len(targets)}  ok={ok} fail={fail} cached={cached}", flush=True)
        time.sleep(0.15)

    json.dump(out, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    total_chars = sum(v.get("chars", 0) for v in out.values())
    empty = sum(1 for v in out.values() if v.get("chars", 0) == 0)
    print(f"\nSaved {len(out)} records -> {args.out}")
    print(f"  ok={ok} fail={fail} cached={cached} | empty-text={empty} | total_chars={total_chars:,}")


if __name__ == "__main__":
    main()
