#!/usr/bin/env python3
"""
Download the best 공고문 HWP/HWPX per PDF-less announcement and extract its text.

  .venv/bin/python src/hwp_extract.py [--limit N] [--force]

- .hwpx (OWPML): unzip, read Contents/section*.xml, pull <hp:t> text.
- .hwp  (HWP5 binary): pyhwp's hwp5txt CLI (needs `six`).
Only announcements WITHOUT a PDF attachment are processed (the PDF ones are
handled by pdf_extract.py). Output mirrors pdf_text: data/hwp_text/<postNo>.txt
plus data/hwp_index.json.
"""
import argparse
import html
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import zipfile

import requests

BASE = "https://www.nrf.re.kr"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120 Safari/537.36")
HWP_DIR = "data/hwps"
OUT_TEXT_DIR = "data/hwp_text"
HWP5TXT = os.path.join(sys.prefix, "bin", "hwp5txt")


def has_pdf(atts):
    return any(re.search(r"\.pdf$", a.get("name", ""), re.I) for a in atts)


def score(name):
    s = 0.0
    if "공고문" in name:
        s += 10
    if re.search(r"공고|모집|공모|신규|선정", name):
        s += 5
    if re.search(r"요강|계획|안내|개요|rfp", name, re.I):
        s += 3
    if re.search(r"영문|english|call for|proposal", name, re.I):
        s -= 8
    s += min(len(name), 60) * 0.01
    return s


def pick_hwp(atts):
    """Prefer a .hwpx 공고문, else a .hwp one. Returns (attachment, kind) or (None, None)."""
    hwpx = sorted([a for a in atts if re.search(r"\.hwpx$", a["name"], re.I)],
                  key=lambda a: score(a["name"]), reverse=True)
    if hwpx:
        return hwpx[0], "hwpx"
    hwp = sorted([a for a in atts if re.search(r"\.hwp$", a["name"], re.I)],
                 key=lambda a: score(a["name"]), reverse=True)
    if hwp:
        return hwp[0], "hwp"
    return None, None


def download(url, referer, dest, retries=3):
    headers = {"User-Agent": UA, "Referer": referer, "Accept-Language": "ko,en;q=0.8", "Accept": "*/*"}
    last = None
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=headers, timeout=40)
            if r.status_code != 200:
                raise RuntimeError(f"HTTP {r.status_code}")
            with open(dest, "wb") as f:
                f.write(r.content)
            return len(r.content)
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(0.8 * (attempt + 1))
    raise last


def extract_hwpx(path):
    texts = []
    with zipfile.ZipFile(path) as z:
        names = sorted(n for n in z.namelist() if re.search(r"Contents/section\d+\.xml$", n))
        for n in names:
            xml = z.read(n).decode("utf-8", "ignore")
            for m in re.findall(r"<hp:t>(.*?)</hp:t>", xml, re.S):
                texts.append(html.unescape(re.sub(r"<[^>]+>", "", m)))
    return "\n".join(texts)


def extract_hwp(path):
    with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as tf:
        out = tf.name
    try:
        subprocess.run([HWP5TXT, "--output", out, path], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=90)
        with open(out, encoding="utf-8", errors="ignore") as f:
            return f.read()
    finally:
        if os.path.exists(out):
            os.unlink(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="data/announcements.json")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    os.makedirs(HWP_DIR, exist_ok=True)
    os.makedirs(OUT_TEXT_DIR, exist_ok=True)
    anns = json.load(open(args.inp, encoding="utf-8"))["announcements"]

    targets = []
    for a in anns:
        atts = a.get("attachments", [])
        if not atts or has_pdf(atts):
            continue  # PDF ones handled elsewhere
        att, kind = pick_hwp(atts)
        if att:
            targets.append((a, att, kind))
    if args.limit:
        targets = targets[: args.limit]

    print(f"{len(targets)} PDF-less announcements with a HWP(X) 공고문")

    index = []
    ok = fail = 0
    for i, (a, att, kind) in enumerate(targets, 1):
        post = a["postNo"]
        dest = os.path.join(HWP_DIR, f"{post}.{kind}")
        rec = {"postNo": post, "title": a["title"], "hwpName": att["name"], "kind": kind}
        try:
            if not os.path.exists(dest) or args.force:
                download(att["url"], a["detailUrl"], dest)
            text = extract_hwpx(dest) if kind == "hwpx" else extract_hwp(dest)
            text = re.sub(r"\n{3,}", "\n\n", text).strip()
            header = (f"[공고제목] {a['title']}\n[HWP파일명] {att['name']}\n[형식] {kind}\n"
                      + "=" * 60 + "\n")
            open(os.path.join(OUT_TEXT_DIR, f"{post}.txt"), "w", encoding="utf-8").write(header + text)
            rec["chars"] = len(text)
            ok += 1
        except Exception as e:  # noqa: BLE001
            rec["error"] = str(e)
            rec["chars"] = 0
            fail += 1
        index.append(rec)
        if i % 10 == 0 or i == len(targets):
            print(f"  {i}/{len(targets)} ok={ok} fail={fail}", flush=True)
        time.sleep(0.15)

    json.dump(index, open("data/hwp_index.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    empty = sum(1 for r in index if r.get("chars", 0) == 0)
    print(f"\nSaved {len(index)} -> data/hwp_index.json | ok={ok} fail={fail} empty={empty}")


if __name__ == "__main__":
    main()
