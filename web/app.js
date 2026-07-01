'use strict';

const state = { data: null, filtered: [] };

const $ = (sel) => document.querySelector(sel);
const els = {};

// ---------- helpers ----------
function parseDate(s) {
  if (!s) return null;
  const d = new Date(s.replace(' ', 'T'));
  return isNaN(d) ? null : d;
}
function fmtAmount(n) {
  if (n == null || n === 0) return null;
  if (n >= 1e8) return (n / 1e8).toFixed(n % 1e8 === 0 ? 0 : 1).replace(/\.0$/, '') + '억원';
  if (n >= 1e4) return Math.round(n / 1e4).toLocaleString() + '만원';
  return n.toLocaleString() + '원';
}
function esc(s) {
  return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function ddayInfo(item) {
  const end = parseDate(item.applyEnd);
  const now = new Date();
  if (item.status === '접수대기') {
    const start = parseDate(item.applyStart);
    return { cls: 'none', text: start ? `${item.applyStart.slice(0, 10)} 접수예정` : '접수예정' };
  }
  if (item.status === '접수마감' || !end || end < now) return { cls: 'none', text: '마감' };
  const days = Math.ceil((end - now) / 86400000);
  return { cls: days <= 7 ? 'soon' : '', text: days === 0 ? 'D-day' : `D-${days}` };
}
function statusBadge(status) {
  if (status === '접수중') return '<span class="badge open">접수중</span>';
  if (status === '접수대기') return '<span class="badge wait">접수대기</span>';
  return '<span class="badge closed">접수마감</span>';
}

// ---------- calendar (.ics + Google Calendar) ----------
const pad = (n) => String(n).padStart(2, '0');
const icsDate = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const icsStampUTC = (d) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const escICS = (s) => (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function foldICS(line) {
  if (line.length <= 74) return line;
  let out = '', i = 0;
  while (i < line.length) { const take = i ? 73 : 74; out += (i ? '\r\n ' : '') + line.slice(i, i + take); i += take; }
  return out;
}
function deadlineDate(item) { return parseDate(item.applyEnd) || parseDate(item.applyStart); }
function calDetails(item) {
  const parts = [];
  const amount = fmtAmount(item.amountKRW); if (amount) parts.push('연구비: ' + amount);
  const rp = item.researchPeriod || {};
  const period = rp.totalText || (rp.totalMonths ? rp.totalMonths + '개월' : null);
  if (period) parts.push('연구기간: ' + period);
  if (item.applyStart && item.applyEnd) parts.push(`신청기간: ${item.applyStart} ~ ${item.applyEnd}`);
  if (item.employmentType) parts.push('지원대상: ' + item.employmentType);
  parts.push('공고 보기: ' + item.detailUrl);
  return parts.join('\n');
}
function buildICS(item) {
  const end = deadlineDate(item); if (!end) return null;
  const day = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const next = new Date(day); next.setDate(day.getDate() + 1);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NRF Grants//KO//', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:nrf-' + item.postNo + '@nrf.re.kr',
    'DTSTAMP:' + icsStampUTC(new Date()),
    'DTSTART;VALUE=DATE:' + icsDate(day),
    'DTEND;VALUE=DATE:' + icsDate(next),
    'SUMMARY:' + escICS('[NRF 신청마감] ' + item.title),
    'DESCRIPTION:' + escICS(calDetails(item)),
    'URL:' + escICS(item.detailUrl),
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + escICS(item.title + ' 신청마감 D-7'), 'TRIGGER:-P7D', 'END:VALARM',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + escICS(item.title + ' 신청마감 D-1'), 'TRIGGER:-P1D', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.map(foldICS).join('\r\n');
}
function googleCalUrl(item) {
  const end = deadlineDate(item); if (!end) return '#';
  const day = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const next = new Date(day); next.setDate(day.getDate() + 1);
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: '[NRF 신청마감] ' + item.title,
    dates: `${icsDate(day)}/${icsDate(next)}`,
    details: calDetails(item),
  });
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}
function downloadICS(item) {
  const ics = buildICS(item); if (!ics) return;
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `NRF_${item.postNo}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- explode announcements into one entry per 지원자격(role) ----------
function itemRoles(item) { return Array.isArray(item.eligibleRoles) ? item.eligibleRoles : []; }
const ROLE_ORDER = { '전임': 0, '비전임': 1, '학생': 2, '기관': 3, '기타': 9 };
// A grant open to 전임+비전임+학생 becomes THREE separate entries (one per role).
function buildEntries(items) {
  const out = [];
  for (const it of items) {
    let roles = Array.isArray(it.eligibleRoles) ? [...new Set(it.eligibleRoles.filter((r) => r !== '기타'))] : [];
    if (!roles.length) roles = ['기타']; // no doc / unclassified -> single '기타' entry
    roles.sort((a, b) => (ROLE_ORDER[a] ?? 5) - (ROLE_ORDER[b] ?? 5));
    for (const role of roles) out.push(Object.assign({}, it, { role }));
  }
  return out;
}

function scoreItem(item, f) {
  let s = 0;
  // status recency
  if (item.status === '접수중') s += 2;
  else if (item.status === '접수대기') s += 1;
  // keyword hits
  if (f.keywords.length) {
    const hay = (item.title + ' ' + item.category + ' ' + (item.targetSummary || '')).toLowerCase();
    let hits = 0;
    for (const kw of f.keywords) if (hay.includes(kw)) hits++;
    s += Math.min(hits, 3) * 2;
  }
  // has structured data → mildly prefer (more useful cards)
  if (item.researchPeriod && item.researchPeriod.totalText) s += 0.5;
  return s;
}

function keywordMatch(item, keywords) {
  if (!keywords.length) return true;
  const hay = (item.title + ' ' + item.category + ' ' + (item.targetSummary || '')).toLowerCase();
  return keywords.some((kw) => hay.includes(kw));
}

// ---------- filter + render ----------
function readFilters() {
  return {
    emp: els.emp.value,
    keywords: els.keyword.value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    category: els.category.value,
    amount: parseInt(els.amount.value, 10) || 0,
    openOnly: els.open.checked,
    sort: els.sort.value,
  };
}

function apply() {
  const f = readFilters();
  let items = state.entries.filter((it) => {
    if (f.openOnly && !(it.status === '접수중' || it.status === '접수대기')) return false;
    if (f.emp && it.role !== f.emp) return false; // 지원자격별로 분리된 항목 중 해당 역할만
    if (f.category && it.topCategory !== f.category) return false;
    if (f.amount && !(it.amountKRW && it.amountKRW >= f.amount)) return false;
    if (!keywordMatch(it, f.keywords)) return false;
    return true;
  });

  items.forEach((it) => { it._score = scoreItem(it, f); });

  const byDeadline = (a, b) => {
    const ea = parseDate(a.applyEnd), eb = parseDate(b.applyEnd);
    const oa = a.status === '접수중' || a.status === '접수대기';
    const ob = b.status === '접수중' || b.status === '접수대기';
    if (oa !== ob) return oa ? -1 : 1;
    if (!ea) return 1; if (!eb) return -1;
    return ea - eb;
  };
  const sorters = {
    match: (a, b) => b._score - a._score || byDeadline(a, b),
    deadline: byDeadline,
    amount: (a, b) => (b.amountKRW || 0) - (a.amountKRW || 0),
    recent: (a, b) => parseInt(b.postNo, 10) - parseInt(a.postNo, 10),
  };
  items.sort(sorters[f.sort] || sorters.match);

  state.filtered = items;
  render(items, f);
}

function cardHTML(item) {
  const dd = ddayInfo(item);
  const amount = fmtAmount(item.amountKRW);
  const rp = item.researchPeriod || {};
  const fu = item.funding || {};
  const period = rp.totalText || (rp.totalMonths ? rp.totalMonths + '개월' : null);
  const perYear = fu.perYearPerProjectText;
  const apply = item.applyStart && item.applyEnd
    ? `${item.applyStart.slice(0, 16)} ~ ${item.applyEnd.slice(0, 16)}` : '—';
  // this entry represents a single 지원자격 role
  const roleBadge = item.role && item.role !== '기타'
    ? `<span class="badge role r-${esc(item.role)}">${esc(item.role)} 지원</span>`
    : '';

  const atts = item.attachments || [];
  const fileChips = atts.slice(0, 3).map((a) =>
    `<a class="file-chip" href="${esc(a.url)}" target="_blank" rel="noopener" title="${esc(a.name)}">📎 ${esc(a.name)}</a>`
  ).join('');
  const moreFiles = atts.length > 3 ? `<span class="file-chip more">+${atts.length - 3}개</span>` : '';

  const metaRow = (k, v, muted) =>
    `<div class="meta"><span class="k">${k}</span><span class="v${muted ? ' muted' : ''}">${v}</span></div>`;

  return `
  <article class="card">
    <div class="card-top">
      ${statusBadge(item.status)}
      ${roleBadge}
      <span class="dday ${dd.cls}">${dd.text}</span>
      <span class="card-cat">${esc((item.categoryPath || []).join(' › ') || item.category)}</span>
    </div>
    <h3 class="card-title"><a href="${esc(item.detailUrl)}" target="_blank" rel="noopener">${esc(item.title)}</a></h3>
    <div class="meta-grid">
      ${metaRow('연구비', amount ? `${amount}${perYear ? ` · 과제당 ${esc(perYear)}` : ''}` : '<span>미표기</span>', !amount)}
      ${metaRow('연구기간', period ? esc(period) : '첨부 공고문 참조', !period)}
      ${metaRow('신청기간', apply)}
      ${metaRow('지원대상', item.targetSummary ? esc(item.targetSummary) : (itemRoles(item).length ? esc(itemRoles(item).join(', ')) : '상세 참조'), !item.targetSummary && !itemRoles(item).length)}
    </div>
    <div class="card-foot">
      ${atts.length ? `<div class="files">${fileChips}${moreFiles}</div>` : '<span></span>'}
      <div class="cal-wrap">
        <button class="cal-btn" type="button" data-post="${item.postNo}">📅 캘린더에 추가 ▾</button>
        <div class="cal-menu" hidden>
          <a class="cal-item" href="${esc(googleCalUrl(item))}" target="_blank" rel="noopener">Google 캘린더</a>
          <button class="cal-item" type="button" data-act="ics" data-post="${item.postNo}">.ics 다운로드 (Apple·Outlook)</button>
        </div>
      </div>
    </div>
  </article>`;
}

function render(items, f) {
  els.cards.innerHTML = items.map(cardHTML).join('');
  els.count.textContent = `${items.length.toLocaleString()}건`;
  const uniquePosts = new Set(items.map((i) => i.postNo)).size;
  const openN = new Set(items.filter((i) => i.status === '접수중').map((i) => i.postNo)).size;
  els.note.textContent = items.length
    ? `· 공고 ${uniquePosts}건을 지원자격별로 분리 · 접수중 ${openN}건`
    : '';
  els.empty.hidden = items.length > 0;
}

// ---------- init ----------
async function init() {
  els.emp = $('#f-employment');
  els.keyword = $('#f-keyword');
  els.category = $('#f-category');
  els.amount = $('#f-amount');
  els.open = $('#f-open');
  els.sort = $('#f-sort');
  els.cards = $('#cards');
  els.count = $('#result-count');
  els.note = $('#result-note');
  els.empty = $('#empty');

  let data;
  try {
    const res = await fetch('data.json');
    data = await res.json();
  } catch (e) {
    els.cards.innerHTML = `<div class="empty">데이터를 불러오지 못했습니다. 로컬 서버로 실행했는지 확인하세요.<br><code>python3 -m http.server</code></div>`;
    return;
  }
  state.data = data;
  state.byPost = new Map(data.items.map((it) => [it.postNo, it]));
  state.entries = buildEntries(data.items); // one entry per (공고 × 지원자격)

  $('#meta-count').textContent =
    `${data.collectedYears?.join('·') || ''} 공고 ${data.count}건 (연구기간·전임여부 ${data.enrichedCount}건)`;
  const src = $('#source-link');
  if (data.source) src.href = data.source;

  // categories
  for (const c of data.topCategories) {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = `${c.name} (${c.count})`;
    els.category.appendChild(opt);
  }

  // events
  ['change', 'input'].forEach((ev) => {
    els.keyword.addEventListener(ev, debounce(apply, 200));
  });
  [els.emp, els.category, els.amount, els.open, els.sort].forEach((el) => el.addEventListener('change', apply));
  $('#f-reset').addEventListener('click', () => {
    els.emp.value = ''; els.keyword.value = ''; els.category.value = '';
    els.amount.value = '0'; els.open.checked = true; els.sort.value = 'match';
    apply();
  });

  // calendar menu (event delegation)
  els.cards.addEventListener('click', (e) => {
    const btn = e.target.closest('.cal-btn');
    if (btn) {
      const menu = btn.nextElementSibling;
      document.querySelectorAll('.cal-menu').forEach((m) => { if (m !== menu) m.hidden = true; });
      menu.hidden = !menu.hidden;
      return;
    }
    const ics = e.target.closest('.cal-item[data-act="ics"]');
    if (ics) {
      const it = state.byPost.get(ics.dataset.post);
      if (it) downloadICS(it);
      ics.closest('.cal-menu').hidden = true;
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.cal-wrap')) document.querySelectorAll('.cal-menu').forEach((m) => (m.hidden = true));
  });

  apply();
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

init();
