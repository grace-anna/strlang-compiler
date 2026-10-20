%{
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ast.h"

int yylex(void);
void yyerror(const char *message);
extern int json_mode;
extern char syntax_error[512];
extern char lexical_error[512];
Stmt *root = NULL;
%}

%code requires {
#include "ast.h"
}

%define parse.error detailed
%locations

%union {
    long long num;
    char *str;
    Expr *expr;
    Stmt *stmt;
    Case *cases;
    DefaultPart *def;
}

%token SWITCH CASE DEFAULT BREAK
%token <str> IDENT
%token <num> NUMBER
%token EQ NE LE GE AND OR INVALID

%type <stmt> program top_statement stmt_list statement switch_stmt
%type <cases> case_list case_clause
%type <def> default_opt default_clause
%type <expr> expr
%type <num> case_constant

%left OR
%left AND
%left EQ NE
%left '<' '>' LE GE
%left '+' '-'
%left '*' '/' '%'
%precedence UMINUS

%start program
%%

program:
    top_statement                 { $$ = root = $1; }
  | program top_statement         { $$ = root = append_stmt($1, $2); }
;

top_statement:
    switch_stmt                   { $$ = $1; }
  | BREAK ';'                     { $$ = make_break(@1.first_line, @1.first_column); }
;

stmt_list:
    %empty                        { $$ = NULL; }
  | stmt_list statement           { $$ = append_stmt($1, $2); }
;

statement:
    switch_stmt                   { $$ = $1; }
  | BREAK ';'                     { $$ = make_break(@1.first_line, @1.first_column); }
  | IDENT '=' expr ';'            { $$ = make_assign($1, $3, @1.first_line, @1.first_column); }
  | ';'                           { $$ = make_empty(@1.first_line, @1.first_column); }
  | '{' stmt_list '}'             { $$ = $2; }
;

switch_stmt:
    SWITCH '(' expr ')' '{' case_list default_opt '}'
                                  { $$ = make_switch($3, $6, $7, @1.first_line, @1.first_column); }
;

case_list:
    %empty                        { $$ = NULL; }
  | case_list case_clause         { $$ = append_case($1, $2); }
;

case_clause:
    CASE case_constant ':' stmt_list
                                  { $$ = make_case($2, $4, @1.first_line, @1.first_column); }
;

default_opt:
    %empty                        { $$ = make_default(0, NULL); }
  | default_clause                { $$ = $1; }
;

default_clause:
    DEFAULT ':' stmt_list         { $$ = make_default(1, $3); }
;

case_constant:
    NUMBER                        { $$ = $1; }
  | '-' NUMBER                    { $$ = -$2; }
  | '+' NUMBER                    { $$ = $2; }
;

expr:
    expr '+' expr                 { $$ = make_binary("+", $1, $3, @2.first_line, @2.first_column); }
  | expr '-' expr                 { $$ = make_binary("-", $1, $3, @2.first_line, @2.first_column); }
  | expr '*' expr                 { $$ = make_binary("*", $1, $3, @2.first_line, @2.first_column); }
  | expr '/' expr                 { $$ = make_binary("/", $1, $3, @2.first_line, @2.first_column); }
  | expr '%' expr                 { $$ = make_binary("%", $1, $3, @2.first_line, @2.first_column); }
  | expr EQ expr                  { $$ = make_binary("==", $1, $3, @2.first_line, @2.first_column); }
  | expr NE expr                  { $$ = make_binary("!=", $1, $3, @2.first_line, @2.first_column); }
  | expr '<' expr                 { $$ = make_binary("<", $1, $3, @2.first_line, @2.first_column); }
  | expr '>' expr                 { $$ = make_binary(">", $1, $3, @2.first_line, @2.first_column); }
  | expr LE expr                  { $$ = make_binary("<=", $1, $3, @2.first_line, @2.first_column); }
  | expr GE expr                  { $$ = make_binary(">=", $1, $3, @2.first_line, @2.first_column); }
  | expr AND expr                 { $$ = make_binary("&&", $1, $3, @2.first_line, @2.first_column); }
  | expr OR expr                  { $$ = make_binary("||", $1, $3, @2.first_line, @2.first_column); }
  | '-' expr %prec UMINUS         { $$ = make_unary("-", $2, @1.first_line, @1.first_column); }
  | '+' expr %prec UMINUS         { $$ = make_unary("+", $2, @1.first_line, @1.first_column); }
  | '!' expr %prec UMINUS         { $$ = make_unary("!", $2, @1.first_line, @1.first_column); }
  | NUMBER                        { $$ = make_number($1, @1.first_line, @1.first_column); }
  | IDENT                         { $$ = make_identifier($1, @1.first_line, @1.first_column); }
  | '(' expr ')'                  { $$ = $2; }
;

%%

void yyerror(const char *message) {
    if (syntax_error[0]) return;
    if (lexical_error[0]) {
        snprintf(syntax_error, sizeof(syntax_error), "%s", lexical_error);
    } else {
        snprintf(syntax_error, sizeof(syntax_error),
                 "Syntax error at line %d, column %d: %s",
                 yylloc.first_line, yylloc.first_column, message);
    }
    if (!json_mode) fprintf(stderr, "%s\n", syntax_error);
}
