'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const compiler = require('../frontend/engines/js-compiler.js');

const expectations = {
  'valid.c': [true, true],
  'duplicate_case.c': [true, false],
  'invalid_break.c': [true, false],
  'top_level_assignment.c': [false, false],
  'top_level_expression.c': [false, false],
  'empty_program.c': [false, false],
  'duplicate_default.c': [false, false],
  'nested_valid.c': [true, true],
  'nested_duplicate.c': [true, false],
  'separate_switches.c': [true, true],
  'missing_colon.c': [false, false],
  'invalid_case_label.c': [false, false],
  'missing_brace.c': [false, false],
  'empty_switch.c': [true, true],
  'identifier_assignment.c': [true, true],
  'arithmetic_precedence.c': [true, true],
  'parenthesized_expression.c': [true, true],
  'nested_arithmetic.c': [true, true],
  'switch_expression.c': [true, true],
  'invalid_missing_semicolon.c': [false, false],
  'invalid_operator_sequence.c': [false, false],
  'unterminated_comment.c': [false, false],
  'invalid_float.c': [false, false],
  'invalid_float_leading_dot.c': [false, false],
  'invalid_float_trailing_dot.c': [false, false],
  'invalid_integer_overflow.c': [false, false],
  'block_comments.c': [true, true],
  'block_statement.c': [true, true],
};

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}\n${error.stack || error}`); }
}

for (const [filename, [syntaxExpected, semanticExpected]] of Object.entries(expectations)) {
  test(filename, () => {
    const source = fs.readFileSync(path.join(__dirname, filename), 'utf8');
    const result = compiler.analyze(source);
    assert.equal(result.syntax.ok, syntaxExpected, result.syntax.error || 'Unexpected syntax result');
    assert.equal(result.semantics.ok, semanticExpected);
    assert.ok(Array.isArray(result.tokens));
    if (syntaxExpected) assert.ok(Array.isArray(result.ast));
    else assert.equal(result.ast, null);
    if (filename === 'unterminated_comment.c' || filename.startsWith('invalid_float')) assert.equal(result.syntax.stage, 'lexical');
    if (filename === 'duplicate_case.c') assert.match(result.semantics.diagnostics[0].message, /duplicate case value 1/);
    if (filename === 'invalid_break.c') assert.match(result.semantics.diagnostics[0].message, /break outside switch/);
  });
}

test('expression strings and precedence', () => {
  const source = fs.readFileSync(path.join(__dirname, 'arithmetic_precedence.c'), 'utf8');
  const result = compiler.analyze(source);
  assert.equal(result.ast[0].cases[0].body[0].value, '(a + (b * c))');
});

test('equivalent signed case labels are duplicates', () => {
  const result = compiler.analyze('switch (x) { case 1: break; case +1: break; }');
  assert.equal(result.syntax.ok, true);
  assert.equal(result.semantics.ok, false);
  assert.match(result.semantics.diagnostics[0].message, /duplicate case value 1/);
});

test('nested switch case values do not collide with outer values', () => {
  const result = compiler.analyze('switch (x) { case 1: switch (y) { case 1: break; } break; }');
  assert.equal(result.syntax.ok, true);
  assert.equal(result.semantics.ok, true);
});

test('break inside a braced case block is legal', () => {
  const result = compiler.analyze('switch (x) { case 1: { break; } }');
  assert.equal(result.syntax.ok, true);
  assert.equal(result.semantics.ok, true);
});

test('break inside a top-level block is still invalid syntax', () => {
  const result = compiler.analyze('{ break; }');
  assert.equal(result.syntax.ok, false);
});

test('comments are ignored and locations continue across lines', () => {
  const result = compiler.analyze('/* first line\n comment */\nswitch (x) { // switch\n case 1: break;\n}');
  assert.equal(result.syntax.ok, true);
  assert.equal(result.ast[0].line, 3);
  assert.equal(result.ast[0].cases[0].line, 4);
});

test('unsupported characters and floats are lexical errors', () => {
  for (const source of ['switch (x) { case 1: x = @; }', 'switch (x) { case 1: x = 2.5; }', 'switch (x) { case 1: x = .5; }']) {
    const result = compiler.analyze(source);
    assert.equal(result.syntax.ok, false);
    assert.equal(result.syntax.stage, 'lexical');
  }
});

test('signed 64-bit duplicate check avoids number precision loss', () => {
  const result = compiler.analyze('switch (x) { case 9007199254740992: break; case 9007199254740992: break; }');
  assert.equal(result.syntax.ok, true);
  assert.equal(result.semantics.ok, false);
  assert.match(result.semantics.diagnostics[0].message, /duplicate case value 9007199254740992/);
});

test('source over 64 KiB returns a controlled input error', () => {
  const result = compiler.analyze(' '.repeat(65537));
  assert.equal(result.syntax.ok, false);
  assert.equal(result.syntax.stage, 'input');
});


test('frontend package is self-contained and loads local scripts', () => {
  const frontend = path.join(__dirname, '..', 'frontend');
  const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
  assert.match(html, /engines\/js-compiler\.js/);
  assert.match(html, /app\.js/);
  assert.doesNotMatch(html, /backend\.js|api\/analyze/i);
  assert.doesNotMatch(fs.readFileSync(path.join(frontend, 'app.js'), 'utf8'), /fetch\s*\(/);
  assert.doesNotMatch(fs.readFileSync(path.join(frontend, 'style.css'), 'utf8'), /@import\s+url\(['"]https?:/i);
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi)) {
    const asset = match[1];
    if (!/^(?:https?:|data:|#)/i.test(asset)) assert.ok(fs.existsSync(path.join(frontend, asset)), `Missing local asset: ${asset}`);
  }
});

console.log(`\nJavaScript compiler tests: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
