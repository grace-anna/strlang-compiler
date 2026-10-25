# StrLang Midnight IDE - Flex + Bison Edition

A compiler front end for a custom string-processing language. The lexer is specified in Flex (`src/lexer.l`), the parser and AST/semantic actions in Bison (`src/parser.y`), and the web interface uses HTML/CSS/JavaScript with a Python standard-library HTTP server. Node.js is not used.

## Requirements

- Flex
- GNU Bison
- GCC or Clang
- Python 3.9+
- Modern browser

## Run on Linux/macOS

Install Flex and Bison with your package manager, then:

```sh
chmod +x build.sh
./build.sh
python3 server.py
```

Open `http://127.0.0.1:4173`.

## Run on Windows

You need a Windows environment where Flex, Bison, and GCC are available in PATH (for example, an MSYS2/MinGW setup configured with those tools). Run:

```bat
build.bat
py server.py
```

If using MSYS2, run the build script from the MSYS2 terminal when the POSIX toolchain is installed there.

## Tests

After building:

```sh
python3 tests/test_compiler.py
```

## Example language

```text
string first = "Hello";
string second = "World";
string message = first + " " + second;
print(message);
message = message + "!";
print(message);
```

Language features:
- `string name;` and `string name = "value";`
- `name = expression;`
- `print(expression);`
- `+` concatenation, chained expressions, parentheses
- Empty strings and escapes `\\n`, `\\t`, `\\\\`, `\\"`
- `//` comments, mandatory semicolons, case-sensitive identifiers
- Declaration-before-use, duplicate declaration, and initialization checks
- ASCII-only source, single global scope
- No loops, conditionals, input, comparison, or execution of source programs.....

## Architecture

`public/app.js` sends source text to `server.py` using `/api/compile`. Python launches the compiled C executable and returns JSON containing tokens, AST, symbol table, and diagnostic information. Flex tokenizes; Bison parses and builds the AST; the semantic pass checks identifier declarations and initialization.

## Notes

- This project requires Flex and Bison at build time. Generated `src/parser.tab.c`, `src/parser.tab.h`, and `src/lex.yy.c` are created by the build script.
- It stops at the first diagnostic.
- This is an academic compiler front end, not a production compiler.
