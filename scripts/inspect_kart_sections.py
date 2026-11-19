import zipfile, re, sys, xml.etree.ElementTree as ET
sys.stdout.reconfigure(encoding='utf-8')

with zipfile.ZipFile('oktyabr_sparexpert.xlsx') as z:
    ns = {'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    rel_map = {r.attrib['Id']: r.attrib['Target'] for r in rels}
    ss = ET.fromstring(z.read('xl/sharedStrings.xml'))
    shared_strings = [''.join(t.text or '' for t in si.findall('.//main:t', ns)) for si in ss.findall('main:si', ns)]
    sheet_targets = {s.attrib['name'].strip(): 'xl/' + rel_map[s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']].lstrip('/') for s in wb.findall('.//main:sheet', ns)}
    xml_data = ET.fromstring(z.read(sheet_targets['Kart Hesabat']))
    
    for r in range(120, 140):
        row = xml_data.find(f'.//main:row[@r="{r}"]', ns)
        if row is not None:
            vals = {}
            for c in row.findall('main:c', ns):
                col = re.sub(r'\d+', '', c.attrib.get('r', ''))
                t_attr = c.attrib.get('t')
                val_el = c.find('main:v', ns)
                val = ''
                if val_el is not None and val_el.text:
                    val = shared_strings[int(val_el.text)] if t_attr == 's' else val_el.text
                if val.strip(): vals[col] = val.strip()
            print(f"Row {r}: {vals}")
