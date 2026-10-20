# Simplified Edition — Build and Regression Notes

## Changes

- Simplified expression grammar in `parser.y` while retaining operator precedence.
- Simplified repeated lexical-error handling in `lexer.l`.
- Kept braced statement blocks in switch cases/default bodies.
- Removed unused demo and unfinished JavaScript compiler engines.
- Removed the recursive-descent fallback parser. Flex and GNU Bison are now required.
- Removed the optional Summary tab and its summary-only rendering code; tokens, syntax, AST, semantic checks, and diagnostics remain.

## Verification

Run these commands on a machine with GCC, Flex, GNU Bison, and Python 3 installed:

```bash
make clean && make
bash tests/run_tests.sh
```

The compiler and JSON/API tests must be rerun against this Flex/Bison-only edition; previous fallback-parser results do not verify this build.

## Scope retained

The project still supports nested switches, signed integer case labels, one optional trailing `default`, assignments and expressions, braced blocks, empty statements, comments, source locations, lexical/syntax diagnostics, duplicate case detection, `break`-outside-switch diagnostics, the website, JSON analysis, and the local Python HTTP API.
