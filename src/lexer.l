%option noyywrap yylineno nodefault never-interactive
%x COMMENT
%{
#include "parser.tab.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

void set_lex_error(int line, int col, const char *message);
void record_token(const char *type, const char *lexeme, int line, int column);
static int current_col = 1;
static int token_col = 1;
#define YY_USER_ACTION do { \
    token_col = current_col; \
    yylloc.first_line = yylineno; \
    yylloc.first_column = token_col; \
    for (int i = 0; i < yyleng; i++) { if (yytext[i] == '\n') current_col = 1; else current_col++; } \
    yylloc.last_line = yylineno; \
    yylloc.last_column = current_col > 1 ? current_col - 1 : 1; \
} while (0);
static char *copy_text(const char *s) {
    size_t n = strlen(s);
    char *p = malloc(n + 1);
    if (!p) exit(2);
    memcpy(p, s, n + 1);
    return p;
}
static int valid_escapes(const char *s) {
    for (size_t i = 1; s[i] && s[i] != '"'; i++) {
        if (s[i] == '\\') {
            i++;
            if (!s[i] || (s[i] != 'n' && s[i] != 't' && s[i] != '\\' && s[i] != '"')) return 0;
        }
        if ((unsigned char)s[i] >= 128) return 0;
    }
    return 1;
}
%}

IDSTART [A-Za-z_]
IDPART  [A-Za-z0-9_]
VALIDSTR \"([^\"\\\n]|\\[nt\\\"])*\"
QUOTED  \"([^\"\\\n]|\\.)*\"

%%
[ \t\r]+                  { /* ignore horizontal whitespace */ }
\n                        { /* yylineno advances automatically */ }
"//"[^\n]*                { /* single-line comment */ }

"string"                  { record_token("KEYWORD_STRING", yytext, yylineno, token_col); return STRING_KW; }
"print"                   { record_token("KEYWORD_PRINT", yytext, yylineno, token_col); return PRINT_KW; }

{IDSTART}{IDPART}*        { yylval.str = copy_text(yytext); record_token("IDENTIFIER", yytext, yylineno, token_col); return IDENTIFIER; }
[0-9]+{IDPART}+           { set_lex_error(yylineno, token_col, "Identifiers cannot begin with a digit."); return INVALID_TOKEN; }
{VALIDSTR}                {
                              if (!valid_escapes(yytext)) {
                                  set_lex_error(yylineno, token_col, "Invalid escape sequence or non-ASCII character in string literal.");
                                  return INVALID_TOKEN;
                              }
                              yylval.str = copy_text(yytext);
                              record_token("STRING_LITERAL", yytext, yylineno, token_col);
                              return STRING_LITERAL;
                          }
{QUOTED}                  {
                              set_lex_error(yylineno, token_col, "Invalid escape sequence in string literal.");
                              return INVALID_TOKEN;
                          }
\"([^\"\\\n]|\\.)*        { set_lex_error(yylineno, token_col, "Unterminated string literal or invalid escape sequence."); return INVALID_TOKEN; }
\"([^\"\\\n]|\\.)*\n      { set_lex_error(yylineno, token_col, "Raw line breaks are not allowed in string literals."); return INVALID_TOKEN; }

"="                       { record_token("ASSIGN", yytext, yylineno, token_col); return ASSIGN; }
"+"                       { record_token("PLUS", yytext, yylineno, token_col); return PLUS; }
"("                       { record_token("LEFT_PAREN", yytext, yylineno, token_col); return LPAREN; }
")"                       { record_token("RIGHT_PAREN", yytext, yylineno, token_col); return RPAREN; }
";"                       { record_token("SEMICOLON", yytext, yylineno, token_col); return SEMICOLON; }
.                         {
                              char msg[128];
                              snprintf(msg, sizeof(msg), "Unexpected character '%s'.", yytext);
                              set_lex_error(yylineno, token_col, msg);
                              return INVALID_TOKEN;
                          }
%%
