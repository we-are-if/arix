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
    
    # 1. Baza col AA (Bank)
    baza_xml = ET.fromstring(z.read(sheet_targets['Baza']))
    baza_banks = []
    for row in baza_xml.findall('.//main:row', ns):
        for c in row.findall('main:c', ns):
            col = re.sub(r'\d+', '', c.attrib.get('r', ''))
            if col == 'AA':
                t_attr = c.attrib.get('t')
                val_el = c.find('main:v', ns)
                val = ''
                if val_el is not None and val_el.text:
                    val = shared_strings[int(val_el.text)] if t_attr == 's' else val_el.text
                if val.strip(): baza_banks.append(val.strip())
    print("Baza Col AA banks:", baza_banks)
    
    # 2. Check Kart Hesabat formulas in column B or C or D or H in rows 1, 41, 81, 121, 161, 201, 241
    kart_xml = ET.fromstring(z.read(sheet_targets['Kart Hesabat']))
    for r in [1, 2, 3, 4, 5, 6, 41, 42, 43, 81, 82, 83, 121, 122, 123, 161, 162, 163, 201, 202, 203, 241, 242, 243]:
        row = kart_xml.find(f'.//main:row[@r="{r}"]', ns)
        if row is not None:
            for c in row.findall('main:c', ns):
                f_el = c.find('main:f', ns)
                if f_el is not None and f_el.text:
                    print(f"Row {r} {c.attrib.get('r')}: formula = {f_el.text}")
