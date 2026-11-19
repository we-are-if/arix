import sys, zipfile, re
from collections import defaultdict
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')

def find_duplicates_in_list(items, category_name):
    # items is a list of (row_or_info, text)
    exact_map = defaultdict(list)
    punct_map = defaultdict(list)
    
    az_map = {'ə': 'e', 'ı': 'i', 'ö': 'o', 'ü': 'u', 'ğ': 'g', 'ç': 'c', 'ş': 's'}
    
    for info, val in items:
        exact_map[val].append(info)
        
        # normalize: remove '-', '.', ' ', '_', '/', lower
        norm = re.sub(r'[\s\.\-_/\\,()]+', '', val).lower()
        punct_map[norm].append((info, val))
        
    print(f"\n==========================================")
    print(f"Kateqoriya: {category_name} (Cəmi: {len(items)}, Unikal: {len(exact_map)})")
    print(f"==========================================")
    
    # 1. Exact duplicates
    exact_dups = {k: v for k, v in exact_map.items() if len(v) > 1}
    print(f"1. Dəqiq eyni adlar ({len(exact_dups)} ədəd):")
    if not exact_dups:
        print("  (Dəqiq təkrarlanan yoxdur)")
    for k, v in exact_dups.items():
        print(f"  • '{k}' -> {len(v)} dəfə: {v}")
        
    # 2. Punctuation/space/case difference
    punct_dups = {}
    for norm_k, v_list in punct_map.items():
        # unique original names
        unique_originals = list({x[1] for x in v_list})
        if len(unique_originals) > 1:
            punct_dups[norm_k] = v_list
            
    print(f"\n2. Defis (-), nöqtə (.) və boşluq (və ya böyük/kiçik hərf) ilə fərqlənən eyni adlar ({len(punct_dups)} ədəd):")
    if not punct_dups:
        print("  (Fərqli yazılışda təkrarlanan yoxdur)")
    for norm_k, v_list in punct_dups.items():
        origs = list({x[1] for x in v_list})
        details = ", ".join([f"'{x[1]}' ({x[0]})" for x in v_list])
        print(f"  • {origs} ==> {details}")
        
    # 3. Car plate or prefix variations
    # e.g., '99-ML-668' vs '99 ML 668', or 'AVTO 999' vs 'T. AVTO 999'
    all_unique = list(exact_map.keys())
    similar_pairs = []
    for i in range(len(all_unique)):
        for j in range(i+1, len(all_unique)):
            a, b = all_unique[i], all_unique[j]
            na = re.sub(r'[\s\.\-_]+', '', a).lower()
            nb = re.sub(r'[\s\.\-_]+', '', b).lower()
            # az normal
            aza = ''.join(az_map.get(c, c) for c in na)
            azb = ''.join(az_map.get(c, c) for c in nb)
            if aza == azb and na != nb:
                similar_pairs.append((a, b, "Azərbaycan hərfləri fərqi"))
            elif (len(aza) >= 5 and len(azb) >= 5):
                if aza in azb or azb in aza:
                    diff = abs(len(aza) - len(azb))
                    if diff <= 6 and not (aza in ['kassa', 'kart', 'bank'] or azb in ['kassa', 'kart', 'bank']):
                        similar_pairs.append((a, b, f"Biri digərinin tərkibindədir ({diff} hərf fərq)"))
                        
    if similar_pairs:
        print(f"\n3. Oxşar / əlavə sözlü variantlar ({len(similar_pairs)} ədəd):")
        for a, b, reason in similar_pairs:
            print(f"  • '{a}' <===> '{b}' ({reason})")

for fname in ['oktyabr_sparexpert.xlsx', 'noyabr_sparexpert.xlsx']:
    print(f"\n#######################################################")
    print(f"### FAYL: {fname}")
    print(f"#######################################################")
    with zipfile.ZipFile(fname) as z:
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
            
        # Extract Baza Col O (Müştəri)
        baza_xml = ET.fromstring(z.read(sheet_targets['Baza']))
        baza_customers = []
        baza_suppliers = []
        for row in baza_xml.findall('.//main:row', ns):
            r_num = int(row.attrib.get('r', 0))
            if r_num < 4: continue
            for c in row.findall('main:c', ns):
                ref = c.attrib.get('r', '')
                col = re.sub(r'\d+', '', ref)
                t_attr = c.attrib.get('t')
                val_el = c.find('main:v', ns)
                val = ''
                if val_el is not None and val_el.text:
                    val = shared_strings[int(val_el.text)] if t_attr == 's' else val_el.text
                val = val.strip()
                if not val: continue
                if col == 'O':
                    baza_customers.append((f"Baza sətir {r_num}", val))
                elif col == 'R':
                    baza_suppliers.append((f"Baza sətir {r_num}", val))
                    
        find_duplicates_in_list(baza_customers, "Baza Müştəriləri (Sütun O)")
        find_duplicates_in_list(baza_suppliers, "Baza Təchizatçıları (Sütun R)")
