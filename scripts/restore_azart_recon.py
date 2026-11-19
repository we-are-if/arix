import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('daily-app/src/DailyWorkspace.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove reconViewMode state
content = content.replace('const [reconViewMode, setReconViewMode] = useState<"cards" | "table">("cards");\n', '')
content = content.replace('const [reconViewMode, setReconViewMode] = useState<"cards" | "table">("cards");\r\n', '')

# 2. Update visibleReconciliationRows to hide zero placeholder cards for sparexpert
old_vr_filter = '''  const visibleReconciliationRows = reconciliationRows.filter(([name, received, previous, expense, supplier]) => {
    const queryNorm = reconciliationQuery.trim().toLocaleLowerCase("az-AZ");
    if (!queryNorm && rules.hideZeroPlaceholderCards && isPlaceholderCard(name) && received === 0 && previous === 0 && expense === 0 && supplier === 0) {
      return false;
    }'''

new_vr_filter = '''  const visibleReconciliationRows = reconciliationRows.filter(([name, received, previous, expense, supplier]) => {
    const queryNorm = reconciliationQuery.trim().toLocaleLowerCase("az-AZ");
    if (!queryNorm && isSparexpert && isPlaceholderCard(name) && received === 0 && previous === 0 && expense === 0 && supplier === 0) {
      return false;
    }
    if (!queryNorm && rules.hideZeroPlaceholderCards && isPlaceholderCard(name) && received === 0 && previous === 0 && expense === 0 && supplier === 0) {
      return false;
    }'''

content = content.replace(old_vr_filter.replace('\r\n', '\n'), new_vr_filter.replace('\r\n', '\n'))
content = content.replace(old_vr_filter.replace('\n', '\r\n'), new_vr_filter.replace('\n', '\r\n'))

# 3. Clean up reconSections and remove renderReconCard
# Find where reconSections begins
start_idx = content.find('  const reconSections = useMemo(() => {')
end_idx = content.find('  return (\n    <div className="app-shell">')
if end_idx == -1:
    end_idx = content.find('  return (\r\n    <div className="app-shell">')

if start_idx != -1 and end_idx != -1:
    clean_recon_sections = '''  const reconSections = useMemo(() => {
    if (!isSparexpert) return [];
    const cashRows: ReconciliationRow[] = [];
    const bankRows: ReconciliationRow[] = [];
    const cardRows: ReconciliationRow[] = [];

    for (const row of visibleReconciliationRows) {
      if (isAggregateAccount(row[0])) continue;
      const cat = getReconRowCategory(row[0], isSparexpert, accountCatalog);
      if (cat === "cash") cashRows.push(row);
      else if (cat === "bank") bankRows.push(row);
      else cardRows.push(row);
    }

    const calcTotals = (rows: ReconciliationRow[]) =>
      rows.reduce(
        (acc, [, received, previous, expense, supplier, transfer = 0]) => {
          const current = previous + received - supplier - expense + (transfer || 0);
          return {
            count: acc.count + 1,
            previous: acc.previous + previous,
            received: acc.received + received,
            expense: acc.expense + expense,
            supplier: acc.supplier + supplier,
            transfer: acc.transfer + (transfer || 0),
            current: acc.current + current,
          };
        },
        { count: 0, previous: 0, received: 0, expense: 0, supplier: 0, transfer: 0, current: 0 }
      );

    return [
      {
        key: "cash" as const,
        title: "Kassa Hesabları",
        icon: <Banknote size={15} className="recon-group-icon icon-cash" />,
        rows: cashRows,
        totals: calcTotals(cashRows),
      },
      {
        key: "bank" as const,
        title: "Rəsmi Bank Hesabları",
        icon: <Building2 size={15} className="recon-group-icon icon-bank" />,
        rows: bankRows,
        totals: calcTotals(bankRows),
      },
      {
        key: "card" as const,
        title: "Kart Hesabları",
        icon: <CreditCard size={15} className="recon-group-icon icon-card" />,
        rows: cardRows,
        totals: calcTotals(cardRows),
      },
    ].filter((sec) => sec.rows.length > 0);
  }, [visibleReconciliationRows, isSparexpert, accountCatalog]);\n\n'''
    content = content[:start_idx] + clean_recon_sections + content[end_idx:]

# 4. Clean up the reconciliation toolbar and table render in JSX
old_panel_block = '''              <section className="reconciliation-panel">
              <div className="reconciliation-toolbar">
                <div className="reconciliation-title">
                  <div>
                    <div className="panel-title-row"><h2>Hesab xülasəsi</h2><em>{visibleReconciliationRows.length} hesab</em></div>
                    <small>Şəxs və kanal üzrə cari qalıq və hərəkət</small>
                  </div>
                </div>
                <div className="reconciliation-toolbar-actions">
                  <div className="recon-view-toggle" role="group" aria-label="Görünüş rejimi">
                    <button
                      type="button"
                      className={cx("recon-toggle-btn", reconViewMode === "cards" && "active")}
                      title="Kart görünüşü (Azart mobil dizaynı)"
                      onClick={() => setReconViewMode("cards")}
                    >
                      <LayoutGrid size={13} />
                      <span className="hide-xs">Kartlar</span>
                    </button>
                    <button
                      type="button"
                      className={cx("recon-toggle-btn", reconViewMode === "table" && "active")}
                      title="Kompakt cədvəl görünüşü"
                      onClick={() => setReconViewMode("table")}
                    >
                      <List size={13} />
                      <span className="hide-xs">Cədvəl</span>
                    </button>
                  </div>
                  <label className="reconciliation-search"><Search size={16} /><input value={reconciliationQuery} onChange={(event) => setReconciliationQuery(event.target.value)} placeholder="Şəxs və ya hesab axtar..." /></label>
                  <button
                    type="button"
                    className="panel-expand-btn"
                    title="Hesablama qaydalarını idarə et (Avto TÖ, Köçürmə və s.)"
                    onClick={() => setView("settings")}
                  >
                    <Settings size={15} />
                  </button>
                  <button
                    type="button"
                    className={cx("panel-expand-btn", (focusMode === "summary" || splitRatio <= 36) && "active")}
                    title={focusMode === "summary" ? "İki panel görünüşünə qayıt" : splitRatio <= 36 ? "Tam ekran genişləndir (100%)" : "Hesab xülasəsini genişləndir (32% / 68%)"}
                    onClick={() => {
                      if (focusMode === "summary") {
                        setFocusMode("split");
                        setSplitRatio(58);
                      } else if (splitRatio <= 36) {
                        setFocusMode("summary");
                      } else {
                        setFocusMode("split");
                        setSplitRatio(32);
                      }
                    }}
                  >
                    {focusMode === "summary" ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  </button>
                </div>
              </div>
              <div className={cx("reconciliation-table", isSparexpert && "is-sparexpert", reconViewMode === "cards" ? "is-card-mode" : "is-table-mode")}>
                {reconViewMode === "table" && (
                  <div className="reconciliation-head">
                    <span className="recon-head-person">Şəxs / Hesab</span>
                    <span className="recon-head-current">Cari qalıq</span>
                    <span className="recon-head-previous">Əvvəldən qalıq</span>
                    <span className="recon-head-received">Vəsait qəbulu</span>
                    {isSparexpert ? (
                      <>
                        <span className="recon-head-supplier">Ödəniş (TÖ)</span>
                        <span className="recon-head-expense">Rasxod</span>
                        <span className="recon-head-transfer">Daxili Köçürmə</span>
                      </>
                    ) : (
                      <>
                        <span className="recon-head-expense">Xərc</span>
                        <span className="recon-head-supplier">Təchizatçıya ödəniş</span>
                      </>
                    )}
                  </div>
                )}
                <div className="reconciliation-mobile-head" aria-hidden="true">
                  <span>Ad / Hesab</span>
                  <span>Cari qalıq</span>
                  <span>Əvvəldən</span>
                  <span>Qəbul</span>
                  <span>{isSparexpert ? "Ödəniş" : "Xərc"}</span>
                  <span>{isSparexpert ? "Rasxod" : "Təchizatçı öd."}</span>
                  {isSparexpert && <span>Köçürmə</span>}
                </div>
                <div className="reconciliation-body">
                  {reconSections.map((section) => (
                    <div key={section.key} className="recon-section-block">
                      <div className="recon-section-divider">
                        <div className="recon-section-header">
                          <div className="recon-section-title">
                            <span className={cx("recon-section-icon", `icon-${section.key}`)}>{section.icon}</span>
                            <strong>{section.title}</strong>
                            <span className="recon-section-count">{section.rows.length} hesab</span>
                          </div>
                          <div className="recon-section-subtotal">
                            <small>Bölmə qalığı:</small>
                            <strong className={section.totals.current < 0 ? "negative" : "positive"}>
                              {formatMoney(section.totals.current, "AZN")}
                            </strong>
                          </div>
                        </div>
                      </div>
                      {reconViewMode === "cards" ? (
                        <div className="recon-card-grid">
                          {section.rows.map(renderReconCard)}
                        </div>
                      ) : (
                        section.rows.map(renderReconRow)
                      )}
                    </div>
                  ))}

                  {/* Grand total summary card */}
                  <div className="recon-grand-total-card">
                    <div className="recon-gt-head">
                      <div className="recon-gt-title">
                        <WalletCards size={18} />
                        <strong>Ümumi Cəmi Qalıq</strong>
                        <span className="recon-gt-badge">{detailReconciliationRows.length} hesab</span>
                      </div>
                      <strong className={reconciliationTotals.previous + reconciliationTotals.received - reconciliationTotals.supplier - reconciliationTotals.expense + (reconciliationTotals.transfer || 0) < 0 ? "recon-gt-balance negative" : "recon-gt-balance positive"}>
                        {formatMoney(
                          isSparexpert
                            ? reconciliationTotals.previous + reconciliationTotals.received - reconciliationTotals.supplier - reconciliationTotals.expense + (reconciliationTotals.transfer || 0)
                            : reconciliationTotals.received + reconciliationTotals.previous - reconciliationTotals.expense - reconciliationTotals.supplier,
                          "AZN"
                        )}
                      </strong>
                    </div>
                    <div className="recon-gt-breakdown">
                      {reconSections.map((sec) => (
                        <div key={sec.key} className="recon-gt-pill">
                          <span className="recon-gt-pill-label">{sec.title.replace(" Hesabları", "")}</span>
                          <b className={sec.totals.current < 0 ? "negative" : "positive"}>{formatMoney(sec.totals.current, "AZN")}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>'''

new_panel_block = '''              <section className="reconciliation-panel">
              <div className="reconciliation-toolbar">
                <div className="reconciliation-title">
                  <div>
                    <div className="panel-title-row"><h2>Hesab xülasəsi</h2><em>{visibleReconciliationRows.length} hesab</em></div>
                    <small>Şəxs və kanal üzrə cari qalıq və hərəkət</small>
                  </div>
                </div>
                <div className="reconciliation-toolbar-actions">
                  <label className="reconciliation-search"><Search size={16} /><input value={reconciliationQuery} onChange={(event) => setReconciliationQuery(event.target.value)} placeholder="Şəxs və ya hesab axtar..." /></label>
                  <button
                    type="button"
                    className="panel-expand-btn"
                    title="Hesablama qaydalarını idarə et (Avto TÖ, Köçürmə və s.)"
                    onClick={() => setView("settings")}
                  >
                    <Settings size={15} />
                  </button>
                  <button
                    type="button"
                    className={cx("panel-expand-btn", (focusMode === "summary" || splitRatio <= 36) && "active")}
                    title={focusMode === "summary" ? "İki panel görünüşünə qayıt" : splitRatio <= 36 ? "Tam ekran genişləndir (100%)" : "Hesab xülasəsini genişləndir (32% / 68%)"}
                    onClick={() => {
                      if (focusMode === "summary") {
                        setFocusMode("split");
                        setSplitRatio(58);
                      } else if (splitRatio <= 36) {
                        setFocusMode("summary");
                      } else {
                        setFocusMode("split");
                        setSplitRatio(32);
                      }
                    }}
                  >
                    {focusMode === "summary" ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  </button>
                </div>
              </div>
              <div className={cx("reconciliation-table", isSparexpert && "is-sparexpert")}>
                <div className="reconciliation-head">
                  <span className="recon-head-person">Şəxs / Hesab</span>
                  <span className="recon-head-current">Cari qalıq</span>
                  <span className="recon-head-previous">Əvvəldən qalıq</span>
                  <span className="recon-head-received">Vəsait qəbulu</span>
                  {isSparexpert ? (
                    <>
                      <span className="recon-head-supplier">Ödəniş (TÖ)</span>
                      <span className="recon-head-expense">Rasxod</span>
                      <span className="recon-head-transfer">Daxili Köçürmə</span>
                    </>
                  ) : (
                    <>
                      <span className="recon-head-expense">Xərc</span>
                      <span className="recon-head-supplier">Təchizatçıya ödəniş</span>
                    </>
                  )}
                </div>
                <div className="reconciliation-mobile-head" aria-hidden="true">
                  <span>Ad / Hesab</span>
                  <span>Cari qalıq</span>
                  <span>Əvvəldən</span>
                  <span>Qəbul</span>
                  <span>{isSparexpert ? "Ödəniş" : "Xərc"}</span>
                  <span>{isSparexpert ? "Rasxod" : "Təchizatçı öd."}</span>
                  {isSparexpert && <span>Köçürmə</span>}
                </div>
                <div className="reconciliation-body">
                  {isSparexpert ? (
                    reconSections.map((section) => (
                      <div key={section.key} className="recon-group-block">
                        <div className="recon-group-divider">
                          <div className="recon-group-divider-content">
                            <div className="recon-group-title">
                              {section.icon}
                              <strong>{section.title}</strong>
                              <span className="recon-group-count">{section.rows.length}</span>
                            </div>
                            <div className="recon-group-subtotal">
                              <small>Cəmi qalıq:</small>
                              <strong className={section.totals.current < 0 ? "negative" : "positive"}>
                                {formatMoney(section.totals.current, "AZN")}
                              </strong>
                            </div>
                          </div>
                        </div>
                        {section.rows.map(renderReconRow)}
                      </div>
                    ))
                  ) : (
                    visibleReconciliationRows.map(renderReconRow)
                  )}
                </div>
              </div>'''

content = content.replace(old_panel_block.replace('\r\n', '\n'), new_panel_block.replace('\r\n', '\n'))
content = content.replace(old_panel_block.replace('\n', '\r\n'), new_panel_block.replace('\n', '\r\n'))

with open('daily-app/src/DailyWorkspace.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated DailyWorkspace.tsx: Azart Membran 100% restored!")
