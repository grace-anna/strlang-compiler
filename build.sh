#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
command -v flex >/dev/null 2>&1 || { echo "Flex is required (install flex)."; exit 1; }
command -v bison >/dev/null 2>&1 || { echo "Bison is required (install bison)."; exit 1; }
command -v cc >/dev/null 2>&1 || command -v gcc >/dev/null 2>&1 || { echo "A C compiler is required."; exit 1; }
BISON=${BISON:-bison}
FLEX=${FLEX:-flex}
CC=${CC:-cc}
"$BISON" -d -o src/parser.tab.c src/parser.y
"$FLEX" -o src/lex.yy.c src/lexer.l
"$CC" -std=c11 -Wall -Wextra -O2 src/parser.tab.c src/lex.yy.c -o strlang
echo "Build successful. Start with: python3 server.py"
