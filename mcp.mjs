// mcp.mjs — the claim checker as a Model Context Protocol server: one JSON-RPC message in, one answer out (none for a
// notification). stdio.mjs runs it over stdin and stdout, so any agent can start it with no account:
//   npx -y github:sjgant80-hub/kar-citelock
// The tool verify_claim is the kernel's verify(), unchanged: the live page, the tests and the mutation gate run the
// same function. No network, no files, no clock.
import { verify, MESH_VERSION, MESH_MAX_CLAIM, MESH_MAX_SOURCES, MESH_MAX_TEXT } from './kernel.mjs';

export const VERSION = '1.1.0';
export const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
export const DEFAULT_PROTOCOL = '2025-06-18';
export const PAGE = 'https://sjgant80-hub.github.io/kar-citelock/';
export const REPO = 'https://github.com/sjgant80-hub/kar-citelock';

// The version the client asked for when this server speaks it, otherwise the one it speaks by default.
export function negotiate(requested) {
  return PROTOCOLS.includes(requested) ? requested : DEFAULT_PROTOCOL;
}

export const INSTRUCTIONS = 'Call verify_claim with a claim and the sources it rests on, before you state the claim. ' +
  'It answers VERIFIED only when every quotation in the claim is word for word in a cited source and every content word ' +
  'and number is in a cited source; otherwise REFUSED, with one reason for each part that failed, and the trace of every ' +
  'check with its offsets. It checks words, numbers and offsets; it does not understand meaning. Call about for the rules and limits.';

export const ABOUT = {
  name: 'kar-citelock',
  what: 'Checks a claim against the sources it cites, with fixed rules and no AI judge. It answers VERIFIED or REFUSED, ' +
    'with the grounding trace: every quotation, number and content word it checked, the source it was found in, and its offsets.',
  verifiedWhen: [
    'every quotation in the claim (text between double quote marks) is word for word in a cited source, capitals included',
    'every content word of the claim outside its quotations is in a cited source; capitals and simple plurals are evened out',
    'every number of the claim outside its quotations is in a cited source; thousands commas are evened out',
  ],
  refusedWhen: 'any of those fails, the claim cites an [id] that is not among the sources, a quotation is left open, or the ' +
    'claim has nothing to check. Each part that failed gets its own reason.',
  citing: 'Put [id] markers in the claim to say which sources it rests on, for example "Revenue rose 12% [s1]." ' +
    'With no marker, every source given is cited.',
  input: {
    claim: 'text, at most ' + MESH_MAX_CLAIM + ' characters: check a long text one sentence at a time',
    sources: 'a list of 1 to ' + MESH_MAX_SOURCES + ' sources, each a text or { id, text }, at most ' + MESH_MAX_TEXT + ' characters in all',
  },
  offsets: 'norm offsets are into the source after spacing, curly quote marks and dashes are evened out; raw offsets are ' +
    'into the source exactly as given, and are null where the raw text there does not slice back to the match',
  limits: [
    'It does not understand meaning. It checks words, numbers and offsets.',
    'It checks that the words and numbers are in the cited sources, not that they are joined the way the claim joins them: ' +
      '"revenue rose 12%" passes against a source that says revenue rose 3% and costs rose 12%.',
    'It cannot see a word the claim leaves out: a claim that drops a "not" its source has can pass.',
    'Small English words (the, and, of, said and others) are skipped and listed in the trace. Chinese, Japanese, Thai and ' +
      'other scripts written without spaces count a whole run of text as one word.',
    'It confirms the words are in the sources you give it, not that the sources are true.',
  ],
  algorithm: MESH_VERSION,
  page: PAGE,
  source: REPO,
  maker: 'Kar',
  supplier: 'AI Native Solutions, https://www.ai-nativesolutions.com',
  support: "agreed per deployment, in each deployment's agreement",
  licence: 'MIT',
};

const SOURCE_ITEM = {
  anyOf: [
    { type: 'string', description: 'the source text; its id is its position, counting from 1' },
    {
      type: 'object',
      required: ['text'],
      properties: {
        id: { type: ['string', 'number'], description: 'what the claim cites it as, e.g. "s1" for [s1]: letters, digits and . _ : -' },
        text: { type: 'string', description: 'the source text' },
      },
    },
  ],
};

export const TOOLS = [
  {
    name: 'verify_claim',
    title: 'Verify a claim against its sources',
    description: 'Check one claim against the sources it rests on, before stating it. VERIFIED only when every quotation ' +
      '("...") is word for word in a cited source and every content word and number outside the quotations is in a cited ' +
      'source; otherwise REFUSED, with one reason per failed part. The trace lists every check with its source and offsets. ' +
      'Cite sources in the claim with [id] markers; with none, every source is cited. Deterministic, no AI judge.',
    inputSchema: {
      type: 'object',
      required: ['claim', 'sources'],
      properties: {
        claim: { type: 'string', description: 'the claim, e.g. "Revenue rose 12% in 2025 [s1]." At most ' + MESH_MAX_CLAIM + ' characters.' },
        sources: { type: 'array', minItems: 1, maxItems: MESH_MAX_SOURCES, items: SOURCE_ITEM, description: 'the sources the claim rests on' },
      },
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'about',
    title: 'What this checker does and where it stops',
    description: 'The rules verify_claim applies, how to cite sources, what the offsets mean, and its limits, in plain words.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
];

function toolResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value, isError: false };
}

function call(params, answer, fail) {
  const args = params.arguments !== null && typeof params.arguments === 'object' ? params.arguments : {};
  if (params.name === 'verify_claim') return answer(toolResult(verify(args)));
  if (params.name === 'about') return answer(toolResult(ABOUT));
  return fail(-32602, 'unknown tool: ' + String(params.name));
}

// One JSON-RPC 2.0 message (already parsed) in; the answer out, or null for a notification (a message with no id).
// It never throws: a message it cannot even read gets an internal-error answer.
export function handleRpc(message) {
  try { return answerTo(message); }
  catch { return { jsonrpc: '2.0', id: null, error: { code: -32603, message: 'internal error: the message could not be read' } }; }
}

function answerTo(message) {
  if (message === null || typeof message !== 'object' || Array.isArray(message)) {
    return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'invalid request: send one JSON-RPC 2.0 object per line' } };
  }
  const id = message.id;
  if (id === undefined) return null;
  const answer = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, text) => ({ jsonrpc: '2.0', id, error: { code, message: text } });
  if (message.jsonrpc !== '2.0') return fail(-32600, 'invalid request: jsonrpc must be "2.0"');
  const params = message.params !== null && typeof message.params === 'object' ? message.params : {};
  const method = message.method;
  if (method === 'initialize') {
    return answer({
      protocolVersion: negotiate(params.protocolVersion),
      capabilities: { tools: {} },
      serverInfo: { name: 'kar-citelock', title: 'Kar CiteLock: claims checked against their sources', version: VERSION },
      instructions: INSTRUCTIONS,
    });
  }
  if (method === 'ping') return answer({});
  if (method === 'tools/list') return answer({ tools: TOOLS });
  if (method === 'tools/call') return call(params, answer, fail);
  return fail(-32601, 'unknown method: ' + String(method));
}
