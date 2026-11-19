"""Merge the reviewed Baza directory into the stopped SpareXpert store."""
import argparse
import json
import re
import sqlite3
import unicodedata
from datetime import datetime, timezone
from pathlib import Path


def key(value):
    normalized = unicodedata.normalize("NFC", value.replace("İ", "i").lower().replace("ı", "i"))
    result = re.sub(r"[^\w]", "", normalized)
    return "90sv858" if result == "90sv858suzuki" else result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("payload", type=Path)
    parser.add_argument("--apply-offline", action="store_true")
    args = parser.parse_args()
    directory = args.directory.resolve(strict=True)
    dbpath = directory / "sparexpert.sqlite"
    if dbpath.resolve(strict=True) != dbpath:
        raise SystemExit("Unexpected database path")
    groups = json.loads(args.payload.read_text(encoding="utf-8"))
    assert {k: len(v) for k, v in groups.items()} == {
        "customers": 1228, "suppliers": 179, "employees": 45, "investors": 4,
    }
    names = [name for group in groups.values() for name in group]
    assert len(set(map(key, names))) == len(names)
    mode = "rw" if args.apply_offline else "ro"
    with sqlite3.connect(dbpath.as_uri() + "?mode=" + mode, uri=True) as db:
        if args.apply_offline:
            db.execute("BEGIN IMMEDIATE")
        raw, revision = db.execute("SELECT data,revision FROM app_state WHERE id=1").fetchone()
        data = json.loads(raw)
        snapshot = data["snapshot"]
        if snapshot.get("invoices") or not any(
            e.get("id", "").startswith("sx-") for e in snapshot["state"]["entries"]
        ):
            raise SystemExit("SpareXpert ledger identity check failed")
        before = snapshot["customerList"]
        existing = {key(n) for n in before}
        additions = [n for n in names if key(n) not in existing]
        print(f"SpareXpert: {len(before)} existing contacts, {len(additions)} to add")
        if not args.apply_offline or not additions:
            return
        now = datetime.now(timezone.utc)
        backups = directory / "backups"
        backups.mkdir(exist_ok=True)
        path = backups / f"sparexpert-before-baza-{now:%Y%m%d-%H%M%S-%f}.sqlite"
        with sqlite3.connect(dbpath.as_uri() + "?mode=ro", uri=True) as source, sqlite3.connect(path) as backup:
            source.backup(backup)
            assert backup.execute("PRAGMA integrity_check").fetchone() == ("ok",)
            assert backup.execute("SELECT revision FROM app_state WHERE id=1").fetchone() == (revision,)
        snapshot["customerList"] = before + additions
        data["snapshotRevision"] += 1
        data["updatedAt"] = now.isoformat()
        data["updatedBy"] = "SpareXpert Baza import"
        db.execute("UPDATE app_state SET data=?,revision=?,updated_at=? WHERE id=1",
                   (json.dumps(data, ensure_ascii=False), revision + 1, now.isoformat()))
        saved = json.loads(db.execute("SELECT data FROM app_state WHERE id=1").fetchone()[0])
        assert saved["snapshot"]["state"] == snapshot["state"]
        assert set(map(key, names)) <= set(map(key, saved["snapshot"]["customerList"]))
        print(f"Imported {len(additions)} contacts. Backup: {path}")


if __name__ == "__main__":
    main()
