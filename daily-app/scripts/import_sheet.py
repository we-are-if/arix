from __future__ import annotations

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import OrderedDict
from datetime import date, timedelta
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

SOURCE = Path(__file__).resolve().parents[1] / "data" / "arix-daily-source.xlsx"
TARGET = Path(__file__).resolve().parents[1] / "src" / "importedData.ts"
WEEK_SHEETS = ["I Həftə", "II Həftə", "III Həftə", "IV Həftə", "V Həftə", "VI Həftə"]
DAY_STARTS = [2, 94, 186, 278, 370, 462, 554]

EXCEL_EPOCH = date(1899, 12, 30)


def excel_date(val: object) -> str | None:
    try:
        serial = int(float(str(val)))
        if 40000 <= serial <= 60000:
            return (EXCEL_EPOCH + timedelta(days=serial)).isoformat()
    except Exception:
        pass
    return None


def number(val: object) -> float:
    try:
        return round(float(str(val)), 2)
    except Exception:
        return 0.0


def clean(val: object) -> str:
    return str(val or "").strip()


def account_id(index: int) -> str:
    return f"sheet-account-{index + 1:02d}"


with zipfile.ZipFile(SOURCE) as z:
    ns = {
        "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
        "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    }
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    rel_map = {r.attrib["Id"]: r.attrib["Target"] for r in rels}
    ss = ET.fromstring(z.read("xl/sharedStrings.xml"))
    shared_strings = ["".join(t.text or "" for t in si.findall(".//main:t", ns)) for si in ss.findall("main:si", ns)]

    sheet_targets = {}
    for s in wb.findall(".//main:sheet", ns):
        name = s.attrib["name"]
        rid = s.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
        sheet_targets[name] = "xl/" + rel_map[rid].lstrip("/")

    def load_sheet(name: str) -> dict[int, dict[str, str]]:
        xml_data = ET.fromstring(z.read(sheet_targets[name]))
        rows_data: dict[int, dict[str, str]] = {}
        for row in xml_data.findall(".//main:row", ns):
            r_num = int(row.attrib["r"])
            row_vals: dict[str, str] = {}
            for c in row.findall("main:c", ns):
                ref = c.attrib["r"]
                col_letters = re.match(r"([A-Z]+)", ref).group(1)
                c_type = c.attrib.get("t")
                v_el = c.find("main:v", ns)
                is_el = c.find("main:is", ns)
                val = None
                if c_type == "s" and v_el is not None and v_el.text is not None:
                    val = shared_strings[int(v_el.text)]
                elif c_type == "inlineStr" and is_el is not None:
                    val = "".join(t.text or "" for t in is_el.findall(".//main:t", ns))
                elif v_el is not None and v_el.text is not None:
                    val = v_el.text
                if val is not None and str(val).strip() != "":
                    row_vals[col_letters] = str(val).strip()
            if row_vals:
                rows_data[r_num] = row_vals
        return rows_data

    entries: list[dict[str, object]] = []
    reconciliation: OrderedDict[str, list[list[object]]] = OrderedDict()
    day_metrics: OrderedDict[str, dict[str, object]] = OrderedDict()
    account_names: OrderedDict[str, None] = OrderedDict()
    categories: OrderedDict[str, None] = OrderedDict()
    people: OrderedDict[str, None] = OrderedDict()
    bank_codes: OrderedDict[str, None] = OrderedDict()

    method_names = {
        "OO": "Onlayn Ödəniş",
        "K/E": "Köçürmə (eyni bank)",
        "K/F": "Köçürmə (fərqli bank)",
        "Nd": "Nağdlaşdırma",
    }

    for sheet_name in WEEK_SHEETS:
        sheet = load_sheet(sheet_name)
        for base in DAY_STARTS:
            day = excel_date(sheet.get(base, {}).get("C"))
            if not day:
                continue

            rows: list[list[object]] = []
            for r in range(base + 3, base + 50):
                rv = sheet.get(r, {})
                name = clean(rv.get("O"))
                if not name or clean(rv.get("Q")) != "=":
                    continue
                received = number(rv.get("R"))
                previous = number(rv.get("T"))
                expense = abs(number(rv.get("V")))
                supplier = abs(number(rv.get("X")))
                rows.append([name, received, previous, expense, supplier])
                account_names[name] = None
                people[name] = None
            reconciliation[day] = rows

            # Daily bottom summary box (Kassa / Kart TÖ / Cloudshop / Qeydlər)
            r_metrics = sheet.get(base + 53, {})
            kassa_check = number(r_metrics.get("N"))
            kart_to_check = number(r_metrics.get("R"))
            cloudshop_check = number(r_metrics.get("V"))
            notes_list = []
            for nr in range(base + 55, base + 65):
                nrv = sheet.get(nr, {})
                for col_k in ("N", "O", "P", "Q", "R", "S", "T", "U", "V"):
                    txt = clean(nrv.get(col_k))
                    if txt and txt not in ("0", "Qeydlər"):
                        notes_list.append(txt)
            day_metrics[day] = {
                "kassa": kassa_check,
                "kartTo": kart_to_check,
                "cloudshop": cloudshop_check,
                "note": " · ".join(notes_list),
            }

            # All operations in the 92-row day block (base+3 .. base+91)
            sequence = 0
            for r in range(base + 3, base + 92):
                rv = sheet.get(r, {})
                amount = number(rv.get("C"))
                entry_type = clean(rv.get("E"))
                if amount == 0 or entry_type not in {"Mədaxil", "Məxaric"}:
                    continue
                sequence += 1
                category = clean(rv.get("F")) or ("Vəsait qəbulu" if entry_type == "Mədaxil" else "Digər xərc")
                counterparty = clean(rv.get("G")) or "Qeyd edilməyib"
                responsible = clean(rv.get("H")) or "Eşqin"
                bank_code = clean(rv.get("I"))
                method_code = clean(rv.get("J"))
                note = clean(rv.get("K"))
                method_label = method_names.get(method_code, method_code)
                if method_label and method_label not in note:
                    full_note = f"{method_label} · {note}" if note else method_label
                else:
                    full_note = note
                categories[category] = None
                people[responsible] = None
                if bank_code:
                    bank_codes[bank_code] = None
                invoiced_flag = clean(rv.get("A")).upper() in {"1", "TRUE"}
                entries.append({
                    "id": f"sheet-{day}-{sequence:02d}",
                    "date": day,
                    "time": "",
                    "kind": "income" if entry_type == "Mədaxil" else "expense",
                    "title": entry_type,
                    "counterparty": counterparty,
                    "category": category,
                    "amount": amount,
                    "invoiced": invoiced_flag,
                    "responsibleName": responsible,
                    "bankCode": bank_code,
                    "method": method_label,
                    "note": full_note,
                })

    all_accounts = list(account_names.keys())
    for person in people.keys():
        if person not in account_names:
            all_accounts.append(person)
    account_ids = {name: account_id(index) for index, name in enumerate(all_accounts)}

    first_snapshot = next(iter(reconciliation.values()), [])
    opening_by_name = {str(row[0]): number(row[2]) for row in first_snapshot}
    accounts = [
        {
            "id": account_ids[name],
            "name": name,
            "type": "card" if name.lower().startswith("kart") else "cash",
            "currency": "AZN",
            "opening": opening_by_name.get(name, 0),
        }
        for name in all_accounts
    ]

    bank_names = {
        "U": "Unibank",
        "R": "Rabitəbank",
        "L": "Leobank",
        "K": "Kapital Bank",
        "B": "ABB",
        "A": "ATB",
        "M": "M10",
    }

    for entry in entries:
        responsible = str(entry.pop("responsibleName"))
        code = str(entry.pop("bankCode"))
        entry["accountId"] = account_ids.get(responsible, accounts[0]["id"])
        entry["responsible"] = responsible
        entry["bank"] = bank_names.get(code, code)

    # Parse Kart Hesabat (7 bank tables)
    kh = load_sheet("Kart Hesabat")
    card_bank_sections = [
        ("Unibank", "U", 3, 9, 50),
        ("Rabitəbank", "R", 53, 59, 100),
        ("Leobank", "L", 103, 109, 150),
        ("Kapital Bank", "K", 153, 159, 200),
        ("ATB", "A", 203, 209, 250),
        ("ABB", "B", 253, 259, 300),
        ("M10", "M", 303, 309, 350),
    ]
    card_report = []
    for bank_title, bank_code, total_row, start_row, end_row in card_bank_sections:
        bank_total = number(kh.get(total_row, {}).get("H"))
        rows_list = []
        for r in range(start_row, end_row + 1):
            rv = kh.get(r, {})
            person = clean(rv.get("B"))
            if not person or person.lower().startswith("kart x"):
                continue
            opening = number(rv.get("C"))
            income = number(rv.get("D"))
            online = number(rv.get("E"))
            same_bank = number(rv.get("F"))
            diff_bank = number(rv.get("G"))
            cash_out = number(rv.get("H"))
            balance = number(rv.get("I"))
            status = clean(rv.get("J"))
            limit_rem = number(rv.get("K"))
            rows_list.append({
                "person": person,
                "opening": opening,
                "income": income,
                "onlinePayment": online,
                "sameBankTransfer": same_bank,
                "diffBankTransfer": diff_bank,
                "cashOut": cash_out,
                "balance": balance,
                "status": status,
                "limitRemaining": limit_rem,
            })
        card_report.append({
            "bank": bank_title,
            "code": bank_code,
            "totalBalance": bank_total,
            "rows": rows_list,
        })

    # Parse Qrafik Hesabat (Weekly charts I..V Həftə)
    qh = load_sheet("Qrafik Hesabat")
    week_blocks = [
        ("I Həftə", 7, 13),
        ("II Həftə", 29, 35),
        ("III Həftə", 52, 58),
        ("IV Həftə", 75, 81),
        ("V Həftə", 98, 104),
    ]
    weekly_charts = []
    for w_title, s_row, e_row in week_blocks:
        days_list = []
        for r in range(s_row, e_row + 1):
            rv = qh.get(r, {})
            d_iso = excel_date(rv.get("B"))
            if not d_iso:
                continue
            days_list.append({
                "date": d_iso,
                "collection": number(rv.get("C")),
                "expense": number(rv.get("I")),
                "supplierPayment": number(rv.get("O")),
            })
        weekly_charts.append({
            "week": w_title,
            "days": days_list,
        })

    # Parse Baza & Cədvəl Hesabat
    baza = load_sheet("Baza")
    customers_list = []
    cards_activity = []
    daily_supplier = []
    category_summary = []
    bank_summary = []

    for r in range(2, 302):
        rv = baza.get(r, {})
        # Customers
        c_name = clean(rv.get("O")) or clean(rv.get("H"))
        if c_name and c_name != "m":
            paid = number(rv.get("P"))
            invoiced = number(rv.get("Q"))
            customers_list.append({
                "name": c_name,
                "paid": paid,
                "invoiced": invoiced,
            })
        # Card activity
        card_holder = clean(rv.get("R"))
        if card_holder and not card_holder.lower().startswith("kart x"):
            cards_activity.append({
                "person": card_holder,
                "amount": number(rv.get("S")),
            })
        # Daily supplier payments
        sup_day = excel_date(rv.get("U"))
        if sup_day:
            daily_supplier.append({
                "date": sup_day,
                "amount": abs(number(rv.get("V"))),
            })
        # Category summary
        cat_name = clean(rv.get("X"))
        if cat_name:
            category_summary.append({
                "category": cat_name,
                "amount": number(rv.get("Y")),
            })
        # Bank summary
        b_name = clean(rv.get("AA"))
        if b_name:
            bank_summary.append({
                "bank": b_name,
                "amount": number(rv.get("AB")),
            })

    # Deduplicate daily_supplier by date preserving order
    seen_sup_dates = set()
    dedup_daily_supplier = []
    for item in daily_supplier:
        if item["date"] not in seen_sup_dates:
            seen_sup_dates.add(item["date"])
            dedup_daily_supplier.append(item)

    # Also extract customer initial debts (Borc) and past month uninvoiced (Baza!F) from qaime-musteri-borcu.xlsx
    qaime_source = Path(__file__).resolve().parents[1] / "data" / "qaime-musteri-borcu.xlsx"
    customer_debts: OrderedDict[str, float] = OrderedDict()
    past_month_uninvoiced: OrderedDict[str, float] = OrderedDict()
    if qaime_source.exists():
        with zipfile.ZipFile(qaime_source) as qz:
            qwb = ET.fromstring(qz.read("xl/workbook.xml"))
            qrels = ET.fromstring(qz.read("xl/_rels/workbook.xml.rels"))
            qrel_map = {r.attrib["Id"]: r.attrib["Target"] for r in qrels}
            qss = ET.fromstring(qz.read("xl/sharedStrings.xml"))
            q_strings = ["".join(t.text or "" for t in si.findall(".//main:t", ns)) for si in qss.findall("main:si", ns)]
            q_targets = {}
            for s in qwb.findall(".//main:sheet", ns):
                sname = s.attrib["name"]
                srid = s.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
                q_targets[sname] = "xl/" + qrel_map[srid].lstrip("/")

            def load_qsheet(name: str) -> dict[int, dict[str, str]]:
                if name not in q_targets:
                    return {}
                xml_d = ET.fromstring(qz.read(q_targets[name]))
                r_data: dict[int, dict[str, str]] = {}
                for row in xml_d.findall(".//main:row", ns):
                    r_num = int(row.attrib["r"])
                    r_vals: dict[str, str] = {}
                    for c in row.findall("main:c", ns):
                        ref = c.attrib["r"]
                        col_letters = re.match(r"([A-Z]+)", ref).group(1)
                        c_type = c.attrib.get("t")
                        v_el = c.find("main:v", ns)
                        val = None
                        if c_type == "s" and v_el is not None and v_el.text is not None:
                            val = q_strings[int(v_el.text)]
                        elif v_el is not None and v_el.text is not None:
                            val = v_el.text
                        if val is not None and str(val).strip() != "":
                            r_vals[col_letters] = str(val).strip()
                    if r_vals:
                        r_data[r_num] = r_vals
                return r_data

            borc_sheet = load_qsheet("Borc")
            for r_idx, row in sorted(borc_sheet.items()):
                if r_idx < 3:
                    continue
                for n_col, v_col in [("B", "C"), ("E", "F"), ("H", "I"), ("K", "L")]:
                    nm = clean(row.get(n_col))
                    v_raw = clean(row.get(v_col))
                    if nm and nm != "Ad" and v_raw != "":
                        customer_debts[nm] = number(v_raw)

            qbaza_sheet = load_qsheet("Baza")
            for r_idx, row in sorted(qbaza_sheet.items()):
                if r_idx < 2:
                    continue
                nm = clean(row.get("B"))
                f_val = number(row.get("F"))
                if nm and nm != "m" and f_val != 0:
                    past_month_uninvoiced[nm] = f_val

    payloads = {
        "IMPORTED_ACCOUNTS": accounts,
        "IMPORTED_ENTRIES": entries,
        "IMPORTED_RECONCILIATION": reconciliation,
        "IMPORTED_DAY_METRICS": day_metrics,
        "IMPORTED_CATEGORIES": list(categories.keys()),
        "IMPORTED_PEOPLE": list(people.keys()),
        "IMPORTED_BANKS": [bank_names.get(code, code) for code in bank_codes.keys()],
        "IMPORTED_CARD_REPORT": card_report,
        "IMPORTED_WEEKLY_CHARTS": weekly_charts,
        "IMPORTED_CUSTOMERS": customers_list,
        "IMPORTED_PIVOT_REPORTS": {
            "byCategory": category_summary,
            "byBank": bank_summary,
            "byCard": cards_activity,
            "dailySupplierPayments": dedup_daily_supplier,
        },
        "IMPORTED_CUSTOMER_DEBTS": customer_debts,
        "IMPORTED_PAST_MONTH_UNINVOICED": past_month_uninvoiced,
    }

    parts = ["// Generated from the linked Google Sheet. Do not edit by hand.\n"]
    for name, payload in payloads.items():
        parts.append(f"export const {name} = {json.dumps(payload, ensure_ascii=False, separators=(',', ':'))} as const;\n")
    TARGET.write_text("".join(parts), encoding="utf-8")
    print(json.dumps({
        "entries": len(entries),
        "days": len(reconciliation),
        "accounts": len(accounts),
        "categories": len(categories),
        "people": len(people),
        "banks": len(bank_codes),
        "cardReportBanks": len(card_report),
        "weeklyCharts": len(weekly_charts),
        "customers": len(customers_list),
        "target": str(TARGET),
    }, ensure_ascii=False, indent=2))
