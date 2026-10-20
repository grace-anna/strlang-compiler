#!/usr/bin/env python3
"""End-to-end checks for the local HTTP API; uses only Python's stdlib."""
import json
import os
import socket
import subprocess
import time
import urllib.error
import urllib.request
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SERVER = ROOT / "backend" / "server.py"

def unused_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]

def request(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method="POST" if data is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=3) as response:
            return response.status, response.headers.get("Content-Type", ""), response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers.get("Content-Type", ""), exc.read()

def main():
    global passed, failed
    passed = 0
    failed = 0
    port = unused_port()
    env = os.environ.copy()
    env["PORT"] = str(port)
    proc = subprocess.Popen(["python3", str(SERVER)], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    passed = failed = 0

    def check(name, ok, detail=""):
        global passed, failed
        if ok:
            print(f"PASS: {name}")
            passed += 1
        else:
            print(f"FAIL: {name}" + (f" — {detail}" if detail else ""))
            failed += 1

    try:
        base = f"http://127.0.0.1:{port}"
        ready = False
        for _ in range(60):
            if proc.poll() is not None:
                break
            try:
                with urllib.request.urlopen(base + "/", timeout=0.5) as response:
                    ready = response.status == 200 and b"SwitchLab" in response.read()
                    break
            except Exception:
                time.sleep(0.1)
        check("frontend serves successfully", ready, proc.stderr.read() if proc.poll() is not None else "server did not become ready")
        try:
            with urllib.request.urlopen(base + "/engines/backend.js", timeout=2) as response:
                backend_js_ok = response.status == 200 and b"/api/analyze" in response.read()
        except Exception:
            backend_js_ok = False
        check("backend engine script is served", backend_js_ok)

        headers = {"Content-Type": "application/json"}
        status, ct, body = request(base + "/api/analyze", json.dumps({"source": "switch(x){case 1: x = y + 1; break;}"}).encode(), headers)
        payload = json.loads(body)
        check("API returns actual expression AST", status == 200 and payload["syntax"]["ok"] and payload["ast"][0]["cases"][0]["body"][0]["expression"]["operator"] == "+")

        status, ct, body = request(base + "/api/analyze", json.dumps({"source": "switch(x){case 1:{x=10; break;} default:{x=0;}}"}).encode(), headers)
        payload = json.loads(body)
        check("API accepts braced case/default blocks", status == 200 and payload["syntax"]["ok"] and len(payload["ast"][0]["cases"][0]["body"]) == 2)

        status, ct, body = request(base + "/api/analyze", json.dumps({"source": "x = y + 1;"}).encode(), headers)
        payload = json.loads(body)
        check("API rejects assignments outside switch-case program", status == 200 and not payload["syntax"]["ok"])

        status, ct, body = request(base + "/api/analyze", json.dumps({"source": ""}).encode(), headers)
        payload = json.loads(body)
        check("API rejects empty source", status == 200 and not payload["syntax"]["ok"])

        status, ct, body = request(base + "/api/analyze", json.dumps({"source": "switch(x){case 1: x = a + * b; break;}"}).encode(), headers)
        payload = json.loads(body)
        check("API returns syntax failures as JSON", status == 200 and not payload["syntax"]["ok"] and payload["syntax"].get("stage") == "syntax" and "column" in payload["syntax"]["error"])

        status, ct, body = request(base + "/api/analyze", json.dumps({"source": "switch(x){case 1: x = @; break;}"}).encode(), headers)
        payload = json.loads(body)
        check("API preserves lexical error stage", status == 200 and payload["syntax"].get("stage") == "lexical")

        status, ct, body = request(base + "/api/analyze", json.dumps({"source": "switch(x){case 1: break; case 1: break;}"}).encode(), headers)
        payload = json.loads(body)
        check("API returns semantic diagnostics", status == 200 and payload["syntax"]["ok"] and not payload["semantics"]["ok"])

        status, ct, body = request(base + "/api/analyze", json.dumps({"source": "x" * (64 * 1024 + 1)}).encode(), headers)
        check("API rejects oversized source", status == 413 and "application/json" in ct and b"64 KiB" in body)

        status, ct, body = request(base + "/api/analyze", b"not json", headers)
        check("API rejects malformed JSON", status == 400 and "application/json" in ct)

        status, ct, body = request(base + "/not-a-route", json.dumps({"source": "x=1;"}).encode(), headers)
        check("API rejects unknown POST route", status == 404 and "application/json" in ct)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill(); proc.wait(timeout=3)

    print(f"\nAPI integration results: {passed} passed, {failed} failed")
    return 1 if failed else 0


class ApiRegressionDiscoveryTests(unittest.TestCase):
    def test_api_regression_suite(self):
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
