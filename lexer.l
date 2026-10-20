%option noyywrap
%x BLOCK_COMMENT
%{
#include <errno.h>
#include <stdlib.h>
#include <string.h>
#include "parser.tab.h"

extern void compiler_set_lexical_error(const char *reason, const char *lexeme, int line, int column);
static int scan_line = 1, scan_column = 1;
static int comment_line = 1, comment_column = 1;

static int bad_token(const char *message);

#define YY_USER_ACTION do { \
    yylloc.first_line = scan_line; yylloc.first_column = scan_column; \
    for (int i = 0; i < yyleng; i++) { \
        if (yytext[i] == '\n') { scan_line++; scan_column = 1; } \
        else scan_column++; \
    } \
    yylloc.last_line = scan_line; \
    yylloc.last_column = scan_column > 1 ? scan_column - 1 : 1; \
} while (0);
%}
%%
"switch"                        { return SWITCH; }
"case"                          { return CASE; }
"default"                       { return DEFAULT; }
"break"                         { return BREAK; }
"=="                            { return EQ; }
"!="                            { return NE; }
"<="                            { return LE; }
">="                            { return GE; }
"&&"                            { return AND; }
"||"                            { return OR; }
[0-9]+\.[0-9]*|\.[0-9]+         { return bad_token("floating-point literals are not supported"); }
[0-9]+                          {
                                    errno = 0;
                                    yylval.num = strtoll(yytext, NULL, 10);
                                    if (errno == ERANGE) return bad_token("integer literal is out of range");
                                    return NUMBER;
                                }
\"([^\\\"\n]|\\.)*\"           {
                                    yylval.str = strndup(yytext + 1, (size_t)yyleng - 2);
                                    return STRING;
                                }
\"([^\\\"\n]|\\.)*             { return bad_token("unterminated string literal"); }
[a-zA-Z_][a-zA-Z0-9_]*           { yylval.str = strdup(yytext); return IDENT; }
"//"[^\n]*                      { }
"/*"                            { comment_line = yylloc.first_line; comment_column = yylloc.first_column; BEGIN(BLOCK_COMMENT); }
<BLOCK_COMMENT>"*/"             { BEGIN(INITIAL); }
<BLOCK_COMMENT>[^*\n]+          { }
<BLOCK_COMMENT>\n               { }
<BLOCK_COMMENT>"*"              { }
<BLOCK_COMMENT><<EOF>>          {
                                    yylloc.first_line = comment_line;
                                    yylloc.first_column = comment_column;
                                    return bad_token("unterminated block comment");
                                }
[ \t\r\n]+                      { }
[()+*/%<>=:;{},!\-]              { return yytext[0]; }
[\xc2-\xdf][\x80-\xbf]          { return bad_token("unsupported character"); }
[\xe0-\xef][\x80-\xbf]{2}       { return bad_token("unsupported character"); }
[\xf0-\xf4][\x80-\xbf]{3}       { return bad_token("unsupported character"); }
.                               { return bad_token("unsupported character"); }
%%

static int bad_token(const char *message) {
    compiler_set_lexical_error(message, yytext, yylloc.first_line, yylloc.first_column);
    return INVALID;
}

void lexer_reset_location(void) {
    scan_line = scan_column = 1;
    comment_line = comment_column = 1;
    BEGIN(INITIAL);
}
