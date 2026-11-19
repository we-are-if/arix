import sys, re, zipfile
from collections import defaultdict
import xml.etree.ElementTree as ET
sys.stdout.reconfigure(encoding='utf-8')

def find_dupes(name_list, label):
    print(f"\n==========================================")
    print(f"ANALYSIS FOR: {label} (Total: {len(name_list)}, Unique: {len(set(name_list))})")
    print(f"==========================================")

    # 1. Exact duplicates
    counts = defaultdict(int)
    for n in name_list:
        counts[n] += 1
    exact_dupes = {k: v for k, v in counts.items() if v > 1}
    if exact_dupes:
        print(f"\n--- 1. TAM EYNİ OLANLAR (Dəqiq Dublikatlar: {len(exact_dupes)}) ---")
        for k, v in sorted(exact_dupes.items(), key=lambda x: -x[1]):
            print(f"  • '{k}' -> {v} dəfə təkrar")
    else:
        print("\n--- 1. TAM EYNİ OLANLAR: Yoxdur ---")

    # 2. Difference only by spaces, hyphens (-), and dots (.)
    # Let's define a cleaner that strips only spaces, hyphens, and dots
    def clean_punct(s):
        return re.sub(r'[\s\.\-_/]+', '', s).lower()

    grouped_punct = defaultdict(list)
    for n in sorted(set(name_list)):
        k = clean_punct(n)
        grouped_punct[k].append(n)

    punct_dupes = {k: v for k, v in grouped_punct.items() if len(v) > 1}
    if punct_dupes:
        print(f"\n--- 2. YALNIZ DEFİS (-), NÖQTƏ (.) VƏ BOŞLUQ İLƏ FƏRQLƏNƏNLƏR ({len(punct_dupes)}) ---")
        for k, variants in sorted(punct_dupes.items()):
            print(f"  • Variantlar: {' <==> '.join(f'\"{v}\"' for v in variants)}")
    else:
        print("\n--- 2. DEFİS, NÖQTƏ VƏ BOŞLUQLA FƏRQLƏNƏNLƏR: Yoxdur ---")

    # 3. Fuzzy similar (like car plates: 50-CA-537 vs 50 CA 537 or phone or similar words)
    def clean_fuzzy(s):
        res = clean_punct(s)
        res = res.replace('ə', 'e').replace('ı', 'i').replace('ö', 'o').replace('ü', 'u').replace('ğ', 'g').replace('ç', 'c').replace('ş', 's')
        return res

    grouped_fuzzy = defaultdict(list)
    for n in sorted(set(name_list)):
        k = clean_fuzzy(n)
        grouped_fuzzy[k].append(n)

    fuzzy_dupes = {k: v for k, v in grouped_fuzzy.items() if len(v) > 1 and v not in punct_dupes.values()}
    if fuzzy_dupes:
        print(f"\n--- 3. HƏRF ŞƏKİLLƏRİ / HƏRİF VƏ İŞARƏ OXŞARLARI ({len(fuzzy_dupes)}) ---")
        for k, variants in sorted(fuzzy_dupes.items()):
            print(f"  • Variantlar: {' <==> '.join(f'\"{v}\"' for v in variants)}")

# A. SparExpert counterparties from October and November sheets
def get_sheet_counterparties(filename):
    with zipfile.ZipFile(filename) as z:
        ns = {'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        wb = ET.fromstring(z.read('xl/workbook.xml'))
        rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        rel_map = {r.attrib['Id']: r.attrib['Target'] for r in rels}
        ss = ET.fromstring(z.read('xl/sharedStrings.xml'))
        shared_strings = [''.join(t.text or '' for t in si.findall('.//main:t', ns)) for si in ss.findall('main:si', ns)]
        sheet_targets = {s.attrib['name']: 'xl/' + rel_map[s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']].lstrip('/') for s in wb.findall('.//main:sheet', ns)}
        
        cps = []
        for w in ['I Həftə', 'II Həftə', 'III Həftə', 'IV Həftə', 'V Həftə', 'VI Həftə']:
            if w not in sheet_targets: continue
            sheet = ET.fromstring(z.read(sheet_targets[w]))
            for row in sheet.findall('.//main:row', ns):
                for c in row.findall('main:c', ns):
                    if c.attrib.get('r', '').startswith('G'): # Col G is counterparty!
                        c_type = c.attrib.get('t')
                        v = c.find('main:v', ns)
                        val = shared_strings[int(v.text)] if c_type == 's' and v is not None and v.text is not None else (v.text if v is not None else None)
                        if val and val.strip() and val.strip() not in ('Kontragent', 'Qeyd edilməyib', 'Rasxod'):
                            cps.append(val.strip())
        return cps

oct_cps = get_sheet_counterparties('oktyabr_sparexpert.xlsx')
nov_cps = get_sheet_counterparties('noyabr_sparexpert.xlsx')
find_dupes(oct_cps + nov_cps, "SPAREXPERT EXCEL (OKTYABR + NOYABR) KONTRAGENTLƏRİ")

# B. Azart Membran customers from importedData.ts
with open('daily-app/src/importedData.ts', 'r', encoding='utf-8') as f:
    text_azart = f.read()

azart_customers = re.findall(r'"name":\s*"([^"]+)"', text_azart)
find_dupes(azart_customers, "AZART MEMBRAN (importedData.ts) MÜŞTƏRİLƏRİ")
