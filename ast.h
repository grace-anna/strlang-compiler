#ifndef AST_H
#define AST_H

typedef struct Expr Expr;
typedef struct Stmt Stmt;
typedef struct Case Case;
typedef struct DefaultPart DefaultPart;

enum { EX_NUMBER, EX_IDENT, EX_BINARY, EX_UNARY };
enum { ST_SWITCH, ST_BREAK, ST_ASSIGN, ST_EMPTY };

struct Expr {
    int type;
    long long number;
    char *name;
    char op[3];
    Expr *left;
    Expr *right;
    int line;
    int column;
};

struct Stmt {
    int type;
    Stmt *next;
    char *name;
    Expr *selector;
    Expr *expr;
    int line;
    int column;
    Case *cases;
    Stmt *body;
    int has_default;
};

struct Case {
    long long value;
    int line;
    int column;
    Stmt *body;
    Case *next;
};

struct DefaultPart {
    int present;
    Stmt *body;
};

Expr *make_number(long long value, int line, int column);
Expr *make_identifier(char *name, int line, int column);
Expr *make_binary(const char *op, Expr *left, Expr *right, int line, int column);
Expr *make_unary(const char *op, Expr *operand, int line, int column);
char *expr_to_string(const Expr *expr);

Stmt *make_switch(Expr *selector, Case *cases, DefaultPart *def, int line, int column);
Stmt *make_break(int line, int column);
Stmt *make_assign(char *name, Expr *expr, int line, int column);
Stmt *make_empty(int line, int column);
Stmt *append_stmt(Stmt *list, Stmt *item);
Case *make_case(long long value, Stmt *body, int line, int column);
Case *append_case(Case *list, Case *item);
DefaultPart *make_default(int present, Stmt *body);
void print_ast(Stmt *list, int depth);

#endif
