from __future__ import annotations

import argparse
import json
import re
import sqlite3
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any

from openpyxl import load_workbook


CARD_FIELDS = (
    "opening",
    "income",
    "onlinePayment",
    "sameBankTransfer",
    "diffBankTransfer",
    "cashOut",
    "balance",
    "status",
    "limitRemaining",
)


def round_money(value: Any) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def clean(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def name_key(value: Any) -> str:
    return unicodedata.normalize("NFKC", clean(value)).casefold()


def read_export(source: str, constant: str) -> Any:
    match = re.search(
        rf"export const {re.escape(constant)} = (.*?) as const;",
        source,
        flags=re.DOTALL,
    )
    if not match:
        raise RuntimeError(f"{constant} was not found in importedData.ts")
    return json.loads(match.group(1))


def parse_card_report(path: Path) -> list[dict[str, Any]]:
    workbook = load_workbook(path, read_only=True, data_only=True)
    sheet = workbook["Kart Hesabat"]
    sections = (
        ("Unibank", "U", 3, 9, 50),
        ("Rabitəbank", "R", 53, 59, 100),
        ("Leobank", "L", 103, 109, 150),
        ("Kapital Bank", "K", 153, 159, 200),
        ("ATB", "A", 203, 209, 250),
        ("ABB", "B", 253, 259, 300),
        ("M10", "M", 303, 309, 350),
    )
    report: list[dict[str, Any]] = []
    for bank, code, total_row, start_row, end_row in sections:
        rows: list[dict[str, Any]] = []
        for row_index in range(start_row, end_row + 1):
            person = clean(sheet.cell(row_index, 2).value)
            if not person or person.casefold().startswith("kart x"):
                continue
            rows.append(
                {
                    "person": person,
                    "opening": round_money(sheet.cell(row_index, 3).value),
                    "income": round_money(sheet.cell(row_index, 4).value),
                    "onlinePayment": round_money(sheet.cell(row_index, 5).value),
                    "sameBankTransfer": round_money(sheet.cell(row_index, 6).value),
                    "diffBankTransfer": round_money(sheet.cell(row_index, 7).value),
                    "cashOut": round_money(sheet.cell(row_index, 8).value),
                    "balance": round_money(sheet.cell(row_index, 9).value),
                    "status": clean(sheet.cell(row_index, 10).value),
                    "limitRemaining": round_money(sheet.cell(row_index, 11).value),
                }
            )
        report.append(
            {
                "bank": bank,
                "code": code,
                "totalBalance": round_money(sheet.cell(total_row, 8).value),
                "rows": rows,
            }
        )
    workbook.close()
    return report


def flatten_card_report(report: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    flattened: dict[str, dict[str, Any]] = {}
    for group in report:
        bank = clean(group.get("bank"))
        flattened[f"bank::{name_key(bank)}"] = {
            "label": bank,
            "totalBalance": round_money(group.get("totalBalance")),
        }
        for row in group.get("rows", []):
            person = clean(row.get("person"))
            flattened[f"row::{name_key(bank)}::{name_key(person)}"] = {
                "label": f"{bank} / {person}",
                **{field: row.get(field) for field in CARD_FIELDS},
            }
    return flattened


def compare_card_reports(
    expected: list[dict[str, Any]], actual: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    expected_rows = flatten_card_report(expected)
    actual_rows = flatten_card_report(actual)
    differences: list[dict[str, Any]] = []
    for key in sorted(set(expected_rows) | set(actual_rows)):
        left = expected_rows.get(key)
        right = actual_rows.get(key)
        if left is None or right is None:
            differences.append({"key": key, "sheet": left, "system": right})
            continue
        fields = set(left) | set(right)
        changed = {}
        for field in fields:
            if field == "label":
                continue
            left_value = left.get(field)
            right_value = right.get(field)
            if isinstance(left_value, (int, float)) or isinstance(right_value, (int, float)):
                equal = abs(round_money(left_value) - round_money(right_value)) < 0.005
            else:
                equal = clean(left_value) == clean(right_value)
            if not equal:
                changed[field] = {"sheet": left_value, "system": right_value}
        if changed:
            differences.append({"key": key, "label": left.get("label"), "fields": changed})
    return differences


def add_unique(
    target: dict[str, dict[str, Any]],
    duplicates: list[dict[str, Any]],
    name: Any,
    amount: Any,
    source: str,
) -> None:
    label = clean(name)
    if not label or label == "Ad" or label == "m":
        return
    key = name_key(label)
    value = round_money(amount)
    if key in target and abs(target[key]["amount"] - value) >= 0.005:
        duplicates.append(
            {
                "name": label,
                "first": target[key]["amount"],
                "next": value,
                "source": source,
            }
        )
    target[key] = {"name": label, "amount": value}


def parse_opening_workbook(path: Path) -> dict[str, Any]:
    workbook = load_workbook(path, read_only=False, data_only=True)
    debt_sheet = workbook["Borc"]
    debts: dict[str, dict[str, Any]] = {}
    debt_duplicates: list[dict[str, Any]] = []
    for row in range(3, debt_sheet.max_row + 1):
        for name_col, value_col in ((2, 3), (5, 6), (8, 9), (11, 12)):
            add_unique(
                debts,
                debt_duplicates,
                debt_sheet.cell(row, name_col).value,
                debt_sheet.cell(row, value_col).value,
                f"Borc!{debt_sheet.cell(row, name_col).coordinate}",
            )

    baza_sheet = workbook["Baza"]
    current_pending: dict[str, dict[str, Any]] = {}
    current_non_customer: dict[str, dict[str, Any]] = {}
    past_month: dict[str, dict[str, Any]] = {}
    pending_duplicates: list[dict[str, Any]] = []
    past_duplicates: list[dict[str, Any]] = []
    for row in range(2, baza_sheet.max_row + 1):
        customer = baza_sheet.cell(row, 2).value
        current_value = round_money(baza_sheet.cell(row, 5).value)
        past_value = round_money(baza_sheet.cell(row, 6).value)
        if current_value > 0.004:
            add_unique(
                current_pending,
                pending_duplicates,
                customer,
                current_value,
                f"Baza!E{row}",
            )
        elif current_value < -0.004:
            add_unique(
                current_non_customer,
                pending_duplicates,
                customer,
                current_value,
                f"Baza!E{row}",
            )
        if abs(past_value) >= 0.005:
            add_unique(
                past_month,
                past_duplicates,
                customer,
                past_value,
                f"Baza!F{row}",
            )
    workbook.close()
    return {
        "debts": debts,
        "debtDuplicates": debt_duplicates,
        "currentPending": current_pending,
        "currentNonCustomer": current_non_customer,
        "currentPendingDuplicates": pending_duplicates,
        "pastMonth": past_month,
        "pastMonthDuplicates": past_duplicates,
    }


def normalize_amount_map(values: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for label, value in values.items():
        result[name_key(label)] = {"name": clean(label), "amount": round_money(value)}
    return result


def compare_amount_maps(
    expected: dict[str, dict[str, Any]], actual: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    differences: list[dict[str, Any]] = []
    for key in sorted(set(expected) | set(actual)):
        left = expected.get(key)
        right = actual.get(key)
        left_amount = left["amount"] if left else None
        right_amount = right["amount"] if right else None
        if left is None or right is None or abs(round_money(left_amount) - round_money(right_amount)) >= 0.005:
            differences.append(
                {
                    "name": (left or right or {}).get("name", key),
                    "sheet": left_amount,
                    "system": right_amount,
                    "difference": round_money(round_money(right_amount) - round_money(left_amount)),
                }
            )
    return differences


def read_live_snapshot(path: Path) -> dict[str, Any]:
    connection = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
    try:
        row = connection.execute(
            "SELECT data, revision, updated_at FROM app_state WHERE id = 1"
        ).fetchone()
    finally:
        connection.close()
    if row is None:
        raise RuntimeError("Daily app_state row is missing")
    state = json.loads(row[0])
    return {
        "dbRevision": row[1],
        "updatedAt": row[2],
        "state": state,
        "snapshot": state.get("snapshot") or {},
    }


def pending_entry_totals(entries: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    totals: dict[str, float] = defaultdict(float)
    labels: dict[str, str] = {}
    for entry in entries:
        if not str(entry.get("date") or "").startswith("2026-10-"):
            continue
        if entry.get("kind") != "income" or entry.get("invoiced") is True:
            continue
        customer = clean(entry.get("counterparty"))
        if not customer or customer == "Qeyd edilməyib":
            continue
        key = name_key(customer)
        labels.setdefault(key, customer)
        totals[key] += abs(round_money(entry.get("amount")))
    return {
        key: {"name": labels[key], "amount": round_money(value)}
        for key, value in totals.items()
        if abs(value) >= 0.005
    }


def summarize_amount_map(values: dict[str, dict[str, Any]]) -> dict[str, Any]:
    return {
        "count": len(values),
        "sum": round_money(sum(item["amount"] for item in values.values())),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--october-xlsx", type=Path, required=True)
    parser.add_argument("--opening-xlsx", type=Path, required=True)
    parser.add_argument("--imported-data", type=Path, required=True)
    parser.add_argument("--live-sqlite", type=Path, required=True)
    parser.add_argument("--json-out", type=Path)
    args = parser.parse_args()

    imported_source = args.imported_data.read_text(encoding="utf-8")
    imported_card = read_export(imported_source, "IMPORTED_CARD_REPORT")
    imported_debts = normalize_amount_map(
        read_export(imported_source, "IMPORTED_CUSTOMER_DEBTS")
    )
    imported_past = normalize_amount_map(
        read_export(imported_source, "IMPORTED_PAST_MONTH_UNINVOICED")
    )

    october_card = parse_card_report(args.october_xlsx)
    opening = parse_opening_workbook(args.opening_xlsx)
    live = read_live_snapshot(args.live_sqlite)
    snapshot = live["snapshot"]
    live_debts = normalize_amount_map(snapshot.get("customerDebts") or {})
    live_past = normalize_amount_map(snapshot.get("pastMonthUninvoiced") or {})
    live_pending = pending_entry_totals((snapshot.get("state") or {}).get("entries") or [])

    card_differences = compare_card_reports(october_card, imported_card)
    imported_debt_differences = compare_amount_maps(opening["debts"], imported_debts)
    live_debt_differences = compare_amount_maps(opening["debts"], live_debts)
    pending_differences = compare_amount_maps(opening["currentPending"], live_pending)
    past_differences = compare_amount_maps(opening["pastMonth"], live_past)

    invoices = snapshot.get("invoices") or []
    entries = (snapshot.get("state") or {}).get("entries") or []
    result = {
        "source": {
            "octoberXlsx": str(args.october_xlsx),
            "openingXlsx": str(args.opening_xlsx),
            "liveSqlite": str(args.live_sqlite),
        },
        "live": {
            "dbRevision": live["dbRevision"],
            "updatedAt": live["updatedAt"],
            "snapshotRevision": live["state"].get("snapshotRevision"),
            "entries": len(entries),
            "invoices": len(invoices),
            "activeInvoices": sum(1 for invoice in invoices if invoice.get("status") == "active"),
        },
        "cardReport": {
            "banks": len(october_card),
            "rows": sum(len(group["rows"]) for group in october_card),
            "differences": card_differences,
            "matches": len(card_differences) == 0,
        },
        "openingDebt": {
            "sheet": summarize_amount_map(opening["debts"]),
            "imported": summarize_amount_map(imported_debts),
            "live": summarize_amount_map(live_debts),
            "sheetDuplicates": opening["debtDuplicates"],
            "importedDifferences": imported_debt_differences,
            "liveDifferences": live_debt_differences,
        },
        "currentMonthPending": {
            "sheet": summarize_amount_map(opening["currentPending"]),
            "liveEntries": summarize_amount_map(live_pending),
            "sheetDuplicates": opening["currentPendingDuplicates"],
            "differences": pending_differences,
        },
        "currentMonthNonCustomer": summarize_amount_map(opening["currentNonCustomer"]),
        "pastMonth": {
            "sheet": summarize_amount_map(opening["pastMonth"]),
            "imported": summarize_amount_map(imported_past),
            "live": summarize_amount_map(live_past),
            "sheetDuplicates": opening["pastMonthDuplicates"],
            "liveDifferences": past_differences,
        },
        "readiness": {
            "cardReportMatchesOctober": len(card_differences) == 0,
            "openingDebtsMatchSource": len(live_debt_differences) == 0,
            "currentMonthPaymentsMatchSource": len(pending_differences) == 0,
            "oldPastMonthBalancesCleared": len(live_past) == 0,
            "noActiveInvoicesDuringCutover": not any(
                invoice.get("status") == "active" for invoice in invoices
            ),
        },
    }
    result["readiness"]["ready"] = all(result["readiness"].values())

    payload = json.dumps(result, ensure_ascii=False, indent=2)
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(payload + "\n", encoding="utf-8")
    print(payload)


if __name__ == "__main__":
    main()
