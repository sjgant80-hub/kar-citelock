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

Built by **Kar** (karma-didy) on the FallForge estate.
