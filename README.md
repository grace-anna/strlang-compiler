# SwitchLab — Switch-Case Compiler Front End

A single-page frontend for a small C-like compiler front end. The browser sends the current editor text to a local Python server, which invokes the C compiler and returns real tokenization, syntax, AST, and semantic results. The UI always uses the backend and actual compiler executable.

## Requirements

- Ubuntu / WSL
- GCC
- Python 3
- Flex and GNU Bison (required to build the compiler from `lexer.l` and `parser.y`)

`make` regenerates the parser and lexer from `parser.y` and `lexer.l`, then builds the compiler. Flex and Bison are required; there is no separate fallback parser.

## Run in Ubuntu / WSL

From this project root:

```bash
make clean && make
bash tests/run_tests.sh
python3 backend/server.py
```

Open <http://localhost:8000> in your browser. Keep the terminal running while using the site. Stop the server with `Ctrl+C`.

To use another port:

```bash
PORT=8001 python3 backend/server.py
```

## Run the complete test suites

The shell test runner executes the compiler regression tests, JSON contract tests, and HTTP API integration tests:

```bash
bash tests/run_tests.sh
```

The Python test scripts can also be run through standard-library unittest discovery. They wrap their existing regression suites so they can be imported safely and can run both standalone and under discovery:

```bash
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

## Test JSON mode

```bash
./mini_compiler --json tests/valid.c | python3 -m json.tool
printf 'switch (x) { case 1: x = y + 1; break; }\n' | ./mini_compiler --json | python3 -m json.tool
```

Normal terminal mode remains supported:

```bash
./mini_compiler tests/valid.c
./mini_compiler
```

## Language scope

Implemented statements: one or more top-level `switch` statements, signed integer `case` labels, one optional trailing `default`, `break`, simple `identifier = expression;` assignments inside switch bodies, empty statements inside switch bodies, and braced statement blocks inside switch bodies. A top-level `break;` is parsed to demonstrate the semantic “break outside switch” diagnostic. Standalone top-level assignments, expressions, empty statements, and empty input are rejected. Expressions include decimal integer literals, identifiers, parentheses, unary `+`, `-`, `!`, arithmetic operators (`+`, `-`, `*`, `/`, `%`), comparisons (`==`, `!=`, `<`, `>`, `<=`, `>=`), and logical operators (`&&`, `||`). Operator precedence and associativity are defined in `parser.y`.

This is **not a full C compiler**. It currently does not parse declarations or implement a typed symbol table, so it does not claim undeclared-variable or type-checking diagnostics. The selector and assignment right-hand side accept supported expressions; case labels are signed integer literals only. A duplicate default is rejected during syntax analysis, and duplicate case values / break outside a switch are reported during semantic checking.

The backend binds to `127.0.0.1`, accepts source up to 64 KiB, launches the compiler with `shell=False`, and applies a five-second timeout. Compiler analysis never executes the submitted source program.

## Files

- `parser.y`, `lexer.l`: active Bison grammar and Flex lexer, using a single expression rule with precedence declarations
- `ast.h`, `ast.c`: structured expression/statement AST and text printer
- `main.c`: normal terminal mode and `--json` mode
- `backend/server.py`: standard-library local HTTP API
- `frontend/`: source editor, tokens, syntax results, AST view, and diagnostics
- `tests/`: original cases, expression regression cases, JSON contract tests and HTTP API tests
