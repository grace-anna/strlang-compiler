#!/usr/bin/env python3
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BIN = ROOT / "mini_compiler"
passed = 0
failed = 0

def check(name, condition, detail=""):
    global passed, failed
    if condition:
        print(f"PASS: {name}")
        passed += 1
    else:
        print(f"FAIL: {name}" + (f" — {detail}" if detail else ""))
        failed += 1

def analyze(source):
    process = subprocess.run([str(BIN), "--json"], input=source, text=True, capture_output=True, cwd=ROOT)
    try:
        payload = json.loads(process.stdout)
    except json.JSONDecodeError as exc:
        raise AssertionError(f"compiler did not emit JSON: {process.stdout!r}; stderr={process.stderr!r}") from exc
    return process.returncode, payload

def main():
    global passed, failed
    passed = 0
    failed = 0
    rc, valid = analyze("switch (x) {\n case 1: break;\n case 2: x = x + 1; break;\n}")
    check("original x = x + 1 regression", rc == 0 and valid["syntax"]["ok"] and valid["ast"][0]["cases"][1]["body"][0]["expression"]["operator"] == "+")

    rc, precedence = analyze("switch(x){case 1: result = a + b * c; break;}")
    expr = precedence["ast"][0]["cases"][0]["body"][0]["expression"] if precedence.get("ast") else None
    check("operator precedence", rc == 0 and precedence["syntax"]["ok"] and expr and expr["operator"] == "+" and expr["right"]["operator"] == "*")

    rc, parens = analyze("switch(x){case 1: result = (a + b) * c; break;}")
    expr = parens["ast"][0]["cases"][0]["body"][0]["expression"] if parens.get("ast") else None
    check("parenthesized expression AST", rc == 0 and expr and expr["operator"] == "*" and expr["left"]["operator"] == "+")

    rc, nested = analyze("switch(x){case 1: x = (a + b) * (c - d); break;}")
    expr = nested["ast"][0]["cases"][0]["body"][0]["expression"] if nested.get("ast") else None
    check("nested arithmetic expressions", rc == 0 and expr and expr["operator"] == "*" and expr["right"]["operator"] == "-")

    rc, blocks = analyze("switch(x){case 1:{x=10; break;} default:{x=0;}}")
    check("braced blocks inside case/default", rc == 0 and blocks["syntax"]["ok"] and len(blocks["ast"][0]["cases"][0]["body"]) == 2 and len(blocks["ast"][0]["defaultBody"]) == 1)

    rc, calls = analyze(r'switch(x){case 1: printf("sum = %d\n", add(a, 2), x); break; default: puts("done");}')
    call_stmt = calls["ast"][0]["cases"][0]["body"][0] if calls.get("ast") else None
    call_expr = call_stmt.get("expression") if call_stmt else None
    args = call_expr.get("arguments", []) if call_expr else []
    check("escaped string and multiple/nested call arguments", rc == 0 and calls["syntax"]["ok"] and call_stmt["kind"] == "call" and call_expr["name"] == "printf" and args[0]["value"] == r"sum = %d\n" and args[1]["name"] == "add" and len(args[1]["arguments"]) == 2 and args[2]["name"] == "x" and calls["ast"][0]["defaultBody"][0]["expression"]["name"] == "puts")

    rc, quoted = analyze(r'switch(x){case 1: printf("say \"hi\"\t", x); break;}')
    quoted_value = quoted["ast"][0]["cases"][0]["body"][0]["expression"]["arguments"][0]["value"] if quoted.get("ast") else None
    check("escaped quotes and tabs in string literal", rc == 0 and quoted_value == r"say \"hi\"\t")

    rc, invalid = analyze("switch(x){case 1: x = a + * b; break;}")
    check("malformed operator sequence rejected", rc != 0 and not invalid["syntax"]["ok"] and invalid["syntax"].get("stage") == "syntax" and "line 1, column" in invalid["syntax"]["error"])

    rc, top_level = analyze("x = y + 1;")
    check("standalone assignment rejected outside switch", rc != 0 and not top_level["syntax"]["ok"] and top_level["syntax"].get("stage") == "syntax")

    rc, top_expr = analyze("a + b * c;")
    check("standalone expression rejected outside switch", rc != 0 and not top_expr["syntax"]["ok"])

    rc, empty_source = analyze("")
    check("empty source rejected", rc != 0 and not empty_source["syntax"]["ok"])

    rc, invalid_char = analyze("switch(x){case 1: x = @; break;}")
    check("unsupported character reports lexical stage", rc != 0 and not invalid_char["syntax"]["ok"] and invalid_char["syntax"].get("stage") == "lexical")

    rc, sem = analyze("switch(x){case 1: break;\ncase 1: break;}")
    check("duplicate case semantic diagnostic", rc == 1 and sem["syntax"]["ok"] and not sem["semantics"]["ok"] and "duplicate case value" in sem["semantics"]["diagnostics"][0]["message"])

    rc, dupdef = analyze("switch(x){case 1: break; default: break; default: break;}")
    check("duplicate default rejected", rc != 0 and not dupdef["syntax"]["ok"])

    rc, comments = analyze("/* one\n two */\nswitch (counter + 1) {case 1: total_value = variable123 + 2 * another; break;}")
    check("comments and long identifiers", rc == 0 and comments["syntax"]["ok"] and any(t["lexeme"] == "variable123" for t in comments["tokens"]))

    rc, unterminated = analyze("switch(x){case 1: x = 1; /* never closes")
    check("unterminated block comment rejected", rc != 0 and not unterminated["syntax"]["ok"] and unterminated["syntax"].get("stage") == "lexical")

    rc, float_input = analyze("switch(x){case 1: x = 2.5; break;}")
    check("floating-point literal rejected consistently", rc != 0 and not float_input["syntax"]["ok"] and float_input["syntax"].get("stage") == "lexical" and any(t["type"] == "INVALID" for t in float_input["tokens"]))

    rc, float_leading_dot = analyze("switch(x){case 1: x = .5; break;}")
    check("leading-dot float rejected consistently", rc != 0 and not float_leading_dot["syntax"]["ok"] and float_leading_dot["syntax"].get("stage") == "lexical" and any(t["lexeme"] == ".5" and t["type"] == "INVALID" for t in float_leading_dot["tokens"]))

    rc, float_trailing_dot = analyze("switch(x){case 1: x = 2.; break;}")
    check("trailing-dot float rejected consistently", rc != 0 and not float_trailing_dot["syntax"]["ok"] and float_trailing_dot["syntax"].get("stage") == "lexical" and any(t["lexeme"] == "2." and t["type"] == "INVALID" for t in float_trailing_dot["tokens"]))

    rc, overflow = analyze("switch(x){case 1: x = 999999999999999999999999999999999999999999; break;}")
    check("out-of-range integer rejected", rc != 0 and not overflow["syntax"]["ok"] and overflow["syntax"].get("stage") == "lexical" and any(t["type"] == "INVALID" for t in overflow["tokens"]))

    statuses = [analyze("switch(x){case 1: x=1; break;}")[0], analyze("switch(x){case 1: x=a+*b; break;}")[0], analyze("switch(x){case 1: x=y+1; break;}")[0]]
    check("independent repeated compilations", statuses == [0, 1, 0], repr(statuses))

    rc, ws = analyze("   \n\t  ")
    check("whitespace-only input rejected consistently", rc != 0 and not ws["syntax"]["ok"])

    depth = 100
    nested_expr = "(" * depth + "42" + ")" * depth
    rc, nested_res = analyze(f"switch(x){{case 1: y = {nested_expr}; break;}}")
    check("deeply nested expressions handled without crash", rc == 0 and nested_res["syntax"]["ok"])

    nested_switches = ""
    for i in range(20): nested_switches += f"switch(x{i}){{case 1: "
    for i in range(20): nested_switches += "break;} "
    rc, nested_sw_res = analyze(nested_switches)
    check("deeply nested switch statements handled without crash", rc == 0 and nested_sw_res["syntax"]["ok"])

    rc, html_input = analyze("switch(x){case 1: <script>alert('xss')</script>; break;}")
    check("HTML tags in source handled safely without crash", rc != 0 and not html_input["syntax"]["ok"])

    rc, emoji_res = analyze("switch(x){case 1: y = 🚀; break;}")
    check("multi-byte UTF-8 emoji handled safely as lexical error", rc != 0 and not emoji_res["syntax"]["ok"] and emoji_res["syntax"].get("stage") == "lexical" and any(t["lexeme"] == "🚀" for t in emoji_res["tokens"]))

    recovery_seq = [
        analyze("")[0],
        analyze("switch(x){case 1: break;}")[0],
        analyze("switch(x){case 1: @; break;}")[0],
        analyze("switch(x){case 1: y=1; break;}")[0],
    ]
    check("compilation recovery after error sequence", recovery_seq == [1, 0, 1, 0], repr(recovery_seq))

    print(f"\nJSON regression results: {passed} passed, {failed} failed")
    return 1 if failed else 0


class JsonRegressionDiscoveryTests(unittest.TestCase):
    def test_json_regression_suite(self):
        result = subprocess.run(
            ["python3", str(Path(__file__).resolve())],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.assertEqual(result.returncode, 0, result.stdout + "\n" + result.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
