/**
 * Defines the small interface used by the active backend engine.
 * The UI calls CompilerEngine.analyze(source) and renders its result.
 */


// ═══════════════════════════════════════════════════════════════════════════
//  TYPE DEFINITIONS  (JSDoc for the backend engine response)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A single token produced by the lexer.
 *
 * Type values mirror the terminal symbols in parser.y / lexer.l:
 *   SWITCH  CASE  DEFAULT  BREAK  NUMBER  IDENT
 *   OPERATOR (supported operators such as +, -, *, /, %, ==, !=, <=, >=, &&, ||)
 *   PUNCT    (single-character delimiters such as ( ) { } : ; )
 *   INVALID  (unsupported characters and floating-point literals in this integer subset)
 *
 * @typedef {Object} Token
 * @property {number} index   - 1-based position in the token stream
 * @property {string} type    - Token class (see values above)
 * @property {string} lexeme  - The exact source text that was matched
 * @property {number} line    - 1-based source line number
 * @property {number} column  - 1-based source column number
 */

/**
 * The result of the syntax (parse) phase.
 * Mirrors yyparse() + yyerror() in parser.y / main.c.
 *
 * @typedef {Object} SyntaxResult
 * @property {boolean}     ok    - true if parsing succeeded
 * @property {string|null} error - Human-readable message, or null on success
 * @property {"lexical"|"syntax"|"backend"|"input"|null} [stage] - Failure category
 */

/**
 * A single case clause inside a switch statement.
 * Mirrors struct Case { int value; Stmt *body; Case *next; } from ast.h.
 *
 * @typedef {Object} CaseNode
 * @property {number}    value - The integer constant for this case
 * @property {number}    [line] - Source line for the case label
 * @property {ASTNode[]} body  - Ordered list of statements inside this case
 */

/**
 * A node in the Abstract Syntax Tree.
 * Mirrors the Stmt struct and the ST_* enum values from ast.h.
 *
 * kind → fields present:
 *   "switch"  name, selector, cases, defaultBody
 *   "break"   line, column
 *   "assign"  name, value (printed expression), expression AST
 *   "empty"   (no extra fields)
 *
 * @typedef {Object} ASTNode
 * @property {"switch"|"break"|"assign"|"empty"} kind
 * @property {string}          [name]        - Identifier (switch / assign)
 * @property {string}          [value]       - Printed assignment expression
 * @property {Object}          [expression]  - Structured expression AST
 * @property {CaseNode[]}      [cases]       - Ordered case clauses (switch)
 * @property {ASTNode[]|null}  [defaultBody] - Default-clause body, or null (switch)
 */

/**
 * Severity of a diagnostic message.
 * @typedef {"error"|"warning"|"info"} DiagnosticKind
 */

/**
 * A single semantic diagnostic.
 * Mirrors the fprintf(stderr, ...) calls in main.c → check().
 *
 * @typedef {Object} Diagnostic
 * @property {DiagnosticKind} kind
 * @property {string}         message
 */

/**
 * The result of the semantic analysis phase.
 * Mirrors the check() function in main.c.
 *
 * @typedef {Object} SemanticResult
 * @property {boolean}      ok          - true when there are no errors
 * @property {Diagnostic[]} diagnostics - Empty on success; errors and/or warnings
 */

/**
 * The full result returned by CompilerEngine.analyze().
 *
 * Contract:
 *   - All four properties are always present.
 *   - ast is null when syntax.ok is false (parse failed before AST was built).
 *   - semantics.diagnostics is [] when ast is null (semantic phase never ran).
 *   - analyze() must never throw; catch all internal errors and encode them
 *     in syntax.error or semantics.diagnostics.
 *
 * @typedef {Object} AnalysisResult
 * @property {Token[]}        tokens    - Flat ordered list of all tokens
 * @property {SyntaxResult}   syntax    - Parse phase outcome
 * @property {ASTNode[]|null} ast       - Root statement list, or null on parse failure
 * @property {SemanticResult} semantics - Semantic phase outcome
 */

/**
 * The compiler engine interface. The backend engine registered with registerEngine()
 * must satisfy this shape.
 *
 * @typedef {Object} CompilerEngineShape
 * @property {string}  name   - Human-readable name displayed in the UI header
 * @property {function(string): Promise<AnalysisResult>} analyze
 *           Accepts a source string; returns Promise<AnalysisResult>.
 *           Must never reject; encode errors inside the result shape.
 */


// ═══════════════════════════════════════════════════════════════════════════
//  REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Register the backend implementation used by the UI.
 *
 * Validates the response interface, then
 * assigns it to window.CompilerEngine for app.js to consume.
 *
 * Throws a descriptive Error if the backend interface is incomplete.
 *
 * @param {CompilerEngineShape} engine
 * @throws {Error} if required properties are missing or have wrong types
 */
function registerEngine(engine) {
  const required = [
    ['name',    'string'],
    ['analyze', 'function'],
  ];

  for (const [prop, expectedType] of required) {
    const actual = typeof engine[prop];
    if (actual !== expectedType) {
      throw new Error(
        `[engine.interface.js] registerEngine() contract violation:\n` +
        `  engine.${prop} must be typeof "${expectedType}" but got "${actual}".\n` +
        `  See the CompilerEngineShape typedef in engine.interface.js.`
      );
    }
  }

  window.CompilerEngine = engine;
  console.info(`[CompilerEngine] Registered: "${engine.name}"`);
}
