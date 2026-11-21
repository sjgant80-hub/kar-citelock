#!/usr/bin/env node
// stdio.mjs — the claim checker as an MCP server over stdio, for any agent, with no account:
//   npx -y github:sjgant80-hub/kar-citelock
// Each line on stdin is one JSON-RPC message; each answer is one line on stdout (MCP's stdio transport). Nothing else
// is written to stdout. It reads nothing from the network and writes nothing to disk.
import { createInterface } from 'node:readline';
import { handleRpc } from './mcp.mjs';

const PARSE_ERROR = JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error: each line must be one JSON-RPC message' } });

createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', (line) => {
  if (line.trim() === '') return;
  let message;
  try { message = JSON.parse(line); } catch { process.stdout.write(PARSE_ERROR + '\n'); return; }
  const answer = handleRpc(message);
  if (answer !== null) process.stdout.write(JSON.stringify(answer) + '\n');
});
