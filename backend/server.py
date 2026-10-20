#!/usr/bin/env python3
"""Local HTTP bridge between the browser UI and the C/Flex/Bison compiler."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import json
import os
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
COMPILER = ROOT / "mini_compiler"
HOST = "127.0.0.1"
PORT = int(os.environ.get("PORT", "8000"))
MAX_SOURCE_BYTES = 64 * 1024
TIMEOUT_SECONDS = 5


def json_bytes(value):
    return json.dumps(value, ensure_ascii=False).encode("utf-8")


def error_result(message, stage="backend"):
    return {
        "error": message,
        "tokens": [],
        "syntax": {"ok": False, "stage": stage, "error": message},
        "ast": None,
        "semantics": {"ok": False, "diagnostics": []},
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND), **kwargs)

    def send_json(self, status, payload):
        data = json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path != "/api/analyze":
            self.send_json(404, {"error": "Endpoint not found."})
            return
        raw_length = self.headers.get("Content-Length")
        try:
            length = int(raw_length or "")
        except ValueError:
            self.send_json(411, {"error": "A valid Content-Length header is required."})
            return
        if length < 0:
            self.send_json(400, {"error": "Invalid request length."})
            return
        if length > MAX_SOURCE_BYTES * 6 + 4096:
            self.send_json(413, error_result("Request is too large. Source limit is 64 KiB.", stage="input"))
            return
        body = self.rfile.read(length)
        try:
            request = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_json(400, error_result("Request body must be valid UTF-8 JSON.", stage="input"))
            return
        if not isinstance(request, dict) or not isinstance(request.get("source"), str):
            self.send_json(400, error_result("Request JSON must contain a string field named 'source'.", stage="input"))
            return
        source = request["source"]
        if len(source.encode("utf-8")) > MAX_SOURCE_BYTES:
            self.send_json(413, error_result("Source is too large. Maximum size is 64 KiB.", stage="input"))
            return
        if not COMPILER.is_file():
            self.send_json(503, error_result("Compiler binary not found. Run 'make' in the project directory first."))
            return
        try:
            completed = subprocess.run(
                [str(COMPILER), "--json"],
                input=source.encode("utf-8"),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=str(ROOT),
                timeout=TIMEOUT_SECONDS,
                check=False,
                shell=False,
            )
        except subprocess.TimeoutExpired:
            self.send_json(504, error_result("Compiler analysis timed out."))
            return
        except OSError:
            self.send_json(503, error_result("Could not start the compiler. Check that mini_compiler is executable."))
            return
        try:
            result = json.loads(completed.stdout.decode("utf-8", errors="replace"))
        except json.JSONDecodeError:
            detail = completed.stderr.decode("utf-8", errors="replace").strip()
            self.send_json(500, error_result("Compiler returned invalid JSON." + (f" {detail}" if detail else "")))
            return
        required = {"tokens", "syntax", "ast", "semantics"}
        if not isinstance(result, dict) or not required.issubset(result):
            self.send_json(500, error_result("Compiler response did not match the expected analysis format."))
            return
        self.send_json(200, result)

    def log_message(self, fmt, *args):
        sys.stderr.write("[server] " + (fmt % args) + "\n")


if __name__ == "__main__":
    if not FRONTEND.is_dir():
        raise SystemExit(f"Frontend directory not found: {FRONTEND}")
    print(f"Switch-Case Compiler running at http://{HOST}:{PORT}")
    print("Press Ctrl+C to stop.")
    try:
        ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
    except OSError as exc:
        raise SystemExit(f"Could not start server on {HOST}:{PORT}: {exc}")
