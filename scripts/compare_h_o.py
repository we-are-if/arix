import sys, zipfile, re
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')
with zipfile.ZipFile('oktyabr_sparexpert.xlsx') as z:
    ns = {'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    rel_map = {r.attrib['Id']: r.attrib['Target'] for r in rels}
    ss = ET.fromstring(z.read('xl/sharedStrings.xml'))
    shared_strings = [''.join(t.text or '' for t in si.findall('.//main:t', ns)) for si in ss.findall('main:si', ns)]
    
    baza_sheet = None
    for s in wb.findall('.//main:sheet', ns):
        if s.attrib['name'].strip() == 'Baza':
            baza_sheet = s
            break
            
    xml_data = ET.fromstring(z.read('xl/' + rel_map[baza_sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']].lstrip('/')))
    h_vals, o_vals = {}, {}
    for row in xml_data.findall('.//main:row', ns):
        r_num = int(row.attrib.get('r', 0))
        for c in row.findall('main:c', ns):
            ref = c.attrib.get('r', '')
            col = re.sub(r'\d+', '', ref)
            t_attr = c.attrib.get('t')
            val_el = c.find('main:v', ns)
            val = ''
            if val_el is not None and val_el.text:
                val = shared_strings[int(val_el.text)] if t_attr == 's' else val_el.text
            val = val.strip()
            if col == 'H': h_vals[r_num] = val
            elif col == 'O': o_vals[r_num] = val
            
    print(f'H count: {len(h_vals)}, O count: {len(o_vals)}')
    diffs = []
    for r in sorted(set(list(h_vals.keys()) + list(o_vals.keys()))):
        hv = h_vals.get(r, '')
        ov = o_vals.get(r, '')
        if hv != ov:
            diffs.append((r, hv, ov))
    print(f'Differences between H and O: {len(diffs)}')
    for r, hv, ov in diffs[:15]:
        print(f'Row {r}: H={hv!r} vs O={ov!r}')
