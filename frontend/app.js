/**
 * app.js — Frontend interactions for the Flex/Bison compiler backend.
 * Sends source to the backend engine and displays tokens, syntax, AST, and diagnostics.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
//  EXAMPLE SNIPPETS  (source text shown in the editor for each dropdown item)
// ═══════════════════════════════════════════════════════════════════════════

const EXAMPLES = {
  valid: {
    label: '✅ valid.c — switch with cases and default',
    source: `switch (x) {
case 1:
    y = 10;
    break;
case 2:
    y = 20;
    break;
default:
    y = 0;
    break;
}`,
  },

  duplicate_case: {
    label: '❌ duplicate_case.c — duplicate case value',
    source: `switch (x) {
case 1:
    break;
case 1:
    break;
}`,
  },

  invalid_break: {
    label: '❌ invalid_break.c — break outside switch',
    source: `break;`,
  },

  duplicate_default: {
    label: '❌ duplicate_default.c — two default clauses (syntax error)',
    source: `switch (x) {
case 1:
    break;
default:
    break;
default:
    break;
}`,
  },

  nested_valid: {
    label: '✅ nested_valid.c — nested switch statements',
    source: `switch (x) {
case 1:
    switch (y) {
    case 2:
        break;
    default:
        break;
    }
    break;
default:
    break;
}`,
  },

  nested_duplicate: {
    label: '❌ nested_duplicate.c — duplicate in inner switch',
    source: `switch (x) {
case 1:
    break;
case 2:
    switch (y) {
    case 1:
        break;
    case 1:
        break;
    }
    break;
}`,
  },

  separate_switches: {
    label: '✅ separate_switches.c — two independent switches',
    source: `switch (x) {
case 1:
    break;
}
switch (y) {
case 1:
    break;
}`,
  },

  expression_update: {
    label: '✅ expression_update.c — identifier arithmetic and assignment',
    source: `switch (x) {
case 1:
    x = x + 1;
    break;
case 2:
    x = (x + 2) * 3;
    break;
default:
    x = 0;
    break;
}`,
  },

  precedence: {
    label: '✅ precedence.c — multiplication before addition',
    source: `switch (x) {
case 1:
    result = a + b * c;
    break;
case 2:
    result = (a + b) * c;
    break;
}`, 
  },

  invalid_expression: {
    label: '❌ invalid_expression.c — malformed operator sequence',
    source: `switch (x) {
case 1:
    x = a + * b;
    break;
}`, 
  },

  empty_switch: {
    label: '✅ empty_switch.c — switch with no cases',
    source: `switch (x) {
}`,
  },

  missing_colon: {
    label: '❌ missing_colon.c — missing colon after case label',
    source: `switch (x) {
case 1
    break;
}`,
  },

  invalid_case_label: {
    label: '❌ invalid_case_label.c — identifier used as case label',
    source: `switch (x) {
case y:
    break;
}`,
  },

  missing_brace: {
    label: '❌ missing_brace.c — missing closing brace',
    source: `switch (x) {
case 1:
    break;`,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
//  DOM REFERENCES
// ═══════════════════════════════════════════════════════════════════════════

const $ = id => document.getElementById(id);

const elEditor       = $('source-editor');
const elBtnAnalyze   = $('btn-analyze');
const elBtnClear     = $('btn-clear');
const elExampleSel   = $('example-select');
const elFileInput    = $('file-input');

// Tab system
const elTabBtns = document.querySelectorAll('[role="tab"]');
const elTabPanels = document.querySelectorAll('.tab-panel');

// Result panels (inner containers that get populated)
const elTokensBody   = $('tokens-body');
const elTokensEmpty  = $('tokens-empty');
const elParseStatus  = $('parse-status');
const elParseError   = $('parse-error');
const elAstRoot      = $('ast-root');
const elAstEmpty     = $('ast-empty');
const elSemStatus    = $('sem-status');
const elSemList      = $('sem-list');
const elConsoleMessages = $('console-messages');
const elConsoleStatus = $('console-status');
let analysisGeneration = 0;

// ═══════════════════════════════════════════════════════════════════════════
//  ENGINE BOOTSTRAP
// ═══════════════════════════════════════════════════════════════════════════

function bootstrapEngine() {
  const engine = window.CompilerEngine;

  if (!engine || typeof engine.analyze !== 'function') {
    elBtnAnalyze.disabled = true;
    showFatalError(
      'No compiler engine loaded.',
      'Check the browser console and ensure index.html loads the backend engine script before app.js.'
    );
    return;
  }

}

function showFatalError(title, detail) {
  const el = $('fatal-error');
  if (el) {
    el.querySelector('.fatal-title').textContent = title;
    el.querySelector('.fatal-detail').textContent = detail;
    el.removeAttribute('hidden');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  EXAMPLE DROPDOWN
// ═══════════════════════════════════════════════════════════════════════════

function populateExampleDropdown() {
  // First option is a placeholder
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Load example…';
  placeholder.disabled = true;
  placeholder.selected = true;
  elExampleSel.appendChild(placeholder);

  for (const [key, { label }] of Object.entries(EXAMPLES)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = label;
    elExampleSel.appendChild(opt);
  }
}

elExampleSel.addEventListener('change', () => {
  const key = elExampleSel.value;
  if (key && EXAMPLES[key]) {
    elEditor.value = EXAMPLES[key].source;
    elExampleSel.value = '';          // reset so same example can be re-loaded
    clearResults();
  }
});

// Load a local .c or .txt file into the editor. The file is read in the browser;
// only its text is sent to the compiler when Analyze is clicked.
elFileInput.addEventListener('change', async () => {
  const file = elFileInput.files && elFileInput.files[0];
  if (!file) return;
  if (!/\.(c|txt)$/i.test(file.name)) {
    showFatalError('Unsupported file type.', 'Please choose a .c or .txt source file.');
    elFileInput.value = '';
    return;
  }
  try {
    elEditor.value = await file.text();
    clearResults();
    const fatal = $('fatal-error');
    if (fatal) fatal.setAttribute('hidden', '');
  } catch (err) {
    showFatalError('Could not read file.', err.message || 'The selected file could not be opened.');
  } finally {
    elFileInput.value = '';
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  TAB SWITCHING
// ═══════════════════════════════════════════════════════════════════════════

function activateTab(tabName) {
  elTabBtns.forEach(btn => {
    const active = btn.dataset.tab === tabName;
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
    btn.classList.toggle('tab--active', active);
  });
  elTabPanels.forEach(panel => {
    const active = panel.dataset.tab === tabName;
    panel.classList.toggle('tab-panel--active', active);
    panel.setAttribute('aria-hidden', active ? 'false' : 'true');
  });
}

elTabBtns.forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});

// ═══════════════════════════════════════════════════════════════════════════
//  ANALYZE BUTTON
// ═══════════════════════════════════════════════════════════════════════════

elBtnAnalyze.addEventListener('click', runAnalysis);
elEditor.addEventListener('input', () => clearResults());
elEditor.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runAnalysis();
});

async function runAnalysis() {
  const generation = analysisGeneration;
  const source = elEditor.value;
  if (!source.trim()) {
    elEditor.classList.add('editor--shake');
    setTimeout(() => elEditor.classList.remove('editor--shake'), 400);
  }

  setLoadingState(true);

  let result;
  try {
    result = await window.CompilerEngine.analyze(source);
  } catch (err) {
    result = {
      tokens:    [],
      syntax:    { ok: false, stage: 'backend', error: `Engine threw an unexpected error: ${err.message}` },
      ast:       null,
      semantics: { ok: false, diagnostics: [] },
    };
  }

  setLoadingState(false);
  if (generation !== analysisGeneration) return;

  try {
    renderResult(result);
    activateTab(chooseInitialTab(result));
  } catch (renderErr) {
    console.error('Error rendering analysis result:', renderErr);
    showFatalError('Display error', `Could not render compiler results: ${renderErr.message}`);
  }
}

function setLoadingState(loading) {
  elBtnAnalyze.disabled = loading;
  elBtnAnalyze.classList.toggle('btn--loading', loading);
  elBtnAnalyze.innerHTML = loading ? 'Compiling…' : '<span aria-hidden="true">▶</span> Analyze';
}

/** After analysis, jump to the most informative tab automatically. */
function chooseInitialTab(result) {
  if (!result || !result.syntax || !result.syntax.ok)    return 'parse';
  if (!result.semantics || !result.semantics.ok) return 'semantics';
  return 'ast';
}

// ═══════════════════════════════════════════════════════════════════════════
//  CLEAR BUTTON
// ═══════════════════════════════════════════════════════════════════════════

elBtnClear.addEventListener('click', () => {
  elEditor.value = '';
  clearResults();
  elEditor.focus();
});

function clearResults() {
  analysisGeneration++;
  renderTokensEmpty();
  renderParseIdle();
  renderAstEmpty();
  renderSemanticsIdle();
  showConsoleMessage('Awaiting compilation.', 'info');
}

// ═══════════════════════════════════════════════════════════════════════════
//  RENDERERS
// ═══════════════════════════════════════════════════════════════════════════

function renderResult(result) {
  renderTokens(result.tokens);
  renderParse(result.syntax);
  renderAst(result.ast);
  renderSemantics(result.semantics, result.syntax.ok);
  renderConsole(result);
}

// ── Tokens ─────────────────────────────────────────────────────────────────

const TOKEN_CLASS = {
  SWITCH:  'tok-keyword',
  CASE:    'tok-keyword',
  DEFAULT: 'tok-keyword',
  BREAK:   'tok-keyword',
  NUMBER:  'tok-number',
  IDENT:   'tok-ident',
  PUNCT:   'tok-punct',
  OPERATOR: 'tok-operator',
  INVALID: 'tok-invalid',
  UNKNOWN: 'tok-invalid',
};

function renderTokens(tokens) {
  if (!tokens || tokens.length === 0) {
    renderTokensEmpty('No tokens found in source.');
    return;
  }

  elTokensEmpty.setAttribute('hidden', '');
  elTokensBody.innerHTML = '';

  tokens.forEach((token, i) => {
    if (!token || typeof token !== 'object') return;
    const tr = document.createElement('tr');
    tr.style.animationDelay = `${i * 28}ms`;
    tr.classList.add('token-row');

    const cls = TOKEN_CLASS[token.type] || 'tok-punct';

    tr.innerHTML = `
      <td class="td-index">${escHtml(token.index)}</td>
      <td><span class="token-badge ${cls}">${escHtml(token.type)}</span></td>
      <td class="td-lexeme"><code>${escHtml(token.lexeme)}</code></td>
      <td class="td-line">${escHtml(token.line)}</td>
      <td class="td-line">${escHtml(token.column ?? "—")}</td>
    `;
    elTokensBody.appendChild(tr);
  });
}

function renderTokensEmpty(message = 'Run Analyze to inspect the token stream.') {
  elTokensBody.innerHTML = '';
  elTokensEmpty.textContent = message;
  elTokensEmpty.removeAttribute('hidden');
}

// ── Parse ──────────────────────────────────────────────────────────────────

function renderParseIdle() {
  elParseStatus.className = 'parse-status parse-status--idle';
  elParseStatus.innerHTML = `<span class="status-icon">⏸</span> Awaiting analysis`;
  elParseError.setAttribute('hidden', '');
  elParseError.textContent = '';
}

function renderParse(syntax) {
  if (!syntax || typeof syntax !== 'object') {
    elParseStatus.className = 'parse-status parse-status--error';
    elParseStatus.innerHTML = `<span class="status-icon">❌</span> Analysis failed`;
    elParseError.removeAttribute('hidden');
    elParseError.textContent = 'No syntax analysis data returned.';
    return;
  }
  if (syntax.ok) {
    elParseStatus.className = 'parse-status parse-status--ok';
    elParseStatus.innerHTML = `<span class="status-icon">✅</span> Syntax analysis successful. Parse tree built`;
    elParseError.setAttribute('hidden', '');
  } else {
    elParseStatus.className = 'parse-status parse-status--error';
    const stageLabels = {
      lexical: 'Lexical error - invalid token',
      syntax: 'Syntax error - parse failed',
      backend: 'Backend error - compiler unavailable',
      input: 'Input error - source could not be read'
    };
    elParseStatus.innerHTML = `<span class="status-icon">❌</span> ${stageLabels[syntax.stage || 'syntax'] || 'Analysis failed'}`;
    elParseError.removeAttribute('hidden');
    elParseError.textContent = syntax.error || 'Unknown compiler error.';
  }
}

// ── AST ────────────────────────────────────────────────────────────────────

function renderAstEmpty() {
  elAstRoot.innerHTML = '';
  elAstEmpty.removeAttribute('hidden');
  elAstEmpty.textContent = 'No AST - run an analysis first.';
}

function renderAst(ast) {
  elAstRoot.innerHTML = '';

  if (!ast || !Array.isArray(ast) || ast.length === 0) {
    elAstEmpty.removeAttribute('hidden');
    elAstEmpty.textContent = (ast === null || ast === undefined)
      ? 'AST not available - parse failed.'
      : 'Empty program - no statements found.';
    return;
  }

  elAstEmpty.setAttribute('hidden', '');
  const ul = buildAstList(ast);
  elAstRoot.appendChild(ul);
}

/**
 * Recursively build a nested <ul><li> tree from an ASTNode array.
 * @param {import('./engine.interface.js').ASTNode[]} nodes
 */
function buildAstList(nodes) {
  const ul = document.createElement('ul');
  ul.classList.add('ast-list');
  if (!Array.isArray(nodes)) return ul;

  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const li = document.createElement('li');
    const safeKind = String(node.kind || '').replace(/[^a-zA-Z0-9_-]/g, '');
    li.classList.add('ast-node', safeKind ? `ast-node--${safeKind}` : 'ast-node--unknown');

    switch (node.kind) {
      case 'switch': {
        li.innerHTML = `<span class="ast-icon">◇</span><span class="ast-label">Switch</span>`;
        if (node.selector) {
          const selectorUl = document.createElement('ul');
          selectorUl.classList.add('ast-list');
          selectorUl.appendChild(buildExpressionNode(node.selector));
          li.appendChild(selectorUl);
        }

        if (Array.isArray(node.cases) && node.cases.length > 0) {
          for (const c of node.cases) {
            if (!c || typeof c !== 'object') continue;
            const caseLi = document.createElement('li');
            caseLi.classList.add('ast-node', 'ast-node--case');
            caseLi.innerHTML = `<span class="ast-icon">◆</span><span class="ast-label">Case</span><span class="ast-detail">${escHtml(c.value)}</span>`;
            if (Array.isArray(c.body) && c.body.length > 0) {
              caseLi.appendChild(buildAstList(c.body));
            }
            const caseUl = document.createElement('ul');
            caseUl.classList.add('ast-list');
            caseUl.appendChild(caseLi);
            li.appendChild(caseUl);
          }
        }

        if (node.defaultBody !== null && node.defaultBody !== undefined) {
          const defLi = document.createElement('li');
          defLi.classList.add('ast-node', 'ast-node--default');
          defLi.innerHTML = `<span class="ast-icon">🔲</span><span class="ast-label">Default</span>`;
          if (Array.isArray(node.defaultBody) && node.defaultBody.length > 0) {
            defLi.appendChild(buildAstList(node.defaultBody));
          }
          const defUl = document.createElement('ul');
          defUl.classList.add('ast-list');
          defUl.appendChild(defLi);
          li.appendChild(defUl);
        }
        break;
      }

      case 'break':
        li.innerHTML = `<span class="ast-icon">⏸</span><span class="ast-label">Break</span>`;
        break;

      case 'assign':
        li.innerHTML = `<span class="ast-icon">↳</span><span class="ast-label">Assign</span><span class="ast-detail">${escHtml(node.name)}</span>`;
        if (node.expression) {
          const exprUl = document.createElement('ul');
          exprUl.classList.add('ast-list');
          exprUl.appendChild(buildExpressionNode(node.expression));
          li.appendChild(exprUl);
        }
        break;

      case 'call':
        li.innerHTML = `<span class="ast-icon">ƒ</span><span class="ast-label">Function call</span>`;
        if (node.expression) {
          const exprUl = document.createElement('ul');
          exprUl.classList.add('ast-list');
          exprUl.appendChild(buildExpressionNode(node.expression));
          li.appendChild(exprUl);
        }
        break;

      case 'empty':
        li.innerHTML = `<span class="ast-icon">∅</span><span class="ast-label">EmptyStatement</span>`;
        break;

      default:
        li.innerHTML = `<span class="ast-icon">?</span><span class="ast-label">${escHtml(node.kind || 'Unknown')}</span>`;
    }

    ul.appendChild(li);
  }

  return ul;
}

function buildExpressionNode(expr) {
  const li = document.createElement('li');
  li.classList.add('ast-node', 'ast-node--expression');
  if (!expr || typeof expr !== 'object') {
    li.innerHTML = `<span class="ast-label">Missing</span>`;
    return li;
  }
  let label = '';
  let detail = '';
  if (expr.kind === 'number') { label = 'Number'; detail = String(expr.value ?? ''); }
  else if (expr.kind === 'identifier') { label = 'Identifier'; detail = expr.name ?? ''; }
  else if (expr.kind === 'string') { label = 'String'; detail = `"${expr.value ?? ''}"`; }
  else if (expr.kind === 'binary') { label = 'Operator'; detail = expr.operator ?? ''; }
  else if (expr.kind === 'unary') { label = 'Unary'; detail = expr.operator ?? ''; }
  else if (expr.kind === 'call') { label = 'Call'; detail = expr.name ?? ''; }
  li.innerHTML = `<span class="ast-label">${escHtml(label || expr.kind || 'Expression')}</span><span class="ast-detail">${escHtml(detail)}</span>`;
  const rawChildren = expr.kind === 'binary' ? [expr.left, expr.right]
    : expr.kind === 'unary' ? [expr.operand]
    : expr.kind === 'call' ? (expr.arguments || []) : [];
  const children = rawChildren.filter(c => c !== null && c !== undefined);
  if (children.length) {
    const ul = document.createElement('ul');
    ul.classList.add('ast-list');
    children.forEach(child => ul.appendChild(buildExpressionNode(child)));
    li.appendChild(ul);
  }
  return li;
}

// ── Semantics ──────────────────────────────────────────────────────────────

function renderSemanticsIdle() {
  elSemStatus.className = 'sem-status sem-status--idle';
  elSemStatus.innerHTML = `<span class="status-icon">⏸</span> Awaiting analysis`;
  elSemList.innerHTML = '';
}

function renderSemantics(semantics, syntaxOk) {
  elSemList.innerHTML = '';

  if (!syntaxOk) {
    elSemStatus.className = 'sem-status sem-status--skip';
    elSemStatus.innerHTML =
      `<span class="status-icon">⚠️</span> Semantic analysis skipped. Fix syntax errors first`;
    return;
  }

  if (!semantics || typeof semantics !== 'object') {
    elSemStatus.className = 'sem-status sem-status--idle';
    elSemStatus.innerHTML = `<span class="status-icon">⏸</span> Semantic analysis not available`;
    return;
  }

  const diags = Array.isArray(semantics.diagnostics) ? semantics.diagnostics : [];
  if (semantics.ok && diags.length === 0) {
    elSemStatus.className = 'sem-status sem-status--ok';
    elSemStatus.innerHTML =
      `<span class="status-icon">✅</span> Semantic analysis successful. No errors detected`;
  } else {
    const count = diags.filter(d => d && d.kind === 'error').length;
    elSemStatus.className = 'sem-status sem-status--error';
    elSemStatus.innerHTML =
      `<span class="status-icon">❌</span> ${count} semantic error${count !== 1 ? 's' : ''} detected`;
  }

  for (const diag of diags) {
    if (!diag || typeof diag !== 'object') continue;
    const card = document.createElement('div');
    const safeKind = String(diag.kind || 'error').replace(/[^a-zA-Z0-9_-]/g, '');
    card.classList.add('diag-card', `diag-card--${safeKind || 'error'}`);

    const iconMap = { error: '❌', warning: '⚠️', info: 'ℹ️' };
    card.innerHTML = `
      <span class="diag-icon">${iconMap[diag.kind] || '•'}</span>
      <span class="diag-msg">${escHtml(diag.message)}</span>
    `;
    elSemList.appendChild(card);
  }
}

function showConsoleMessage(message, kind = 'info') {
  if (!elConsoleMessages) return;
  elConsoleMessages.innerHTML = '';
  const row = document.createElement('div');
  row.className = `console-message console-message--${kind}`;
  row.textContent = message;
  elConsoleMessages.appendChild(row);
  if (elConsoleStatus) elConsoleStatus.textContent = kind === 'success' ? 'No errors' : kind === 'error' ? 'Errors detected' : 'Compiler output';
}

function renderConsole(result) {
  if (!result || typeof result !== 'object') return;
  const messages = [];
  const syntax = result.syntax || { ok: false, error: 'Unknown syntax result' };
  if (syntax.ok) messages.push({ kind: 'success', text: 'Syntax analysis successful.' });
  else {
    const stage = syntax.stage || 'syntax';
    const prefixByStage = { lexical: 'Lexical error', syntax: 'Syntax error', backend: 'Backend/API error', input: 'Input error' };
    messages.push({ kind: 'error', text: `${prefixByStage[stage] || 'Analysis error'}: ${syntax.error || 'No details provided.'}` });
  }
  const semantics = result.semantics || { ok: false, diagnostics: [] };
  const diags = Array.isArray(semantics.diagnostics) ? semantics.diagnostics : [];
  for (const d of diags) {
    if (d && d.message) messages.push({ kind: d.kind || 'error', text: d.message });
  }
  if (syntax.ok && semantics.ok && messages.length === 1) messages.push({ kind: 'success', text: 'Semantic analysis successful. No semantic errors reported.' });
  elConsoleMessages.innerHTML = '';
  messages.forEach(item => {
    const row = document.createElement('div');
    row.className = `console-message console-message--${item.kind}`;
    const prefix = item.kind === 'error' ? '[ERROR]' : item.kind === 'warning' ? '[WARN]' : item.kind === 'success' ? '[OK]' : '[INFO]';
    row.textContent = `${prefix} ${item.text}`;
    elConsoleMessages.appendChild(row);
  });
  elConsoleStatus.textContent = messages.some(m => m.kind === 'error') ? 'Errors detected' : 'Analysis complete';
}

// ═══════════════════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ═══════════════════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════════════════

(function init() {
  bootstrapEngine();
  populateExampleDropdown();
  activateTab('tokens');
  clearResults();

  // Pre-load the "valid" example so the editor is never blank on first load
  if (EXAMPLES.valid) {
    elEditor.value = EXAMPLES.valid.source;
  }
})();
