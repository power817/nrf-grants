'use strict';

const BASE = 'https://www.nrf.re.kr';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const DEFAULT_REFERER = `${BASE}/page/362?menuNo=362&bizNotGubn=guide`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, { referer = DEFAULT_REFERER, retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Referer: referer,
          'Accept-Language': 'ko,en;q=0.8',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < retries - 1) await sleep(700 * (attempt + 1));
    }
  }
  throw lastErr;
}

// Minimal concurrency limiter.
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

// Build the "all periods within a year" list URL that the site's own search submits.
function listUrl({ year, pageNum = 1, pageSize = 100 }) {
  const qs = new URLSearchParams({
    menuNo: '362',
    bizNo: '0',
    bizNotGubn: 'guide',
    pageNum: String(pageNum),
    searchRegChoiceDttm: 'M',
    bizSearchRegDttmAllYn: 'Y',
    searchRegYearDttm: String(year),
    orderType: 'REG_DTTM',
    orderTypeAt: 'DESC',
    pageSize: String(pageSize),
  });
  return `${BASE}/page/362?${qs.toString()}`;
}

module.exports = { BASE, fetchText, sleep, mapLimit, listUrl };
