import sys, zipfile, re
import xml.etree.ElementTree as ET
sys.stdout.reconfigure(encoding='utf-8')

def inspect_baza(filename):
    print(f'=== BAZA SHEET IN {filename} ===')
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
        
        if 'Baza' not in sheet_targets:
            print('No Baza sheet')
            return
            
        xml_data = ET.fromstring(z.read(sheet_targets['Baza']))
        rows = []
        for row in xml_data.findall('.//main:row', ns):
            r_num = int(row.attrib['r'])
            row_vals = {}
            for c in row.findall('main:c', ns):
                ref = c.attrib['r']
                col = re.match(r'([A-Z]+)', ref).group(1)
                c_type = c.attrib.get('t')
                v = c.find('main:v', ns)
                val = shared_strings[int(v.text)] if c_type == 's' and v is not None and v.text is not None else (v.text if v is not None else None)
                if val and val.strip():
                    row_vals[col] = val.strip()
            if row_vals:
                rows.append((r_num, row_vals))
                
        print(f'Total rows in Baza: {len(rows)}')
        print('Sample rows from Baza:')
        for r_num, rv in rows[:20]:
            print(f'  Row {r_num}: {rv}')

inspect_baza('oktyabr_sparexpert.xlsx')
inspect_baza('noyabr_sparexpert.xlsx')
