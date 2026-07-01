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

  // eligibleRoles (separated 지원자격 roles), keyed by postNo
  const rolesDir = path.resolve('data/eligroles');
  const rolesByPost = new Map();
  if (fs.existsSync(rolesDir)) {
    for (const f of fs.readdirSync(rolesDir).filter((x) => x.endsWith('.json'))) {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(rolesDir, f), 'utf8'));
        if (Array.isArray(r.eligibleRoles)) rolesByPost.set(path.basename(f, '.json'), r.eligibleRoles);
      } catch (e) {
        /* skip */
      }
    }
  }

  // funding range + total period, keyed by postNo
  const mpDir = path.resolve('data/moneyperiod');
  const mpByPost = new Map();
  if (fs.existsSync(mpDir)) {
    for (const f of fs.readdirSync(mpDir).filter((x) => x.endsWith('.json'))) {
      try {
        mpByPost.set(path.basename(f, '.json'), JSON.parse(fs.readFileSync(path.join(mpDir, f), 'utf8')));
      } catch (e) {
        /* skip */
      }
    }
  }

  let enriched = 0;
  const empDist = {};
  let withPeriod = 0;
  let withFunding = 0;
  const roleDist = {};
  let withRange = 0;
  for (const a of data.announcements) {
    a.eligibleRoles = rolesByPost.get(a.postNo) || null;
    if (a.eligibleRoles) for (const r of a.eligibleRoles) roleDist[r] = (roleDist[r] || 0) + 1;
    const mp = mpByPost.get(a.postNo);
    if (mp) {
      a.fundingMinKRW = mp.fundingMinKRW ?? null;
      a.fundingMaxKRW = mp.fundingMaxKRW ?? null;
      a.fundingBasis = mp.fundingBasis ?? null;
      a.fundingDisplay = mp.fundingDisplay ?? null;
      a.periodTotalText = mp.periodTotalText ?? null;
      a.periodMonths = mp.periodMonths ?? null;
      if (a.fundingDisplay) withRange++;
    }
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
  console.log('  전임/비전임(단일) 분포:', JSON.stringify(empDist, null, 0));
  console.log('  eligibleRoles(다중) 분포:', JSON.stringify(roleDist, null, 0), `| 태그된 공고: ${rolesByPost.size}`);
  console.log(`  연구비 범위 표시문구 있는 공고: ${withRange} | moneyperiod 파일: ${mpByPost.size}`);
  console.log(`saved -> ${args.out}`);
}

main();
