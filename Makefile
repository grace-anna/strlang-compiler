CC = gcc
CFLAGS = -Wall -Wextra -std=gnu11 -g

HAVE_GENERATORS := $(shell command -v bison >/dev/null 2>&1 && command -v flex >/dev/null 2>&1 && echo yes)

ifeq ($(HAVE_GENERATORS),yes)
all: mini_compiler

mini_compiler: parser.tab.c lex.yy.c ast.c main.c ast.h
	$(CC) $(CFLAGS) parser.tab.c lex.yy.c ast.c main.c -o mini_compiler

parser.tab.c parser.tab.h: parser.y ast.h
	bison -d -Wall -o parser.tab.c parser.y

lex.yy.c: lexer.l parser.tab.h
	flex -o lex.yy.c lexer.l
else
all:
	@echo "Error: Flex and GNU Bison are required to build this compiler." >&2
	@echo "On Ubuntu/WSL, install them with: sudo apt install flex bison" >&2
	@exit 1
endif

clean:
	rm -f mini_compiler parser.tab.c parser.tab.h lex.yy.c

.PHONY: all clean
