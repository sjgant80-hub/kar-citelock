// CiteLock as a cell of the genome: its judge is the kernel's verify(), its lane is a claim with its sources.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { judge, inLane, health } from './genome/cell.mjs';
import { verify } from './kernel.mjs';

const seed = JSON.parse(readFileSync(new URL('./seed.json', import.meta.url), 'utf8'));
const SRC = [{ id: 'report', text: 'Example Co. annual report, 2025. Revenue rose 12% to 4.2 million euros.' }];
const NOT_A_CLAIM = [null, undefined, 'x', 5, [], {}, { claim: 'x' }, { claim: 'x', sources: [] }, { claim: 5, sources: ['a'] },
  { claim: 'x', sources: [{ id: 'a b', text: 'x' }] }, { question: 'Is Example Co. a well-run company?' }];

test('judge: the seed cases, a known-true claim verified and a known-false one not', async () => {
  assert.equal(await judge(seed.judge.cases.good), 'verified');
  assert.equal(await judge(seed.judge.cases.bad), 'unverified');
  assert.equal(verify(seed.judge.cases.bad).verdict, 'REFUSED');
});

test('judge: verified exactly when verify() says VERIFIED; a claim verify() refuses is unverified', async () => {
  assert.equal(await judge({ claim: 'Revenue rose 12% [report].', sources: SRC }), 'verified');
  assert.equal(await judge({ claim: 'Revenue rose 21% [report].', sources: SRC }), 'unverified');
  assert.equal(await judge({ claim: 'Revenue fell 12%.', sources: SRC }), 'unverified');
  assert.equal(await judge({ claim: 'It is.', sources: SRC }), 'unverified');            // read, but nothing to check
});

test('judge: input that is not a claim with sources verify() can read is refused', async () => {
  for (const bad of NOT_A_CLAIM) assert.equal(await judge(bad), 'refused', JSON.stringify(bad));
});

test('lane: a claim with its sources is in lane, true or false; anything else is not', async () => {
  assert.equal(await inLane(seed.boundary.inLane), true);
  assert.equal(await inLane(seed.boundary.outOfLane), false);
  assert.equal(await inLane(seed.judge.cases.bad), true);                                // in lane, and refused by the judge
  assert.equal(await inLane({ claim: 'Revenue rose 21%.', sources: ['Revenue rose 12%.'] }), true);
  for (const bad of NOT_A_CLAIM) assert.equal(await inLane(bad), false, JSON.stringify(bad));
  assert.equal(seed.boundary.escalate, 'kar');
});

test('health says what this repository cannot measure from inside it', async () => {
  assert.deepEqual(await health(), { used: null, dependedOn: null, lastEarned: null });
});
