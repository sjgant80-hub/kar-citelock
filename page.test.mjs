// page.test.mjs — the live page's claim check (claim-page.js), run without a browser: index.html's inline script
// (the KERNEL block and the quote tool) and claim-page.js are loaded into one context with a small stand-in for the
// DOM, the buttons are pressed, and what lands on the page is compared with what kernel.mjs's verify() says.
// witness mutation-gates claim-page.js against these tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { verify, MESH_SKIP } from './kernel.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const HTML = read('./index.html');
const INLINE = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const PAGE_JS = read('./claim-page.js');

class Txt { constructor(t) { this.data = String(t); this.parentNode = null; } get textContent() { return this.data; } }
class El {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.childNodes = []; this.parentNode = null; this.attrs = {}; this.listeners = {};
    this.className = ''; this.value = ''; this.placeholder = ''; this.style = {}; this.scrolled = 0;
    this.classList = {
      add: (c) => { if (!this.classList.contains(c)) this.className = (this.className + ' ' + c).trim(); },
      remove: (c) => { this.className = this.className.split(' ').filter((x) => x && x !== c).join(' '); },
      contains: (c) => this.className.split(' ').includes(c),
    };
  }
  get children() { return this.childNodes.filter((n) => n instanceof El); }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(v) { this.replaceChildren(); if (String(v) !== '') this.appendChild(new Txt(v)); }
  set innerHTML(v) { this.replaceChildren(); this.html = String(v); }
  get innerHTML() { return this.html || ''; }
  appendChild(n) { if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.push(n); return n; }
  insertBefore(n) { return this.appendChild(n); }
  removeChild(n) { this.childNodes = this.childNodes.filter((x) => x !== n); n.parentNode = null; return n; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  replaceChildren(...ns) { for (const n of this.childNodes) n.parentNode = null; this.childNodes = []; for (const n of ns) this.appendChild(n); }
  querySelector(tag) { for (const k of this.children) { if (k.tagName === tag.toUpperCase()) return k; const f = k.querySelector(tag); if (f) return f; } return null; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  click() { for (const f of this.listeners.click || []) f({ preventDefault() {}, target: this }); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  scrollIntoView() { this.scrolled++; }
}

const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

// a fresh page: every id in index.html, the data-limit / data-copy buttons, and the given fetch and clipboard
function load({ fetchFn, clipboard } = {}) {
  const byId = new Map();
  for (const m of HTML.matchAll(/<([a-z0-9]+)\b([^>]*)>/g)) {
    const id = m[2].match(/\bid="([^"]+)"/), cls = m[2].match(/\bclass="([^"]+)"/);
    if (!id) continue;
    const e = new El(m[1]);
    if (cls) e.className = cls[1];
    byId.set(id[1], e);
  }
  for (const m of HTML.matchAll(/<pre[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/pre>/g)) byId.get(m[1]).textContent = unescape(m[2]);
  const buttons = [];
  for (const m of HTML.matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)) {
    const a = m[1].match(/data-(limit|copy)="([^"]+)"/);
    if (!a) continue;
    const b = new El('button'); b.setAttribute('data-' + a[1], a[2]); b.textContent = m[2]; buttons.push(b);
  }
  const document = {
    getElementById: (id) => byId.get(id) || null,
    createElement: (t) => new El(t),
    createTextNode: (t) => new Txt(t),
    querySelectorAll: (sel) => buttons.filter((b) => b.getAttribute(sel.slice(1, -1)) !== null),
    querySelector: () => new El('div'),
    addEventListener: () => {},
    body: new El('body'),
  };
  const files = (p) => read('./' + p);
  const defaultFetch = async (p) => ({ ok: true, status: 200, text: async () => files(p), json: async () => JSON.parse(files(p)) });
  const ctx = {
    document, console, setTimeout, clearTimeout, TextEncoder, crypto: globalThis.crypto, Blob, URL,
    navigator: { clipboard }, fetch: fetchFn || defaultFetch,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(INLINE[0], ctx, { filename: 'index.html' });
  vm.runInContext(PAGE_JS, ctx, { filename: 'claim-page.js' });
  return { $: (id) => byId.get(id), ctx, buttons, limit: (k) => buttons.find((b) => b.getAttribute('data-limit') === k), copy: (k) => buttons.find((b) => b.getAttribute('data-copy') === k) };
}

const rowsOf = (p) => p.$('mSources').children.map((r) => [r.querySelector('input').value, r.querySelector('textarea').value]);
const cells = (p) => p.$('mTrace').children.map((tr) => tr.children.map((td) => td.textContent));
const setRows = (p, rows) => {
  p.$('mSources').replaceChildren();
  for (let i = 0; i < rows.length; i++) p.$('mAddSource').click();
  p.$('mSources').children.forEach((r, i) => { r.querySelector('input').value = rows[i][0]; r.querySelector('textarea').value = rows[i][1]; });
};
const KIND = { cite: 'citation', quote: 'quotation', number: 'number', word: 'word' };
// what the trace table must show for a verify() result, worked out from the kernel's own output
function expectedCells(input, r) {
  const texts = Object.fromEntries(r.trace.sources.map((s, i) => [s.id, input.sources[i].text]));
  return r.trace.checks.filter((c) => c.kind !== 'input').map((c) => [
    KIND[c.kind],
    c.kind === 'quote' ? '“' + c.text + '”' : c.kind === 'cite' ? '[' + c.text + ']' : c.text,
    c.ok ? '✓ yes' : '✗ no',
    !c.ok ? c.reason : c.kind === 'cite' ? 'one of the sources given'
      : c.raw ? c.source + ', characters ' + c.raw[0] + '–' + c.raw[1] + ': ' + texts[c.source].slice(c.raw[0], c.raw[1])
        : c.source + ', characters evened-out ' + c.norm[0] + '–' + c.norm[1] + ': (the raw text does not slice back to the match exactly here)',
  ]);
}
const R = 'Example Co. annual report, 2025. Revenue rose 12% to 4.2 million euros. The chair said: “we will open two new sites in 2026”.';
const S = 'Example Co. staff survey, March 2026. 81% of staff said they would recommend Example Co. as a place to work.';
const TRUE = { claim: 'Revenue rose 12% in 2025 [report], and the chair said "we will open two new sites in 2026" [report]. 81% of staff would recommend Example Co. [survey].', sources: [{ id: 'report', text: R }, { id: 'survey', text: S }] };
const FALSE = { claim: 'Revenue rose 21% in 2025 [report], and the chair said "we will open two new sites in 2027" [report].', sources: TRUE.sources };

test('page: loads with one empty source row, the skipped words from the kernel, and no result showing', () => {
  const p = load();
  assert.deepEqual(rowsOf(p), [['s1', '']]);
  const row = p.$('mSources').children[0];
  assert.equal(row.className, 'src-row');
  assert.equal(row.childNodes.length, 3);                                  // id, text, Remove: no stray text
  assert.equal(row.querySelector('input').placeholder, 'id, e.g. s1');
  assert.equal(row.querySelector('textarea').placeholder, 'Paste the source text…');
  assert.equal(row.querySelector('button').textContent, 'Remove');
  assert.equal(row.querySelector('button').className, 'ghost small-btn');
  assert.equal(p.$('skipWords').textContent, [...MESH_SKIP].join(', '));
  assert.equal(p.$('mOut').classList.contains('hidden'), true);
});

test('page: "Load a true claim" shows VERIFIED and every check where the kernel found it', () => {
  const p = load();
  p.$('mLoadTrue').click();
  const r = verify(TRUE);
  assert.equal(r.verdict, 'VERIFIED');
  assert.deepEqual(rowsOf(p), [['report', R], ['survey', S]]);
  assert.equal(p.$('mOut').classList.contains('hidden'), false);
  assert.equal(p.$('mVerdict').textContent, 'VERIFIED');
  assert.equal(p.$('mVerdict').className, 'badge VERIFIED');
  assert.equal(p.$('mSummary').textContent, '15 of 15 checks passed · sources searched: report, survey');
  assert.equal(p.$('mReasons').children.length, 0);
  assert.deepEqual(cells(p), expectedCells(TRUE, r));
  assert.deepEqual(cells(p)[3], ['quotation', '“we will open two new sites in 2026”', '✓ yes', 'report, characters 89–123: we will open two new sites in 2026']);
  assert.equal(p.$('mTrace').children[3].children[2].className, 'ok-yes');
  assert.equal(p.$('mTrace').children[3].children[3].children[0].className, 'hit');
  assert.equal(p.$('mSkipped').textContent, 'Skipped as small words (not checked): in, and, the, said, of');
  assert.equal(p.$('mJson').textContent, JSON.stringify(r, null, 2));
});

test('page: "Load a false claim" shows REFUSED, each reason, and the failed checks', () => {
  const p = load();
  p.$('mLoadFalse').click();
  const r = verify(FALSE);
  assert.equal(p.$('mVerdict').textContent, 'REFUSED');
  assert.equal(p.$('mVerdict').className, 'badge REFUSED');
  assert.deepEqual(p.$('mReasons').children.map((li) => li.textContent), r.reasons);
  assert.equal(r.reasons.length, 2);
  assert.deepEqual(cells(p), expectedCells(FALSE, r));
  const failed = p.$('mTrace').children.filter((tr) => tr.children[2].className === 'ok-no').map((tr) => tr.children[1].textContent);
  assert.deepEqual(failed, ['“we will open two new sites in 2027”', '21']);
  // 2 citations + 1 quotation + 2 numbers + 3 words = 8 checks; the quotation and 21 fail
  assert.equal(p.$('mSummary').textContent, '6 of 8 checks passed · sources searched: report');
});

test('page: rows with no id are cited by position, empty rows are left out, an id with no text is kept', () => {
  const p = load();
  setRows(p, [['', ''], ['', 'Revenue rose 12% in 2025.']]);
  p.$('mClaim').value = 'Revenue rose 12% [1].';
  p.$('mVerify').click();
  assert.equal(p.$('mVerdict').textContent, 'VERIFIED');
  assert.equal(p.$('mSummary').textContent, '4 of 4 checks passed · sources searched: 1');
  setRows(p, [['a', ''], ['', 'Revenue rose 12% in 2025.']]);
  p.$('mClaim').value = 'Revenue rose [2].';
  p.$('mVerify').click();
  assert.equal(p.$('mVerdict').textContent, 'VERIFIED');                   // the id-only row counts as source 1
  setRows(p, [['  b  ', 'Costs fell.']]);
  p.$('mClaim').value = 'Costs fell [b].';
  p.$('mVerify').click();
  assert.equal(p.$('mVerdict').textContent, 'VERIFIED');                   // the id is trimmed
});

test('page: a cited id that is not given, input the kernel refuses, and a match with no raw offsets', () => {
  const p = load();
  setRows(p, [['s1', 'Revenue rose.']]);
  p.$('mClaim').value = 'Revenue [s9]';
  p.$('mVerify').click();
  assert.equal(p.$('mSummary').textContent, '0 of 2 checks passed · sources searched: none');
  assert.deepEqual(cells(p)[0], ['citation', '[s9]', '✗ no', 'the claim cites [s9], which is not one of the sources given']);
  setRows(p, [['', '']]);
  p.$('mClaim').value = 'Revenue rose.';
  p.$('mVerify').click();
  assert.deepEqual(p.$('mReasons').children.map((li) => li.textContent), ['sources must be a list of 1 to 50 sources']);
  assert.equal(p.$('mSummary').textContent, '');                           // no check ran, so no count
  assert.equal(p.$('mTrace').children.length, 0);
  setRows(p, [['s1', 'Then we wait…']]);
  p.$('mClaim').value = '"we wait."';
  p.$('mVerify').click();
  assert.deepEqual(cells(p), [['quotation', '“we wait.”', '✓ yes', 's1, characters evened-out 5–13: (the raw text does not slice back to the match exactly here)']]);
  assert.equal(p.$('mSkipped').textContent, '');
  setRows(p, [['s1', 'The board [met].']]);
  p.$('mClaim').value = 'The board met [s1].';
  p.$('mVerify').click();
  assert.deepEqual(cells(p)[0], ['citation', '[s1]', '✓ yes', 'one of the sources given']);
});

test('page: Add a source stops at 50, Remove takes a row away and never leaves none, Clear resets', () => {
  const p = load();
  for (let i = 0; i < 60; i++) p.$('mAddSource').click();
  assert.equal(p.$('mSources').children.length, 50);
  assert.equal(p.$('mSources').children[1].querySelector('input').placeholder, 'id, e.g. s2');
  assert.deepEqual(rowsOf(p)[1], ['', '']);
  p.$('mSources').children[0].querySelector('button').click();
  assert.equal(p.$('mSources').children.length, 49);
  p.$('mLoadTrue').click();
  p.$('mClear').click();
  assert.deepEqual(rowsOf(p), [['s1', '']]);
  assert.equal(p.$('mClaim').value, '');
  assert.equal(p.$('mOut').classList.contains('hidden'), true);
  p.$('mSources').children[0].querySelector('button').click();
  assert.deepEqual(rowsOf(p), [['', '']]);                                  // removing the last row leaves a fresh empty one
});

test('page: the "Try it" buttons load each limit, run it and scroll to the box', () => {
  const p = load();
  for (const [k, claim] of [['joined', 'revenue rose 12%'], ['dropped', 'The board did approve the merger.']]) {
    p.limit(k).click();
    assert.equal(p.$('mClaim').value, claim);
    assert.equal(p.$('mVerdict').textContent, 'VERIFIED');
  }
  assert.equal(p.$('claim').scrolled, 2);
});

test('page: Copy puts the exact text on the clipboard, and says so when it cannot', async () => {
  const copied = [];
  const p = load({ clipboard: { writeText: async (t) => { copied.push(t); } } });
  for (const k of ['aNpx', 'aConfig', 'aClaude']) p.copy(k).click();
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(copied, ['npx -y github:sjgant80-hub/kar-citelock', p.$('aConfig').textContent, 'claude mcp add kar-citelock -- npx -y github:sjgant80-hub/kar-citelock']);
  assert.deepEqual(JSON.parse(copied[1]).mcpServers['kar-citelock'], { command: 'npx', args: ['-y', 'github:sjgant80-hub/kar-citelock'] });
  assert.equal(p.copy('aNpx').textContent, 'Copied');
  await new Promise((r) => setTimeout(r, 1300));
  assert.equal(p.copy('aNpx').textContent, 'Copy');
  const none = load();
  none.copy('aNpx').click();
  assert.equal(none.copy('aNpx').textContent, 'Select the text to copy');
  const refused = load({ clipboard: { writeText: async () => { throw new Error('blocked'); } } });
  refused.copy('aNpx').click();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(refused.copy('aNpx').textContent, 'Select the text to copy');
});

test('page: the recorded agent call is shown step by step, and re-run here gives the same answers', async () => {
  const p = load();
  await p.ctx.claimPageReady;
  const out = p.$('traceOut');
  assert.equal(out.children[0].textContent, 'The agent starts the server and introduces itself (initialize). The server answers as kar-citelock 1.1.0, protocol 2025-06-18, offering tools. Then the agent calls verify_claim twice:');
  const calls = out.children.filter((c) => c.className === 'trace-call');
  assert.equal(calls.length, 2);
  const text = (box, tag) => box.children.filter((c) => c.tagName === tag).map((c) => c.textContent);
  assert.deepEqual(text(calls[0], 'H3'), ['Call 1: the answer was VERIFIED']);
  assert.deepEqual(text(calls[1], 'H3'), ['Call 2: the answer was REFUSED']);
  assert.deepEqual(text(calls[0], 'PRE'), [TRUE.claim]);
  assert.deepEqual(calls[0].children.find((c) => c.tagName === 'UL').children.map((li) => li.textContent), ['[report] ' + R, '[survey] ' + S]);
  const steps = (box) => box.children.find((c) => c.tagName === 'OL').children.map((li) => li.textContent);
  assert.deepEqual(steps(calls[0]), [
    'Citations: [report] is a source given; [survey] is a source given. Sources searched: report, survey.',
    'Quotation “we will open two new sites in 2026”: found word for word in report, characters 89–123.',
    'Numbers: 12 (report, 46–48), 2025 (report, 27–31), 81 (survey, 38–40).',
    'Content words: Revenue (report, 33–40), rose (report, 41–45), chair (report, 76–81), staff (survey, 12–17), would (survey, 61–66), recommend (survey, 67–76), Example (report, 0–7), Co (report, 8–10).',
    'Skipped as small words: in, and, the, said, of.',
  ]);
  const F = verify(FALSE);
  assert.deepEqual(steps(calls[1]).slice(1, 3), ['Quotation “we will open two new sites in 2027”: ' + F.reasons[0] + '.', 'Numbers: 21 (not found), 2025 (report, 27–31).']);
  const ps = (box) => box.children.filter((c) => c.tagName === 'P');
  assert.equal(ps(calls[0]).at(-2).textContent, 'Answer: VERIFIED. Every check passed.');
  assert.equal(ps(calls[1]).at(-2).textContent, 'Answer: REFUSED, with 2 reasons: ' + F.reasons.join(' · '));
  for (const box of calls) {
    assert.equal(ps(box).at(-1).className, 'small match-yes');
    assert.equal(ps(box).at(-1).textContent, 'This page ran the same claim through its own copy of the check and got exactly the same answer.');
  }
  const raw = out.children.at(-1);
  assert.equal(raw.tagName, 'DETAILS');
  assert.equal(raw.children[1].textContent, read('./trace/mcp-call.in.jsonl').trim() + '\n\n' + read('./trace/mcp-call.out.jsonl').trim());
});

test('page: a recorded answer that differs from this page is flagged, and a missing recording says so', async () => {
  const tampered = read('./trace/mcp-call.out.jsonl').replace('"verdict":"VERIFIED"', '"verdict":"VERIFIED","extra":1');
  const files = { 'trace/mcp-call.in.jsonl': read('./trace/mcp-call.in.jsonl'), 'trace/mcp-call.out.jsonl': tampered };
  const p = load({ fetchFn: async (u) => ({ ok: true, status: 200, text: async () => files[u] }) });
  await p.ctx.claimPageReady;
  const flags = p.$('traceOut').children.filter((c) => c.className === 'trace-call').map((b) => b.children.filter((c) => c.tagName === 'P').at(-1));
  assert.deepEqual(flags.map((f) => f.className), ['small match-no', 'small match-yes']);
  assert.equal(flags[0].textContent, 'This page ran the same claim through its own copy of the check and got a DIFFERENT answer: do not rely on this page until that is fixed.');
  const gone = load({ fetchFn: async () => ({ ok: false, status: 404 }) });
  await gone.ctx.claimPageReady;
  assert.equal(gone.$('traceOut').textContent, 'The recorded call could not be read here; open trace/mcp-call.in.jsonl and trace/mcp-call.out.jsonl directly.');
  assert.equal(gone.$('traceOut').children[0].className, 'muted');
});
