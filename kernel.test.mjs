// kernel.test.mjs — CiteLock's kernel (the KERNEL block of index.html, generated into kernel.mjs).
// Expected values are worked out by hand from the algorithm, never copied from a run. Each test names
// the behaviour it pins; witness v0.6 checks that every one of them actually bites (receipts/witness.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALGO_VERSION, NEAR_THRESHOLD, ZERO_HASH, normalize, hasSubtle, sha256Hex, canonicalize, canonicalJSON,
  levenshtein, similarity, findAnchor, contextSnippet, verifyClaim, makeSource, verifyAll, summarizeVerdicts,
  receiptPayload, chainHash, verifyLedger, isWordChar, findWhole, NO_SPACE_SCRIPTS,
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
