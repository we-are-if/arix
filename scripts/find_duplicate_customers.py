import sys, re
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8')

# Read customers from sparexpertDefaults.ts
with open('daily-app/src/sparexpertDefaults.ts', 'r', encoding='utf-8') as f:
    text = f.read()

# Extract SPAREXPERT_CUSTOMERS
m = re.search(r'export const SPAREXPERT_CUSTOMERS\s*:\s*string\[\]\s*=\s*\[(.*?)\];', text, re.DOTALL)
if not m:
    print('Could not find SPAREXPERT_CUSTOMERS')
    sys.exit(1)

customers_raw = [c.strip().strip('"').strip("'") for c in m.group(1).split(',') if c.strip()]
print(f'Total customers loaded: {len(customers_raw)}')

# Also extract all counterparties from October and November transactions
with open('server/dailySparexpertSeed.js', 'r', encoding='utf-8') as f:
    seed_text = f.read()

tx_counterparties = re.findall(r'"counterparty":\s*"([^"]+)"', seed_text)
print(f'Total transaction counterparties: {len(tx_counterparties)} ({len(set(tx_counterparties))} unique)')

# 1. Exact duplicates in SPAREXPERT_CUSTOMERS list
exact_counts = defaultdict(int)
for c in customers_raw:
    exact_counts[c] += 1

exact_dupes = {k: v for k, v in exact_counts.items() if v > 1}
print(f'\n=== 1. EXACT DUPLICATES IN SPAREXPERT_CUSTOMERS LIST ({len(exact_dupes)}) ===')
for name, cnt in sorted(exact_dupes.items(), key=lambda x: -x[1]):
    print(f'  • "{name}" -> {cnt} dəfə təkrar')

# 2. Normalized duplicates in SPAREXPERT_CUSTOMERS (ignoring -, ., spaces, and case)
def normalize_name(s):
    res = re.sub(r'[\s\.\-_/]+', '', s).lower()
    res = res.replace('ə', 'e').replace('ı', 'i').replace('ö', 'o').replace('ü', 'u').replace('ğ', 'g').replace('ç', 'c').replace('ş', 's')
    return res

grouped = defaultdict(list)
for c in sorted(set(customers_raw)):
    key = normalize_name(c)
    if key:
        grouped[key].append(c)

fuzzy_dupes = {k: v for k, v in grouped.items() if len(v) > 1}
print(f'\n=== 2. DUPLICATES IN SPAREXPERT_CUSTOMERS DIFFERING BY PUNCTUATION / SPACES / HYPHENS / DOTS ({len(fuzzy_dupes)}) ===')
for k, variants in sorted(fuzzy_dupes.items(), key=lambda x: x[0]):
    print(f'  • {" və ".join(f"\'{v}\'" for v in variants)}')

# 3. Normalized duplicates across ALL transaction counterparties + customers list combined
all_names = set(customers_raw) | set(tx_counterparties)
grouped_all = defaultdict(list)
for c in sorted(all_names):
    key = normalize_name(c)
    if key:
        grouped_all[key].append(c)

fuzzy_all = {k: v for k, v in grouped_all.items() if len(v) > 1}
print(f'\n=== 3. DUPLICATES ACROSS ALL TRANSACTIONS & CUSTOMERS ({len(fuzzy_all)}) ===')
for k, variants in sorted(fuzzy_all.items(), key=lambda x: x[0]):
    print(f'  • {" və ".join(f"\'{v}\'" for v in variants)}')
