#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ast.h"

static void *checked_calloc(size_t n, size_t size) {
    void *p = calloc(n, size);
    if (!p) {
        fprintf(stderr, "Out of memory while constructing the AST.\n");
        exit(2);
    }
    return p;
}

static char *copy_string(const char *s) {
    size_t n = strlen(s ? s : "") + 1;
    char *copy = malloc(n);
    if (!copy) {
        fprintf(stderr, "Out of memory while constructing the AST.\n");
        exit(2);
    }
    memcpy(copy, s ? s : "", n);
    return copy;
}

Expr *make_number(long long value, int line, int column) {
    Expr *e = checked_calloc(1, sizeof(*e));
    e->type = EX_NUMBER;
    e->number = value;
    e->line = line;
    e->column = column;
    return e;
}

Expr *make_identifier(char *name, int line, int column) {
    Expr *e = checked_calloc(1, sizeof(*e));
    e->type = EX_IDENT;
    e->name = name ? name : copy_string("");
    e->line = line;
    e->column = column;
    return e;
}

Expr *make_binary(const char *op, Expr *left, Expr *right, int line, int column) {
    Expr *e = checked_calloc(1, sizeof(*e));
    e->type = EX_BINARY;
    snprintf(e->op, sizeof(e->op), "%s", op);
    e->left = left;
    e->right = right;
    e->line = line;
    e->column = column;
    return e;
}

Expr *make_unary(const char *op, Expr *operand, int line, int column) {
    Expr *e = checked_calloc(1, sizeof(*e));
    e->type = EX_UNARY;
    snprintf(e->op, sizeof(e->op), "%s", op);
    e->left = operand;
    e->line = line;
    e->column = column;
    return e;
}

static void append_text(char **buf, size_t *used, size_t *cap, const char *text) {
    size_t n = strlen(text);
    if (*used + n + 1 > *cap) {
        size_t next_cap = *cap;
        while (*used + n + 1 > next_cap) next_cap *= 2;
        char *next = realloc(*buf, next_cap);
        if (!next) {
            free(*buf);
            fprintf(stderr, "Out of memory while printing an expression.\n");
            exit(2);
        }
        *buf = next;
        *cap = next_cap;
    }
    memcpy(*buf + *used, text, n);
    *used += n;
    (*buf)[*used] = '\0';
}

static void expression_string_into(const Expr *e, char **buf, size_t *used, size_t *cap) {
    if (!e) { append_text(buf, used, cap, "<missing>"); return; }
    char number[64];
    switch (e->type) {
        case EX_NUMBER:
            snprintf(number, sizeof(number), "%lld", e->number);
            append_text(buf, used, cap, number);
            break;
        case EX_IDENT:
            append_text(buf, used, cap, e->name ? e->name : "");
            break;
        case EX_BINARY:
            append_text(buf, used, cap, "(");
            expression_string_into(e->left, buf, used, cap);
            append_text(buf, used, cap, " ");
            append_text(buf, used, cap, e->op);
            append_text(buf, used, cap, " ");
            expression_string_into(e->right, buf, used, cap);
            append_text(buf, used, cap, ")");
            break;
        case EX_UNARY:
            append_text(buf, used, cap, "(");
            append_text(buf, used, cap, e->op);
            expression_string_into(e->left, buf, used, cap);
            append_text(buf, used, cap, ")");
            break;
        default:
            append_text(buf, used, cap, "<unknown>");
    }
}

char *expr_to_string(const Expr *expr) {
    size_t cap = 64, used = 0;
    char *buf = malloc(cap);
    if (!buf) {
        fprintf(stderr, "Out of memory while printing an expression.\n");
        exit(2);
    }
    buf[0] = '\0';
    expression_string_into(expr, &buf, &used, &cap);
    return buf;
}

Stmt *make_switch(Expr *selector, Case *cases, DefaultPart *def, int line, int column) {
    Stmt *s = checked_calloc(1, sizeof(*s));
    s->type = ST_SWITCH;
    s->selector = selector;
    s->name = expr_to_string(selector);
    s->cases = cases;
    s->has_default = def ? def->present : 0;
    s->body = def ? def->body : NULL;
    s->line = line;
    s->column = column;
    free(def);
    return s;
}

Stmt *make_break(int line, int column) {
    Stmt *s = checked_calloc(1, sizeof(*s));
    s->type = ST_BREAK;
    s->line = line;
    s->column = column;
    return s;
}

Stmt *make_assign(char *name, Expr *expr, int line, int column) {
    Stmt *s = checked_calloc(1, sizeof(*s));
    s->type = ST_ASSIGN;
    s->name = name ? name : copy_string("");
    s->expr = expr;
    s->line = line;
    s->column = column;
    return s;
}

Stmt *make_empty(int line, int column) {
    Stmt *s = checked_calloc(1, sizeof(*s));
    s->type = ST_EMPTY;
    s->line = line;
    s->column = column;
    return s;
}

Stmt *append_stmt(Stmt *list, Stmt *item) {
    if (!list) return item;
    Stmt *p = list;
    while (p->next) p = p->next;
    p->next = item;
    return list;
}

Case *make_case(long long value, Stmt *body, int line, int column) {
    Case *c = checked_calloc(1, sizeof(*c));
    c->value = value;
    c->body = body;
    c->line = line;
    c->column = column;
    return c;
}

Case *append_case(Case *list, Case *item) {
    if (!list) return item;
    Case *p = list;
    while (p->next) p = p->next;
    p->next = item;
    return list;
}

DefaultPart *make_default(int present, Stmt *body) {
    DefaultPart *d = checked_calloc(1, sizeof(*d));
    d->present = present;
    d->body = body;
    return d;
}

static void indent(int depth) {
    for (int i = 0; i < depth; i++) printf("  ");
}

void print_ast(Stmt *list, int depth) {
    for (Stmt *s = list; s; s = s->next) {
        indent(depth);
        if (s->type == ST_SWITCH) {
            printf("Switch(%s)\n", s->name);
            for (Case *c = s->cases; c; c = c->next) {
                indent(depth + 1);
                printf("Case(%lld)\n", c->value);
                print_ast(c->body, depth + 2);
            }
            if (s->has_default) {
                indent(depth + 1);
                printf("Default\n");
                print_ast(s->body, depth + 2);
            }
        } else if (s->type == ST_BREAK) {
            printf("Break\n");
        } else if (s->type == ST_ASSIGN) {
            char *value = expr_to_string(s->expr);
            printf("Assign(%s, %s)\n", s->name, value);
            free(value);
        } else {
            printf("EmptyStatement\n");
        }
    }
}
