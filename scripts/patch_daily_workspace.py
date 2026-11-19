import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('daily-app/src/DailyWorkspace.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add LayoutGrid, List to lucide-react import
if 'LayoutGrid' not in content:
    content = content.replace('  ClipboardCheck,\n', '  ClipboardCheck,\n  LayoutGrid,\n  List,\n')
    content = content.replace('  ClipboardCheck,\r\n', '  ClipboardCheck,\r\n  LayoutGrid,\r\n  List,\r\n')

# 2. Add SPAREXPERT_CARD_REPORT to sparexpertDefaults import
if 'SPAREXPERT_CARD_REPORT' not in content:
    old_imp = '  SPAREXPERT_CUSTOMERS,\n  SPAREXPERT_ENTRIES,'
    new_imp = '  SPAREXPERT_CUSTOMERS,\n  SPAREXPERT_CARD_REPORT,\n  SPAREXPERT_ENTRIES,'
    content = content.replace(old_imp, new_imp)
    content = content.replace(old_imp.replace('\n', '\r\n'), new_imp.replace('\n', '\r\n'))

# 3. Update getAccountDisplayInfo for Kapital Bank accounts
old_display = '''  if (name === "H.Spare") return { cleanName: "Spare", badgeText: "Kapital Bank", badgeClass: "bank" };
  if (name === "H.ƏDV") return { cleanName: "Spare (ƏDV)", badgeText: "Kapital ƏDV", badgeClass: "bank" };
  if (name === "H.Simran") return { cleanName: "Simran", badgeText: "Kapital Bank", badgeClass: "bank" };
  if (name === "H.SimƏDV") return { cleanName: "Simran (ƏDV)", badgeText: "Kapital ƏDV", badgeClass: "bank" };'''

new_display = '''  if (name === "H.Spare") return { cleanName: "Spare (Əsas)", badgeText: "Kapital Bank", badgeClass: "bank" };
  if (name === "H.ƏDV") return { cleanName: "Spare (ƏDV)", badgeText: "Kapital Bank", badgeClass: "bank" };
  if (name === "H.Simran") return { cleanName: "Simran (Əsas)", badgeText: "Kapital Bank", badgeClass: "bank" };
  if (name === "H.SimƏDV") return { cleanName: "Simran (ƏDV)", badgeText: "Kapital Bank", badgeClass: "bank" };'''

content = content.replace(old_display.replace('\r\n', '\n'), new_display.replace('\r\n', '\n'))
content = content.replace(old_display.replace('\n', '\r\n'), new_display.replace('\n', '\r\n'))

# 4. Add reconViewMode state
old_state = 'const [reconciliationQuery, setReconciliationQuery] = useState("");'
new_state = 'const [reconciliationQuery, setReconciliationQuery] = useState("");\n  const [reconViewMode, setReconViewMode] = useState<"cards" | "table">("cards");'
if 'reconViewMode' not in content:
    content = content.replace(old_state, new_state)

# 5. Add getReconRowCategory and reconSections, and renderReconCard
helper_code = '''
const getReconRowCategory = (name: string, isSpare: boolean, catalog: Account[]): "cash" | "bank" | "card" => {
  if (isAggregateAccount(name) || name === "Ümumi" || name === "Ümumi Cəmi") return "cash";
  const acc = catalog.find((a) => a.id === name || a.name === name);
  if (acc?.type === "cash") return "cash";
  if (acc?.type === "bank") return "bank";
  if (acc?.type === "card") return "card";

  if (name.startsWith("N.")) return "cash";
  if (name.startsWith("H.")) return "bank";
  if (name.startsWith("K.") || name.startsWith("BK.") || name.startsWith("Kart")) return "card";
  if (name === "Ceyhun") return "card";
  if (acc?.channel === "Kassa") return "cash";
  if (acc?.channel?.includes("Bank") || acc?.channel?.includes("ƏDV")) return "bank";
  return "card";
};
'''

if 'const getReconRowCategory' not in content:
    # insert before getAccountDisplayInfo
    idx = content.find('const getAccountDisplayInfo =')
    if idx >= 0:
        content = content[:idx] + helper_code.strip() + '\n\n' + content[idx:]

# 6. Pass isSparexpert to AccountsView
old_av1 = '<AccountsView\n              state={state}\n              accounts={accountCatalog}'
new_av1 = '<AccountsView\n              isSparexpert={isSparexpert}\n              state={state}\n              accounts={accountCatalog}'
content = content.replace(old_av1, new_av1)
content = content.replace(old_av1.replace('\n', '\r\n'), new_av1.replace('\n', '\r\n'))

# Check second AccountsView occurrence
old_av2 = '<AccountsView\n              state={state}\n              accounts={accountCatalog}'
new_av2 = '<AccountsView\n              isSparexpert={isSparexpert}\n              state={state}\n              accounts={accountCatalog}'
content = content.replace(old_av2, new_av2)
content = content.replace(old_av2.replace('\n', '\r\n'), new_av2.replace('\n', '\r\n'))

# 7. Update AccountsView signature
old_av_sig = '''function AccountsView({
  state,
  accounts,
  balanceAt,
  cardLimitSettings,
  canManageLimits,
  onSaveCardLimitSettings,
  customAccounts = [],
  onSaveAccount,
  onDeleteAccount,
  peopleList = [],
  setPeopleList,
  channelList = [],
  setChannelList,
  initialSubTab = "cards",
}: {'''

new_av_sig = '''function AccountsView({
  state,
  accounts,
  balanceAt,
  cardLimitSettings,
  canManageLimits,
  onSaveCardLimitSettings,
  customAccounts = [],
  onSaveAccount,
  onDeleteAccount,
  peopleList = [],
  setPeopleList,
  channelList = [],
  setChannelList,
  initialSubTab = "cards",
  isSparexpert = false,
}: {
  isSparexpert?: boolean;'''

content = content.replace(old_av_sig.replace('\r\n', '\n'), new_av_sig.replace('\r\n', '\n'))
content = content.replace(old_av_sig.replace('\n', '\r\n'), new_av_sig.replace('\n', '\r\n'))

# 8. Inside AccountsView: use baseCardReport and firstCardMonth
old_av_body = '''  const [selectedBank, setSelectedBank] = useState<string>("Kapital Bank");
  const currentMonth = monthKey(todayKey);
  const firstCardMonth = IMPORTED_CARD_REPORT_MONTH === "0000-00" ? currentMonth : IMPORTED_CARD_REPORT_MONTH;'''

new_av_body = '''  const [selectedBank, setSelectedBank] = useState<string>("Kapital Bank");
  const baseCardReport = isSparexpert ? SPAREXPERT_CARD_REPORT : IMPORTED_CARD_REPORT;
  const currentMonth = monthKey(todayKey);
  const firstCardMonth = isSparexpert
    ? "2026-10"
    : IMPORTED_CARD_REPORT_MONTH === "0000-00"
    ? currentMonth
    : IMPORTED_CARD_REPORT_MONTH;'''

content = content.replace(old_av_body.replace('\r\n', '\n'), new_av_body.replace('\r\n', '\n'))
content = content.replace(old_av_body.replace('\n', '\r\n'), new_av_body.replace('\n', '\r\n'))

# In dynamicBankReports:
content = content.replace('return IMPORTED_CARD_REPORT.map((bankGroup) => {', 'return baseCardReport.map((bankGroup) => {')

# In CardLimitSettingsDialog:
old_clsd = '{limitSettingsOpen && <CardLimitSettingsDialog settings={cardLimitSettings}'
new_clsd = '{limitSettingsOpen && <CardLimitSettingsDialog isSparexpert={isSparexpert} settings={cardLimitSettings}'
content = content.replace(old_clsd, new_clsd)

old_clsd_sig = 'function CardLimitSettingsDialog({ settings, initialBank, onClose, onSave }: {'
new_clsd_sig = 'function CardLimitSettingsDialog({ settings, initialBank, onClose, onSave, isSparexpert = false }: {\n  isSparexpert?: boolean;'
content = content.replace(old_clsd_sig, new_clsd_sig)

old_clsd_rep = '  const reports = IMPORTED_CARD_REPORT as readonly {'
new_clsd_rep = '  const reports = (isSparexpert ? SPAREXPERT_CARD_REPORT : IMPORTED_CARD_REPORT) as readonly {'
content = content.replace(old_clsd_rep, new_clsd_rep)

with open('daily-app/src/DailyWorkspace.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Applied patch part 1 successfully!")
