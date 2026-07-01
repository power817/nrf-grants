'use strict';
/**
 * Offline regression test for the parsers, run against saved fixtures.
 *   node tests/parse.test.js
 * Exits non-zero on failure.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { parseList, parseLastPage, parseDetail } = require('../src/parse');

const fx = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');
let passed = 0;
const check = (name, fn) => {
  fn();
  passed++;
  console.log('  ok -', name);
};

console.log('LIST');
const listHtml = fx('list.html');
const items = parseList(listHtml);
check('parses 100 items on a full page', () => assert.strictEqual(items.length, 100));
check('every item has postNo + title', () => assert(items.every((i) => i.postNo && i.title)));
check('every item has a parsed 신청기간 start', () => assert(items.every((i) => i.applyStart)));
check('detects pagination (last page = 3)', () => assert.strictEqual(parseLastPage(listHtml), 3));
check('builds a detail URL', () => assert(items[0].detailUrl.includes('/biz/notice/view?ac=view&postNo=')));

console.log('DETAIL');
const d = parseDetail(fx('detail.html'));
check('parses 사업금액 -> number', () => assert.strictEqual(d.amountKRW, 600000000));
check('parses 신청기간 start/end', () => assert(d.applyStart && d.applyEnd));
check('parses 등록자/조회수', () => assert(d.registrant && typeof d.views === 'number'));
check('extracts attachments with download URLs', () => {
  assert(d.attachments.length >= 5);
  assert(d.attachments.every((a) => a.url.includes('/download/post/loading/')));
});
check('captures body text', () => assert(d.bodyText.length > 500));

console.log(`\n${passed} checks passed`);
