// cell.mjs — CiteLock's three answers for the birth check (seed.json, genome/).
//
// judge  the kernel's own verify(): a claim with its sources is verified when verify() says VERIFIED (every quotation
//        word for word in a cited source, every content word and number in a cited source), unverified when verify()
//        says REFUSED for a part of the claim, and refused when the input is not a claim with sources verify() can read.
// lane   a claim with its sources, exactly as verify() takes them: text and 1 to 50 sources within its size limits.
//        Anything else (a question, a request for an opinion, a judgement of meaning) is out of lane and goes to Kar.
// health this repository cannot see who calls the check or depends on it, so it says so: null, not a guess.
import { verify } from '../kernel.mjs';

// verify() marks input it cannot read with a single check of kind 'input'; a claim it read has none
function readable(input) {
  const r = verify(input);
  return { r, read: r.trace.checks.every((c) => c.kind !== 'input') };
}

export async function judge(input) {
  const { r, read } = readable(input);
  if (!read) return 'refused';
  return r.verdict === 'VERIFIED' ? 'verified' : 'unverified';
}

export async function inLane(input) {
  return readable(input).read;
}

export async function health() {
  return { used: null, dependedOn: null, lastEarned: null };
}
