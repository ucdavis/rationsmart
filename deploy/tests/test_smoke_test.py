"""Exercise the real deployment smoke function without starting or changing services."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / "deploy.sh"
SMOKE = SCRIPT.read_text().split("smoke_test() {", 1)[1].split("\nstart_all()", 1)[0]
HARNESS = r'''
set -euo pipefail
GATEWAY_PORT=8080
log() { echo "$*"; }
sleep() { :; }
dc() {
  if [[ "$1 $2" == "gateway config" ]]; then
    printf '%s' "$COMPOSE_JSON"
  else
    echo "backend-health" >> "$CALLS"
  fi
}
curl() {
  printf '%s\n' "$*" >> "$CALLS"
  [[ "$CURL_EXIT" == 0 ]] || return "$CURL_EXIT"
  if [[ "$*" == *'/docs' ]]; then printf '%s' "$DOCS_STATUS"; fi
  return 0
}
'''


class SmokeTest(unittest.TestCase):
    def run_smoke(self, tls=False, docs="404", curl_exit="0", config=None):
        ports = [{"target": 80, "published": "8080"}]
        if tls:
            ports.append({"target": 443, "published": "443"})
        with tempfile.TemporaryDirectory() as directory:
            calls = Path(directory) / "calls"
            result = subprocess.run(
                ["bash", "-c", HARNESS + "\nsmoke_test() {" + SMOKE + "\nsmoke_test"],
                env={**os.environ, "CALLS": str(calls), "DOCS_STATUS": docs,
                     "CURL_EXIT": curl_exit,
                     "COMPOSE_JSON": config if config is not None else json.dumps(
                         {"services": {"nginx": {"ports": ports}}})},
                capture_output=True, text=True,
            )
            return result.returncode, calls.read_text() if calls.exists() else ""

    def test_http_without_override(self):
        status, calls = self.run_smoke()
        self.assertEqual(status, 0)
        self.assertIn("http://localhost:8080/docs", calls)
        self.assertNotIn("--cacert", calls)
        self.assertIn("backend-health", calls)

    def test_https_checks_origin_and_certificate_for_every_request(self):
        status, calls = self.run_smoke(tls=True)
        self.assertEqual(status, 0)
        requests = [line for line in calls.splitlines() if line != "backend-health"]
        self.assertEqual(len(requests), 3)
        for line in requests:
            self.assertIn("--resolve rationsmart.ucdavis.edu:443:127.0.0.1", line)
            self.assertIn("--cacert /etc/rationsmart/tls/cloudflare-origin-ca-root.pem", line)
            if line.endswith("/docs"):
                self.assertNotIn(" -L ", line)
        self.assertIn("https://rationsmart.ucdavis.edu:443/docs", calls)

    def test_docs_must_be_denied_for_both_protocols(self):
        for tls in (False, True):
            for response in ("200", "308", "500"):
                with self.subTest(tls=tls, response=response):
                    status, calls = self.run_smoke(tls=tls, docs=response)
                    self.assertNotEqual(status, 0)
                    self.assertNotIn("backend-health", calls)

    def test_invalid_certificate_fails_without_http_fallback(self):
        status, calls = self.run_smoke(tls=True, curl_exit="60")
        self.assertNotEqual(status, 0)
        self.assertNotIn("http://localhost", calls)

    def test_invalid_compose_configuration_fails(self):
        status, calls = self.run_smoke(config="invalid json")
        self.assertNotEqual(status, 0)
        self.assertEqual(calls, "")


if __name__ == "__main__":
    unittest.main()
