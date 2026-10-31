# CiteLock

**Live:** https://sjgant80-hub.github.io/kar-citelock/

Deterministic quote & citation verification — **no LLM judge**. Paste source documents and the quotes
an AI (or a person) claims come from them; CiteLock checks each claim against its source with plain
substring search + Levenshtein similarity and classifies it **VERIFIED / NEAR MATCH / NOT FOUND**. Every
run ends in a SHA-256 receipt anyone can reproduce byte-for-byte from the same inputs, plus a
tamper-evident hash-chained session ledger you can export, edit, and re-import to see the chain break.

One self-contained HTML file — no backend, no network, nothing sent anywhere, runs in your browser.

**Honest limit:** it only confirms text is present in the source *you* supplied — not that the source is
authentic, nor that a verbatim quote isn't misleading out of context.

## Use it from an agent

`SKILL.md` makes this repository an agent skill in the open SKILL.md format (Claude Code, Codex CLI, Cursor and
others read it). The agent runs `scripts/kar-citelock.mjs`, one Node.js 20+ file with no dependencies and no network,
and gets the same verdicts and the same receipt hash as this page:

    node scripts/kar-citelock.mjs examples/demo.json

`node make-zip.mjs` checks the package against Agensi's published rules and builds `dist/kar-citelock.zip`, the
upload for the Agensi skill marketplace. CI builds the same ZIP on every push and prints its SHA-256.

## Proof

- **One source of truth:** the KERNEL block of `index.html` is the verifier. `node build.mjs` copies it
  byte-for-byte into `kernel.mjs` and into the skill script; CI fails if the three ever differ.
- **Tests:** `npm test` runs the kernel tests, and runs the skill script alone in an empty folder, the way
  Agensi runs it, against the expected outputs in `examples/`.
- **Mutation gate:** witness v0.6 made 38 single-operator mutants of `kernel.mjs` and the tests caught
  36; the other 2 are equivalent mutants, reasons in `witness.baseline.json`. Receipt: `receipts/witness.json` (kernel SHA-256 `d1534bc802f6a242…`).
  CI re-runs the gate on every push: https://github.com/sjgant80-hub/kar-citelock/actions/workflows/ci.yml

Powered by the Konomi architecture, created by Thomas Frumkin. MIT licence (see `LICENSE`).
