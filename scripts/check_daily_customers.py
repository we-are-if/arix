import sys, zipfile, re
from collections import defaultdict
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')

for fname in ['oktyabr_sparexpert.xlsx', 'noyabr_sparexpert.xlsx']:
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
            
        medaxil_customers = defaultdict(list)
        for sname, spath in sheet_targets.items():
            if sname in ['Baza', 'Kart Hesabat', 'Kassa Hesabat', 'Rəsmi Hesabat', 'Sheet1', 'Hesabat']:
                continue
            xml_data = ET.fromstring(z.read(spath))
            for row in xml_data.findall('.//main:row', ns):
                r_num = int(row.attrib.get('r', 0))
                if r_num < 4: continue
                for c in row.findall('main:c', ns):
                    ref = c.attrib.get('r', '')
                    col = re.sub(r'\d+', '', ref)
                    if col == 'B': # Mədaxil Müştəri
                        t_attr = c.attrib.get('t')
                        val_el = c.find('main:v', ns)
                        val = ''
                        if val_el is not None and val_el.text:
                            val = shared_strings[int(val_el.text)] if t_attr == 's' else val_el.text
                        val = val.strip()
                        if val:
                            medaxil_customers[val].append(f"{sname}:{r_num}")
                            
        # Now find duplicate plates/customers in daily transactions
        norm_map = defaultdict(list)
        for name, occurrences in medaxil_customers.items():
            norm = re.sub(r'[\s\.\-_]+', '', name).lower()
            norm_map[norm].append((name, occurrences))
            
        diff_punct = {k: v for k, v in norm_map.items() if len(v) > 1}
        print(f"File: {fname} - Mədaxil müştərilərində defis/boşluq/nöqtə fərqləri: {len(diff_punct)}")
        for k, v in diff_punct.items():
            print(f"  • {v}")
