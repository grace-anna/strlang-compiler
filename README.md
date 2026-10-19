# SwitchLab — Pure Frontend Switch-Case Compiler

SwitchLab is a browser-only educational compiler front end for a small C-like switch-case language. The lexer, parser, AST builder, and semantic checks all run in JavaScript inside the browser. There is no C compiler, Flex, Bison, Python backend, Node.js server, network request, or package installation required.

## Run it

1. Extract the ZIP.
2. Open `frontend/index.html` in a modern browser (Chrome, Edge, or Firefox).
3. Write or load a sample program and select **Analyze**. `Ctrl+Enter` also runs analysis.

The complete interface is local. The file picker can load `.c` or `.txt` files from your computer; the compiler only analyzes the source and never executes the source program.

## Included features

- Source editor, built-in sample programs, open-file control and clear button.
- Lexer token table with token type, lexeme, line and column.
- Syntax diagnostics with source locations.
- Abstract Syntax Tree visualization for switch selectors, cases, assignments, expressions, default branches, break and empty statements.
- Semantic errors for duplicate constant case labels (including signed-equivalent labels), and `break` outside any switch.
- Nested switches, arithmetic/comparison/logical expressions, unary operators, line/block comments, empty switches, and braced blocks within case/default bodies.
- Regression tests runnable in Node.js; Node is only needed to run the tests, not the website.

## Run regression tests (optional)

Install Node.js if it is not already installed, then from the project root run:

```bash
node tests/test_js_compiler.js
```

The test runner uses Node's built-in modules only. It does not launch a server or install dependencies.

## Language scope

This is not a full C compiler. A nonempty program contains one or more top-level `switch` statements or a top-level `break;` (which is included to demonstrate the semantic error). Standalone top-level assignments, expressions, empty statements, and empty input are rejected. Within switch bodies, the compiler supports nested switches, `break;`, identifier assignments, empty statements, and braced statement blocks. A switch has zero or more `case` clauses followed by at most one optional `default` clause. Case labels must be signed or unsigned decimal integer literals; identifiers and arithmetic expressions are not valid case labels.

Expressions support decimal integer literals, identifiers, parentheses, unary `+`, `-`, `!`, arithmetic `+`, `-`, `*`, `/`, `%`, comparisons `==`, `!=`, `<`, `>`, `<=`, `>=`, and logical `&&`, `||`. Binary operator precedence and left associativity follow the grammar documented in `grammar.md`. Floating-point literals and integers outside the signed 64-bit positive range are rejected by the lexer.

The AST currently flattens braced blocks into their contained statement lists; block-brace boundaries are not retained as separate AST nodes. The compiler does not execute programs and does not perform variable declaration, type, or scope checking.

## Files

- `frontend/index.html`: UI markup and script loading.
- `frontend/style.css`: original UI styling.
- `frontend/app.js`: editor interactions and rendering for tokens, syntax diagnostics, AST, and semantics.
- `frontend/engines/js-compiler.js`: browser lexer, parser, AST construction, and semantic analysis.
- `tests/*.c`: small source-program samples used as test input; they are not implementation code.
- `tests/test_js_compiler.js`: regression tests for the JavaScript compiler.
- `grammar.md`: language grammar and limitations.
