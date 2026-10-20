# Implemented Grammar

This document describes the language accepted by `parser.y` and `lexer.l`. The compiler is a small C-like front end, not a complete ISO C compiler. A nonempty program must contain one or more top-level switch statements. A top-level `break;` is also parsed deliberately so semantic analysis can report “break outside switch.” Standalone assignments, expressions, function calls, and empty statements are rejected at the top level; assignments, function-call statements, empty statements, and braced statement blocks are accepted inside switch case/default bodies.

## Yacc/Bison productions

```yacc
program:
    top_statement
  | program top_statement
;

top_statement:
    switch_stmt
  | BREAK ';'
;

stmt_list:
    %empty
  | stmt_list statement
;

statement:
    switch_stmt
  | BREAK ';'
  | IDENT '=' expr ';'
  | IDENT '(' argument_list_opt ')' ';'
  | ';'
  | '{' stmt_list '}'
;

switch_stmt:
    SWITCH '(' expr ')' '{' case_list default_opt '}'
;

case_list:
    %empty
  | case_list case_clause
;

case_clause:
    CASE case_constant ':' stmt_list
;

default_opt:
    %empty
  | default_clause
;

default_clause:
    DEFAULT ':' stmt_list
;

case_constant:
    NUMBER
  | '-' NUMBER
  | '+' NUMBER
;

expr:
    expr '+' expr
  | expr '-' expr
  | expr '*' expr
  | expr '/' expr
  | expr '%' expr
  | expr EQ expr
  | expr NE expr
  | expr '<' expr
  | expr '>' expr
  | expr LE expr
  | expr GE expr
  | expr AND expr
  | expr OR expr
  | '-' expr %prec UMINUS
  | '+' expr %prec UMINUS
  | '!' expr %prec UMINUS
  | NUMBER
  | IDENT
  | STRING
  | IDENT '(' argument_list_opt ')'
  | '(' expr ')'
;

argument_list_opt:
    %empty
  | argument_list
;

argument_list:
    expr
  | argument_list ',' expr
;
```

## Precedence and associativity

From lowest to highest: `||`, `&&`, `==` / `!=`, `<` / `>` / `<=` / `>=`, `+` / `-`, `*` / `/` / `%`, then unary `-`, unary `+`, and `!`. Binary operators are left-associative; unary operators are right-associative.

## Implemented semantic checks

- `break` outside a switch is reported as a semantic error.
- Duplicate integer case values within one switch are reported, with source lines.
- A second `default` is rejected by syntax analysis because the implemented grammar allows only one trailing default clause.

## Known limitations

- Case labels must be signed integer literals, not identifiers or constant expressions.
- The language does not yet parse variable declarations or enforce declared-variable/type/scope rules; a symbol table is therefore not claimed.
- Function calls are supported as expressions and as statements in switch bodies, with zero or more comma-separated expression arguments. Function definitions, declarations, and call/type validation are not implemented.
- Double-quoted string literals support backslash-escaped characters and preserve their source spelling in the AST; escape sequences are not interpreted. Character literals, floating-point values, increment/decrement operators, loops, `if` statements, arrays, and full C declaration syntax are not supported.
- The AST stores switch, assignment, and call expressions structurally, preserving operator precedence and source locations. Braced statement blocks are accepted but their braces are not stored as separate AST nodes.
