// claim-page.js — the claim check on the live page: the boxes, the trace table, the copy buttons, and the recorded
// agent call. It decides nothing itself: every verdict comes from verify() in the KERNEL block inlined in index.html
// (the same code as kernel.mjs and the MCP server), and is put on the page with textContent only.
// page.test.mjs runs this file against a small stand-in for the browser, and witness mutation-gates it.
(function(){
'use strict';

// The two Example Co. sources are made up; they are the claims and sources of the recorded call in trace/mcp-call.in.jsonl.
var EXAMPLE_SOURCES = [
  { id: 'report', text: 'Example Co. annual report, 2025. Revenue rose 12% to 4.2 million euros. The chair said: “we will open two new sites in 2026”.' },
  { id: 'survey', text: 'Example Co. staff survey, March 2026. 81% of staff said they would recommend Example Co. as a place to work.' }
];
var EXAMPLES = {
  truth: { claim: 'Revenue rose 12% in 2025 [report], and the chair said "we will open two new sites in 2026" [report]. 81% of staff would recommend Example Co. [survey].', sources: EXAMPLE_SOURCES },
  falsehood: { claim: 'Revenue rose 21% in 2025 [report], and the chair said "we will open two new sites in 2027" [report].', sources: EXAMPLE_SOURCES },
  joined: { claim: 'revenue rose 12%', sources: [{ id: 's1', text: 'Revenue rose 3% and costs rose 12%.' }] },
  dropped: { claim: 'The board did approve the merger.', sources: [{ id: 's1', text: 'The board did not approve the merger.' }] }
};
var KIND = { cite: 'citation', quote: 'quotation', number: 'number', word: 'word' };

function make(tag, text, cls){
  var e = document.createElement(tag);
  if (text) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

function addSourceRow(id, text){
  var box = $('mSources');
  if (box.children.length >= MESH_MAX_SOURCES) return;
  var row = make('div', '', 'src-row');
  var idIn = document.createElement('input');
  idIn.type = 'text'; idIn.value = id; idIn.placeholder = 'id, e.g. s' + (box.children.length + 1);
  idIn.setAttribute('aria-label', 'source id');
  var ta = document.createElement('textarea');
  ta.rows = 3; ta.value = text; ta.placeholder = 'Paste the source text…';
  ta.setAttribute('aria-label', 'source text');
  var rm = make('button', 'Remove', 'ghost small-btn');
  rm.type = 'button';
  rm.addEventListener('click', function(){ row.remove(); if (!box.children.length) addSourceRow('', ''); });
  row.appendChild(idIn); row.appendChild(ta); row.appendChild(rm);
  box.appendChild(row);
}

function setInput(ex){
  $('mClaim').value = ex.claim;
  $('mSources').replaceChildren();
  ex.sources.forEach(function(s){ addSourceRow(s.id, s.text); });
}

// the boxes as verify() takes them: a row with no id is cited by its position; a row with neither id nor text is left out
function readInput(){
  var sources = [];
  Array.prototype.forEach.call($('mSources').children, function(row){
    var id = row.querySelector('input').value.trim(), text = row.querySelector('textarea').value;
    if (text === '' && id === '') return;
    sources.push(id === '' ? { text: text } : { id: id, text: text });
  });
  return { claim: $('mClaim').value, sources: sources };
}

function offsets(c){ return c.raw ? c.raw[0] + '–' + c.raw[1] : 'evened-out ' + c.norm[0] + '–' + c.norm[1]; }

function where(td, c, texts){
  if (!c.ok) { td.textContent = c.reason; return; }
  if (c.kind === 'cite') { td.textContent = 'one of the sources given'; return; }
  td.appendChild(document.createTextNode(c.source + ', characters ' + offsets(c) + ': '));
  td.appendChild(c.raw ? make('span', texts[c.source].slice(c.raw[0], c.raw[1]), 'hit')
    : document.createTextNode('(the raw text does not slice back to the match exactly here)'));
}

function render(input, r){
  $('mOut').classList.remove('hidden');
  var v = $('mVerdict');
  v.textContent = r.verdict; v.className = 'badge ' + r.verdict;
  var counted = r.trace.checks.filter(function(c){ return c.kind !== 'input'; });
  var passed = counted.filter(function(c){ return c.ok; }).length;
  $('mSummary').textContent = counted.length ? passed + ' of ' + counted.length + ' checks passed · sources searched: ' + (r.trace.cited.join(', ') || 'none') : '';
  $('mReasons').replaceChildren.apply($('mReasons'), r.reasons.map(function(x){ return make('li', x); }));
  var texts = {};
  r.trace.sources.forEach(function(s, i){ texts[s.id] = input.sources[i].text; });
  $('mTrace').replaceChildren.apply($('mTrace'), counted.map(function(c){
    var tr = document.createElement('tr');
    tr.appendChild(make('td', KIND[c.kind]));
    tr.appendChild(make('td', c.kind === 'quote' ? '“' + c.text + '”' : c.kind === 'cite' ? '[' + c.text + ']' : c.text));
    tr.appendChild(make('td', c.ok ? '✓ yes' : '✗ no', c.ok ? 'ok-yes' : 'ok-no'));
    var td = document.createElement('td');
    where(td, c, texts);
    tr.appendChild(td);
    return tr;
  }));
  $('mSkipped').textContent = r.trace.skipped.length ? 'Skipped as small words (not checked): ' + r.trace.skipped.join(', ') : '';
  $('mJson').textContent = JSON.stringify(r, null, 2);
}

function run(){
  var input = readInput();
  render(input, verify(input));
}

function flash(btn, text){
  var was = btn.textContent;
  btn.textContent = text;
  setTimeout(function(){ btn.textContent = was; }, 1200);
}

$('mVerify').addEventListener('click', run);
$('mLoadTrue').addEventListener('click', function(){ setInput(EXAMPLES.truth); run(); });
$('mLoadFalse').addEventListener('click', function(){ setInput(EXAMPLES.falsehood); run(); });
$('mAddSource').addEventListener('click', function(){ addSourceRow('', ''); });
$('mClear').addEventListener('click', function(){
  $('mClaim').value = '';
  $('mSources').replaceChildren();
  addSourceRow('s1', '');
  $('mOut').classList.add('hidden');
});
Array.prototype.forEach.call(document.querySelectorAll('[data-limit]'), function(b){
  b.addEventListener('click', function(){
    setInput(EXAMPLES[b.getAttribute('data-limit')]);
    run();
    $('claim').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});
Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function(b){
  b.addEventListener('click', function(){
    var text = $(b.getAttribute('data-copy')).textContent;
    if (!navigator.clipboard) { flash(b, 'Select the text to copy'); return; }
    navigator.clipboard.writeText(text).then(function(){ flash(b, 'Copied'); }, function(){ flash(b, 'Select the text to copy'); });
  });
});
$('skipWords').textContent = Array.from(MESH_SKIP).join(', ');
addSourceRow('s1', '');

// "How the claim check works": the recorded MCP call, read from trace/, and the same claims re-run on this page
function found(c){ return c.ok ? c.text + ' (' + c.source + ', ' + offsets(c) + ')' : c.text + ' (not found)'; }

function steps(answer){
  var out = [], checks = answer.trace.checks;
  var of = function(kind){ return checks.filter(function(c){ return c.kind === kind; }); };
  var named = {};
  var cites = of('cite').filter(function(c){ var fresh = !named[c.text]; named[c.text] = true; return fresh; });
  if (cites.length) out.push('Citations: ' + cites.map(function(c){ return '[' + c.text + ']' + (c.ok ? ' is a source given' : ' is not a source given'); }).join('; ') + '. Sources searched: ' + answer.trace.cited.join(', ') + '.');
  of('quote').forEach(function(c){
    out.push('Quotation “' + c.text + '”: ' + (c.ok ? 'found word for word in ' + c.source + ', characters ' + offsets(c) + '.' : c.reason + '.'));
  });
  if (of('number').length) out.push('Numbers: ' + of('number').map(found).join(', ') + '.');
  if (of('word').length) out.push('Content words: ' + of('word').map(found).join(', ') + '.');
  if (answer.trace.skipped.length) out.push('Skipped as small words: ' + answer.trace.skipped.join(', ') + '.');
  return out;
}

function lines(t){ return t.split('\n').filter(function(l){ return l.trim() !== ''; }).map(function(l){ return JSON.parse(l); }); }

function get(p){
  return fetch(p, { cache: 'no-cache' }).then(function(r){ if (!r.ok) throw new Error(p + ': ' + r.status); return r.text(); });
}

function showCall(out, m, answer){
  var args = m.params.arguments;
  var same = JSON.stringify(verify(args)) === JSON.stringify(answer);
  var box = make('div', '', 'trace-call');
  box.appendChild(make('h3', 'Call ' + (m.id - 1) + ': the answer was ' + answer.verdict));
  box.appendChild(make('p', 'The claim the agent sent:'));
  box.appendChild(make('pre', args.claim, 'code'));
  box.appendChild(make('p', 'Its sources (made up for this page):'));
  var ul = make('ul', '', 'small');
  args.sources.forEach(function(s){ ul.appendChild(make('li', '[' + s.id + '] ' + s.text)); });
  box.appendChild(ul);
  box.appendChild(make('p', 'What the server checked, in order (source, then character offsets in the source as sent):'));
  var ol = document.createElement('ol');
  steps(answer).forEach(function(s){ ol.appendChild(make('li', s)); });
  box.appendChild(ol);
  box.appendChild(make('p', answer.verdict === 'VERIFIED' ? 'Answer: VERIFIED. Every check passed.'
    : 'Answer: REFUSED, with ' + answer.reasons.length + ' reason' + (answer.reasons.length === 1 ? '' : 's') + ': ' + answer.reasons.join(' · ')));
  box.appendChild(make('p', same ? 'This page ran the same claim through its own copy of the check and got exactly the same answer.'
    : 'This page ran the same claim through its own copy of the check and got a DIFFERENT answer: do not rely on this page until that is fixed.',
    same ? 'small match-yes' : 'small match-no'));
  out.appendChild(box);
}

function trace(){
  var out = $('traceOut');
  return Promise.all([get('trace/mcp-call.in.jsonl'), get('trace/mcp-call.out.jsonl')]).then(function(files){
    var sent = lines(files[0]), byId = {};
    lines(files[1]).forEach(function(m){ byId[m.id] = m; });
    var info = byId[1].result;
    out.replaceChildren(make('p', 'The agent starts the server and introduces itself (initialize). The server answers as ' + info.serverInfo.name + ' ' +
      info.serverInfo.version + ', protocol ' + info.protocolVersion + ', offering tools. Then the agent calls verify_claim twice:'));
    sent.filter(function(m){ return m.method === 'tools/call'; }).forEach(function(m){ showCall(out, m, byId[m.id].result.structuredContent); });
    var d = document.createElement('details');
    d.appendChild(make('summary', 'The raw messages, exactly as sent and received'));
    d.appendChild(make('pre', files[0].trim() + '\n\n' + files[1].trim(), 'code'));
    out.appendChild(d);
  }).catch(function(){
    out.replaceChildren(make('p', 'The recorded call could not be read here; open trace/mcp-call.in.jsonl and trace/mcp-call.out.jsonl directly.', 'muted'));
  });
}
window.claimPageReady = trace();
})();
