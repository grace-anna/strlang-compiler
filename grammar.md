# SwitchLab Language Grammar

The JavaScript compiler accepts a small C-like language, not full ISO C. The grammar below is descriptive; the implementation is a browser-side lexer and recursive-descent / precedence-climbing parser in `frontend/engines/js-compiler.js`.

```text
program          := top_statement+
top_statement    := switch_stmt | BREAK ';'
switch_stmt      := SWITCH '(' expr ')' '{' case_clause* default_clause? '}'
case_clause      := CASE signed_integer ':' statement*
default_clause   := DEFAULT ':' statement*
signed_integer   := NUMBER | '-' NUMBER | '+' NUMBER
statement        := switch_stmt
                  | BREAK ';'
                  | IDENT '=' expr ';'
                  | ';'
                  | '{' statement* '}'
```

## Expressions

Binary operators are left-associative and have the following precedence, from lowest to highest:

1. `||`
2. `&&`
3. `==`, `!=`
4. `<`, `>`, `<=`, `>=`
5. `+`, `-`
6. `*`, `/`, `%`
7. Unary `+`, `-`, `!`

Primary expressions are integer literals, identifiers, and parenthesized expressions.

## Semantic checks

- A `break;` outside a switch is reported as an error.
- Duplicate numeric case values within the same switch are reported with both source lines. For example, `case 1:` and `case +1:` are duplicates.
- Nested switches are checked independently.
- A second `default` clause is rejected by syntax analysis.

## Lexer behavior

The lexer recognizes `switch`, `case`, `default`, and `break`; identifiers; decimal integer literals; operators; delimiters; line comments (`//`); and block comments (`/* ... */`). Unsupported characters, floating-point literals, oversized integer literals, and unterminated block comments produce lexical diagnostics.

## Limitations

There are no declarations, functions, loops, conditionals, arrays, strings, floating-point values, or full C semantics. The parser does not perform symbol-table, type, or undeclared-variable checks. Braced statement blocks are syntactically accepted but flattened in the AST, so their braces are not represented as separate nodes.
