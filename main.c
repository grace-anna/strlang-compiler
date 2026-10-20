#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <errno.h>
#include "ast.h"

extern int yyparse(void);
extern FILE *yyin;
extern Stmt *root;
extern void yyrestart(FILE *input_file);
extern void lexer_reset_location(void);

int json_mode = 0;
char syntax_error[512] = "";
char lexical_error[512] = "";

void compiler_set_lexical_error(const char *reason, const char *lexeme, int line, int column) {
    if (lexical_error[0]) return;
    if (lexeme && lexeme[0])
        snprintf(lexical_error, sizeof(lexical_error), "Lexical error at line %d, column %d: %s near '%.80s'", line, column, reason, lexeme);
    else
        snprintf(lexical_error, sizeof(lexical_error), "Lexical error at line %d, column %d: %s", line, column, reason);
}
static int errors = 0;
#define MAX_DIAGNOSTICS 128
static char diagnostics[MAX_DIAGNOSTICS][512];
static int diagnostic_count = 0;

static void add_diagnostic(const char *message) {
    if (diagnostic_count >= MAX_DIAGNOSTICS) return;
    snprintf(diagnostics[diagnostic_count], sizeof(diagnostics[diagnostic_count]), "%s", message);
    diagnostic_count++;
}

static void emit_diagnostic(const char *message) {
    if (json_mode) add_diagnostic(message);
    else fprintf(stderr, "%s\n", message);
    errors++;
}

static void check(Stmt *list, int break_depth) {
    for (Stmt *s = list; s; s = s->next) {
        if (s->type == ST_BREAK) {
            if (break_depth == 0) {
                char msg[160];
                snprintf(msg, sizeof(msg), "Semantic error at line %d, column %d: break outside switch", s->line, s->column);
                emit_diagnostic(msg);
            }
        } else if (s->type == ST_SWITCH) {
            for (Case *a = s->cases; a; a = a->next) {
                for (Case *b = a->next; b; b = b->next) {
                    if (a->value == b->value) {
                        char msg[192];
                        snprintf(msg, sizeof(msg), "Semantic error: duplicate case value %lld (lines %d and %d)", a->value, a->line, b->line);
                        emit_diagnostic(msg);
                        break;
                    }
                }
                check(a->body, break_depth + 1);
            }
            if (s->has_default) check(s->body, break_depth + 1);
        }
    }
}

static char *read_all(FILE *fp, size_t *length) {
    size_t cap = 4096, used = 0;
    char *buf = malloc(cap + 1);
    if (!buf) return NULL;
    for (;;) {
        if (used == cap) {
            if (cap >= 16 * 1024 * 1024) { free(buf); return NULL; }
            cap *= 2;
            char *next = realloc(buf, cap + 1);
            if (!next) { free(buf); return NULL; }
            buf = next;
        }
        size_t n = fread(buf + used, 1, cap - used, fp);
        used += n;
        if (n == 0) {
            if (ferror(fp)) { free(buf); return NULL; }
            break;
        }
    }
    buf[used] = '\0';
    *length = used;
    return buf;
}

static void json_string(const char *s) {
    putchar('"');
    for (const unsigned char *p = (const unsigned char *)(s ? s : ""); *p; p++) {
        switch (*p) {
            case '"': fputs("\\\"", stdout); break;
            case '\\': fputs("\\\\", stdout); break;
            case '\b': fputs("\\b", stdout); break;
            case '\f': fputs("\\f", stdout); break;
            case '\n': fputs("\\n", stdout); break;
            case '\r': fputs("\\r", stdout); break;
            case '\t': fputs("\\t", stdout); break;
            default:
                if (*p < 0x20) printf("\\u%04x", *p);
                else putchar(*p);
        }
    }
    putchar('"');
}

static int word_char(unsigned char c) { return isalnum(c) || c == '_'; }
static int digit_char(unsigned char c) { return isdigit(c); }

static const char *token_type(const char *s, size_t n) {
    if (n == 6 && !memcmp(s, "switch", n)) return "SWITCH";
    if (n == 4 && !memcmp(s, "case", n)) return "CASE";
    if (n == 7 && !memcmp(s, "default", n)) return "DEFAULT";
    if (n == 5 && !memcmp(s, "break", n)) return "BREAK";
    if (n && digit_char((unsigned char)s[0])) {
        size_t i = 1;
        while (i < n && digit_char((unsigned char)s[i])) i++;
        if (i == n) {
            char *end = NULL;
            errno = 0;
            (void)strtoll(s, &end, 10);
            return errno == ERANGE || end != s + n ? "INVALID" : "NUMBER";
        }
    }
    if (n && (isalpha((unsigned char)s[0]) || s[0] == '_')) {
        size_t i = 1;
        while (i < n && word_char((unsigned char)s[i])) i++;
        if (i == n) return "IDENT";
    }
    if (n == 2 && ( !memcmp(s, "==", 2) || !memcmp(s, "!=", 2) ||
                    !memcmp(s, "<=", 2) || !memcmp(s, ">=", 2) ||
                    !memcmp(s, "&&", 2) || !memcmp(s, "||", 2))) return "OPERATOR";
    if (n == 1 && strchr("+-*/%<>! =", s[0]) && s[0] != ' ') return "OPERATOR";
    if (n == 1 && strchr("(){}:;", s[0])) return "PUNCT";
    return "INVALID";
}

static void print_one_token(const char *source, size_t start, size_t n, int index, int line, int col, int *first) {
    if (!*first) putchar(',');
    *first = 0;
    printf("{\"index\":%d,\"type\":", index);
    json_string(token_type(source + start, n));
    fputs(",\"lexeme\":", stdout);
    char *lexeme = malloc(n + 1);
    if (!lexeme) json_string("");
    else {
        memcpy(lexeme, source + start, n);
        lexeme[n] = '\0';
        json_string(lexeme);
        free(lexeme);
    }
    printf(",\"line\":%d,\"column\":%d}", line, col);
}

static void print_tokens(const char *source) {
    size_t i = 0, len = strlen(source);
    int line = 1, col = 1, index = 0, first = 1;
    fputc('[', stdout);
    while (i < len) {
        unsigned char c = (unsigned char)source[i];
        if (isspace(c)) {
            if (c == '\n') { line++; col = 1; }
            else col++;
            i++;
            continue;
        }
        if (c == '/' && i + 1 < len && source[i + 1] == '/') {
            i += 2; col += 2;
            while (i < len && source[i] != '\n') { i++; col++; }
            continue;
        }
        if (c == '/' && i + 1 < len && source[i + 1] == '*') {
            size_t comment_start = i;
            int comment_line = line, comment_col = col;
            i += 2; col += 2;
            while (i < len && !(source[i] == '*' && i + 1 < len && source[i + 1] == '/')) {
                if (source[i] == '\n') { line++; col = 1; i++; }
                else { i++; col++; }
            }
            if (i < len) { i += 2; col += 2; }
            else {
                print_one_token(source, comment_start, len - comment_start, ++index, comment_line, comment_col, &first);
            }
            continue;
        }
        size_t start = i, n = 1;
        int token_line = line, token_col = col;
        if (isalpha(c) || c == '_') {
            i++;
            while (i < len && word_char((unsigned char)source[i])) i++;
            n = i - start;
        } else if (isdigit(c)) {
            i++;
            while (i < len && digit_char((unsigned char)source[i])) i++;
            if (i < len && source[i] == '.') {
                i++;
                while (i < len && digit_char((unsigned char)source[i])) i++;
            }
            n = i - start;
        } else if (c == '.' && i + 1 < len && digit_char((unsigned char)source[i + 1])) {
            i++; while (i < len && digit_char((unsigned char)source[i])) i++;
            n = i - start;
        } else if (i + 1 < len && ((c == '=' && source[i+1] == '=') ||
                   (c == '!' && source[i+1] == '=') || (c == '<' && source[i+1] == '=') ||
                   (c == '>' && source[i+1] == '=') || (c == '&' && source[i+1] == '&') ||
                   (c == '|' && source[i+1] == '|'))) {
            i += 2; n = 2;
        } else i++;
        col += (int)n;
        print_one_token(source, start, n, ++index, token_line, token_col, &first);
    }
    fputc(']', stdout);
}

static void print_expr_json(const Expr *expr) {
    if (!expr) { fputs("null", stdout); return; }
    if (expr->type == EX_NUMBER) {
        printf("{\"kind\":\"number\",\"value\":%lld,\"line\":%d,\"column\":%d}", expr->number, expr->line, expr->column);
    } else if (expr->type == EX_IDENT) {
        fputs("{\"kind\":\"identifier\",\"name\":", stdout);
        json_string(expr->name);
        printf(",\"line\":%d,\"column\":%d}", expr->line, expr->column);
    } else if (expr->type == EX_BINARY) {
        fputs("{\"kind\":\"binary\",\"operator\":", stdout);
        json_string(expr->op);
        fputs(",\"left\":", stdout); print_expr_json(expr->left);
        fputs(",\"right\":", stdout); print_expr_json(expr->right);
        printf(",\"line\":%d,\"column\":%d}", expr->line, expr->column);
    } else {
        fputs("{\"kind\":\"unary\",\"operator\":", stdout);
        json_string(expr->op);
        fputs(",\"operand\":", stdout); print_expr_json(expr->left);
        printf(",\"line\":%d,\"column\":%d}", expr->line, expr->column);
    }
}

static void print_ast_json(Stmt *list) {
    int first = 1;
    putchar('[');
    for (Stmt *s = list; s; s = s->next) {
        if (!first) putchar(',');
        first = 0;
        if (s->type == ST_SWITCH) {
            fputs("{\"kind\":\"switch\",\"name\":", stdout);
            json_string(s->name ? s->name : "");
            fputs(",\"selector\":", stdout); print_expr_json(s->selector);
            fputs(",\"cases\":[", stdout);
            int first_case = 1;
            for (Case *c = s->cases; c; c = c->next) {
                if (!first_case) putchar(',');
                first_case = 0;
                printf("{\"value\":%lld,\"line\":%d,\"column\":%d,\"body\":", c->value, c->line, c->column);
                print_ast_json(c->body);
                putchar('}');
            }
            fputs("],\"defaultBody\":", stdout);
            if (s->has_default) print_ast_json(s->body);
            else fputs("null", stdout);
            printf(",\"line\":%d,\"column\":%d}", s->line, s->column);
        } else if (s->type == ST_BREAK) {
            printf("{\"kind\":\"break\",\"line\":%d,\"column\":%d}", s->line, s->column);
        } else if (s->type == ST_ASSIGN) {
            char *value = expr_to_string(s->expr);
            fputs("{\"kind\":\"assign\",\"name\":", stdout);
            json_string(s->name);
            fputs(",\"value\":", stdout); json_string(value);
            fputs(",\"expression\":", stdout); print_expr_json(s->expr);
            printf(",\"line\":%d,\"column\":%d}", s->line, s->column);
            free(value);
        } else {
            printf("{\"kind\":\"empty\",\"line\":%d,\"column\":%d}", s->line, s->column);
        }
    }
    putchar(']');
}

static void print_failure_json(const char *message) {
    fputs("{\"tokens\":[],\"syntax\":{\"ok\":false,\"stage\":\"input\",\"error\":", stdout);
    json_string(message);
    fputs("},\"ast\":null,\"semantics\":{\"ok\":false,\"diagnostics\":[]}}\n", stdout);
}

static int run_json(FILE *input) {
    size_t length = 0;
    char *source = read_all(input, &length);
    if (!source) {
        print_failure_json("Unable to read source input (input may be too large).");
        return 2;
    }
    FILE *parse_input = tmpfile();
    if (!parse_input || fwrite(source, 1, length, parse_input) != length) {
        if (parse_input) fclose(parse_input);
        free(source);
        print_failure_json("Unable to prepare parser input.");
        return 2;
    }
    rewind(parse_input);
    yyin = parse_input;
    yyrestart(parse_input);
    lexer_reset_location();
    root = NULL;
    syntax_error[0] = '\0';
    lexical_error[0] = '\0';
    json_mode = 1;
    int parse_status = yyparse();
    if (parse_status != 0 && syntax_error[0] == '\0') snprintf(syntax_error, sizeof(syntax_error), "Syntax analysis failed.");

    errors = 0;
    diagnostic_count = 0;
    if (parse_status == 0) check(root, 0);
    json_mode = 0;

    fputs("{\"tokens\":", stdout); print_tokens(source);
    fputs(",\"syntax\":{\"ok\":", stdout);
    fputs(parse_status == 0 ? "true" : "false", stdout);
    fputs(",\"stage\":", stdout);
    if (parse_status == 0) fputs("null", stdout); else json_string(lexical_error[0] ? "lexical" : "syntax");
    fputs(",\"error\":", stdout);
    if (parse_status == 0) fputs("null", stdout); else json_string(syntax_error);
    fputs("},\"ast\":", stdout);
    if (parse_status == 0) print_ast_json(root); else fputs("null", stdout);
    fputs(",\"semantics\":{\"ok\":", stdout);
    fputs((parse_status == 0 && errors == 0) ? "true" : "false", stdout);
    fputs(",\"diagnostics\":[", stdout);
    for (int i = 0; i < diagnostic_count; i++) {
        if (i) putchar(',');
        fputs("{\"kind\":\"error\",\"message\":", stdout);
        json_string(diagnostics[i]);
        putchar('}');
    }
    fputs("]}}\n", stdout);

    fclose(parse_input);
    free(source);
    return parse_status != 0 || errors != 0 ? 1 : 0;
}

int main(int argc, char **argv) {
    if (argc >= 2 && strcmp(argv[1], "--json") == 0) {
        if (argc > 3) { print_failure_json("Usage: mini_compiler --json [input_file]"); return 2; }
        FILE *input = stdin;
        if (argc == 3) {
            input = fopen(argv[2], "rb");
            if (!input) {
                char message[512];
                snprintf(message, sizeof(message), "Unable to open input file: %s", argv[2]);
                print_failure_json(message);
                return 2;
            }
        }
        int status = run_json(input);
        if (input != stdin) fclose(input);
        return status;
    }
    if (argc > 2) { fprintf(stderr, "Usage: %s [input_file]\n", argv[0]); return 2; }
    if (argc == 2) {
        yyin = fopen(argv[1], "rb");
        if (!yyin) { perror(argv[1]); return 2; }
    } else yyin = stdin;
    yyrestart(yyin);
    lexer_reset_location();
    root = NULL;
    json_mode = 0;
    syntax_error[0] = '\0';
    lexical_error[0] = '\0';
    if (yyparse() != 0) { if (argc == 2) fclose(yyin); return 1; }
    errors = 0;
    check(root, 0);
    if (errors) {
        printf("Compilation failed: %d semantic error(s)\n", errors);
        if (argc == 2) fclose(yyin);
        return 1;
    }
    printf("Syntax analysis successful.\n");
    printf("Semantic analysis successful.\n");
    printf("Abstract Syntax Tree:\n");
    print_ast(root, 0);
    if (argc == 2) fclose(yyin);
    return 0;
}
