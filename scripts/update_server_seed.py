import sys

with open('server/dailySparexpertSeed.js', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('"channel": "Kapital ƏDV"', '"channel": "Kapital Bank"')

# If SPAREXPERT_CHANNELS has "Kapital ƏDV"
c = c.replace('"Kapital ƏDV",\n', '')
c = c.replace('"Kapital ƏDV",\r\n', '')

with open('server/dailySparexpertSeed.js', 'w', encoding='utf-8') as f:
    f.write(c)

print('Updated server/dailySparexpertSeed.js')
