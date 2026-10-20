# Simplified Edition — Changes

- `parser.y` uses a single expression grammar with precedence declarations.
- `lexer.l` centralizes repeated lexical-error handling and tracks line/column positions directly.
- Braced statement blocks inside case/default bodies are supported.
- The UI keeps the source editor, sample programs, tokens, syntax analysis, AST, semantics, and diagnostics; the optional Summary tab has been removed.
- The unused demo engine, unfinished JavaScript compiler engine, and `parser_runtime.c` fallback have been removed.
- Flex and GNU Bison are required to build the compiler. The Python API, AST, JSON output, duplicate-case detection, and `break` checking remain.

Build and test:

```bash
make clean && make
bash tests/run_tests.sh
python3 backend/server.py
```

The browser UI is available at `http://127.0.0.1:8000` while the server is running.
