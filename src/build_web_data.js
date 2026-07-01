'use strict';
/**
 * Build a compact frontend dataset from the enriched announcements.
 *   node src/build_web_data.js
 * Reads data/announcements_enriched.json (falls back to data/announcements.json),
 * writes web/data.json with only the fields the UI needs.
 */
const fs = require('fs');
const path = require('path');

const inEnriched = 'data/announcements_enriched.json';
const inPlain = 'data/announcements.json';
const outPath = 'web/data.json';

const src = fs.existsSync(inEnriched) ? inEnriched : inPlain;
const data = JSON.parse(fs.readFileSync(src, 'utf8'));

// Strip legal-citation boilerplate from 지원대상 for readability, e.g.
// "…법 …에서 정하는 기관·단체(대학, 출연연 …)에 소속되어 …수행할 수 있는 연구자" -> "대학, 출연연 …에 소속된 연구자"
function cleanTarget(s) {
  if (!s) return s;
  // "…정하는 기관·단체(대학, 출연연 …)에 소속되어 …수행할 수 있는 연구자" -> "대학, 출연연 …에 소속된 연구자"
  s = s.replace(
    /[^.]*?(?:정하는|해당하는)\s*기관(?:[·ㆍ\s및]*단체)?\s*\(([^)]*)\)에\s*소속(?:되어|한)[^.]*?(?:수행할|참여할|신청할)\s*수\s*있는\s*연구자/g,
    '$1에 소속된 연구자'
  );
  // 문장 앞의 "…법 …에서 정하는 " 법령 인용 접두 제거
  s = s.replace(/(^|\.\s*)[가-힣]*법[^.(]*?(?:에서|에\s*따라)\s*정하는\s+/g, '$1');
  return s.trim();
}

function compact(a) {
  const pf = a.pdfFields || null;
  const item = {
    postNo: a.postNo,
    title: a.title,
    category: a.category,
    categoryPath: a.categoryPath || [],
    topCategory: (a.categoryPath && a.categoryPath[0]) || a.category || '',
    status: a.status,
    applyStart: a.applyStart,
    applyEnd: a.applyEnd,
    amountKRW: a.amountKRW ?? null,
    amountRaw: a.amountRaw ?? null,
    modified: !!a.modified,
    detailUrl: a.detailUrl,
    eligibleRoles: a.eligibleRoles || null,
    // funding range + total period (extracted)
    fundingDisplay: a.fundingDisplay || null,
    fundingMinKRW: a.fundingMinKRW ?? null,
    fundingMaxKRW: a.fundingMaxKRW ?? null,
    periodTotalText: a.periodTotalText || null,
    periodMonths: a.periodMonths ?? null,
    attachments: (a.attachments || []).map((x) => ({ name: x.name, url: x.url })),
  };
  if (pf) {
    item.researchPeriod = pf.researchPeriod || null;
    item.funding = pf.funding || null;
    item.employmentType = (pf.eligibility && pf.eligibility.employmentType) || null;
    item.targetSummary = cleanTarget((pf.eligibility && pf.eligibility.targetSummary) || null);
    item.confidence = pf.confidence || null;
  } else {
    item.researchPeriod = null;
    item.funding = null;
    item.employmentType = null;
    item.targetSummary = null;
    item.confidence = null;
  }
  return item;
}

const items = data.announcements.map(compact);

// facets for the UI (unique top categories)
const cats = {};
for (const it of items) if (it.topCategory) cats[it.topCategory] = (cats[it.topCategory] || 0) + 1;
const topCategories = Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ name: k, count: v }));

const payload = {
  source: data.source,
  generatedAt: new Date().toISOString(),
  collectedYears: data.collectedYears || [],
  count: items.length,
  enrichedCount: items.filter((i) => i.employmentType).length,
  topCategories,
  items,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(payload));
console.log(`built ${outPath}: ${items.length} items (${payload.enrichedCount} with PDF fields), ${topCategories.length} categories`);
console.log(`  size: ${(fs.statSync(outPath).size / 1024).toFixed(0)} KB (source: ${src})`);
