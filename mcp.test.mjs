// mcp.test.mjs — the MCP server (mcp.mjs) message by message, then the real thing: stdio.mjs spawned as its own
// process and spoken to in MCP over stdin and stdout, the way an agent runs it. With CITELOCK_MCP_NPX set (CI sets it
// to this commit on GitHub), the spawned server is `npx -y <that>` instead: the install line on the page, run for real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { handleRpc, negotiate, TOOLS, ABOUT, VERSION, PROTOCOLS, DEFAULT_PROTOCOL, INSTRUCTIONS, PAGE, REPO } from './mcp.mjs';
import { verify, MESH_VERSION } from './kernel.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const NPX = process.env.CITELOCK_MCP_NPX;
// npx runs from a fresh empty folder, as a stranger's agent would start it. CI runs it on Node 20, 22 and 24.
const SERVER = NPX
  ? ['npx', ['-y', NPX], { shell: process.platform === 'win32', cwd: mkdtempSync(join(tmpdir(), 'citelock-npx-')) }]
  : [process.execPath, [join(HERE, 'stdio.mjs')], { cwd: HERE }];

const SRC = [{ id: 'report', text: 'The board approved the merger on 3 March. Revenue rose 12% in 2025.' }];
const TRUE = { claim: 'The board approved the merger, and revenue rose 12% [report].', sources: SRC };
const FALSE = { claim: 'The board rejected the merger, and revenue rose 15% [report].', sources: SRC };
const FALSE_REASONS = ['the number 15 is not in any cited source', 'the word "rejected" is not in any cited source'];
const INVALID = { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'invalid request: send one JSON-RPC 2.0 object per line' } };
const rpc = (id, method, params) => (params === undefined ? { jsonrpc: '2.0', id, method } : { jsonrpc: '2.0', id, method, params });
const callTool = (id, name, args) => rpc(id, 'tools/call', { name, arguments: args });

test('negotiate: a version this server speaks is echoed, anything else gets the default', () => {
  for (const v of PROTOCOLS) assert.equal(negotiate(v), v);
  assert.equal(DEFAULT_PROTOCOL, '2025-06-18');
  for (const v of ['1999-01-01', undefined, null, 5]) assert.equal(negotiate(v), DEFAULT_PROTOCOL);
});

test('handleRpc: what is not one JSON-RPC object is an invalid request; a message with no id gets no answer', () => {
  for (const m of [null, 5, 'x', [], [rpc(1, 'ping')]]) assert.deepEqual(handleRpc(m), INVALID);
  assert.equal(handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal(handleRpc({ jsonrpc: '2.0', method: 'tools/list' }), null);
  assert.deepEqual(handleRpc({ jsonrpc: '1.0', id: 1, method: 'ping' }), { jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'invalid request: jsonrpc must be "2.0"' } });
  assert.deepEqual(handleRpc(rpc(0, 'ping')), { jsonrpc: '2.0', id: 0, result: {} });         // id 0 is a request, not a notification
  assert.deepEqual(handleRpc(rpc('a', 'ping')), { jsonrpc: '2.0', id: 'a', result: {} });
  const toxic = { get id() { throw new Error('boom'); } };
  assert.deepEqual(handleRpc(toxic), { jsonrpc: '2.0', id: null, error: { code: -32603, message: 'internal error: the message could not be read' } });
});

test('handleRpc: initialize names the server and its one capability, and echoes the protocol it was asked for', () => {
  const want = (protocolVersion) => ({
    jsonrpc: '2.0', id: 1,
    result: {
      protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: 'kar-citelock', title: 'Kar CiteLock: claims checked against their sources', version: VERSION },
      instructions: INSTRUCTIONS,
    },
  });
  assert.deepEqual(handleRpc(rpc(1, 'initialize', { protocolVersion: '2025-03-26' })), want('2025-03-26'));
  assert.deepEqual(handleRpc(rpc(1, 'initialize')), want(DEFAULT_PROTOCOL));
  assert.deepEqual(handleRpc(rpc(1, 'initialize', null)), want(DEFAULT_PROTOCOL));
  assert.deepEqual(handleRpc(rpc(1, 'initialize', 'x')), want(DEFAULT_PROTOCOL));
  assert.equal(VERSION, '1.1.0');
});

test('handleRpc: tools/list lists verify_claim and about; unknown methods and tools are errors', () => {
  assert.deepEqual(handleRpc(rpc(2, 'tools/list')), { jsonrpc: '2.0', id: 2, result: { tools: TOOLS } });
  assert.deepEqual(TOOLS.map((t) => t.name), ['verify_claim', 'about']);
  assert.deepEqual(TOOLS[0].inputSchema.required, ['claim', 'sources']);
  assert.deepEqual(handleRpc(rpc(3, 'resources/list')), { jsonrpc: '2.0', id: 3, error: { code: -32601, message: 'unknown method: resources/list' } });
  assert.deepEqual(handleRpc({ jsonrpc: '2.0', id: 3 }), { jsonrpc: '2.0', id: 3, error: { code: -32601, message: 'unknown method: undefined' } });
  assert.deepEqual(handleRpc(callTool(4, 'nope', {})), { jsonrpc: '2.0', id: 4, error: { code: -32602, message: 'unknown tool: nope' } });
  assert.deepEqual(handleRpc(rpc(4, 'tools/call')), { jsonrpc: '2.0', id: 4, error: { code: -32602, message: 'unknown tool: undefined' } });
});

test('handleRpc: verify_claim is the kernel verify(): a true claim VERIFIED, a false one REFUSED with its reasons', () => {
  const t = handleRpc(callTool(5, 'verify_claim', TRUE));
  assert.deepEqual(t, { jsonrpc: '2.0', id: 5, result: { content: [{ type: 'text', text: JSON.stringify(verify(TRUE), null, 2) }], structuredContent: verify(TRUE), isError: false } });
  assert.equal(t.result.structuredContent.verdict, 'VERIFIED');
  const f = handleRpc(callTool(6, 'verify_claim', FALSE));
  assert.equal(f.result.structuredContent.verdict, 'REFUSED');
  assert.deepEqual(f.result.structuredContent.reasons, FALSE_REASONS);
  assert.equal(f.result.isError, false);                                      // REFUSED is an answer, not a tool error
  assert.deepEqual(handleRpc(rpc(7, 'tools/call', { name: 'verify_claim' })).result.structuredContent.reasons, ['the claim must be text']);
  assert.deepEqual(handleRpc(callTool(7, 'verify_claim', null)).result.structuredContent.reasons, ['the claim must be text']);
  assert.deepEqual(handleRpc(callTool(7, 'verify_claim', 'x')).result.structuredContent.reasons, ['the claim must be text']);
});

test('handleRpc: about says what it checks and where it stops, names Kar and the supplier, and nothing private', () => {
  const a = handleRpc(callTool(8, 'about', {}));
  assert.deepEqual(a.result.structuredContent, ABOUT);
  assert.equal(a.result.content[0].text, JSON.stringify(ABOUT, null, 2));
  assert.equal(ABOUT.algorithm, MESH_VERSION);
  assert.equal(ABOUT.page, PAGE);
  assert.equal(ABOUT.source, REPO);
  assert.equal(ABOUT.maker, 'Kar');
  assert.match(ABOUT.supplier, /AI Native Solutions, https:\/\/www\.ai-nativesolutions\.com/);
  assert.match(ABOUT.limits[0], /does not understand meaning/);
});

test('the limits in about are true of the kernel: joined words and a dropped "not" can pass', () => {
  assert.equal(verify({ claim: 'revenue rose 12%', sources: ['Revenue rose 3% and costs rose 12%.'] }).verdict, 'VERIFIED');
  assert.equal(verify({ claim: 'The board did approve the merger.', sources: ['The board did not approve the merger.'] }).verdict, 'VERIFIED');
});

// ---- the real server, spawned ----
const lines = (out) => out.split(/\r?\n/).filter((l) => l !== '').map((l) => JSON.parse(l));

test('stdio: a whole MCP session on stdin gets one answer per request on stdout, in order', () => {
  const input = [
    JSON.stringify(rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } })),
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    '',
    '   ',
    JSON.stringify(rpc(2, 'tools/list')),
    JSON.stringify(callTool(3, 'verify_claim', TRUE)),
    JSON.stringify(callTool(4, 'verify_claim', FALSE)) + '\r',
    'this is not json',
    JSON.stringify(callTool(5, 'about', {})),
  ].join('\n') + '\n';
  const [cmd, args, opts] = SERVER;
  const r = spawnSync(cmd, args, { ...opts, input, encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, r.stderr);
  const out = lines(r.stdout);
  assert.deepEqual(out.map((m) => m.id), [1, 2, 3, 4, null, 5]);
  assert.equal(out[0].result.serverInfo.name, 'kar-citelock');
  assert.deepEqual(out[1].result.tools.map((t) => t.name), ['verify_claim', 'about']);
  assert.equal(out[2].result.structuredContent.verdict, 'VERIFIED');
  assert.equal(out[3].result.structuredContent.verdict, 'REFUSED');
  assert.deepEqual(out[3].result.structuredContent.reasons, FALSE_REASONS);
  assert.deepEqual(out[4], { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error: each line must be one JSON-RPC message' } });
  assert.equal(out[5].result.structuredContent.maker, 'Kar');
});

test('stdio: it answers each line as it arrives, without waiting for the end of the input', async () => {
  const [cmd, args, opts] = SERVER;
  const child = spawn(cmd, args, { ...opts, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '', stderr = '';
  const waiting = [];
  child.stderr.on('data', (d) => { stderr += d; });
  // a server that dies answers every question still waiting with how it died, so the test fails instead of hanging
  child.on('close', (code) => { while (waiting.length) waiting.shift()({ closed: code, stderr }); });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) { const l = buf.slice(0, nl); buf = buf.slice(nl + 1); waiting.shift()(JSON.parse(l)); }
  });
  const ask = (m) => new Promise((resolve) => { waiting.push(resolve); child.stdin.write(JSON.stringify(m) + '\n'); });
  const exited = new Promise((resolve) => child.on('close', resolve));
  try {
    const init = await ask(rpc(1, 'initialize', { protocolVersion: '2025-11-25' }));
    assert.equal(init.result.protocolVersion, '2025-11-25');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const t = await ask(callTool(2, 'verify_claim', TRUE));
    assert.equal(t.id, 2);
    assert.equal(t.result.structuredContent.verdict, 'VERIFIED');
    const f = await ask(callTool(3, 'verify_claim', FALSE));
    assert.deepEqual(f.result.structuredContent.reasons, FALSE_REASONS);
  } finally {
    child.stdin.end();
  }
  assert.equal(await exited, 0);
});
