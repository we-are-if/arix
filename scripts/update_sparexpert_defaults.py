import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('daily-app/src/sparexpertDefaults.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update channel for H.ƏDV and H.SimƏDV
content = content.replace('"channel": "Kapital ƏDV"', '"channel": "Kapital Bank"')

# 2. Update SPAREXPERT_CHANNELS
old_channels = '''export const SPAREXPERT_CHANNELS: string[] = [
  "Kassa",
  "Kapital Bank",
  "Kapital ƏDV",
  "Rabitə Bank",
  "Ziraat Bank",
  "Biznes Kart",
  "Kart"
];'''

new_channels = '''export const SPAREXPERT_CHANNELS: string[] = [
  "Kassa",
  "Kapital Bank",
  "Rabitə Bank",
  "Ziraat Bank",
  "Biznes Kart",
  "Kart"
];'''

content = content.replace(old_channels.replace('\r\n', '\n'), new_channels.replace('\r\n', '\n'))
content = content.replace(old_channels.replace('\n', '\r\n'), new_channels.replace('\n', '\r\n'))

# 3. Add SPAREXPERT_CARD_REPORT
card_report_code = '''
export const SPAREXPERT_CARD_REPORT = [
  {
    bank: "Kapital Bank",
    code: "K",
    totalBalance: 13902.24,
    rows: [
      {
        person: "Kənan",
        opening: 4088.0,
        income: 3590.0,
        onlinePayment: 0.0,
        sameBankTransfer: -4134.0,
        diffBankTransfer: 0.0,
        cashOut: 0.0,
        balance: 3544.0,
        status: "",
        monthlyLimit: 5000.0,
        limitRemaining: 1456.0,
      },
      {
        person: "Simran",
        opening: 11708.82,
        income: 126.0,
        onlinePayment: 0.0,
        sameBankTransfer: -433.0,
        diffBankTransfer: -100.0,
        cashOut: 0.0,
        balance: 11301.82,
        status: "",
        monthlyLimit: 5000.0,
        limitRemaining: -6401.82,
      },
      {
        person: "Elgiz",
        opening: -1834.37,
        income: 7077.0,
        onlinePayment: -255.61,
        sameBankTransfer: -7360.6,
        diffBankTransfer: -376.0,
        cashOut: -293.0,
        balance: -3042.58,
        status: "",
        monthlyLimit: 10416.16,
        limitRemaining: 7373.58,
      },
      {
        person: "Ceyhun",
        opening: 0.0,
        income: 8422.0,
        onlinePayment: 0.0,
        sameBankTransfer: -6223.0,
        diffBankTransfer: -100.0,
        cashOut: 0.0,
        balance: 2099.0,
        status: "",
        monthlyLimit: 5000.0,
        limitRemaining: 2801.0,
      },
      ...Array.from({ length: 28 }, (_, i) => ({
        person: `Kart X${i + 3}`,
        opening: 0.0,
        income: 0.0,
        onlinePayment: 0.0,
        sameBankTransfer: 0.0,
        diffBankTransfer: 0.0,
        cashOut: 0.0,
        balance: 0.0,
        status: "🚫",
        monthlyLimit: 5000.0,
        limitRemaining: 5000.0,
      })),
    ],
  },
  {
    bank: "Unibank",
    code: "U",
    totalBalance: 0.0,
    rows: [
      { person: "Kənan", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      { person: "Simran", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      { person: "Elgiz", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      { person: "Ceyhun", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      ...Array.from({ length: 28 }, (_, i) => ({
        person: `Kart X${i + 3}`,
        opening: 0.0,
        income: 0.0,
        onlinePayment: 0.0,
        sameBankTransfer: 0.0,
        diffBankTransfer: 0.0,
        cashOut: 0.0,
        balance: 0.0,
        status: "🚫",
        monthlyLimit: 5000.0,
        limitRemaining: 5000.0,
      })),
    ],
  },
  {
    bank: "Rabitə Bank",
    code: "R",
    totalBalance: 0.0,
    rows: [
      { person: "Kənan", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      { person: "Simran", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      { person: "Elgiz", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      { person: "Ceyhun", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      ...Array.from({ length: 28 }, (_, i) => ({
        person: `Kart X${i + 3}`,
        opening: 0.0,
        income: 0.0,
        onlinePayment: 0.0,
        sameBankTransfer: 0.0,
        diffBankTransfer: 0.0,
        cashOut: 0.0,
        balance: 0.0,
        status: "🚫",
        monthlyLimit: 5000.0,
        limitRemaining: 5000.0,
      })),
    ],
  },
  {
    bank: "Leobank",
    code: "L",
    totalBalance: 0.0,
    rows: [
      { person: "Kənan", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      { person: "Simran", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      { person: "Elgiz", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      { person: "Ceyhun", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      ...Array.from({ length: 28 }, (_, i) => ({
        person: `Kart X${i + 3}`,
        opening: 0.0,
        income: 0.0,
        onlinePayment: 0.0,
        sameBankTransfer: 0.0,
        diffBankTransfer: 0.0,
        cashOut: 0.0,
        balance: 0.0,
        status: "🚫",
        monthlyLimit: 5000.0,
        limitRemaining: 5000.0,
      })),
    ],
  },
  {
    bank: "ABB",
    code: "A",
    totalBalance: 0.0,
    rows: [
      { person: "Kənan", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      { person: "Simran", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      { person: "Elgiz", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      { person: "Ceyhun", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      ...Array.from({ length: 28 }, (_, i) => ({
        person: `Kart X${i + 3}`,
        opening: 0.0,
        income: 0.0,
        onlinePayment: 0.0,
        sameBankTransfer: 0.0,
        diffBankTransfer: 0.0,
        cashOut: 0.0,
        balance: 0.0,
        status: "🚫",
        monthlyLimit: 5000.0,
        limitRemaining: 5000.0,
      })),
    ],
  },
  {
    bank: "Azər Türk Bank",
    code: "AT",
    totalBalance: 0.0,
    rows: [
      { person: "Kənan", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      { person: "Simran", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      { person: "Elgiz", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      { person: "Ceyhun", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      ...Array.from({ length: 28 }, (_, i) => ({
        person: `Kart X${i + 3}`,
        opening: 0.0,
        income: 0.0,
        onlinePayment: 0.0,
        sameBankTransfer: 0.0,
        diffBankTransfer: 0.0,
        cashOut: 0.0,
        balance: 0.0,
        status: "🚫",
        monthlyLimit: 5000.0,
        limitRemaining: 5000.0,
      })),
    ],
  },
  {
    bank: "M10",
    code: "M",
    totalBalance: 0.0,
    rows: [
      { person: "Kənan", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      { person: "Simran", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      { person: "Elgiz", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      { person: "Ceyhun", opening: 0.0, income: 0.0, onlinePayment: 0.0, sameBankTransfer: 0.0, diffBankTransfer: 0.0, cashOut: 0.0, balance: 0.0, status: "", monthlyLimit: 5000.0, limitRemaining: 5000.0 },
      ...Array.from({ length: 28 }, (_, i) => ({
        person: `Kart X${i + 3}`,
        opening: 0.0,
        income: 0.0,
        onlinePayment: 0.0,
        sameBankTransfer: 0.0,
        diffBankTransfer: 0.0,
        cashOut: 0.0,
        balance: 0.0,
        status: "🚫",
        monthlyLimit: 5000.0,
        limitRemaining: 5000.0,
      })),
    ],
  },
] as const;
'''

if 'export const SPAREXPERT_CARD_REPORT' not in content:
    # insert before SPAREXPERT_ENTRIES
    idx = content.find('export const SPAREXPERT_ENTRIES')
    if idx >= 0:
        content = content[:idx] + card_report_code + '\n' + content[idx:]
    else:
        content += card_report_code

with open('daily-app/src/sparexpertDefaults.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated daily-app/src/sparexpertDefaults.ts successfully!")
