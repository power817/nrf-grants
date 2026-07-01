'use strict';
/**
 * NRF 신규사업공모 collector.
 *
 * Usage:
 *   node src/collect.js                      # current year, list + detail
 *   node src/collect.js --years 2026,2025    # specific years
 *   node src/collect.js --from 2023 --to 2026
 *   node src/collect.js --list-only          # skip detail fetch (fast)
 *   node src/collect.js --limit 5            # cap detail fetches (testing)
 *   node src/collect.js --concurrency 6
 *   node src/collect.js --out data/announcements.json
 */
const fs = require('fs');
const path = require('path');
const { fetchText, sleep, mapLimit, listUrl, BASE } = require('./http');
const { parseList, parseLastPage, parseDetail } = require('./parse');

function parseArgs(argv) {
  const a = { years: null, from: null, to: null, listOnly: false, limit: null, concurrency: 4, out: 'data/announcements.json' };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--years') a.years = argv[++i].split(',').map((s) => parseInt(s.trim(), 10));
    else if (k === '--from') a.from = parseInt(argv[++i], 10);
    else if (k === '--to') a.to = parseInt(argv[++i], 10);
    else if (k === '--list-only') a.listOnly = true;
    else if (k === '--limit') a.limit = parseInt(argv[++i], 10);
    else if (k === '--concurrency') a.concurrency = parseInt(argv[++i], 10);
    else if (k === '--out') a.out = argv[++i];
  }
  return a;
}

function resolveYears(a, currentYear) {
  if (a.years) return a.years;
  if (a.from || a.to) {
    const from = a.from || currentYear;
    const to = a.to || currentYear;
    const out = [];
    for (let y = to; y >= from; y--) out.push(y);
    return out;
  }
  return [currentYear];
}

async function collectListForYear(year) {
  const first = await fetchText(listUrl({ year, pageNum: 1 }));
  let items = parseList(first);
  const lastPage = parseLastPage(first);
  process.stdout.write(`  [${year}] page 1/${lastPage}: ${items.length} items\n`);
  for (let p = 2; p <= lastPage; p++) {
    await sleep(200);
    const html = await fetchText(listUrl({ year, pageNum: p }));
    const more = parseList(html);
    items = items.concat(more);
    process.stdout.write(`  [${year}] page ${p}/${lastPage}: ${more.length} items\n`);
    if (more.length === 0) break;
  }
  return items.map((it) => ({ ...it, year }));
}

async function main() {
  const args = parseArgs(process.argv);
  // currentYear is passed via arg-free default; hard-code fallback avoids Date in headless contexts.
  const currentYear = args.currentYear || new Date().getFullYear();
  const years = resolveYears(args, currentYear);

  console.log(`NRF collector — years: ${years.join(', ')} | detail: ${!args.listOnly} | concurrency: ${args.concurrency}`);

  // 1) List phase (dedupe by postNo)
  let list = [];
  for (const y of years) list = list.concat(await collectListForYear(y));
  const byPost = new Map();
  for (const it of list) if (!byPost.has(it.postNo)) byPost.set(it.postNo, it);
  let records = [...byPost.values()];
  console.log(`\nList phase done: ${records.length} unique announcements`);

  // 2) Detail phase
  if (!args.listOnly) {
    let targets = records;
    if (args.limit) targets = records.slice(0, args.limit);
    console.log(`Fetching ${targets.length} detail pages...`);
    let done = 0;
    await mapLimit(targets, args.concurrency, async (rec) => {
      try {
        const html = await fetchText(rec.detailUrl, { referer: listUrl({ year: rec.year }) });
        const d = parseDetail(html);
        Object.assign(rec, {
          amountRaw: d.amountRaw,
          amountKRW: d.amountKRW,
          detailApplyStart: d.applyStart,
          detailApplyEnd: d.applyEnd,
          registrant: d.registrant,
          regDate: d.regDate,
          views: d.views,
          attachments: d.attachments,
          bodyText: d.bodyText,
          detailFetched: true,
        });
      } catch (err) {
        rec.detailFetched = false;
        rec.detailError = String(err.message || err);
      }
      done++;
      if (done % 10 === 0 || done === targets.length) process.stdout.write(`  detail ${done}/${targets.length}\r`);
      await sleep(120);
    });
    process.stdout.write('\n');
    const failed = targets.filter((r) => r.detailFetched === false);
    if (failed.length) console.log(`  ${failed.length} detail fetches failed`);
  }

  // 3) Save
  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const payload = {
    source: `${BASE}/page/362?menuNo=362&bizNotGubn=guide`,
    collectedYears: years,
    count: records.length,
    announcements: records,
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`\nSaved ${records.length} announcements -> ${args.out}`);

  // quick stats
  const withAmount = records.filter((r) => r.amountKRW != null).length;
  const withAtt = records.filter((r) => (r.attachments || []).length > 0).length;
  console.log(`  with 사업금액: ${withAmount} | with 첨부: ${withAtt}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
