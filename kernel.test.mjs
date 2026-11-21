// kernel.test.mjs — CiteLock's kernel (the KERNEL block of index.html, generated into kernel.mjs).
// Expected values are worked out by hand from the algorithm, never copied from a run. Each test names
// the behaviour it pins; witness v0.6 checks that every one of them actually bites (receipts/witness.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALGO_VERSION, NEAR_THRESHOLD, ZERO_HASH, normalize, hasSubtle, sha256Hex, canonicalize, canonicalJSON,
  levenshtein, similarity, findAnchor, contextSnippet, verifyClaim, makeSource, verifyAll, summarizeVerdicts,
  receiptPayload, chainHash, verifyLedger, isWordChar, findWhole, NO_SPACE_SCRIPTS,
  MESH_VERSION, MESH_MAX_CLAIM, MESH_MAX_SOURCES, MESH_MAX_TEXT, MESH_NEAR_MAX, MESH_SKIP,
  meshFold, meshNumberKey, meshTerms, meshMap, meshRaw, verify,
} from './kernel.mjs';

test('constants are the published algorithm', () => {
  assert.equal(ALGO_VERSION, 'citelock-v2');
  assert.equal(NEAR_THRESHOLD, 0.9);
  assert.equal(ZERO_HASH, '0'.repeat(64));
});

test('normalize: curly quotes, dashes, NBSP and runs of whitespace fold; non-strings become empty', () => {
  assert.equal(normalize('  a ‘b’  “c”—d e\n\tf  '), "a 'b' \"c\"-d e f");
  assert.equal(normalize('a  b'), 'a b');
  assert.equal(normalize('Ａ'), 'A');   // NFKC: fullwidth A
  assert.equal(normalize(42), '');
  assert.equal(normalize(null), '');
});

test('sha256Hex: the FIPS 180-2 test vector', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(await sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('hasSubtle: true only when crypto, crypto.subtle and subtle.digest all exist', async () => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const setCrypto = (value) => Object.defineProperty(globalThis, 'crypto', { value, configurable: true, writable: true });
  try {
    assert.equal(hasSubtle(), true);
    setCrypto(undefined);
    assert.equal(hasSubtle(), false);
    setCrypto({});
    assert.equal(hasSubtle(), false);
    setCrypto({ subtle: {} });
    assert.equal(hasSubtle(), false);
    await assert.rejects(sha256Hex('x'), /crypto\.subtle/);
  } finally {
    Object.defineProperty(globalThis, 'crypto', desc);
  }
  assert.equal(hasSubtle(), true);
});

test('canonicalize / canonicalJSON: keys sorted at every depth, arrays kept in order, primitives untouched', () => {
  assert.equal(canonicalJSON({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } }), '{"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}');
  assert.equal(canonicalize(null), null);
  assert.equal(canonicalize(7), 7);
  assert.equal(canonicalize('ab'), 'ab');
  assert.equal(canonicalJSON({ a: 1, s: 'x' }), '{"a":1,"s":"x"}');
});

test('levenshtein: textbook distances', () => {
  assert.equal(levenshtein('', 'abc'), 3);
  assert.equal(levenshtein('abc', ''), 3);
  assert.equal(levenshtein('abc', 'abc'), 0);
  assert.equal(levenshtein('abc', 'abd'), 1);
  assert.equal(levenshtein('abc', 'ab'), 1);
  assert.equal(levenshtein('ab', 'abc'), 1);
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('flaw', 'lawn'), 2);
});

test('similarity: 1 - distance / longer length; two empty strings are identical', () => {
  assert.equal(similarity('', ''), 1);
  assert.equal(similarity('abc', 'abd'), 1 - 1 / 3);
  assert.equal(similarity('abcd', 'ab'), 0.5);
});

test('findAnchor: the longest phrase of 8 down to 3 words found in the source', () => {
  // the full quote is found → its offset in the quote is 0
  assert.deepEqual(findAnchor('alpha beta gamma delta', 'xx alpha beta gamma delta'),
    { sourceIdx: 3, quoteOffset: 0, phrase: 'alpha beta gamma delta' });
  // only a 3-word phrase matches, and it is the last 3 words of the quote
  assert.deepEqual(findAnchor('zz yy xx beta gamma delta', 'beta gamma delta'),
    { sourceIdx: 0, quoteOffset: 9, phrase: 'beta gamma delta' });
  // 2 words are never an anchor
  assert.equal(findAnchor('beta gamma', 'beta gamma delta'), null);
  assert.equal(findAnchor('nothing here matches at all', 'beta gamma delta'), null);
});

test('findAnchor: empty words are dropped, and a phrase not found verbatim in the quote anchors at offset 0', () => {
  assert.deepEqual(findAnchor('one  two three four', 'one two three four'),
    { sourceIdx: 0, quoteOffset: 0, phrase: 'one two three four' });
});

test('contextSnippet: pads 30 by default, ellipsis only where text was cut', () => {
  const norm = 'x'.repeat(100);
  assert.equal(contextSnippet(norm, 50, 5), '…' + 'x'.repeat(65) + '…');
  assert.equal(contextSnippet('hello world', 0, 5, 3), 'hello wo…');
  assert.equal(contextSnippet('hello world', 6, 5, 3), '…lo world');
  assert.equal(contextSnippet('hello world', 0, 11, 3), 'hello world');
});

test('verifyClaim: exact (after normalisation) → VERIFIED with similarity 1', () => {
  const src = { norm: normalize('He said: “ship it today”, then left.') };
  const r = verifyClaim('  ship   it today ', src);
  assert.equal(r.verdict, 'VERIFIED');
  assert.equal(r.similarity, 1);
  assert.equal(r.excerpt, 'He said: "ship it today", then left.');
});

test('isWordChar: one letter or digit of a script written with spaces; nothing else', () => {
  for (const c of ['a', 'Z', '5', '\u00E9', '\u0430', '\u03B1', '\u05E9', '\u0645', '\uAC00']) assert.equal(isWordChar(c), true, c);
  for (const c of ['', ' ', '-', "'", '"', '.', ',', 'ab', '\u4E2D', '\u3042', '\u30A2', '\u0E01', '\u0E81', '\u1780', '\u1000', undefined, null, 5])
    assert.equal(isWordChar(c), false, String(c));
  assert.equal(NO_SPACE_SCRIPTS.test('\u4E2D'), true);
  assert.equal(NO_SPACE_SCRIPTS.test('a'), false);
});

test('findWhole: the first occurrence that starts and ends on a word edge', () => {
  assert.equal(findWhole('she said yes', 'he said yes'), -1);
  assert.equal(findWhole('police', 'lice'), -1);
  assert.equal(findWhole('lice police', 'lice'), 0);                         // at the very start
  assert.equal(findWhole('the police lice', 'lice'), 11);                    // at the very end
  assert.equal(findWhole('she said yes, then he said yes.', 'he said yes'), 19);   // skips the one inside "she"
  assert.equal(findWhole('he said yesterday', 'he said yes'), -1);           // ends inside a word
  assert.equal(findWhole('he said yes!', 'he said yes'), 0);                 // punctuation is an edge
  assert.equal(findWhole('x"not accurate"y', '"not accurate"'), 1);         // a quote that starts and ends with punctuation
  assert.equal(findWhole('ab-cd', '-cd'), 2);                                // starts with punctuation: the left side needs no edge
  assert.equal(findWhole('abc-', 'c-'), -1);                                 // ...but its right side still does when it ends on a letter
  assert.equal(findWhole('abc-', 'bc-'), -1);
  assert.equal(findWhole('a bc-', 'bc-'), 2);
  assert.equal(findWhole('\u6211\u4EEC\u4ECA\u5929\u5F00\u4F1A', '\u4ECA\u5929'), 2);   // Chinese: no word edges, any substring
  assert.equal(findWhole('abc', 'zz'), -1);
});

test('verifyClaim: a quote found only inside longer words is not VERIFIED (v1 verified "he said yes" in "she said yes")', async () => {
  const src = await makeSource('s', 'Asked about the merger, she said yes. Then he left.');
  // measured against the whole words it sits in: 1 - 1/12, and the excerpt shows what the source says
  assert.deepEqual(verifyClaim('he said yes', src),
    { verdict: 'NEAR_MATCH', similarity: 1 - 1 / 12, excerpt: 'Asked about the merger, she said yes. Then he left.' });
  assert.equal(verifyClaim('lice', await makeSource('p', 'The police said so.')).verdict, 'NOT_FOUND');
  // the excerpt runs to the word edges on both sides, padded as usual
  const long = await makeSource('l', 'x'.repeat(40) + ' then the boss and she said yesterday it was fine ' + 'y'.repeat(40));
  const r = verifyClaim('he said yes', long);
  assert.equal(r.verdict, 'NOT_FOUND');
  assert.equal(r.similarity, 1 - 7 / 18);                                    // "he said yes" against "she said yesterday": 7 edits, 18 characters
  // 30 characters of padding each side of the whole words: 11 x + ' then the boss and ' (19) before, ' it was fine ' (13) + 17 y after
  assert.equal(r.excerpt, '…' + 'x'.repeat(11) + ' then the boss and she said yesterday it was fine ' + 'y'.repeat(17) + '…');
  // whole words still VERIFY, wherever they are
  assert.equal(verifyClaim('she said yes', src).verdict, 'VERIFIED');
  assert.equal(verifyClaim('he left', src).verdict, 'VERIFIED');
  assert.equal(verifyClaim('Asked about', src).verdict, 'VERIFIED');
});

test('verifyClaim: an ordinary near miss scores exactly as in v1 (only the exact-text case is re-measured)', async () => {
  const src = await makeSource('s', 'Minutes: The committee agreed the pilot would move to the new platform firstly and soon.');
  // measured with citelock-v1 on the same input: the window ends inside "firstly" and is not widened
  assert.deepEqual(verifyClaim('the committee agreed the pilot would shift to the new platform first', src),
    { verdict: 'NOT_FOUND', similarity: 0.8970588235294118, excerpt: 'Minutes: The committee agreed the pilot would move to the new platform firstly and soon.' });
});

test('verifyClaim never throws: no source, or a source without text, is SOURCE_MISSING', () => {
  const missing = { verdict: 'SOURCE_MISSING', similarity: 0, excerpt: '' };
  assert.deepEqual(verifyClaim('a quote', undefined), missing);
  assert.deepEqual(verifyClaim('a quote', null), missing);
  assert.deepEqual(verifyClaim('a quote', { norm: 42 }), missing);
  assert.deepEqual(verifyClaim(undefined, undefined), { verdict: 'EMPTY', similarity: 0, excerpt: '' });
});

test('verifyClaim: an empty quote is EMPTY, a quote with no 3-word anchor is NOT_FOUND', () => {
  assert.deepEqual(verifyClaim('   ', { norm: 'anything' }), { verdict: 'EMPTY', similarity: 0, excerpt: '' });
  assert.deepEqual(verifyClaim('totally different words here', { norm: 'alpha beta gamma delta' }),
    { verdict: 'NOT_FOUND', similarity: 0, excerpt: '' });
});

test('verifyClaim: similarity exactly at the 0.90 threshold is a NEAR_MATCH', () => {
  // quote and source are 10 characters, one substitution apart: 1 - 1/10 = 0.9 exactly
  const r = verifyClaim('ab cd ef g', { norm: 'ab cd ef h' });
  assert.equal(r.similarity, 0.9);
  assert.equal(r.verdict, 'NEAR_MATCH');
});

test('verifyClaim: below the threshold is NOT_FOUND even with an anchor', () => {
  const r = verifyClaim('ab cd ef gh ij', { norm: 'ab cd ef xy zw' });
  assert.equal(r.verdict, 'NOT_FOUND');
  assert.equal(r.similarity, 1 - 4 / 14);
});

test('verifyClaim: the search window reaches 20 characters past the anchor', () => {
  // "aaa bbb ccc" first occurs at 0, but the near-copy of the whole quote starts at 20
  const norm = 'aaa bbb ccc zzzzzzz aaa bbb ccc ddd';
  const r = verifyClaim('aaa bbb ccc ddx', { norm });
  assert.equal(r.verdict, 'NEAR_MATCH');
  assert.equal(r.similarity, 1 - 1 / 15);
});

test('verifyClaim: among equally good windows the first one wins', () => {
  const norm = Array(25).fill('abc').join(' ');            // 99 characters, period 4
  const r = verifyClaim('abc abc abc abd', { norm });      // every window scores 14/15
  assert.equal(r.verdict, 'NEAR_MATCH');
  assert.equal(r.excerpt, norm.slice(0, 45) + '…');        // the window at 0, not the one at 20
});

test('makeSource: label, normalised text, its SHA-256 and length', async () => {
  const s = await makeSource('L', '  abc  ');
  assert.deepEqual(s, { label: 'L', norm: 'abc', hash: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', length: 3 });
});

test('verifyAll: each claim is checked against the source it names; an unknown label is SOURCE_MISSING', () => {
  const sources = [{ label: 'A', norm: 'one two three four' }, { label: 'B', norm: 'five six seven eight' }];
  const claims = [
    { sourceLabel: 'B', quoteRaw: 'six seven eight' },
    { sourceLabel: 'A', quoteRaw: 'two three four' },
    { sourceLabel: 'C', quoteRaw: 'two three four' },
  ];
  assert.deepEqual(verifyAll(sources, claims).map((r) => r.verdict), ['VERIFIED', 'VERIFIED', 'SOURCE_MISSING']);
});

test('summarizeVerdicts: counts per verdict, keys sorted', () => {
  assert.equal(summarizeVerdicts([{ verdict: 'VERIFIED' }, { verdict: 'NOT_FOUND' }, { verdict: 'VERIFIED' }]), 'NOT_FOUND:1|VERIFIED:2');
  assert.equal(summarizeVerdicts([]), '');
});

test('receiptPayload: sources sorted by label, claims sorted by source/quote/locator, fixed formats', () => {
  const sources = [{ label: 'B', hash: 'hb', length: 2 }, { label: 'A', hash: 'ha', length: 1 }];
  const claims = [
    { sourceLabel: 'B', quoteRaw: ' z ', locator: 'p.2' },
    { sourceLabel: 'A', quoteRaw: 'y' },
  ];
  const results = [{ verdict: 'NEAR_MATCH', similarity: 0.93587 }, { verdict: 'EMPTY' }];
  assert.deepEqual(receiptPayload(sources, claims, results), {
    algorithm: 'citelock-v2',
    nearThreshold: '0.90',
    sources: [{ label: 'A', sha256: 'ha', length: 1 }, { label: 'B', sha256: 'hb', length: 2 }],
    claims: [
      { source: 'A', quote: 'y', locator: '', verdict: 'EMPTY', similarity: '0.0000' },
      { source: 'B', quote: 'z', locator: 'p.2', verdict: 'NEAR_MATCH', similarity: '0.9359' },
    ],
  });
  const one = receiptPayload([], [{ sourceLabel: 'A', quoteRaw: 'q' }], [{ verdict: 'VERIFIED', similarity: 1 }]);
  assert.equal(one.claims[0].similarity, '1.0000');
});

test('receiptPayload: ties keep their input order (the sort is stable)', () => {
  const sources = [{ label: 'A', hash: 'first', length: 1 }, { label: 'A', hash: 'second', length: 1 }, { label: 'A', hash: 'third', length: 1 }];
  const claims = [{ sourceLabel: 'A', quoteRaw: 'q', locator: 'x' }, { sourceLabel: 'A', quoteRaw: 'q', locator: 'x' }];
  const results = [{ verdict: 'VERIFIED', similarity: 1 }, { verdict: 'NOT_FOUND', similarity: 0 }];
  const p = receiptPayload(sources, claims, results);
  assert.deepEqual(p.sources.map((s) => s.sha256), ['first', 'second', 'third']);
  assert.deepEqual(p.claims.map((c) => c.verdict), ['VERIFIED', 'NOT_FOUND']);
});

test('chainHash + verifyLedger: a valid chain passes; an edited entry or a broken link is named', async () => {
  const h1 = await chainHash(ZERO_HASH, 'r1', 'VERIFIED:1');
  assert.equal(h1, await sha256Hex(ZERO_HASH + ':r1:VERIFIED:1'));
  const h2 = await chainHash(h1, 'r2', 'NOT_FOUND:1');
  const good = [
    { n: 1, prevChainHash: ZERO_HASH, receiptHash: 'r1', summary: 'VERIFIED:1', chainHash: h1 },
    { n: 2, prevChainHash: h1, receiptHash: 'r2', summary: 'NOT_FOUND:1', chainHash: h2 },
  ];
  assert.deepEqual(await verifyLedger(good), {
    ok: true,
    checks: [{ n: 1, ok: true, prevMatches: true, chainMatches: true }, { n: 2, ok: true, prevMatches: true, chainMatches: true }],
  });
  const edited = good.map((e) => ({ ...e }));
  edited[0].summary = 'VERIFIED:9';                     // the hash no longer recomputes; the link to #2 still holds
  assert.deepEqual(await verifyLedger(edited), {
    ok: false,
    checks: [{ n: 1, ok: false, prevMatches: true, chainMatches: false }, { n: 2, ok: true, prevMatches: true, chainMatches: true }],
  });
  const relinked = good.map((e) => ({ ...e }));
  relinked[1].prevChainHash = ZERO_HASH;                // #2 no longer points at #1
  const v = await verifyLedger(relinked);
  assert.equal(v.ok, false);
  assert.deepEqual(v.checks[1], { n: 2, ok: false, prevMatches: false, chainMatches: false });
  assert.deepEqual(await verifyLedger([]), { ok: true, checks: [] });
});

test('verifyLedger never throws: a non-list is not a valid chain, a null entry is a mismatch', async () => {
  assert.deepEqual(await verifyLedger(5), { ok: false, checks: [] });
  assert.deepEqual(await verifyLedger(null), { ok: false, checks: [] });
  assert.deepEqual(await verifyLedger({ length: 1, 0: {} }), { ok: false, checks: [] });
  assert.deepEqual(await verifyLedger([null]), { ok: false, checks: [{ n: undefined, ok: false, prevMatches: false, chainMatches: false }] });
});

/* ---------- the trust mesh: verify({ claim, sources }) ---------- */
// Offsets are found with indexOf on the test's own inputs, never read back from a run of the kernel.
const S1 = 'The board approved the merger on 3 March.  Revenue rose 12% to £1,200,000, it said: “we will grow”.';
const S1n = 'The board approved the merger on 3 March. Revenue rose 12% to £1,200,000, it said: "we will grow".';
const S2 = 'Costs fell 4% in 2024, while revenue rose.';
const span = (hay, needle, from = 0) => { const i = hay.indexOf(needle, from); assert.notEqual(i, -1, needle); return [i, i + needle.length]; };
const NOTHING = 'nothing to check: the claim has no quotation, no content word and no number';

test('mesh constants are the published limits', () => {
  assert.equal(MESH_VERSION, 'citelock-mesh-v1');
  assert.equal(MESH_MAX_CLAIM, 2000);
  assert.equal(MESH_MAX_SOURCES, 50);
  assert.equal(MESH_MAX_TEXT, 1000000);
  assert.equal(MESH_NEAR_MAX, 300);
  assert.equal(normalize(S1), S1n);
  for (const w of ['not', 'no', 'never', 'without', 'may', 'will', 'must', 'over', 'under', 'more', 'less', 'he', 'she', 'we']) assert.equal(MESH_SKIP.has(w), false, w);
  for (const w of ['the', 'and', 'it', 'is', 'said', 'according', 'of']) assert.equal(MESH_SKIP.has(w), true, w);
});

test('meshFold: simple plurals and possessives fold to the singular, nothing else', () => {
  assert.equal(meshFold('Rates'), 'rate');
  assert.equal(meshFold('companies'), 'company');
  assert.equal(meshFold('flies'), 'fly');
  assert.equal(meshFold('ties'), 'tie');          // four letters: the -ies rule needs five, the -s rule takes it
  assert.equal(meshFold('bus'), 'bus');           // three letters keep their s
  assert.equal(meshFold('class'), 'class');       // a double s is not a plural
  assert.equal(meshFold("board's"), 'board');
  assert.equal(meshFold('Board'), 'board');
  assert.equal(meshFold('rose'), 'rose');
});

test('meshNumberKey: thousands commas out, everything else as written', () => {
  assert.equal(meshNumberKey('1,200,000'), '1200000');
  assert.equal(meshNumberKey('1,200.50'), '1200.50');
  assert.equal(meshNumberKey('3,5'), '3,5');
  assert.equal(meshNumberKey('1,2345'), '1,2345');
  assert.equal(meshNumberKey('12.0'), '12.0');
});

test('meshTerms: numbers first, then the words of what is left, each with offsets', () => {
  assert.deepEqual(meshTerms('Q3 COVID-19 board\'s 1,200'), {
    numbers: [
      { text: '3', key: '3', start: 1, end: 2 },
      { text: '19', key: '19', start: 9, end: 11 },
      { text: '1,200', key: '1200', start: 20, end: 25 },
    ],
    words: [
      { text: 'Q', lower: 'q', key: 'q', start: 0, end: 1 },
      { text: 'COVID', lower: 'covid', key: 'covid', start: 3, end: 8 },
      { text: "board's", lower: "board's", key: 'board', start: 12, end: 19 },
    ],
  });
});

test('meshMap: where each normalised character came from in the raw text', () => {
  assert.deepEqual(meshMap('a  b'), { starts: [0, 3, 3], ends: [1, 3, 4] });
  assert.deepEqual(meshMap('  ﬁ '), { starts: [2, 2], ends: [3, 3] });          // a ligature: two characters from one
  assert.deepEqual(meshMap('𝐀b'), { starts: [0, 2], ends: [2, 3] });     // a character outside the BMP is two code units
  assert.equal(meshMap('é'), null);                                            // letter + accent: NFKC joins them, so no map
  assert.deepEqual(meshMap(''), { starts: [], ends: [] });
});

test('meshRaw: raw offsets only when the raw text there normalises back to the match; the map is built once', () => {
  const src = { raw: '  a', norm: 'a', map: undefined };
  assert.deepEqual(meshRaw(src, 0, 1), [2, 3]);
  assert.deepEqual(src.map, { starts: [2], ends: [3] });
  assert.equal(meshRaw({ raw: 'x', norm: 'x', map: null }, 0, 1), null);              // a source already known to have no map
  const dots = { raw: 'wait…', norm: 'wait...', map: undefined };
  assert.equal(meshRaw(dots, 0, 5), null);                                           // "wait." ends inside the ellipsis
  assert.deepEqual(meshRaw(dots, 0, 4), [0, 4]);
});

test('verify: a true claim is VERIFIED, and the trace grounds every quotation, number and word at its offsets', () => {
  const C1 = 'The board approved the merger, and revenue rose 12% [s1]. It said "we will grow".';
  const r = verify({ claim: C1, sources: [{ id: 's1', text: S1 }] });
  const word = (claimText, srcText) => ({ kind: 'word', text: claimText, at: span(C1, claimText), ok: true, source: 's1', norm: span(S1n, srcText), raw: span(S1, srcText) });
  assert.deepEqual(r, {
    verdict: 'VERIFIED',
    algorithm: 'citelock-mesh-v1',
    reasons: [],
    trace: {
      claim: C1,
      cited: ['s1'],
      checks: [
        { kind: 'cite', text: 's1', at: span(C1, '[s1]'), ok: true },
        { kind: 'quote', text: 'we will grow', at: span(C1, '"we will grow"'), ok: true, source: 's1', norm: span(S1n, 'we will grow'), raw: span(S1, 'we will grow') },
        { kind: 'number', text: '12', at: span(C1, '12'), ok: true, source: 's1', norm: span(S1n, '12'), raw: span(S1, '12') },
        word('board', 'board'), word('approved', 'approved'), word('merger', 'merger'), word('revenue', 'Revenue'), word('rose', 'rose'),
      ],
      skipped: ['the', 'and', 'it', 'said'],
      sources: [{ id: 's1', length: S1.length }],
    },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r);                                // plain JSON, nothing undefined
  for (const c of r.trace.checks.filter((x) => x.raw)) assert.equal(normalize(S1.slice(c.raw[0], c.raw[1])), S1n.slice(c.norm[0], c.norm[1]));
});

test('verify: a changed number and an altered quotation are REFUSED, one reason each, with the closest passage', () => {
  const C2 = 'Revenue rose 13%, and "The board approved the merger on 4 March".';
  const r = verify({ claim: C2, sources: [{ id: 's1', text: S1 }] });
  assert.equal(r.verdict, 'REFUSED');
  const excerpt = S1n.slice(0, 70) + '…';
  assert.deepEqual(r.reasons, [
    'the quotation "The board approved the merger on 4 March" is not word for word in any cited source; the closest passage, in source s1, is 97.5% alike: ' + excerpt,
    'the number 13 is not in any cited source',
  ]);
  assert.deepEqual(r.trace.checks[0].closest, { source: 's1', similarity: 1 - 1 / 40, excerpt });
  assert.deepEqual(r.trace.checks[1], { kind: 'number', text: '13', at: span(C2, '13'), ok: false, reason: 'the number 13 is not in any cited source' });
  assert.equal(r.trace.checks.length, 4);                                            // the 4 inside the quotation is not a separate number
});

test('verify: a negation is a content word, and "approve" is not "approved"', () => {
  const r = verify({ claim: 'The board did not approve the merger.', sources: [S1] });
  assert.equal(r.verdict, 'REFUSED');
  assert.deepEqual(r.reasons, ['the word "not" is not in any cited source', 'the word "approve" is not in any cited source']);
  assert.deepEqual(r.trace.cited, ['1']);
  assert.deepEqual(r.trace.skipped, ['the', 'did']);
});

test('verify: [id] markers choose the sources, in the order the claim cites them', () => {
  const src = [{ id: 's1', text: S1 }, { id: 's2', text: S2 }];
  const wrong = verify({ claim: 'Costs fell 4% [s1].', sources: src });
  assert.deepEqual(wrong.reasons, ['the number 4 is not in any cited source', 'the word "Costs" is not in any cited source', 'the word "fell" is not in any cited source']);
  assert.deepEqual(wrong.trace.cited, ['s1']);
  const right = verify({ claim: 'Costs fell 4% [s2].', sources: src });
  assert.equal(right.verdict, 'VERIFIED');
  assert.deepEqual(right.trace.checks.slice(1).map((c) => [c.text, c.source, c.norm]), [['4', 's2', span(S2, '4')], ['Costs', 's2', span(S2, 'Costs')], ['fell', 's2', span(S2, 'fell')]]);
  const order = verify({ claim: 'Revenue rose [s2, s1].', sources: src });
  assert.equal(order.verdict, 'VERIFIED');
  assert.deepEqual(order.trace.cited, ['s2', 's1']);
  assert.deepEqual(order.trace.checks.map((c) => [c.kind, c.text, c.source]), [['cite', 's2', undefined], ['cite', 's1', undefined], ['word', 'Revenue', 's2'], ['word', 'rose', 's2']]);
  const unmarked = verify({ claim: 'Revenue rose.', sources: src });
  assert.deepEqual(unmarked.trace.cited, ['s1', 's2']);
  assert.deepEqual(unmarked.trace.checks.map((c) => c.source), ['s1', 's1']);
  const twice = verify({ claim: 'Revenue rose [s1] and costs fell [s2] [s1].', sources: src });
  assert.equal(twice.verdict, 'VERIFIED');
  assert.deepEqual(twice.trace.cited, ['s1', 's2']);
  assert.deepEqual(twice.trace.checks.filter((c) => c.kind === 'cite').map((c) => c.at), [span(twice.trace.claim, '[s1]'), span(twice.trace.claim, '[s2]'), span(twice.trace.claim, '[s1]', 30)]);
  assert.deepEqual(twice.trace.checks.find((c) => c.text === 'costs').source, 's2');
});

test('verify: a citation of a source not given is REFUSED; a bracket that is not a list of ids is text', () => {
  const src = [{ id: 's1', text: S1 }];
  const r = verify({ claim: 'Revenue rose 12% [s9].', sources: src });
  assert.deepEqual(r.reasons, [
    'the claim cites [s9], which is not one of the sources given',
    'the number 12 is not in any cited source',
    'the word "Revenue" is not in any cited source',
    'the word "rose" is not in any cited source',
  ]);
  assert.deepEqual(r.trace.cited, []);
  assert.deepEqual(r.trace.checks[0], { kind: 'cite', text: 's9', at: span(r.trace.claim, '[s9]'), ok: false, reason: 'the claim cites [s9], which is not one of the sources given' });
  const mixed = verify({ claim: 'Revenue rose [s1, s9].', sources: src });
  assert.deepEqual(mixed.reasons, ['the claim cites [s9], which is not one of the sources given']);
  assert.deepEqual(mixed.trace.cited, ['s1']);
  const text = verify({ claim: 'The board [the figure] approved it.', sources: src });
  assert.deepEqual(text.reasons, ['the word "figure" is not in any cited source']);
  assert.deepEqual(text.trace.cited, ['s1']);
  assert.equal(text.trace.checks.some((c) => c.kind === 'cite'), false);
  assert.equal(verify({ claim: 'The board [] approved.', sources: src }).verdict, 'VERIFIED');
});

test('verify: quotations are matched word for word (capitals count), curly quote marks in the claim are straightened', () => {
  const curly = verify({ claim: '“we will grow”', sources: [S1] });
  assert.equal(curly.verdict, 'VERIFIED');
  assert.equal(curly.trace.claim, '"we will grow"');
  assert.deepEqual(curly.trace.checks[0].at, [0, 14]);
  const caps = verify({ claim: '"we Will grow"', sources: [S1] });
  assert.deepEqual(caps.reasons, ['the quotation "we Will grow" is not word for word in any cited source']);
  assert.equal(caps.trace.checks[0].closest, undefined);                            // no passage is a near match
  const HE = 'Asked about the merger, she said yes. Then he left.';
  const he = verify({ claim: '"he said yes"', sources: [HE] });
  assert.deepEqual(he.reasons, ['the quotation "he said yes" is not word for word in any cited source; the closest passage, in source 1, is 91.7% alike: ' + HE]);
  assert.deepEqual(he.trace.checks[0].closest, { source: '1', similarity: 1 - 1 / 12, excerpt: HE });
  const two = verify({ claim: '"we will grow" and "we will shrink"', sources: [S1] });
  assert.deepEqual(two.reasons, ['the quotation "we will shrink" is not word for word in any cited source']);
  assert.equal(two.trace.checks[0].ok, true);
});

test('verify: an unclosed or empty quotation is REFUSED', () => {
  const open = verify({ claim: 'It said "we will grow.', sources: [S1] });
  assert.deepEqual(open.reasons, ['the claim opens a quotation and never closes it']);
  assert.deepEqual(open.trace.checks[0], { kind: 'quote', text: '"', at: [8, 9], ok: false, reason: 'the claim opens a quotation and never closes it' });
  assert.deepEqual(open.trace.checks.slice(1).map((c) => [c.text, c.ok]), [['we', true], ['will', true], ['grow', true]]);
  const empty = verify({ claim: 'It said "".', sources: [S1] });
  assert.deepEqual(empty.reasons, ['the claim has an empty quotation']);
  assert.deepEqual(empty.trace.checks, [{ kind: 'quote', text: '', at: [8, 10], ok: false, reason: 'the claim has an empty quotation' }]);
});

test('verify: raw offsets are left out where the raw text does not normalise back to the match; the verdict stands', () => {
  const dots = verify({ claim: '"we wait."', sources: ['Then we wait…'] });
  assert.equal(dots.verdict, 'VERIFIED');
  assert.deepEqual(dots.trace.checks[0].norm, [5, 13]);
  assert.equal(dots.trace.checks[0].raw, null);
  const accent = verify({ claim: 'café ouvre', sources: ['Le café ouvre'] });
  assert.equal(accent.verdict, 'VERIFIED');
  assert.deepEqual(accent.trace.checks.map((c) => [c.text, c.norm, c.raw]), [['café', [3, 7], null], ['ouvre', [8, 13], null]]);
});

test('verify: numbers are compared as written, with thousands commas taken out', () => {
  const SN = 'Sales were 1,200,000 units at 12 sites in Q3.';
  const big = verify({ claim: 'Sales were 1200000 units.', sources: [SN] });
  assert.equal(big.verdict, 'VERIFIED');
  assert.deepEqual(big.trace.checks[0], { kind: 'number', text: '1200000', at: [11, 18], ok: true, source: '1', norm: span(SN, '1,200,000'), raw: span(SN, '1,200,000') });
  assert.deepEqual(verify({ claim: 'Sales were 12.0 sites.', sources: [SN] }).reasons, ['the number 12.0 is not in any cited source']);
  const q = verify({ claim: 'Q3 sales', sources: [SN] });
  assert.equal(q.verdict, 'VERIFIED');
  assert.deepEqual(q.trace.skipped, ['q']);
  assert.deepEqual(q.trace.checks[0].norm, span(SN, '3'));
  const again = verify({ claim: '12 sites, 12 sites and 12.', sources: [SN] });
  assert.deepEqual(again.trace.checks.map((c) => c.text), ['12', 'sites']);          // each number and word once
});

test('verify: words match whatever their capitals and simple plural; small words are skipped and listed', () => {
  assert.equal(verify({ claim: 'REVENUE ROSE', sources: [S1] }).verdict, 'VERIFIED');
  assert.equal(verify({ claim: 'Rates rose.', sources: ['The rate rose.'] }).verdict, 'VERIFIED');
  const small = verify({ claim: 'It is the board, and it is a board I said.', sources: [S1] });
  assert.equal(small.verdict, 'VERIFIED');
  assert.deepEqual(small.trace.checks.map((c) => c.text), ['board']);
  assert.deepEqual(small.trace.skipped, ['it', 'is', 'the', 'and', 'a', 'i', 'said']);
  assert.deepEqual(verify({ claim: 'no board', sources: [S1] }).reasons, ['the word "no" is not in any cited source']);
});

test('verify: a claim with nothing to check is REFUSED', () => {
  const none = verify({ claim: 'It is.', sources: [S1] });
  assert.deepEqual(none.reasons, [NOTHING]);
  assert.deepEqual(none.trace.checks, []);
  const cite = verify({ claim: '[s1]', sources: [{ id: 's1', text: S1 }] });
  assert.equal(cite.verdict, 'REFUSED');
  assert.deepEqual(cite.reasons, [NOTHING]);
  assert.equal(cite.trace.checks.length, 1);
});

test('verify: the closest passage is the most alike NEAR_MATCH, the first source on a tie', () => {
  const QB = '"The board approved the merger on 4 March"';
  const A = 'The board approved the merger on 3 March';
  assert.equal(verify({ claim: QB, sources: [{ id: 'a', text: A }, { id: 'b', text: A }] }).trace.checks[0].closest.source, 'a');
  const better = verify({ claim: QB, sources: [{ id: 'a', text: 'The board approved the merger on 3 Mar.h' }, { id: 'b', text: A }] });
  assert.deepEqual(better.trace.checks[0].closest, { source: 'b', similarity: 1 - 1 / 40, excerpt: A });
  const past = verify({ claim: QB, sources: [{ id: 'x', text: 'nothing alike here at all' }, { id: 'a', text: A }] });
  assert.equal(past.trace.checks[0].closest.source, 'a');
});

test('verify: a quotation over 300 characters is not searched for its closest passage', () => {
  const T300 = 'abcd '.repeat(60).slice(0, 299) + 'z';
  const T301 = 'abcd '.repeat(60).slice(0, 299) + 'zz';
  assert.equal(T300.length, MESH_NEAR_MAX);
  const at = verify({ claim: '"X' + T300.slice(1) + '"', sources: [T300] });
  assert.deepEqual(at.trace.checks[0].closest, { source: '1', similarity: 1 - 1 / 300, excerpt: T300 });
  const over = verify({ claim: '"X' + T301.slice(1) + '"', sources: [T301] });
  assert.deepEqual(over.reasons, ['the quotation "X' + T301.slice(1) + '" is not word for word in any cited source']);
});

test('verify: input it cannot use is REFUSED with the reason, never thrown', () => {
  const OBJ = 'the input must be an object: { claim, sources }';
  assert.deepEqual(verify(null), {
    verdict: 'REFUSED', algorithm: 'citelock-mesh-v1', reasons: [OBJ],
    trace: { claim: '', cited: [], checks: [{ kind: 'input', ok: false, reason: OBJ }], skipped: [], sources: [] },
  });
  for (const v of [undefined, 5, 'x', true]) assert.deepEqual(verify(v).reasons, [OBJ]);
  assert.deepEqual(verify({}).reasons, ['the claim must be text']);
  assert.deepEqual(verify({ claim: 5, sources: [S1] }).reasons, ['the claim must be text']);
  const LIST = 'sources must be a list of 1 to 50 sources';
  for (const sources of [undefined, [], 'abc', new Array(51).fill(S1)]) assert.deepEqual(verify({ claim: 'board', sources }).reasons, [LIST]);
  const fifty = verify({ claim: 'board', sources: new Array(50).fill(S1) });
  assert.equal(fifty.verdict, 'VERIFIED');
  assert.equal(fifty.trace.sources.length, 50);
  assert.deepEqual(verify({ claim: 'board', sources: [5] }).reasons, ['source 1 has no text']);
  assert.deepEqual(verify({ claim: 'board', sources: [S1, null] }).reasons, ['source 2 has no text']);
  assert.deepEqual(verify({ claim: 'board', sources: [S1, { id: 'x' }] }).reasons, ['source 2 has no text']);
  assert.deepEqual(verify({ claim: 'board', sources: [[]] }).reasons, ['source 1 has no text']);
  assert.deepEqual(verify({ claim: 'board', sources: [{ id: 'a b', text: S1 }] }).reasons, ['source 1: an id may only use letters, digits and . _ : -']);
  assert.deepEqual(verify({ claim: 'board', sources: [S1, { id: '', text: S1 }] }).reasons, ['source 2: an id may only use letters, digits and . _ : -']);
  assert.deepEqual(verify({ claim: 'board', sources: [{ id: 'a', text: 'x' }, { id: 'a', text: 'y' }] }).reasons, ['two sources have the id a']);
  assert.deepEqual(verify({ claim: 'board', sources: ['x', { id: '1', text: 'y' }] }).reasons, ['two sources have the id 1']);
  const toxic = { get text() { throw new Error('boom'); } };
  assert.deepEqual(verify({ claim: 'board', sources: [toxic] }).reasons, ['the input could not be read']);
  assert.deepEqual(verify({ get claim() { throw new Error('boom'); } }).reasons, ['the input could not be read']);
  for (const v of [NaN, [], () => {}, 10n, { claim: 'x', sources: [[]] }]) assert.equal(verify(v).verdict, 'REFUSED');
});

test('verify: ids default to the position, a number id is its digits', () => {
  const r = verify({ claim: 'alpha beta', sources: ['alpha', { text: 'beta' }] });
  assert.equal(r.verdict, 'VERIFIED');
  assert.deepEqual(r.trace.sources, [{ id: '1', length: 5 }, { id: '2', length: 4 }]);
  assert.deepEqual(r.trace.checks.map((c) => c.source), ['1', '2']);
  const n = verify({ claim: 'board [7]', sources: [{ id: 7, text: S1 }] });
  assert.equal(n.verdict, 'VERIFIED');
  assert.deepEqual(n.trace.cited, ['7']);
});

test('verify: the size limits hold at their edges', () => {
  const claim = 'board' + ' '.repeat(MESH_MAX_CLAIM - 5);
  assert.equal(verify({ claim, sources: [S1] }).verdict, 'VERIFIED');
  assert.deepEqual(verify({ claim: claim + ' ', sources: [S1] }).reasons, ['the claim is longer than 2000 characters: check it one sentence at a time']);
  const fits = verify({ claim: 'board', sources: ['x'.repeat(MESH_MAX_TEXT - 5), 'board'] });
  assert.equal(fits.verdict, 'VERIFIED');
  assert.equal(fits.trace.checks[0].source, '2');
  assert.deepEqual(verify({ claim: 'board', sources: ['x'.repeat(MESH_MAX_TEXT - 4), 'board'] }).reasons, ['the sources add up to more than 1000000 characters']);
});
