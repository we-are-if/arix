"""Import the reviewed November ledger into a stopped SpareXpert SQLite store."""

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="Directory containing sparexpert.sqlite")
    parser.add_argument("payload", type=Path)
    parser.add_argument("--apply-offline", action="store_true",
                        help="Write only while the API holding this store is stopped")
    args = parser.parse_args()
    directory = args.directory.resolve(strict=True)
    path = (directory / "sparexpert.sqlite").resolve(strict=True)
    if path != directory / "sparexpert.sqlite":
        raise SystemExit("Refusing a redirected database path")

    entries = json.loads(args.payload.read_text(encoding="utf-8"))["state"]["entries"]
    expected = {"2026-11-02": 28, "2026-11-03": 30, "2026-11-04": 24,
                "2026-11-05": 45, "2026-11-06": 22}
    counts = {}
    for entry in entries:
        counts[entry["date"]] = counts.get(entry["date"], 0) + 1
    by_id = {entry["id"]: entry for entry in entries}
    if counts != expected or len(by_id) != len(entries):
        raise SystemExit("Payload does not match the reviewed November batch")

    mode = "rw" if args.apply_offline else "ro"
    with sqlite3.connect(path.as_uri() + "?mode=" + mode, uri=True) as db:
        if args.apply_offline:
            db.execute("BEGIN IMMEDIATE")
        raw, revision = db.execute("SELECT data, revision FROM app_state WHERE id=1").fetchone()
        data = json.loads(raw)
        snapshot = data["snapshot"]
        if snapshot.get("invoices"):
            raise SystemExit("Unexpected invoices; verify the company before importing")
        current = snapshot["state"]["entries"]
        current_by_id = {entry["id"]: entry for entry in current}
        conflicts = [key for key, entry in by_id.items()
                     if key in current_by_id and current_by_id[key] != entry]
        if conflicts:
            raise SystemExit(f"Refusing to overwrite {len(conflicts)} existing operations")
        new = [entry for key, entry in by_id.items() if key not in current_by_id]
        print(f"SpareXpert: {len(current)} existing, {len(new)} to add, {len(entries) - len(new)} already imported")
        if not args.apply_offline or not new:
            return

        now = datetime.now(timezone.utc)
        backup_dir = directory / "backups"
        backup_dir.mkdir(mode=0o700, exist_ok=True)
        backup_path = backup_dir / f"sparexpert-before-november-{now:%Y%m%d-%H%M%S-%f}.sqlite"
        # The separate read connection snapshots the committed state while the write lock excludes changes.
        with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True) as source, sqlite3.connect(backup_path) as backup:
            source.backup(backup)
            if backup.execute("PRAGMA integrity_check").fetchone() != ("ok",):
                raise RuntimeError("Backup failed its integrity check")
            if backup.execute("SELECT revision FROM app_state WHERE id=1").fetchone() != (revision,):
                raise RuntimeError("Backup revision mismatch")

        current.extend(new)
        data["snapshotRevision"] = int(data["snapshotRevision"]) + 1
        data["updatedAt"] = now.isoformat()
        data["updatedBy"] = "SpareXpert November import"
        db.execute("UPDATE app_state SET data=?, revision=?, updated_at=? WHERE id=1",
                   (json.dumps(data, ensure_ascii=False), revision + 1, now.isoformat()))
        saved = json.loads(db.execute("SELECT data FROM app_state WHERE id=1").fetchone()[0])
        saved_by_id = {entry["id"]: entry for entry in saved["snapshot"]["state"]["entries"]}
        if any(saved_by_id.get(key) != entry for key, entry in by_id.items()):
            raise RuntimeError("Verification failed; transaction rolled back")
        print(f"Imported and verified {len(new)} operations. Backup: {backup_path}")


if __name__ == "__main__":
    main()
