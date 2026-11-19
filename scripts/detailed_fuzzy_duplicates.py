import sys, re, zipfile
from collections import defaultdict
import xml.etree.ElementTree as ET
sys.stdout.reconfigure(encoding='utf-8')

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
                    if c.attrib.get('r', '').startswith('G'):
                        c_type = c.attrib.get('t')
                        v = c.find('main:v', ns)
                        val = shared_strings[int(v.text)] if c_type == 's' and v is not None and v.text is not None else (v.text if v is not None else None)
                        if val and val.strip() and val.strip() not in ('Kontragent', 'Qeyd edilməyib', 'Rasxod'):
                            cps.append(val.strip())
        return cps

all_cps = sorted(set(get_sheet_counterparties('oktyabr_sparexpert.xlsx') + get_sheet_counterparties('noyabr_sparexpert.xlsx')))
print(f'Total unique counterparties in SpareXpert sheets: {len(all_cps)}')

# Let us find:
# A. Differing only by '.', '-', ' ' (punctuation and spaces)
def strip_all(s):
    return re.sub(r'[\s\.\-_/()]+', '', s).lower()

punct_map = defaultdict(list)
for cp in all_cps:
    punct_map[strip_all(cp)].append(cp)

print('\n=== A. DEFİS, NÖQTƏ VƏ YA BOŞLUQLA FƏRQLƏNƏNLƏR ===')
found_a = False
for k, v in sorted(punct_map.items()):
    if len(v) > 1:
        found_a = True
        print(f'  • {" <==> ".join(f"\"{x}\"" for x in v)}')
if not found_a:
    print('  (Eyni hərf ardıcıllığı ilə yalnız defis/nöqtə/boşluq fərqi olan birbaşa cütlük yoxdur)')

# B. Matching without prefixes ('T.', 'Ə.', 'Y.', 'K.', 'H.', 'N.')
def strip_prefix(s):
    # strip T., Ə., Y., K., H., N. prefix
    s2 = re.sub(r'^[TƏYKHN]\.\s*', '', s, flags=re.IGNORECASE)
    # strip common suffixes like MMC, nəğd, nəgd, nağd, auto, avto
    s2 = re.sub(r'\b(mmc|nəğd|nəgd|nağd|spare)\b', '', s2, flags=re.IGNORECASE)
    return strip_all(s2)

prefix_map = defaultdict(list)
for cp in all_cps:
    p_key = strip_prefix(cp)
    if len(p_key) >= 3:
        prefix_map[p_key].append(cp)

print('\n=== B. PREFİKS (T., Ə., Y., N., K.) VƏ ƏLAVƏ SÖZLƏRLƏ (nəğd, MMC) FƏRQİ OLANLAR ===')
for k, v in sorted(prefix_map.items()):
    if len(v) > 1:
        print(f'  • {" <==> ".join(f"\"{x}\"" for x in v)}')

# C. Check car numbers (e.g. 77-JL-891 vs others)
cars = [cp for cp in all_cps if re.search(r'\d{2}.*[a-zA-Z]{2}.*\d{3}', cp)]
print(f'\n=== C. AVTOMOBİL NÖMRƏLƏRİ (MÜŞTƏRİLƏR) ({len(cars)}) ===')
for c in cars:
    print(f'  • {c}')
