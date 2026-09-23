import importlib.util
import io
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


DEPLOY = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("normalizer", DEPLOY / "normalize_catalog_dump.py")
normalizer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(normalizer)


class CatalogMigrationTests(unittest.TestCase):
    def normalize(self, dump):
        output = io.StringIO()
        normalizer.normalize(io.StringIO(dump), output)
        return output.getvalue()

    def test_removes_legacy_values_preserving_copy_escapes_and_nulls(self):
        dump = (
            "COPY public.card_printings (id, price_cardtrader_max, image_uri, catalog_id) FROM stdin;\n"
            "abc\t99.5\tname\\twith\\nnewlines\t\\N\n\\.\n"
        )
        self.assertEqual(self.normalize(dump), (
            "COPY public.card_printings (id, image_uri, catalog_id) FROM stdin;\n"
            "abc\tname\\twith\\nnewlines\t\\N\n\\.\n"
        ))

    def test_current_schema_and_other_tables_are_unchanged(self):
        dump = "COPY public.card_price_history (id, provider) FROM stdin;\na\tcardmarket\n\\.\n"
        self.assertEqual(self.normalize(dump), dump)

    def test_catalog_legacy_prices_are_removed(self):
        dump = "COPY public.card_catalog (id, price_goldfish_min, prices_updated_at, name) FROM stdin;\na\t1\t2026-01-01\tForest\n\\.\n"
        self.assertIn("(id, name)", self.normalize(dump))
        self.assertIn("a\tForest\n", self.normalize(dump))

    def test_incomplete_or_malformed_copy_is_rejected(self):
        for row in ("a\n", "a\t1\n"):
            with self.assertRaises(ValueError):
                self.normalize("COPY public.card_printings (id, price_cardtrader_max) FROM stdin;\n" + row)

    def run_migration(self, failure):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "docker").write_text("""#!/usr/bin/env bash
if [[ "$1" == ps ]]; then
    echo mtg-utils-db
else
    printf 'COPY public.card_printings (id, price_cardtrader_max) FROM stdin;\na\t1\n\\\\.\n'
    exit "${DUMP_EXIT}"
fi
""")
            (root / "ssh").write_text("""#!/usr/bin/env bash
echo called >> "$TEST_DIR/ssh-calls"
if [[ "$*" == *gunzip* ]]; then
    gzip -dc > "$TEST_DIR/payload.sql"
fi
""")
            for name in ("docker", "ssh"):
                (root / name).chmod(0o755)
            result = subprocess.run(
                ["bash", str(DEPLOY / "05_migrate_catalog.sh")],
                env={**os.environ, "PATH": f"{root}:{os.environ['PATH']}",
                     "TEST_DIR": directory, "DUMP_EXIT": str(failure)},
                capture_output=True, text=True,
            )
            payload = root / "payload.sql"
            return result, (root / "ssh-calls").exists(), payload.read_text() if payload.exists() else ""

    def test_failed_dump_never_contacts_destination(self):
        result, contacted, _ = self.run_migration(1)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(contacted)

    def test_truncate_import_and_updates_share_transaction(self):
        result, contacted, payload = self.run_migration(0)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(contacted)
        self.assertTrue(payload.startswith("BEGIN;\nTRUNCATE TABLE"))
        self.assertTrue(payload.endswith("COMMIT;\n"))
        self.assertIn("COPY public.card_printings (id) FROM stdin;\na\n", payload)
        self.assertIn("SET search_path = public;", payload)
        self.assertIn("UPDATE card_printings", payload)
        self.assertNotIn("CASCADE", payload)
        self.assertNotIn("scryfall_bulk_cards", payload)
        self.assertNotIn("cm_price_history", payload)


if __name__ == "__main__":
    unittest.main()
