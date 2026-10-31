// cli.mjs — CiteLock on the command line. build.mjs bundles this with the KERNEL block of index.html into
// scripts/kar-citelock.mjs, the single file the Agensi skill runs. It reads one JSON input (a file, or `-`
// for stdin), verifies every claimed quote against its source and prints a JSON report.
// Exit 0 = every quote VERIFIED · 1 = at least one is not · 2 = the input could not be used.
import { readFileSync } from 'node:fs';
import { ALGO_VERSION, normalize, sha256Hex, canonicalJSON, makeSource, verifyAll, summarizeVerdicts, receiptPayload } from './kernel.mjs';

const USAGE = `usage: node kar-citelock.mjs <input.json | ->
input:  {"sources": [{"label": "…", "text": "…"} or {"label": "…", "file": "path/to/source.txt"}],
         "claims":  [{"source": "<a source label>", "quote": "…", "locator": "optional, e.g. p. 4"}]}
output: a JSON report on stdout. exit 0 = every quote VERIFIED, 1 = at least one is not, 2 = bad input`;

class InputError extends Error {}
const fail = (msg) => { throw new InputError(msg); };

function readText(path, what) {
  try { return readFileSync(path === '-' ? 0 : path, 'utf8'); }
  catch (e) { return fail(`cannot read ${what}: ${e.code || e.message}`); }
}

async function citelock(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.sources) || !Array.isArray(input.claims)) {
    fail('input needs a "sources" array and a "claims" array');
  }
  const sources = [];
  for (const [i, s] of input.sources.entries()) {
    const label = typeof s?.label === 'string' ? s.label.trim() : '';
    if (!label) fail(`sources[${i}] needs a "label"`);
    if (sources.some((x) => x.label === label)) fail(`sources[${i}]: the label "${label}" is used twice`);
    const text = typeof s.text === 'string' ? s.text
      : typeof s.file === 'string' ? readText(s.file, `sources[${i}].file ${s.file}`)
      : fail(`sources[${i}] needs "text" or "file"`);
    if (!normalize(text)) fail(`sources[${i}] ("${label}") is empty`);
    sources.push(await makeSource(label, text));
  }
  const claims = input.claims.map((c, i) => {
    if (typeof c?.quote !== 'string' || !c.quote.trim()) fail(`claims[${i}] needs a non-empty "quote"`);
    if (typeof c.source !== 'string') fail(`claims[${i}] needs "source": the label of the source it quotes`);
    return { sourceLabel: c.source.trim(), quoteRaw: c.quote.trim(), locator: typeof c.locator === 'string' ? c.locator.trim() : '' };
  });
  if (!claims.length) fail('there are no claims to check');

  const results = verifyAll(sources, claims);
  const canonical = canonicalJSON(receiptPayload(sources, claims, results));
  const summary = summarizeVerdicts(results);
  const allVerified = results.every((r) => r.verdict === 'VERIFIED');
  return {
    exitCode: allVerified ? 0 : 1,
    report: {
      tool: 'kar-citelock',
      algorithm: ALGO_VERSION,
      verdict: allVerified ? 'ALL_VERIFIED' : 'NOT_ALL_VERIFIED',
      summary,
      results: claims.map((c, i) => ({
        source: c.sourceLabel,
        locator: c.locator,
        quote: normalize(c.quoteRaw),
        verdict: results[i].verdict,
        similarity: Number(results[i].similarity.toFixed(4)),
        excerpt: results[i].excerpt,
      })),
      sources: sources.map((s) => ({ label: s.label, sha256: s.hash, length: s.length })),
      receipt: { sha256: await sha256Hex(canonical), canonical },
    },
  };
}

async function main(args) {
  if (args.length !== 1 || args[0] === '-h' || args[0] === '--help') { process.stderr.write(USAGE + '\n'); return 2; }
  const raw = readText(args[0], args[0] === '-' ? 'stdin' : args[0]);
  let input;
  try { input = JSON.parse(raw); } catch (e) { fail(`the input is not valid JSON (${e.message})`); }
  const { exitCode, report } = await citelock(input);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  return exitCode;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`kar-citelock: ${e instanceof InputError ? e.message : 'internal error: ' + (e && e.message)}\n`);
  process.exitCode = e instanceof InputError ? 2 : 3;
}
