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
    attachments: (a.attachments || []).map((x) => ({ name: x.name, url: x.url })),
  };
  if (pf) {
    item.researchPeriod = pf.researchPeriod || null;
    item.funding = pf.funding || null;
    item.employmentType = (pf.eligibility && pf.eligibility.employmentType) || null;
    item.targetSummary = (pf.eligibility && pf.eligibility.targetSummary) || null;
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
