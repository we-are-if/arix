import sys, re
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8')

with open('daily-app/src/importedData.ts', 'r', encoding='utf-8') as f:
    text = f.read()

m = re.search(r'export const IMPORTED_CUSTOMERS\s*=\s*(\[.*?\])\s*as const;', text, re.DOTALL)
if not m:
    print('No IMPORTED_CUSTOMERS')
    sys.exit(1)

import json
customers = json.loads(m.group(1))
names = [c['name'] for c in customers]
print(f'Total Azart Membran customers: {len(names)}')

# 1. Exact duplicates in Azart customers
counts = defaultdict(int)
for n in names:
    counts[n] += 1

exact_dupes = {k: v for k, v in counts.items() if v > 1}
print(f'\n=== 1. TAM EYNİ TƏKRARLANAN MÜŞTƏRİLƏR ({len(exact_dupes)}) ===')
for k, v in sorted(exact_dupes.items()):
    print(f'  • "{k}": {v} dəfə')

# 2. Differing by hyphen (-), dot (.), space ( ), or slash (/)
def norm_punct(s):
    # remove -, ., spaces, parens, quotes, slashes
    res = re.sub(r'[\s\.\-_/()"\']+', '', s).lower()
    return res

grouped = defaultdict(list)
for n in sorted(set(names)):
    grouped[norm_punct(n)].append(n)

punct_dupes = {k: v for k, v in grouped.items() if len(v) > 1}
print(f'\n=== 2. DEFİS (-), NÖQTƏ (.) VƏ BOŞLUQ FƏRQİ İLƏ EYNİ OLAN MÜŞTƏRİLƏR ({len(punct_dupes)}) ===')
for k, v in sorted(punct_dupes.items()):
    print(f'  • {" <==> ".join(f"\"{x}\"" for x in v)}')

# 3. Fuzzy similar names (e.g. city or bracket differences)
# e.g. "Elçin Biləcəri" vs "Elçin Xırdalan" is different person, but:
# "Lamina PRO (Əhməd)" vs "Lamina PRO"
# "Ramil Usta Kapak" vs "Ramil Usta"
# "Kapakçı MMC (Fuad)" vs "Fuad"
print('\n=== 3. MÖTƏRİZƏLİ / ŞƏXS ADLI ƏLAVƏ İLƏ EYNİ ŞİRKƏT OLANLAR ===')
base_map = defaultdict(list)
for n in sorted(set(names)):
    # remove brackets like (Əhməd), (Fuad), (Mikayıl)
    clean_base = re.sub(r'\(.*?\)', '', n).strip()
    clean_base = norm_punct(clean_base)
    if len(clean_base) >= 4:
        base_map[clean_base].append(n)

for k, v in sorted(base_map.items()):
    if len(v) > 1 and v not in punct_dupes.values():
        print(f'  • {" <==> ".join(f"\"{x}\"" for x in v)}')
