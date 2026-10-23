%{
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

typedef enum { N_PROGRAM, N_DECL, N_ASSIGN, N_PRINT, N_BINARY, N_ID, N_STRING } NodeType;
typedef struct Node {
    NodeType type;
    char *value;
    int line;
    int column;
    struct Node *left, *right;
    struct Node **items;
    int count, cap;
} Node;

typedef struct {
    char *message;
    char *kind;
    int line, column;
} Diagnostic;

typedef struct {
    char *type;
    char *lexeme;
    int line, column;
} TokenInfo;

extern int yylineno;
extern int yylex(void);
extern char *yytext;
extern FILE *yyin;
void yyerror(const char *message);
void set_lex_error(int line, int col, const char *message);
void record_token(const char *type, const char *lexeme, int line, int column);

Node *root = NULL;
Diagnostic diagnostic = {0};
bool has_error = false;
TokenInfo *tokens = NULL;
int token_count = 0, token_capacity = 0;

static char *sdup(const char *s) {
    if (!s) return NULL;
    size_t n = strlen(s);
    char *p = malloc(n + 1);
    if (!p) exit(2);
    memcpy(p, s, n + 1);
    return p;
}
static void set_error(const char *kind, int line, int column, const char *message) {
    if (has_error) return;
    has_error = true;
    diagnostic.kind = sdup(kind);
    diagnostic.line = line > 0 ? line : 1;
    diagnostic.column = column > 0 ? column : 1;
    diagnostic.message = sdup(message);
}
void set_lex_error(int line, int col, const char *message) {
    set_error("lexical", line, col, message);
}
void record_token(const char *type, const char *lexeme, int line, int column) {
    if (token_count == token_capacity) {
        token_capacity = token_capacity ? token_capacity * 2 : 64;
        tokens = realloc(tokens, sizeof(TokenInfo) * token_capacity);
        if (!tokens) exit(2);
    }
    tokens[token_count++] = (TokenInfo){sdup(type), sdup(lexeme), line, column};
}
static Node *new_node(NodeType type, const char *value, int line, int col) {
    Node *n = calloc(1, sizeof(Node));
    if (!n) exit(2);
    n->type = type; n->value = sdup(value); n->line = line; n->column = col;
    return n;
}
static void add_child(Node *p, Node *c) {
    if (!p || !c) return;
    if (p->count == p->cap) {
        p->cap = p->cap ? p->cap * 2 : 8;
        p->items = realloc(p->items, sizeof(Node *) * p->cap);
        if (!p->items) exit(2);
    }
    p->items[p->count++] = c;
}
static const char *node_type_name(NodeType t) {
    switch (t) {
        case N_PROGRAM: return "Program";
        case N_DECL: return "Declaration";
        case N_ASSIGN: return "Assignment";
        case N_PRINT: return "OutputStatement";
        case N_BINARY: return "BinaryExpression";
        case N_ID: return "Identifier";
        case N_STRING: return "StringLiteral";
    }
    return "Unknown";
}
typedef struct { char *name; bool initialized; int line; } Symbol;
Symbol *symbols = NULL;
int symbol_count = 0, symbol_capacity = 0;
static int find_symbol(const char *name) {
    for (int i = 0; i < symbol_count; i++)
        if (strcmp(symbols[i].name, name) == 0) return i;
    return -1;
}
static void add_symbol(const char *name, bool initialized, int line) {
    if (symbol_count == symbol_capacity) {
        symbol_capacity = symbol_capacity ? symbol_capacity * 2 : 16;
        symbols = realloc(symbols, sizeof(Symbol) * symbol_capacity);
        if (!symbols) exit(2);
    }
    symbols[symbol_count++] = (Symbol){sdup(name), initialized, line};
}
static bool check_expr(Node *n) {
    if (!n || has_error) return false;
    if (n->type == N_STRING) return true;
    if (n->type == N_ID) {
        int i = find_symbol(n->value);
        if (i < 0) {
            char msg[256]; snprintf(msg, sizeof(msg), "Undeclared variable '%s'.", n->value);
            set_error("semantic", n->line, n->column, msg); return false;
        }
        if (!symbols[i].initialized) {
            char msg[256]; snprintf(msg, sizeof(msg), "Variable '%s' may be uninitialized.", n->value);
            set_error("semantic", n->line, n->column, msg); return false;
        }
        return true;
    }
    if (n->type == N_BINARY) return check_expr(n->left) && check_expr(n->right);
    return true;
}
static void analyze_semantics(Node *program) {
    for (int i = 0; program && i < program->count && !has_error; i++) {
        Node *n = program->items[i];
        if (n->type == N_DECL) {
            if (find_symbol(n->value) >= 0) {
                char msg[256]; snprintf(msg, sizeof(msg), "Duplicate declaration of '%s'.", n->value);
                set_error("semantic", n->line, n->column, msg); break;
            }
            if (n->left && !check_expr(n->left)) break;
            add_symbol(n->value, n->left != NULL, n->line);
        } else if (n->type == N_ASSIGN) {
            int i_symbol = find_symbol(n->value);
            if (i_symbol < 0) {
                char msg[256]; snprintf(msg, sizeof(msg), "Assignment to undeclared variable '%s'.", n->value);
                set_error("semantic", n->line, n->column, msg); break;
            }
            if (!check_expr(n->left)) break;
            symbols[i_symbol].initialized = true;
        } else if (n->type == N_PRINT) {
            check_expr(n->left);
        }
    }
}
static void json_string(const char *s) {
    putchar('"');
    if (s) for (const unsigned char *p = (const unsigned char *)s; *p; p++) {
        switch (*p) {
            case '"': fputs("\\\"", stdout); break;
            case '\\': fputs("\\\\", stdout); break;
            case '\n': fputs("\\n", stdout); break;
            case '\r': fputs("\\r", stdout); break;
            case '\t': fputs("\\t", stdout); break;
            default: if (*p < 32) printf("\\u%04x", *p); else putchar(*p);
        }
    }
    putchar('"');
}
static void json_node(Node *n) {
    if (!n) { fputs("null", stdout); return; }
    fputs("{\"type\":", stdout); json_string(node_type_name(n->type));
    if (n->value) { fputs(",\"value\":", stdout); json_string(n->value); }
    printf(",\"line\":%d,\"column\":%d", n->line, n->column);
    if (n->type == N_PROGRAM) {
        fputs(",\"children\":[", stdout);
        for (int i=0; i<n->count; i++) { if(i) putchar(','); json_node(n->items[i]); }
        putchar(']');
    } else if (n->type == N_DECL || n->type == N_ASSIGN || n->type == N_PRINT) {
        if (n->left) { fputs(",\"expression\":", stdout); json_node(n->left); }
    } else if (n->type == N_BINARY) {
        fputs(",\"left\":", stdout); json_node(n->left);
        fputs(",\"right\":", stdout); json_node(n->right);
    }
    putchar('}');
}
static void output_json(void) {
    printf("{\"ok\":%s,\"tokens\":[", has_error ? "false" : "true");
    for (int i=0; i<token_count; i++) {
        if (i) putchar(',');
        fputs("{\"type\":", stdout); json_string(tokens[i].type);
        fputs(",\"lexeme\":", stdout); json_string(tokens[i].lexeme);
        printf(",\"line\":%d,\"column\":%d}", tokens[i].line, tokens[i].column);
    }
    fputs("],\"ast\":", stdout);
    if (root && !has_error) json_node(root); else fputs("null", stdout);
    fputs(",\"symbolTable\":[", stdout);
    for (int i=0; i<symbol_count; i++) {
        if (i) putchar(',');
        fputs("{\"name\":", stdout); json_string(symbols[i].name);
        fputs(",\"type\":\"string\",\"initialized\":", stdout);
        fputs(symbols[i].initialized ? "true" : "false", stdout);
        printf(",\"declarationLine\":%d}", symbols[i].line);
    }
    fputs("],\"diagnostic\":", stdout);
    if (has_error) {
        fputs("{\"kind\":", stdout); json_string(diagnostic.kind);
        fputs(",\"message\":", stdout); json_string(diagnostic.message);
        printf(",\"line\":%d,\"column\":%d}", diagnostic.line, diagnostic.column);
    } else fputs("null", stdout);
    puts("}");
}
%}

%define parse.error detailed
%locations
%union { char *str; struct Node *node; }
%token <str> IDENTIFIER STRING_LITERAL
%token STRING_KW PRINT_KW ASSIGN PLUS LPAREN RPAREN SEMICOLON INVALID_TOKEN
%type <node> program statements statement declaration assignment output expression primary
%start program

%%
program:
    statements { root = new_node(N_PROGRAM, "Program", 1, 1); if ($1) { for (int i=0; i<$1->count; i++) add_child(root, $1->items[i]); } $$ = root; }
;
statements:
    %empty { $$ = new_node(N_PROGRAM, "Statements", 1, 1); }
  | statements statement { $$ = $1; add_child($$, $2); }
;
statement:
    declaration { $$ = $1; }
  | assignment { $$ = $1; }
  | output { $$ = $1; }
;
declaration:
    STRING_KW IDENTIFIER SEMICOLON {
        $$ = new_node(N_DECL, $2, @2.first_line, @2.first_column);
    }
  | STRING_KW IDENTIFIER ASSIGN expression SEMICOLON {
        $$ = new_node(N_DECL, $2, @2.first_line, @2.first_column); $$->left = $4;
    }
;
assignment:
    IDENTIFIER ASSIGN expression SEMICOLON {
        $$ = new_node(N_ASSIGN, $1, @1.first_line, @1.first_column); $$->left = $3;
    }
;
output:
    PRINT_KW LPAREN expression RPAREN SEMICOLON {
        $$ = new_node(N_PRINT, "print", @1.first_line, @1.first_column); $$->left = $3;
    }
;
expression:
    primary { $$ = $1; }
  | expression PLUS primary {
        $$ = new_node(N_BINARY, "+", @2.first_line, @2.first_column); $$->left = $1; $$->right = $3;
    }
;
primary:
    IDENTIFIER { $$ = new_node(N_ID, $1, @1.first_line, @1.first_column); }
  | STRING_LITERAL { $$ = new_node(N_STRING, $1, @1.first_line, @1.first_column); }
  | LPAREN expression RPAREN { $$ = $2; }
;
%%
void yyerror(const char *message) {
    if (!has_error) set_error("syntax", yylloc.first_line, yylloc.first_column, message);
}
int main(void) {
    if (yyparse() == 0 && !has_error) analyze_semantics(root);
    output_json();
    return 0;
}
