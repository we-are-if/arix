import sys, re
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8')

with open('daily-app/src/importedData.ts', 'r', encoding='utf-8') as f:
    text = f.read()

cps = re.findall(r'"counterparty":\s*"([^"]+)"', text)
print(f'Total Azart entries counterparties: {len(cps)} ({len(set(cps))} unique)')

# Exact counts
counts = defaultdict(int)
for cp in cps:
    counts[cp] += 1

# Check punct differences: -, ., spaces, case
def norm_punct(s):
    return re.sub(r'[\s\.\-_/()"\']+', '', s).lower()

punct_map = defaultdict(set)
for cp in set(cps):
    punct_map[norm_punct(cp)].add(cp)

print('\n=== DEFİS, NÖQTƏ VƏ BOŞLUQ FƏRQİ İLƏ EYNİ OLANLAR (AZART ENTRIES) ===')
for k, variants in sorted(punct_map.items()):
    if len(variants) > 1:
        print(f'  • {" <==> ".join(f"\"{v}\"" for v in sorted(variants))}')

# Check bracketed vs unbracketed or similar
def norm_bracket(s):
    # remove (something)
    b = re.sub(r'\(.*?\)', '', s).strip()
    return norm_punct(b)

bracket_map = defaultdict(set)
for cp in set(cps):
    bracket_map[norm_bracket(cp)].add(cp)

print('\n=== MÖTƏRİZƏ VƏ YA ƏLAVƏ İLƏ FƏRQLƏNƏN EYNİ MÜŞTƏRİLƏR ===')
for k, variants in sorted(bracket_map.items()):
    if len(variants) > 1 and len(k) >= 4 and variants not in punct_map.values():
        print(f'  • {" <==> ".join(f"\"{v}\"" for v in sorted(variants))}')
