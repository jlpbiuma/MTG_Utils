import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[3]
STEPS = [
    "00_check_remote", "01_prepare_env", "02_sync_code", "03_remote_build",
    "04_init_database", "09_migrate_database", "07_start_services", "08_verify_health",
]


class DeploymentFlowTests(unittest.TestCase):
    def run_deployment(self, failing_step=""):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "Makefile").write_text((ROOT / "Makefile").read_text())
            scripts = root / "scripts/deploy"
            scripts.mkdir(parents=True)
            for step in STEPS + ["05_migrate_catalog", "06_migrate_media"]:
                script = scripts / f"{step}.sh"
                script.write_text(
                    f'#!/bin/sh\necho {step} >> steps.log\n'
                    f'if [ "{step}" = "$FAILING_STEP" ]; then exit 1; fi\n'
                )
                script.chmod(0o755)
            result = subprocess.run(
                ["make", "-j8", "deploy-full"], cwd=root,
                env={**os.environ, "FAILING_STEP": failing_step},
                capture_output=True, text=True,
            )
            return result, (root / "steps.log").read_text().splitlines()

    def test_full_deploy_runs_migrations_in_order_without_catalog_or_media_import(self):
        result, steps = self.run_deployment()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(steps, STEPS)

    def test_migration_failure_stops_before_starting_services(self):
        result, steps = self.run_deployment("09_migrate_database")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(steps, STEPS[:6])

    def test_backend_start_only_runs_api(self):
        dockerfile = (ROOT / "backend/Dockerfile").read_text()
        command = next(line[4:] for line in dockerfile.splitlines() if line.startswith("CMD "))
        self.assertEqual(json.loads(command)[:5], ["uv", "run", "uvicorn", "src.main:app", "--host"])

    def test_migration_error_has_no_destructive_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            ssh = root / "ssh"
            ssh.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$SSH_LOG"\nexit 1\n')
            ssh.chmod(0o755)
            log = root / "ssh.log"
            result = subprocess.run(
                ["bash", str(ROOT / "scripts/deploy/09_migrate_database.sh")],
                env={**os.environ, "PATH": f"{root}:{os.environ['PATH']}", "SSH_LOG": str(log)},
                capture_output=True, text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            commands = log.read_text().splitlines()
            self.assertEqual(len(commands), 1)
            self.assertIn("prisma migrate deploy", commands[0])
            for forbidden in ("db push", "reset", "TRUNCATE", "sync-catalog"):
                self.assertNotIn(forbidden, commands[0])


if __name__ == "__main__":
    unittest.main()
