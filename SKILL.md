---
name: "kar-citelock"
description: "Verifies that every quote attributed to a source document really appears in that source, word for word after normalising quotes, dashes and whitespace, and returns VERIFIED, NEAR_MATCH or NOT_FOUND per quote with a SHA-256 receipt anyone can recompute. Use before you quote, cite or attribute text to a document, or when the user asks to check quotes, citations, a summary or a transcript against its source. Deterministic Node.js script with no LLM judge and no network."
summary: "Is each quote really in its source? VERIFIED, NEAR_MATCH or NOT_FOUND per quote, the closest source passage, and a SHA-256 receipt a third party can recompute. No LLM judge, no network, one Node.js file, mutation-tested."
version: "1.0.0"
tags: ["citations", "quote-verification", "fact-checking", "hallucination", "deterministic", "receipts"]
use_cases: ["Check every quote in a research summary before it is sent", "Catch a misquoted line from a meeting or interview transcript", "Show a reviewer that each cited sentence is in the source, with a receipt"]
docs_url: "https://sjgant80-hub.github.io/kar-citelock/"
---

# CiteLock: check quotes against their sources

CiteLock answers one question with no model in the loop: **is this quote really in that source?** It
normalises both texts (Unicode NFKC, curly quotes, dashes, non-breaking spaces, runs of whitespace) and
looks for the quote verbatim. If it is not there verbatim, it anchors on the longest phrase of 3 to 8
words the quote shares with the source and scores the closest passage by Levenshtein similarity.

| Verdict | Meaning |
|---|---|
| `VERIFIED` | The quote is in the source, verbatim after normalisation. |
| `NEAR_MATCH` | Not verbatim, but a passage of the source is at least 90% similar: a changed word, a typo, a dropped comma. |
| `NOT_FOUND` | No passage of the source is 90% similar. Treat the quote as unsupported. |
| `SOURCE_MISSING` | The claim names a source label that was not supplied. |
| `EMPTY` | The quote is empty after normalisation. |

## When to use it

- Before you put a quotation, a citation or an "X said Y" into an answer, a report, a document or a commit.
- When the user asks you to check quotes, citations, a summary or a transcript against the source documents.
- When another agent or tool produced quotes you are about to rely on.

It checks presence, not meaning. Do not use it to judge whether a source is true or a quote is fair in context.

## How to run it

The script is `scripts/kar-citelock.mjs`: one file, Node.js 20 or newer, no dependencies, no network, and
it writes no files. Run it unchanged and keep the `.mjs` extension.

1. Collect the source texts and the quotes to check. Give each source a short, unique label.
2. Write the input as JSON, to a file or straight to stdin:

   ```json
   {
     "sources": [
       { "label": "Keynote transcript", "text": "…the full source text…" },
       { "label": "Annual report", "file": "reports/annual-2025.txt" }
     ],
     "claims": [
       { "source": "Keynote transcript", "quote": "we are asking the machine to show its work", "locator": "00:41" }
     ]
   }
   ```

   A source is either `"text"` or `"file"` (a path read relative to the current directory). `locator` is optional.
3. Run `node scripts/kar-citelock.mjs input.json`, or pipe the JSON in with `node scripts/kar-citelock.mjs -`.
4. Read the exit code: `0` every quote is VERIFIED, `1` at least one is not, `2` the input could not be used
   (the reason is on stderr; fix the input and run again).
5. Report one line per quote: the verdict, the locator and the quote. For a `NEAR_MATCH`, show the source
   `excerpt` beside the quote so the difference is visible, and correct the quote from it. Never present a
   `NEAR_MATCH` or `NOT_FOUND` quote as verified. End with the receipt SHA-256 so the result can be re-checked.

## What it prints

`examples/demo.json` checks three quotes against one transcript: one exact, one with a single word changed,
one invented. The report (`examples/demo.out.json`, exit code 1) reads, in part:

```json
{
  "verdict": "NOT_ALL_VERIFIED",
  "summary": "NEAR_MATCH:1|NOT_FOUND:1|VERIFIED:1",
  "results": [
    { "locator": "00:41 (exact)", "verdict": "VERIFIED", "similarity": 1 },
    { "locator": "00:41 (one word changed)", "verdict": "NEAR_MATCH", "similarity": 0.9359,
      "quote": "…show its work every single day, without exception",
      "excerpt": "…show its work every single time, without exception, because a claim nobody can …" },
    { "locator": "claimed 01:10 (fabricated)", "verdict": "NOT_FOUND", "similarity": 0 }
  ],
  "receipt": { "sha256": "dd2417527e3146f8c3ff428fc97a439d981cb7eaea1d32907a97a28a91e0d091", "canonical": "{…}" }
}
```

Each result also carries `source`, the normalised `quote` and an `excerpt` of the closest passage; `sources`
lists each source's SHA-256 and length.

## Re-check this skill yourself

Everything here is deterministic: the same input gives the same report and the same receipt hash on any
machine, and no language model judges anything.

- **A receipt:** `receipt.canonical` is the canonical JSON of the result (keys sorted, no whitespace) and
  `receipt.sha256` is its SHA-256. Hash the canonical string with any SHA-256 tool and compare.
- **The example:** `node scripts/kar-citelock.mjs examples/demo.json` prints exactly the report in
  `examples/demo.out.json` and exits 1, receipt `dd2417527e31…`.
- **The page:** the live page at https://sjgant80-hub.github.io/kar-citelock/ runs the same logic in a
  browser. Its "Load demo" then "Run verification" shows the same receipt hash.
- **The source:** https://github.com/sjgant80-hub/kar-citelock (MIT). The script's KERNEL block is
  byte-identical to the logic of the live page and to `kernel.mjs`; CI fails if they ever differ.
- **CI on every push:** https://github.com/sjgant80-hub/kar-citelock/actions/workflows/ci.yml runs the
  tests, the byte-identity check, the receipt check, the witness mutation gate and the ZIP build, and prints
  the ZIP's SHA-256.
- **The mutation gate:** witness v0.6 (https://github.com/sjgant80-hub/witness, tag `v0.6`) made
  38 single-operator changes (mutants) to the kernel and the tests caught 36 of them. The other 2 are equivalent mutants: they cannot change behaviour, and each has its measured reason in `witness.baseline.json`. The receipt is
  `receipts/witness.json` in the repository, for kernel SHA-256 `d1534bc802f6a242ea8acdab3cdfc9cb41fef525b90a61c4aeb9354d9002ae39`. With the repository and
  witness v0.6 side by side, `node gate.mjs --witness ../witness/witness.mjs` re-runs it.

## Where it stops

- It confirms that text is present in the source you supplied. It does not check that the source is
  authentic, or that a verbatim quote keeps its meaning out of context.
- The near-match threshold is fixed at 0.90. One changed word in a long quote is a `NEAR_MATCH`; one changed
  word in a quote of a few words can fall below it and read `NOT_FOUND`.
- A quote must share a run of at least three words with the source to be scored at all; shorter quotes are
  `VERIFIED` only when they appear verbatim.

---

Made by AI Native Solutions, built by Kar. Powered by the Konomi architecture, created by Thomas Frumkin.
MIT licence: see `LICENSE`.
