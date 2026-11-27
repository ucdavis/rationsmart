"""Exercise the real storage block of deploy/vm-deploy.sh (storage_env_lines) without Azure, Docker or a VM."""
from pathlib import Path
import re
import subprocess
import unittest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = (REPO / "deploy" / "vm-deploy.sh").read_text()
DEPLOY_WORKFLOW = (REPO / ".github" / "workflows" / "deploy.yml").read_text()

# The functions are cut out of the script itself, so the test cannot drift from what runs on the VM.
QUOTE_FN = re.search(r"^q\(\) \{.*\}$", SCRIPT, re.M).group(0)
STORAGE_FN = SCRIPT.split("storage_env_lines() {", 1)[1].split("\n}\n", 1)[0]
HARNESS = "set -euo pipefail\n" + QUOTE_FN + "\nstorage_env_lines() {" + STORAGE_FN + "\n}\n"


def run(account=None):
    """Run storage_env_lines the way the script does: inside a group whose output goes to a file, then more lines follow."""
    env = {"PATH": "/usr/bin:/bin"}
    if account is not None:
        env["AZURE_STORAGE_ACCOUNT"] = account
    body = HARNESS + 'out="$(mktemp)"; { echo BEFORE; storage_env_lines; echo AFTER; } > "$out"; cat "$out"; rm -f "$out"\n'
    proc = subprocess.run(["bash", "-c", body], env=env, capture_output=True, text=True, timeout=30)
    return proc.returncode, proc.stdout.splitlines(), proc.stderr


class StorageEnvLines(unittest.TestCase):
    def test_variable_not_set_writes_nothing(self):
        rc, out, _ = run(None)
        self.assertEqual((rc, out), (0, ["BEFORE", "AFTER"]))

    def test_empty_variable_writes_nothing(self):
        rc, out, _ = run("")
        self.assertEqual((rc, out), (0, ["BEFORE", "AFTER"]))

    def test_valid_account_writes_exactly_three_lines(self):
        rc, out, _ = run("rsreportszg3cv5fg")
        self.assertEqual(rc, 0)
        self.assertEqual(
            out,
            ["BEFORE", "STORAGE_BACKEND=azure", "AZURE_STORAGE_ACCOUNT='rsreportszg3cv5fg'", "AZURE_STORAGE_CONTAINER=reports", "AFTER"],
        )

    def test_boundary_lengths_are_accepted(self):
        for name in ("abc", "a" * 24, "a1b2c3"):
            with self.subTest(name=name):
                self.assertEqual(run(name)[0], 0)

    def test_invalid_names_stop_the_release_before_anything_after_is_written(self):
        bad = ["ab", "a" * 25, "UPPERCASE1", "has-dash", "has space", "under_score", "dot.dot", "quote'quote", "$(id)", "a;b", "é" * 4]
        for name in bad:
            with self.subTest(name=name):
                rc, out, err = run(name)
                self.assertEqual(rc, 2)
                self.assertNotIn("AFTER", out)
                self.assertNotIn("STORAGE_BACKEND=azure", out)
                self.assertIn("not a valid storage account name", err)

    def test_values_are_single_quoted_so_compose_does_not_expand_them(self):
        _, out, _ = run("abc123")
        self.assertIn("AZURE_STORAGE_ACCOUNT='abc123'", out)


class Wiring(unittest.TestCase):
    def test_function_is_called_inside_the_env_block_before_the_optional_image_tag(self):
        block = SCRIPT.split('} > "$env_tmp"', 1)[0]
        self.assertIn("\n  storage_env_lines\n", block)
        self.assertLess(block.index("storage_env_lines\n"), block.index('echo "IMAGE_TAG='))

    def test_storage_lines_come_from_the_function_only(self):
        self.assertEqual(SCRIPT.count('echo "STORAGE_BACKEND=azure"'), 1)

    def test_no_account_key_or_connection_string_anywhere(self):
        for text in (SCRIPT, DEPLOY_WORKFLOW):
            self.assertNotRegex(text, r"(?i)STORAGE_ACCOUNT_KEY|connection[_-]?string|AccountKey")

    def test_workflow_reads_the_variable_and_passes_it_to_the_script(self):
        self.assertIn("AZURE_STORAGE_ACCOUNT: ${{ vars.AZURE_STORAGE_ACCOUNT }}", DEPLOY_WORKFLOW)
        loop = re.search(r"for v in RELEASE_SHA[^;]*; do", DEPLOY_WORKFLOW, re.S).group(0)
        self.assertIn("AZURE_STORAGE_ACCOUNT", loop)

    def test_variable_is_optional_in_the_script(self):
        need_line = re.search(r"^need KEY_VAULT_NAME.*$", SCRIPT, re.M).group(0)
        self.assertNotIn("AZURE_STORAGE_ACCOUNT", need_line)


if __name__ == "__main__":
    unittest.main()
