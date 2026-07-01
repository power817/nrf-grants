'use strict';
const cheerio = require('cheerio');

const BASE = 'https://www.nrf.re.kr';

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

// "2026-02-10 09:00 ~ 2026-04-20 18:00" -> { start, end }
function parsePeriod(text) {
  const re = /(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?)\s*~\s*(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?)/;
  const m = (text || '').match(re);
  return m ? { start: m[1].trim(), end: m[2].trim() } : { start: null, end: null };
}

// "600,000,000 원" -> 600000000
function parseAmount(text) {
  if (!text) return null;
  const digits = text.replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : null;
}

/** Parse a 신규사업공모 list page into announcement summaries. */
function parseList(html) {
  const $ = cheerio.load(html);
  const items = [];
  $('div.public-notice-block').each((_, el) => {
    const $el = $(el);
    const a = $el.find('a.view_btn[data-post_no]').first();
    if (!a.length) return;

    const postNo = a.attr('data-post_no');
    const bizNo = a.attr('data-biz_no') || '';
    const closeYn = a.attr('data-post_close_yn') || '';
    const title = clean(a.text());

    const catRaw = clean($el.find('.bread-crumb-text').first().text()).replace(/^\[|\]$/g, '').trim();
    const categoryPath = catRaw.split('>').map((s) => s.trim()).filter(Boolean);

    const infoText = clean($el.find('.info-text').first().text()); // "접수일자 : start ~ end"
    const { start: applyStart, end: applyEnd } = parsePeriod(infoText);

    const status = clean($el.find('.state-block .block-text, .pnb-state .block-text').first().text());
    const tag = clean($el.find('.title-category').first().text());

    items.push({
      postNo,
      bizNo,
      closeYn,
      title,
      category: catRaw,
      categoryPath,
      applyStart,
      applyEnd,
      status,
      modified: /수정/.test(tag),
      detailUrl: `${BASE}/biz/notice/view?ac=view&postNo=${postNo}&menuNo=362&bizNotGubn=guide&bizNo=${bizNo}`,
    });
  });
  return items;
}

/** Detect how many result pages exist (from the pagination widget). */
function parseLastPage(html) {
  const $ = cheerio.load(html);
  let max = 1;
  $('.omks--board-pagination a, .pagi-num, .pagi-nums a').each((_, el) => {
    const oc = $(el).attr('onclick') || '';
    const m = oc.match(/goSearch\((\d+)\)/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
    const n = parseInt(clean($(el).text()), 10);
    if (Number.isFinite(n)) max = Math.max(max, n);
  });
  return max;
}

/** Parse a notice detail page. */
function parseDetail(html) {
  const $ = cheerio.load(html);

  // Structured header rows: "신청 기간 : ...", "사업 금액 : ... 원"
  let applyPeriodRaw = null;
  let amountRaw = null;
  $('p.omks--stnc-text').each((_, el) => {
    const t = clean($(el).text());
    let m;
    if ((m = t.match(/^신청\s*기간\s*:\s*(.+)$/))) applyPeriodRaw = m[1].trim();
    else if ((m = t.match(/^사업\s*금액\s*:\s*(.+)$/))) amountRaw = m[1].trim();
  });

  // 등록자 / 등록일 / 조회수
  let registrant = null;
  let regDate = null;
  let views = null;
  $('span.info-text').each((_, el) => {
    const t = clean($(el).text());
    let m;
    if ((m = t.match(/^등록자\s*:\s*(.+)$/))) registrant = m[1].trim();
    else if ((m = t.match(/^등록일\s*:\s*(.+)$/))) regDate = m[1].trim();
    else if ((m = t.match(/^조회수\s*:\s*(.+)$/))) views = m[1].trim().replace(/,/g, '');
  });

  // Attachments (real 서식 files)
  const attachments = [];
  $('a.omks--file-name[data-attach_no]').each((_, el) => {
    const name = clean($(el).text());
    const attachNo = $(el).attr('data-attach_no');
    if (!name) return;
    attachments.push({ name, attachNo, url: `${BASE}/download/post/loading/${attachNo}` });
  });

  // Announcement body text — tightest element containing both the 공고내용 marker region.
  // Grab the container holding the 공고 prose; fall back to the stnc section parent.
  let bodyText = '';
  const bodyEl = $('.omks--editor-view, .board-view-content, [class*="editor"]').filter((_, el) =>
    /공고|사업|과제|지원/.test($(el).text())
  ).first();
  if (bodyEl && bodyEl.length) {
    bodyText = clean(bodyEl.text());
  } else {
    // fallback: text after the "공고내용" label
    const all = clean($('.cms-contents, .contents-body, main').first().text());
    const idx = all.indexOf('공고내용');
    bodyText = idx >= 0 ? all.slice(idx, idx + 20000) : all.slice(0, 20000);
  }

  const period = parsePeriod(applyPeriodRaw || '');

  return {
    amountRaw,
    amountKRW: parseAmount(amountRaw),
    applyPeriodRaw,
    applyStart: period.start,
    applyEnd: period.end,
    registrant,
    regDate,
    views: views ? parseInt(views, 10) : null,
    attachments,
    bodyText,
  };
}

module.exports = { parseList, parseLastPage, parseDetail, parsePeriod, parseAmount, BASE };
