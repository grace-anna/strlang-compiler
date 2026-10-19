/* A small browser-only compiler for the SwitchLab language. */
(function (root) {
  'use strict';

  const MAX_INT = 9223372036854775807n;
  const KEYWORDS = { switch: 'SWITCH', case: 'CASE', default: 'DEFAULT', break: 'BREAK' };
  const TWO_CHAR = ['==', '!=', '<=', '>=', '&&', '||'];
  const OPERATORS = ['+', '-', '*', '/', '%', '<', '>', '=', '!', '==', '!=', '<=', '>=', '&&', '||'];
  const PUNCTUATION = ['(', ')', '{', '}', ':', ';'];
  const PRECEDENCE = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };

  function token(type, lexeme, line, column, index, extra) {
    return Object.assign({ type, lexeme, line, column, index }, extra || {});
  }

  function lex(source) {
    const tokens = [];
    let i = 0, line = 1, column = 1, firstError = null;
    const length = source.length;
    function advance() {
      const ch = source[i++];
      if (ch === '\n') { line++; column = 1; } else column++;
      return ch;
    }
    function add(type, start, startLine, startColumn, extra) {
      tokens.push(token(type, source.slice(start, i), startLine, startColumn, tokens.length + 1, extra));
    }
    function invalid(message, start, startLine, startColumn) {
      add('INVALID', start, startLine, startColumn);
      if (!firstError) firstError = `Lexical error at line ${startLine}, column ${startColumn}: ${message}`;
    }

    while (i < length) {
      const ch = source[i];
      if (/\s/.test(ch)) { advance(); continue; }
      const start = i, startLine = line, startColumn = column;

      if (ch === '/' && source[i + 1] === '/') {
        advance(); advance();
        while (i < length && source[i] !== '\n') advance();
        continue;
      }
      if (ch === '/' && source[i + 1] === '*') {
        advance(); advance();
        let closed = false;
        while (i < length) {
          if (source[i] === '*' && source[i + 1] === '/') { advance(); advance(); closed = true; break; }
          advance();
        }
        if (!closed) {
          tokens.push(token('INVALID', source.slice(start), startLine, startColumn, tokens.length + 1));
          if (!firstError) firstError = `Lexical error at line ${startLine}, column ${startColumn}: unterminated block comment`;
        }
        continue;
      }

      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1] || ''))) {
        if (ch === '.') {
          advance();
          while (i < length && /[0-9]/.test(source[i])) advance();
          invalid('floating-point literals are not supported', start, startLine, startColumn);
          continue;
        }
        while (i < length && /[0-9]/.test(source[i])) advance();
        if (source[i] === '.') {
          advance();
          while (i < length && /[0-9]/.test(source[i])) advance();
          invalid('floating-point literals are not supported', start, startLine, startColumn);
          continue;
        }
        const raw = source.slice(start, i);
        let value;
        try { value = BigInt(raw); } catch (_) { value = MAX_INT + 1n; }
        if (value > MAX_INT) invalid('integer literal is out of range', start, startLine, startColumn);
        else add('NUMBER', start, startLine, startColumn, { integer: value });
        continue;
      }

      if (/[A-Za-z_]/.test(ch)) {
        advance();
        while (i < length && /[A-Za-z0-9_]/.test(source[i])) advance();
        const word = source.slice(start, i);
        add(KEYWORDS[word] || 'IDENT', start, startLine, startColumn);
        continue;
      }

      const pair = source.slice(i, i + 2);
      if (TWO_CHAR.includes(pair)) {
        advance(); advance();
        add('OPERATOR', start, startLine, startColumn);
        continue;
      }
      if (OPERATORS.includes(ch)) {
        advance(); add('OPERATOR', start, startLine, startColumn); continue;
      }
      if (PUNCTUATION.includes(ch)) {
        advance(); add('PUNCT', start, startLine, startColumn); continue;
      }
      advance();
      invalid('unsupported character', start, startLine, startColumn);
    }
    return { tokens, error: firstError };
  }

  class ParseError extends Error {
    constructor(tok, message) {
      super(`Syntax error at line ${tok ? tok.line : 1}, column ${tok ? tok.column : 1}: ${message}`);
      this.name = 'ParseError';
      this.token = tok;
    }
  }

  class Parser {
    constructor(tokens) { this.tokens = tokens; this.pos = 0; }
    peek(offset = 0) { return this.tokens[this.pos + offset] || null; }
    is(type, lexeme) {
      const t = this.peek();
      return !!t && t.type === type && (lexeme === undefined || t.lexeme === lexeme);
    }
    take() { return this.tokens[this.pos++] || null; }
    expect(type, lexeme, description) {
      if (this.is(type, lexeme)) return this.take();
      const t = this.peek();
      const got = t ? `unexpected '${t.lexeme}'` : 'unexpected end of input';
      throw new ParseError(t, `${got}; expected ${description || (lexeme || type)}`);
    }
    expectKeyword(type) { return this.expect(type, undefined, type.toLowerCase()); }
    parseProgram() {
      if (!this.peek()) throw new ParseError(null, 'expected a switch statement or break;');
      const nodes = [];
      while (this.peek()) nodes.push(this.parseTopStatement());
      return nodes;
    }
    parseTopStatement() {
      if (this.is('SWITCH')) return this.parseSwitch();
      if (this.is('BREAK')) return this.parseBreak();
      const t = this.peek();
      throw new ParseError(t, `unexpected '${t ? t.lexeme : ''}'; expected switch or break`);
    }
    parseStatement() {
      if (this.is('SWITCH')) return this.parseSwitch();
      if (this.is('BREAK')) return this.parseBreak();
      if (this.is('PUNCT', ';')) {
        const t = this.take();
        return { kind: 'empty', line: t.line, column: t.column };
      }
      if (this.is('PUNCT', '{')) {
        this.take();
        const body = [];
        while (this.peek() && !this.is('PUNCT', '}')) body.push(this.parseStatement());
        this.expect('PUNCT', '}', "'}'");
        return body;
      }
      if (this.is('IDENT')) {
        const name = this.take();
        this.expect('OPERATOR', '=', "'='");
        const expression = this.parseExpression();
        this.expect('PUNCT', ';', "';'");
        return { kind: 'assign', name: name.lexeme, value: formatExpression(expression), expression, line: name.line, column: name.column };
      }
      const t = this.peek();
      throw new ParseError(t, `unexpected '${t ? t.lexeme : ''}' in statement`);
    }
    parseBreak() {
      const t = this.expectKeyword('BREAK');
      this.expect('PUNCT', ';', "';'");
      return { kind: 'break', line: t.line, column: t.column };
    }
    parseSwitch() {
      const start = this.expectKeyword('SWITCH');
      this.expect('PUNCT', '(', "'('");
      const selector = this.parseExpression();
      this.expect('PUNCT', ')', "')'");
      this.expect('PUNCT', '{', "'{'" );
      const cases = [];
      while (this.is('CASE')) cases.push(this.parseCase());
      let defaultBody = null;
      if (this.is('DEFAULT')) {
        this.take();
        this.expect('PUNCT', ':', "':'");
        defaultBody = this.parseStatementListUntilBrace();
      }
      this.expect('PUNCT', '}', "'}'");
      return { kind: 'switch', name: formatExpression(selector), selector, cases, defaultBody, line: start.line, column: start.column };
    }
    parseCase() {
      const start = this.expectKeyword('CASE');
      let sign = 1n;
      if (this.is('OPERATOR', '-') || this.is('OPERATOR', '+')) sign = this.take().lexeme === '-' ? -1n : 1n;
      const number = this.expect('NUMBER', undefined, 'an integer constant case label');
      this.expect('PUNCT', ':', "':'");
      const body = this.parseStatementListUntilClause();
      const valueBig = sign * number.integer;
      return { value: safeDisplayInteger(valueBig), _valueBig: valueBig, line: start.line, column: start.column, body };
    }
    parseStatementListUntilClause() {
      const body = [];
      while (this.peek() && !this.is('CASE') && !this.is('DEFAULT') && !this.is('PUNCT', '}')) {
        body.push(this.parseStatement());
      }
      return body;
    }
    parseStatementListUntilBrace() {
      const body = [];
      while (this.peek() && !this.is('PUNCT', '}')) {
        body.push(this.parseStatement());
      }
      return body;
    }
    parseExpression(minPrecedence = 0) {
      let left = this.parseUnary();
      while (true) {
        const t = this.peek();
        if (!t || t.type !== 'OPERATOR' || !(t.lexeme in PRECEDENCE)) break;
        const precedence = PRECEDENCE[t.lexeme];
        if (precedence < minPrecedence) break;
        this.take();
        const right = this.parseExpression(precedence + 1);
        left = { kind: 'binary', operator: t.lexeme, left, right, line: t.line, column: t.column };
      }
      return left;
    }
    parseUnary() {
      if (this.is('OPERATOR', '-') || this.is('OPERATOR', '+') || this.is('OPERATOR', '!')) {
        const op = this.take();
        const operand = this.parseUnary();
        return { kind: 'unary', operator: op.lexeme, operand, line: op.line, column: op.column };
      }
      if (this.is('NUMBER')) {
        const t = this.take();
        return { kind: 'number', value: safeDisplayInteger(t.integer), line: t.line, column: t.column };
      }
      if (this.is('IDENT')) {
        const t = this.take();
        return { kind: 'identifier', name: t.lexeme, line: t.line, column: t.column };
      }
      if (this.is('PUNCT', '(')) {
        this.take();
        const e = this.parseExpression();
        this.expect('PUNCT', ')', "')'");
        return e;
      }
      const t = this.peek();
      throw new ParseError(t, `expected an expression${t ? `, got '${t.lexeme}'` : ''}`);
    }
  }

  function safeDisplayInteger(value) {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : value.toString();
  }

  function formatExpression(expr) {
    if (!expr) return '<missing>';
    if (expr.kind === 'number') return String(expr.value);
    if (expr.kind === 'identifier') return expr.name;
    if (expr.kind === 'binary') return `(${formatExpression(expr.left)} ${expr.operator} ${formatExpression(expr.right)})`;
    if (expr.kind === 'unary') return `(${expr.operator}${formatExpression(expr.operand)})`;
    return '<unknown>';
  }

  function validateSemantics(nodes, breakDepth = 0, diagnostics = []) {
    for (const node of nodes) {
      if (node.kind === 'break' && breakDepth === 0) {
        diagnostics.push({ kind: 'error', message: `Semantic error at line ${node.line}, column ${node.column}: break outside switch` });
      } else if (node.kind === 'switch') {
        for (let i = 0; i < node.cases.length; i++) {
          for (let j = i + 1; j < node.cases.length; j++) {
            if (node.cases[i]._valueBig === node.cases[j]._valueBig) {
              diagnostics.push({ kind: 'error', message: `Semantic error: duplicate case value ${node.cases[j]._valueBig} (lines ${node.cases[i].line} and ${node.cases[j].line})` });
              break;
            }
          }
        }
        for (const c of node.cases) validateSemantics(c.body, breakDepth + 1, diagnostics);
        if (node.defaultBody !== null) validateSemantics(node.defaultBody, breakDepth + 1, diagnostics);
      }
    }
    return diagnostics;
  }

  function syntaxFailure(error, tokens, stage) {
    return { tokens: publicTokens(tokens), syntax: { ok: false, stage, error }, ast: null, semantics: { ok: false, diagnostics: [] } };
  }
  function publicTokens(tokens) {
    return tokens.map(({ type, lexeme, line, column, index }) => ({ type, lexeme, line, column, index }));
  }
  function analyze(source) {
    try {
      if (typeof source !== 'string') return syntaxFailure('Source input must be text.', [], 'input');
      if (new TextEncoder().encode(source).length > 65536) return syntaxFailure('Source is too large (maximum 64 KiB).', [], 'input');
      const scanned = lex(source);
      if (scanned.error) return syntaxFailure(scanned.error, scanned.tokens, 'lexical');
      const parser = new Parser(scanned.tokens);
      const ast = parser.parseProgram();
      // Remove internal BigInt case values from the public AST while retaining them for checking.
      function removeInternalValues(nodes) {
        for (const node of nodes) {
          if (node.kind !== 'switch') continue;
          for (const c of node.cases) {
            delete c._valueBig;
            removeInternalValues(c.body);
          }
          if (node.defaultBody !== null) removeInternalValues(node.defaultBody);
        }
      }
      // Block statements are flattened by parseStatement into arrays; flatten them in place.
      const flatten = list => {
        const output = [];
        for (const item of list) {
          if (Array.isArray(item)) output.push(...flatten(item));
          else {
            if (item.kind === 'switch') {
              item.cases.forEach(c => { c.body = flatten(c.body); });
              if (item.defaultBody !== null) item.defaultBody = flatten(item.defaultBody);
            }
            output.push(item);
          }
        }
        return output;
      };
      const normalizedAst = flatten(ast);
      const diagnostics = validateSemantics(normalizedAst);
      removeInternalValues(normalizedAst);
      return { tokens: publicTokens(scanned.tokens), syntax: { ok: true, stage: null, error: null }, ast: normalizedAst, semantics: { ok: diagnostics.length === 0, diagnostics } };
    } catch (error) {
      if (error instanceof ParseError) {
        // Lexing succeeded, so any parse error belongs to the syntax phase.
        const scanned = lex(source);
        return syntaxFailure(error.message, scanned.tokens, 'syntax');
      }
      return syntaxFailure(`Compiler error: ${error && error.message ? error.message : String(error)}`, [], 'input');
    }
  }

  const engine = { name: 'JavaScript compiler', analyze };
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
  if (root) {
    if (typeof root.registerEngine === 'function') root.registerEngine(engine);
    else root.CompilerEngine = engine;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
