import sys, zipfile, re
from collections import defaultdict
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')

def normalize_text(text):
    t = text.lower()
    t = re.sub(r'[\s\.\-_/\\,()]+', '', t)
    # az character map
    az_map = {
        'ə': 'e', 'ı': 'i', 'ö': 'o', 'ü': 'u', 'ğ': 'g', 'ç': 'c', 'ş': 's',
        'e': 'e', 'i': 'i', 'o': 'o', 'u': 'u', 'g': 'g', 'c': 'c', 's': 's'
    }
    t = ''.join(az_map.get(ch, ch) for ch in t)
    return t

def extract_all(filename):
    with zipfile.ZipFile(filename) as z:
        ns = {'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        wb = ET.fromstring(z.read('xl/workbook.xml'))
        rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        rel_map = {r.attrib['Id']: r.attrib['Target'] for r in rels}
        ss = ET.fromstring(z.read('xl/sharedStrings.xml'))
        shared_strings = [''.join(t.text or '' for t in si.findall('.//main:t', ns)) for si in ss.findall('main:si', ns)]
        
        sheet_targets = {}
        for s in wb.findall('.//main:sheet', ns):
            name = s.attrib['name'].strip()
            rid = s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
            sheet_targets[name] = 'xl/' + rel_map[rid].lstrip('/')
            
        # 1. Baza sheet
        baza_customers = []
        baza_suppliers = []
        if 'Baza' in sheet_targets:
            xml_data = ET.fromstring(z.read(sheet_targets['Baza']))
            for row in xml_data.findall('.//main:row', ns):
                r_num = int(row.attrib.get('r', 0))
                for c in row.findall('main:c', ns):
                    ref = c.attrib.get('r', '')
                    col = re.sub(r'\d+', '', ref)
                    t_attr = c.attrib.get('t')
                    val_el = c.find('main:v', ns)
                    val = ''
                    if val_el is not None and val_el.text:
                        if t_attr == 's':
                            val = shared_strings[int(val_el.text)]
                        else:
                            val = val_el.text
                    val = val.strip()
                    if not val:
                        continue
                    if col == 'O' and r_num >= 4:
                        baza_customers.append((r_num, val))
                    elif col == 'R' and r_num >= 4:
                        baza_suppliers.append((r_num, val))
                        
        # 2. Transaction counterparties from daily sheets
        tx_counterparties = defaultdict(list)
        for sname, spath in sheet_targets.items():
            if sname in ['Baza', 'Kart Hesabat', 'Kassa Hesabat', 'Rəsmi Hesabat', 'Sheet1', 'Hesabat']:
                continue
            xml_data = ET.fromstring(z.read(spath))
            for row in xml_data.findall('.//main:row', ns):
                r_num = int(row.attrib.get('r', 0))
                if r_num < 4:
                    continue
                for c in row.findall('main:c', ns):
                    ref = c.attrib.get('r', '')
                    col = re.sub(r'\d+', '', ref)
                    t_attr = c.attrib.get('t')
                    val_el = c.find('main:v', ns)
                    val = ''
                    if val_el is not None and val_el.text:
                        if t_attr == 's':
                            val = shared_strings[int(val_el.text)]
                        else:
                            val = val_el.text
                    val = val.strip()
                    if not val:
                        continue
                    # B: Mədaxil qarşı tərəf, D: Məxaric qarşı tərəf, P: Bank qarşı tərəf
                    if col in ['B', 'D', 'P']:
                        tx_counterparties[val].append(f"{sname}:sətir {r_num} (sütun {col})")
                        
        return baza_customers, baza_suppliers, tx_counterparties

for fname in ['oktyabr_sparexpert.xlsx', 'noyabr_sparexpert.xlsx']:
    print(f"\n=======================================================")
    print(f"FAYL: {fname}")
    print(f"=======================================================")
    b_cust, b_supp, tx_cp = extract_all(fname)
    
    # Analyze Baza Customers
    print(f"\n--- BAZA MÜŞTƏRİLƏRİ (Sütun O) (Cəmi: {len(b_cust)}) ---")
    
    # 1. Exact duplicates
    exact_map = defaultdict(list)
    for r, name in b_cust:
        exact_map[name].append(r)
    exact_dups = {k: v for k, v in exact_map.items() if len(v) > 1}
    print(f"\n1. Dəqiq eyni olanlar ({len(exact_dups)} ədəd):")
    for k, v in exact_dups.items():
        print(f"  • '{k}' -> {len(v)} dəfə (Sətirlər: {v})")
        
    # 2. Difference only by hyphens, dots, spaces, case
    norm_map = defaultdict(list)
    for r, name in b_cust:
        # remove space, dot, hyphen
        cleaned = re.sub(r'[\s\.\-_]+', '', name).lower()
        norm_map[cleaned].append((r, name))
        
    punct_dups = {k: v for k, v in norm_map.items() if len({x[1] for x in v}) > 1}
    print(f"\n2. Yalnız defis (-), nöqtə (.) və boşluq (və ya böyük/kiçik hərf) ilə fərqlənənlər ({len(punct_dups)} cüt/qrup):")
    for k, v in punct_dups.items():
        unique_names = list({x[1] for x in v})
        details = ", ".join([f"'{name}' (sətir {r})" for r, name in v])
        print(f"  • {unique_names} ==> {details}")
        
    # 3. Fuzzy / similar (car plate variations, e.g. with extra words or suffix)
    # Check if a name is substring of another or differs by 'nəğd', etc.
    all_names = list({name for _, name in b_cust})
    variations = []
    for i in range(len(all_names)):
        for j in range(i+1, len(all_names)):
            n1 = all_names[i]
            n2 = all_names[j]
            # normalize az letters
            az1 = normalize_text(n1)
            az2 = normalize_text(n2)
            if az1 == az2 and n1.lower() != n2.lower():
                variations.append((n1, n2, "Azərbaycan hərfləri fərqi (e/ə, i/ı və s.)"))
            elif (len(az1) >= 5 and len(az2) >= 5) and (az1 in az2 or az2 in az1):
                # check if one contains the other
                diff = abs(len(az1) - len(az2))
                if diff <= 8: # small difference like 'nəğd', 'avto', etc.
                    variations.append((n1, n2, f"Biri digərini ehtiva edir (fərq: {diff} hərf)"))
                    
    if variations:
        print(f"\n3. Oxşar və ya variant olan müştərilər ({len(variations)} cüt):")
        for n1, n2, reason in variations[:30]:
            print(f"  • '{n1}' <==> '{n2}' ({reason})")
            
    # Also check daily transaction counterparties
    print(f"\n--- GÜNLÜK ƏMƏLİYYATLARDA İSTİFADƏ OLUNAN QARŞI TƏRƏFLƏR (Müştəri və Təchizatçılar) ---")
    tx_names = list(tx_cp.keys())
    tx_norm_map = defaultdict(list)
    for name in tx_names:
        cleaned = re.sub(r'[\s\.\-_]+', '', name).lower()
        tx_norm_map[cleaned].append(name)
        
    tx_punct_dups = {k: v for k, v in tx_norm_map.items() if len(v) > 1}
    print(f"Yalnız defis, nöqtə və boşluqla fərqlənən günlük əməliyyat qarşı tərəfləri ({len(tx_punct_dups)} ədəd):")
    for k, v in tx_punct_dups.items():
        print(f"  • {v}")
