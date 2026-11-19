import sys, zipfile, re
from collections import defaultdict
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')

with zipfile.ZipFile('oktyabr_sparexpert.xlsx') as z:
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
    cols = defaultdict(list)
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
            if val:
                cols[col].append((r_num, val))
                
print("Columns in Baza:")
for col in sorted(cols.keys()):
    header = [v for r, v in cols[col] if r in [1, 2, 3]]
    print(f"Col {col} (rows {len(cols[col])}): header = {header[:2]}")
