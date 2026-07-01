'use strict';
/**
 * Merge LLM-extracted PDF fields (data/pdf_fields/<postNo>.json) back into the
 * announcements dataset.
 *
 *   node src/merge_fields.js
 *   node src/merge_fields.js --in data/announcements.json --fields data/pdf_fields --out data/announcements_enriched.json
 */
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const a = { in: 'data/announcements.json', fields: 'data/pdf_fields', out: 'data/announcements_enriched.json' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--in') a.in = argv[++i];
    else if (argv[i] === '--fields') a.fields = argv[++i];
    else if (argv[i] === '--out') a.out = argv[++i];
  }
  return a;
}

function main() {
  const args = parseArgs(process.argv);
  const data = JSON.parse(fs.readFileSync(args.in, 'utf8'));
  const dir = path.resolve(args.fields);

  const fieldFiles = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    : [];
  const byPost = new Map();
  let bad = 0;
  for (const f of fieldFiles) {
    const postNo = path.basename(f, '.json');
    try {
      byPost.set(postNo, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
    } catch (e) {
      bad++;
    }
  }

  let enriched = 0;
  const empDist = {};
  let withPeriod = 0;
  let withFunding = 0;
  for (const a of data.announcements) {
    const pf = byPost.get(a.postNo);
    if (!pf) {
      a.pdfFields = null;
      continue;
    }
    a.pdfFields = pf;
    enriched++;
    const emp = pf.eligibility && pf.eligibility.employmentType ? pf.eligibility.employmentType : '(none)';
    empDist[emp] = (empDist[emp] || 0) + 1;
    if (pf.researchPeriod && pf.researchPeriod.totalText) withPeriod++;
    if (pf.funding && (pf.funding.perYearPerProjectText || pf.funding.totalScaleText)) withFunding++;
  }

  data.enrichedCount = enriched;
  data.enrichedAt = new Date().toISOString();
  fs.writeFileSync(path.resolve(args.out), JSON.stringify(data, null, 2));

  console.log(`fields files: ${fieldFiles.length} (parse-failed: ${bad})`);
  console.log(`announcements enriched with PDF fields: ${enriched} / ${data.announcements.length}`);
  console.log(`  with 연구기간(totalText): ${withPeriod}`);
  console.log(`  with 연구비(funding text): ${withFunding}`);
  console.log('  전임/비전임 분포:', JSON.stringify(empDist, null, 0));
  console.log(`saved -> ${args.out}`);
}

main();
