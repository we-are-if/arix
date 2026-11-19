import sys, zipfile, re
from collections import defaultdict
import xml.etree.ElementTree as ET
sys.stdout.reconfigure(encoding='utf-8')

def extract_baza_customers(filename):
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
        
        xml_data = ET.fromstring(z.read(sheet_targets['Baza']))
        customers = []
        suppliers = []
        employees = []
        for row in xml_data.findall('.//main:row', ns):
            r_num = int(row.attrib['r'])
            if r_num == 1: continue
            for c in row.findall('main:c', ns):
                ref = c.attrib['r']
                col = re.match(r'([A-Z]+)', ref).group(1)
                c_type = c.attrib.get('t')
                v = c.find('main:v', ns)
                val = shared_strings[int(v.text)] if c_type == 's' and v is not None and v.text is not None else (v.text if v is not None else None)
                if val and val.strip() and val.strip() != '0':
                    if col == 'O': customers.append((r_num, val.strip()))
                    elif col == 'R': suppliers.append((r_num, val.strip()))
                    elif col == 'AM': employees.append((r_num, val.strip()))
        return customers, suppliers, employees

oct_c, oct_s, oct_e = extract_baza_customers('oktyabr_sparexpert.xlsx')
nov_c, nov_s, nov_e = extract_baza_customers('noyabr_sparexpert.xlsx')

print(f"oktyabr_sparexpert Baza: {len(oct_c)} müştəri, {len(oct_s)} təchizatçı, {len(oct_e)} əməkdaş")
print(f"noyabr_sparexpert Baza:  {len(nov_c)} müştəri, {len(nov_s)} təchizatçı, {len(nov_e)} əməkdaş")

def check_list(items, title):
    names = [x[1] for x in items]
    print(f"\n=======================================================")
    print(f"{title} (Cəmi sətir: {len(items)}, Unikal ad: {len(set(names))})")
    print(f"=======================================================")
    
    # 1. Exact duplicates in list
    counts = defaultdict(list)
    for r, name in items:
        counts[name].append(r)
    exact = {k: v for k, v in counts.items() if len(v) > 1}
    if exact:
        print(f"\n1. DƏQİQ EYNİ TƏKRARLANANLAR ({len(exact)} ədəd):")
        for k, rows in sorted(exact.items()):
            print(f"  • '{k}' -> {len(rows)} dəfə (Sətirlər: {rows})")
            
    # 2. Differing only by spaces, hyphens (-), and dots (.)
    def clean_punct(s):
        # strip spaces, dots, hyphens
        return re.sub(r'[\s\.\-_]+', '', s).lower()
        
    grouped = defaultdict(set)
    for r, name in items:
        k = clean_punct(name)
        grouped[k].add(name)
        
    diff = {k: v for k, v in grouped.items() if len(v) > 1}
    if diff:
        print(f"\n2. DEFİS (-), NÖQTƏ (.) VƏ BOŞLUQ İLƏ FƏRQLƏNƏNLƏR ({len(diff)} ədəd):")
        for k, v in sorted(diff.items()):
            print(f"  • {' <==> '.join(f'\"{x}\"' for x in sorted(v))}")
    else:
        print("\n2. Defis, nöqtə və boşluqla fərqlənən təkrar yoxdur.")

check_list(oct_c, "OKTYABR BAZA MÜŞTƏRİLƏRİ (Sütun O)")
check_list(nov_c, "NOYABR BAZA MÜŞTƏRİLƏRİ (Sütun O)")
check_list(oct_s, "OKTYABR BAZA TƏCHİZATÇILARI (Sütun R)")
check_list(nov_s, "NOYABR BAZA TƏCHİZATÇILARI (Sütun R)")
