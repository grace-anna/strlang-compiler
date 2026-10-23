#!/usr/bin/env python3
"""Small standard-library HTTP bridge for the Flex/Bison StrLang compiler."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import subprocess
import os
import sys

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
BINARY = ROOT / ("strlang.exe" if os.name == "nt" else "strlang")
HOST = "127.0.0.1"
PORT = int(os.environ.get("PORT", "4173"))
MAX_SOURCE = 200_000


def decode_string_literal(value):
    """Decode the four escape sequences supported by StrLang."""
    if not isinstance(value, str) or len(value) < 2 or value[0] != '"' or value[-1] != '"':
        raise ValueError("Malformed string literal in AST.")
    raw = value[1:-1]
    result = []
    i = 0
    escapes = {"n": "\n", "t": "\t", "\\": "\\", '"': '"'}
    while i < len(raw):
        if raw[i] == "\\":
            i += 1
            if i >= len(raw) or raw[i] not in escapes:
                raise ValueError("Invalid escape sequence encountered during execution.")
            result.append(escapes[raw[i]])
        else:
            result.append(raw[i])
        i += 1
    return "".join(result)

def evaluate_expression(node, variables):
    if not isinstance(node, dict):
        raise RuntimeError("Malformed expression in AST.")
    kind = node.get("type")
    if kind == "StringLiteral":
        return decode_string_literal(node.get("value", ""))
    if kind == "Identifier":
        name = node.get("value", "")
        if name not in variables:
            raise RuntimeError(f"Variable '{name}' is not initialized.")
        return variables[name]
    if kind == "BinaryExpression":
        return evaluate_expression(node.get("left"), variables) + evaluate_expression(node.get("right"), variables)
    raise RuntimeError(f"Unsupported expression node: {kind}.")

def execute_program(ast):
    """Run the tiny validated StrLang AST to produce print() output."""
    variables = {}
    declared = set()
    output = []
    for statement in ast.get("children", []):
        kind = statement.get("type")
        name = statement.get("value", "")
        if kind == "Declaration":
            declared.add(name)
            if statement.get("expression") is not None:
                variables[name] = evaluate_expression(statement["expression"], variables)
        elif kind == "Assignment":
            if name not in declared:
                raise RuntimeError(f"Assignment to undeclared variable '{name}'.")
            variables[name] = evaluate_expression(statement.get("expression"), variables)
        elif kind == "OutputStatement":
            output.extend(evaluate_expression(statement.get("expression"), variables).split("\n"))
    return output

class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body, content_type="application/json; charset=utf-8"):
        data = body if isinstance(body, bytes) else (json.dumps(body, ensure_ascii=False).encode("utf-8") if isinstance(body, (dict, list)) else str(body).encode("utf-8"))
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/":
            path = "/index.html"
        target = (PUBLIC / path.lstrip("/")).resolve()
        if not str(target).startswith(str(PUBLIC.resolve()) + os.sep):
            return self._send(403, "Forbidden", "text/plain; charset=utf-8")
        if not target.is_file():
            return self._send(404, "Not found", "text/plain; charset=utf-8")
        types = {".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8"}
        self._send(200, target.read_bytes(), types.get(target.suffix, "application/octet-stream"))

    def do_POST(self):
        if self.path != "/api/compile":
            return self._send(404, {"error":"Not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > MAX_SOURCE:
                return self._send(413, {"error":"Source limit is 200 KB."})
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            source = payload.get("source")
            if not isinstance(source, str):
                return self._send(400, {"error":"Expected source to be a string."})
            if not BINARY.is_file():
                return self._send(500, {"error":"Compiler executable not found. Run build.sh or build.bat first."})
            result = subprocess.run([str(BINARY)], input=source, text=True, capture_output=True, timeout=5)
            if result.returncode != 0:
                return self._send(500, {"error":result.stderr or f"Compiler exited with {result.returncode}."})
            try:
                data = json.loads(result.stdout)
            except json.JSONDecodeError:
                return self._send(500, {"error":"Compiler returned invalid JSON.", "details":result.stdout[:500]})
            if data.get("ok") and data.get("ast"):
                try:
                    data["output"] = execute_program(data["ast"])
                except (ValueError, RuntimeError) as exc:
                    data["ok"] = False
                    data["diagnostic"] = {"kind": "runtime", "message": str(exc), "line": 1, "column": 1}
                    data["output"] = []
            else:
                data["output"] = []
            return self._send(200, data)
        except subprocess.TimeoutExpired:
            return self._send(408, {"error":"Compilation timed out."})
        except (ValueError, UnicodeDecodeError) as exc:
            return self._send(400, {"error":f"Invalid request: {exc}"})
        except Exception as exc:
            return self._send(500, {"error":str(exc)})

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")

if __name__ == "__main__":
    print(f"StrLang IDE running at http://{HOST}:{PORT}")
    print("Press Ctrl+C to stop.")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
