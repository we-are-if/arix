import sys, zipfile, json, re
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

EXCEL_EPOCH = date(1899, 12, 30)
def excel_date(val):
    try:
        serial = int(float(str(val)))
        if 40000 <= serial <= 60000:
            return (EXCEL_EPOCH + timedelta(days=serial)).isoformat()
    except Exception:
        pass
    return None

def clean(val):
    return str(val or '').strip()

def number(val):
    try:
        return round(float(str(val)), 2)
    except Exception:
        return 0.0

account_lookup = {
    'N.Elgiz': {'person': 'Elgiz', 'channel': 'Kassa', 'type': 'cash'},
    'N.Kənan': {'person': 'Kənan', 'channel': 'Kassa', 'type': 'cash'},
    'N.Ceyhun': {'person': 'Ceyhun', 'channel': 'Kassa', 'type': 'cash'},
    'N.Fuad': {'person': 'Fuad', 'channel': 'Kassa', 'type': 'cash'},
    'H.Spare': {'person': 'Spare', 'channel': 'Kapital Bank', 'type': 'bank'},
    'H.ƏDV': {'person': 'Spare', 'channel': 'Kapital Bank', 'type': 'bank'},
    'H.Simran': {'person': 'Simran', 'channel': 'Kapital Bank', 'type': 'bank'},
    'H.SimƏDV': {'person': 'Simran', 'channel': 'Kapital Bank', 'type': 'bank'},
    'H.Ceyhun': {'person': 'Ceyhun', 'channel': 'Kapital Bank', 'type': 'bank'},
    'H.SpareRB': {'person': 'Spare', 'channel': 'Rabitə Bank', 'type': 'bank'},
    'H.SimZiraat': {'person': 'Simran', 'channel': 'Ziraat Bank', 'type': 'bank'},
    'BK.Simran': {'person': 'Simran', 'channel': 'Biznes Kart', 'type': 'card'},
    'K.Elgiz': {'person': 'Elgiz', 'channel': 'Kapital Bank', 'type': 'card'},
    'K.Ceyhun': {'person': 'Ceyhun', 'channel': 'Kapital Bank', 'type': 'card'},
    'K.Kənan': {'person': 'Kənan', 'channel': 'Kapital Bank', 'type': 'card'},
    'K.Simran': {'person': 'Simran', 'channel': 'Kapital Bank', 'type': 'card'},
    'KX3': {'person': 'Elgiz', 'channel': 'Kapital Bank', 'type': 'card'},
}

def extract_entries():
    files = [
        ('oktyabr_sparexpert.xlsx', 'oct'),
        ('noyabr_sparexpert.xlsx', 'nov')
    ]
    all_entries = []

    for filename, prefix in files:
        with zipfile.ZipFile(filename) as z:
            ns = {'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            wb = ET.fromstring(z.read('xl/workbook.xml'))
            rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
            rel_map = {r.attrib['Id']: r.attrib['Target'] for r in rels}
            ss = ET.fromstring(z.read('xl/sharedStrings.xml'))
            shared_strings = [''.join(t.text or '' for t in si.findall('.//main:t', ns)) for si in ss.findall('main:si', ns)]
            sheet_targets = {s.attrib['name']: 'xl/' + rel_map[s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']].lstrip('/') for s in wb.findall('.//main:sheet', ns)}
            
            def load_sheet(name):
                if name not in sheet_targets: return {}
                xml_data = ET.fromstring(z.read(sheet_targets[name]))
                rows_data = {}
                for row in xml_data.findall('.//main:row', ns):
                    r_num = int(row.attrib['r'])
                    row_vals = {}
                    for c in row.findall('main:c', ns):
                        ref = c.attrib['r']
                        col = re.match(r'([A-Z]+)', ref).group(1)
                        c_type = c.attrib.get('t')
                        v = c.find('main:v', ns)
                        is_el = c.find('main:is', ns)
                        val = None
                        if c_type == 's' and v is not None and v.text is not None:
                            val = shared_strings[int(v.text)]
                        elif c_type == 'inlineStr' and is_el is not None:
                            val = ''.join(t.text or '' for t in is_el.findall('.//main:t', ns))
                        elif v is not None and v.text is not None:
                            val = v.text
                        if val is not None and str(val).strip():
                            row_vals[col] = str(val).strip()
                    if row_vals:
                        rows_data[r_num] = row_vals
                return rows_data

            DAY_STARTS = [2, 94, 186, 278, 370, 462, 554]
            seq = 0
            for w in ['I Həftə', 'II Həftə', 'III Həftə', 'IV Həftə', 'V Həftə', 'VI Həftə']:
                sheet = load_sheet(w)
                for base in DAY_STARTS:
                    d = excel_date(sheet.get(base, {}).get('C'))
                    if not d: continue
                    for r in range(base + 3, base + 92):
                        rv = sheet.get(r, {})
                        amt = number(rv.get('C'))
                        etype = clean(rv.get('E'))
                        if amt == 0 or etype not in ('Mədaxil', 'Məxaric'):
                            continue
                        seq += 1
                        cat = clean(rv.get('F')) or ('Vəsait qəbulu' if etype == 'Mədaxil' else 'Digər')
                        cp = clean(rv.get('G')) or 'Qeyd edilməyib'
                        acc_id = clean(rv.get('H')) or 'N.Elgiz'
                        card_code = clean(rv.get('I'))
                        method_code = clean(rv.get('J'))
                        note = clean(rv.get('K'))

                        is_transfer = 'köçürmə' in cat.lower() or 'daxili' in cat.lower()
                        # The sheet credits G and debits H by the signed amount.
                        if is_transfer and amt < 0:
                            acc_id, cp = cp, acc_id
                        source_info = account_lookup.get(acc_id, {'person': acc_id.replace('N.', '').replace('K.', '').replace('H.', ''), 'channel': 'Kassa', 'type': 'cash'})
                        
                        target_acc_id = None
                        target_responsible = None
                        target_bank = None
                        
                        if is_transfer:
                            target_acc_id = cp
                            t_info = account_lookup.get(target_acc_id, {'person': target_acc_id.replace('N.', '').replace('K.', '').replace('H.', ''), 'channel': 'Kassa', 'type': 'cash'})
                            target_responsible = t_info['person']
                            target_bank = t_info['channel']
                            kind = 'transfer'
                            final_amt = abs(amt)
                        elif etype == 'Mədaxil':
                            kind = 'income'
                            final_amt = abs(amt)
                        else:
                            kind = 'expense'
                            final_amt = -abs(amt)

                        expense_method = None
                        if kind == 'expense':
                            if method_code == 'K/E': expense_method = 'same_bank'
                            elif method_code == 'K/F': expense_method = 'diff_bank'
                            elif method_code == 'OO': expense_method = 'online'
                            elif method_code == 'Nd' or card_code == 'Nd': expense_method = 'same_bank'

                        entry_obj = {
                            'id': f'sx-{prefix}-{seq:04d}',
                            'date': d,
                            'time': '12:00',
                            'kind': kind,
                            'title': f'{cat} - {cp}',
                            'counterparty': cp,
                            'category': cat,
                            'amount': final_amt,
                            'accountId': acc_id,
                            'responsible': source_info['person'],
                            'bank': source_info['channel'],
                            'note': note or f'Vərəq: {w}, Sətir: {r}',
                            'card': card_code
                        }
                        if target_acc_id:
                            entry_obj['targetAccountId'] = target_acc_id
                        if target_responsible:
                            entry_obj['targetResponsible'] = target_responsible
                        if target_bank:
                            entry_obj['targetBank'] = target_bank
                        if expense_method:
                            entry_obj['expenseMethod'] = expense_method

                        all_entries.append(entry_obj)
    return all_entries

def main():
    entries = extract_entries()
    print(f'Extracted {len(entries)} verified entries.')

    # 1. Update daily-app/src/sparexpertDefaults.ts
    defaults_file = Path('daily-app/src/sparexpertDefaults.ts')
    content = defaults_file.read_text(encoding='utf-8')
    # If SPAREXPERT_ENTRIES is already in defaults_file, cut it off
    split_marker = 'export const SPAREXPERT_ENTRIES'
    if split_marker in content:
        content = content.split(split_marker)[0].strip()

    entries_ts = json.dumps(entries, ensure_ascii=False, indent=2)
    new_defaults = content.rstrip() + f'''\n\nexport const SPAREXPERT_ENTRIES = {entries_ts} as const;\n'''
    defaults_file.write_text(new_defaults, encoding='utf-8')
    print('Updated daily-app/src/sparexpertDefaults.ts')

    # 2. Update server/dailySparexpertSeed.js
    server_seed_file = Path('server/dailySparexpertSeed.js')
    seed_content = server_seed_file.read_text(encoding='utf-8')
    # Look for export const SPAREXPERT_ENTRIES = [ ... ];
    start_pos = seed_content.find('export const SPAREXPERT_ENTRIES = [')
    end_pos = seed_content.find('export function buildSparexpertSeedData()')
    if start_pos != -1 and end_pos != -1:
        new_seed = seed_content[:start_pos] + f'export const SPAREXPERT_ENTRIES = {entries_ts};\n\n' + seed_content[end_pos:]
        server_seed_file.write_text(new_seed, encoding='utf-8')
        print('Updated server/dailySparexpertSeed.js')
    else:
        print('Warning: Could not locate markers in server/dailySparexpertSeed.js')

if __name__ == '__main__':
    main()
