import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[3]


class BaselineTests(unittest.TestCase):
    def run_baseline(self, diff_exit):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            uv = root / "uv"
            uv.write_text(
                '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALL_LOG"\n'
                'if [ "$4" = "diff" ]; then exit "$DIFF_EXIT"; fi\n'
            )
            uv.chmod(0o755)
            log = root / "calls"
            result = subprocess.run(
                ["sh", str(ROOT / "backend/prisma/baseline.sh")],
                env={**os.environ, "PATH": f"{root}:{os.environ['PATH']}",
                     "CALL_LOG": str(log), "DIFF_EXIT": str(diff_exit)},
                capture_output=True, text=True,
            )
            return result.returncode, log.read_text().splitlines()

    def test_matching_schema_only_updates_migration_ledger(self):
        code, calls = self.run_baseline(0)
        self.assertEqual(code, 0)
        self.assertEqual(len(calls), 2)
        self.assertIn("--to-schema-datamodel prisma/migrations/0_init/schema.prisma", calls[0])
        self.assertEqual(calls[1], "run prisma migrate resolve --applied 0_init")

    def test_drift_and_connection_errors_never_mark_migration_applied(self):
        for status in (1, 2):
            with self.subTest(status=status):
                code, calls = self.run_baseline(status)
                self.assertEqual(code, status)
                self.assertEqual(len(calls), 1)

    def test_only_complete_baseline_is_active(self):
        migrations = ROOT / "backend/prisma/migrations"
        self.assertEqual([p.name for p in migrations.iterdir() if p.is_dir()], ["0_init"])
        sql = (migrations / "0_init/migration.sql").read_text()
        self.assertEqual(sql.count("CREATE TABLE"), 26)
        for table in ("scryfall_bulk_cards", "scryfall_bulk_state", "user_wants", "cm_price_history"):
            self.assertIn(f'CREATE TABLE "{table}"', sql)
        for forbidden in ("TRUNCATE", "DROP TABLE", "DELETE FROM"):
            self.assertNotIn(forbidden, sql.upper())


if __name__ == "__main__":
    unittest.main()
