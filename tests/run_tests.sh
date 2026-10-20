#!/usr/bin/env bash
set -u
passed=0
failed=0

run_test() {
    file="$1"
    expected_status="$2"
    expected_text="$3"

    output=$(./mini_compiler "$file" 2>&1)
    actual_status=$?

    if [ "$actual_status" -eq "$expected_status" ] &&
       printf '%s' "$output" | grep -Fq "$expected_text"; then
        printf 'PASS: %s\n' "$file"
        passed=$((passed+1))
    else
        printf 'FAIL: %s\n' "$file"
        printf 'Expected exit status: %s\n' "$expected_status"
        printf 'Actual exit status: %s\n' "$actual_status"
        printf 'Output:\n%s\n' "$output"
        failed=$((failed+1))
    fi
}

run_test tests/valid.c 0 "Syntax analysis successful."
run_test tests/duplicate_case.c 1 "duplicate case value"
run_test tests/invalid_break.c 1 "break outside switch"
run_test tests/top_level_assignment.c 1 "Syntax error"
run_test tests/top_level_expression.c 1 "Syntax error"
run_test tests/empty_program.c 1 "Syntax error"
run_test tests/duplicate_default.c 1 "Syntax error"
run_test tests/nested_valid.c 0 "Semantic analysis successful."
run_test tests/nested_duplicate.c 1 "duplicate case value"
run_test tests/separate_switches.c 0 "Semantic analysis successful."
run_test tests/missing_colon.c 1 "Syntax error"
run_test tests/invalid_case_label.c 1 "Syntax error"
run_test tests/missing_brace.c 1 "Syntax error"
run_test tests/empty_switch.c 0 "Semantic analysis successful."
run_test tests/identifier_assignment.c 0 "Assign(x, (y + 1))"
run_test tests/arithmetic_precedence.c 0 "Assign(result, (a + (b * c)))"
run_test tests/parenthesized_expression.c 0 "Assign(result, ((a + b) * c))"
run_test tests/nested_arithmetic.c 0 "Assign(x, ((a + b) * (c - d)))"
run_test tests/switch_expression.c 0 "Switch((x + 1))"
run_test tests/invalid_missing_semicolon.c 1 "Syntax error"
run_test tests/invalid_operator_sequence.c 1 "Syntax error"
run_test tests/unterminated_comment.c 1 "Lexical error"
run_test tests/invalid_float.c 1 "Lexical error"
run_test tests/invalid_float_leading_dot.c 1 "Lexical error"
run_test tests/invalid_float_trailing_dot.c 1 "Lexical error"
run_test tests/invalid_integer_overflow.c 1 "Lexical error"
run_test tests/block_comments.c 0 "Semantic analysis successful."
run_test tests/block_statement.c 0 "Semantic analysis successful."
run_test tests/function_calls.c 0 'Call(printf("Addition\n", add(left, 2), result))'

printf '\nCompiler regression results: %d passed, %d failed\n' "$passed" "$failed"
[ "$failed" -eq 0 ] && python3 tests/test_json.py && python3 tests/test_api.py
