# CiteLock

**Live:** https://sjgant80-hub.github.io/kar-citelock/

Deterministic quote & citation verification — **no LLM judge**. Paste source documents and the quotes
an AI (or a person) claims come from them; CiteLock checks each claim against its source with plain
whole-word search + Levenshtein similarity and classifies it **VERIFIED / NEAR MATCH / NOT FOUND**. Every
run ends in a SHA-256 receipt anyone can reproduce byte-for-byte from the same inputs, plus a
tamper-evident hash-chained session ledger you can export, edit, and re-import to see the chain break.

One self-contained HTML file — no backend, no network, nothing sent anywhere, runs in your browser.

**Honest limit:** it only confirms text is present in the source *you* supplied — not that the source is
authentic, nor that a verbatim quote isn't misleading out of context.

## Check a whole claim: `verify({ claim, sources })`

The kernel also checks a claim against the sources it cites, and answers **VERIFIED** only when every quotation in
the claim is word for word in a cited source, every content word outside the quotations is in a cited source, and
every number is in a cited source. Otherwise it answers **REFUSED**, with one reason for each part that failed. The
trace lists every check with the source it was found in and its offsets. A claim cites sources with `[id]`
markers; with no marker it cites them all. It checks words, numbers and offsets; it does not understand meaning.

## Call it from your agent (MCP, no account)

    npx -y github:sjgant80-hub/kar-citelock

That starts an MCP server over stdio (Node.js 20 or later, no dependencies, no network, nothing written to disk) with
two tools: `verify_claim` (a claim and its sources in; VERIFIED or REFUSED and the trace out) and `about` (the rules
and the limits). In an MCP client's config:

```json
{ "mcpServers": { "kar-citelock": { "command": "npx", "args": ["-y", "github:sjgant80-hub/kar-citelock"] } } }
```

or in Claude Code: `claude mcp add kar-citelock -- npx -y github:sjgant80-hub/kar-citelock`. `mcp.test.mjs` spawns
the server and speaks MCP to it; CI also runs that line itself, from GitHub, from an empty folder, on every commit.
npx needs git on the machine. Started from inside this repository's own folder, npm 10 on GitHub's runner failed with
"GitFetcher requires an Arborist constructor"; started from any other folder it works.

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
- **Mutation gate:** witness v0.6 made 114 single-operator mutants of `kernel.mjs` and the tests caught
  112; the other 2 are equivalent mutants, reasons in `witness.baseline.json`. Receipt: `receipts/witness.json` (kernel SHA-256 `4a2c9e19f96cec2e…`).
  CI re-runs the gate on every push: https://github.com/sjgant80-hub/kar-citelock/actions/workflows/ci.yml
- **The MCP server:** witness v0.6 made 18 mutants of `mcp.mjs` and 2 of `stdio.mjs`; `mcp.test.mjs` caught all 20,
  with no exemptions, and `handleRpc` never throws on the fuzz battery. CI re-runs both on every push.

Powered by the Konomi architecture, created by Thomas Frumkin. MIT licence (see `LICENSE`).
