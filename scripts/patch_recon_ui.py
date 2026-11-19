import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('daily-app/src/DailyWorkspace.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Fix normalizeCardLimitSettings at line 225
old_norm = 'const reports = (isSparexpert ? SPAREXPERT_CARD_REPORT : IMPORTED_CARD_REPORT) as readonly {'
new_norm = 'const reports = [...IMPORTED_CARD_REPORT, ...SPAREXPERT_CARD_REPORT] as readonly {'
content = content.replace(old_norm, new_norm)

# 2. Add reconSections and renderReconCard
recon_helpers = '''
  const reconSections = useMemo(() => {
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
          const current = isSparexpert
            ? previous + received - supplier - expense + (transfer || 0)
            : received + previous - expense - supplier;
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
        icon: <Banknote size={16} className="recon-icon-cash" />,
        rows: cashRows,
        totals: calcTotals(cashRows),
      },
      {
        key: "bank" as const,
        title: "Rəsmi Bank Hesabları",
        icon: <Building2 size={16} className="recon-icon-bank" />,
        rows: bankRows,
        totals: calcTotals(bankRows),
      },
      {
        key: "card" as const,
        title: "Kart Hesabları",
        icon: <CreditCard size={16} className="recon-icon-card" />,
        rows: cardRows,
        totals: calcTotals(cardRows),
      },
    ].filter((sec) => sec.rows.length > 0);
  }, [visibleReconciliationRows, isSparexpert, accountCatalog]);

  const renderReconCard = ([name, received, previous, expense, supplier, transfer = 0]: ReconciliationRow) => {
    const current = isSparexpert
      ? previous + received - supplier - expense + (transfer || 0)
      : received + previous - expense - supplier;
    const autoTo = !isSparexpert && isAutoSupplierCollector(name);
    const { cleanName, badgeText, badgeClass } = getAccountDisplayInfo(name, isSparexpert, accountCatalog, autoTo);
    const acc = accountCatalog.find((a) => a.id === name || a.name === name);
    const channelBank = acc?.channel || badgeText;

    return (
      <article
        key={name}
        className="recon-desktop-card clickable-recon-row"
        role="button"
        tabIndex={0}
        title={`${cleanName} hesabının günün dökümünü açmaq üçün klikləyin`}
        onClick={() => setStatementAccountName(name)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setStatementAccountName(name);
          }
        }}
      >
        <div className="recon-d-head">
          <div className="recon-d-identity">
            <span className="recon-d-icon">
              {badgeClass === "bank" ? (
                <BankLogo bank={channelBank} size={22} />
              ) : badgeClass === "cash" ? (
                <Banknote size={18} className="recon-icon-cash" />
              ) : (
                <CreditCard size={18} className="recon-icon-card" />
              )}
            </span>
            <div className="recon-d-titles">
              <span className="recon-d-name" title={cleanName}>{cleanName}</span>
              <span className={cx("recon-badge", badgeClass)}>{badgeText}</span>
            </div>
          </div>
          <div className="recon-d-current">
            <span className="recon-d-label">Cari qalıq</span>
            <strong className={cx("recon-d-balance", current < 0 ? "negative" : "positive")}>
              {formatMoney(current, "AZN")}
            </strong>
          </div>
        </div>

        <div className="recon-d-pills">
          <div className="recon-d-pill pill-neutral" title="Əvvəldən qalıq">
            <span className="pill-label">Əvvəl</span>
            <span className="pill-val">{formatMoney(previous, "AZN")}</span>
          </div>
          <div className={cx("recon-d-pill", received > 0 && "pill-positive")} title="Vəsait qəbulu / Mədaxil">
            <span className="pill-label">+Qəbul</span>
            <span className="pill-val">{formatMoney(received, "AZN")}</span>
          </div>
          {isSparexpert ? (
            <>
              <div className={cx("recon-d-pill", supplier > 0 && "pill-warning")} title="Təchizatçı ödənişi (TÖ)">
                <span className="pill-label">−Ödəniş</span>
                <span className="pill-val">{formatMoney(supplier, "AZN")}</span>
              </div>
              <div className={cx("recon-d-pill", expense > 0 && "pill-negative")} title="Rasxod / Xərclər">
                <span className="pill-label">−Rasxod</span>
                <span className="pill-val">{formatMoney(expense, "AZN")}</span>
              </div>
              <div className={cx("recon-d-pill", transfer > 0 ? "pill-positive" : transfer < 0 ? "pill-negative" : "")} title="Daxili Köçürmə">
                <span className="pill-label">±Köçürmə</span>
                <span className="pill-val">{transfer !== 0 ? (transfer > 0 ? `+${formatMoney(transfer, "AZN")}` : formatMoney(transfer, "AZN")) : "0 ₼"}</span>
              </div>
            </>
          ) : (
            <>
              <div className={cx("recon-d-pill", expense > 0 && "pill-negative")} title="Xərc">
                <span className="pill-label">−Xərc</span>
                <span className="pill-val">{formatMoney(expense, "AZN")}</span>
              </div>
              <div className={cx("recon-d-pill", supplier > 0 && "pill-warning")} title="Təchizatçıya ödəniş">
                <span className="pill-label">−TÖ</span>
                <span className="pill-val">{formatMoney(supplier, "AZN")}</span>
              </div>
            </>
          )}
        </div>

        <div className="recon-d-footer">
          <span className="recon-d-hint">Günün dökümünü açmaq üçün klikləyin</span>
          <ChevronRight size={13} className="recon-d-chevron" />
        </div>
      </article>
    );
  };
'''

# Insert recon_helpers right after renderReconRow
if 'const renderReconCard =' not in content:
    target_str = '        <span data-label="Təchizatçı" className={cx("recon-cell-supplier", supplier ? "outflow" : "")}>{formatMoney(supplier, "AZN")}</span>\n          </>\n        )}\n      </article>\n    );\n  };'
    target_str_crlf = target_str.replace('\n', '\r\n')
    
    if target_str in content:
        content = content.replace(target_str, target_str + '\n' + recon_helpers)
    elif target_str_crlf in content:
        content = content.replace(target_str_crlf, target_str_crlf + '\r\n' + recon_helpers.replace('\n', '\r\n'))
    else:
        print("Warning: target_str not matched for renderReconCard")

# 3. Update the reconciliation toolbar and table render
old_toolbar_actions = '''                <div className="reconciliation-toolbar-actions">
                  <label className="reconciliation-search"><Search size={16} /><input value={reconciliationQuery} onChange={(event) => setReconciliationQuery(event.target.value)} placeholder="Şəxs və ya hesab axtar..." /></label>'''

new_toolbar_actions = '''                <div className="reconciliation-toolbar-actions">
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
                  <label className="reconciliation-search"><Search size={16} /><input value={reconciliationQuery} onChange={(event) => setReconciliationQuery(event.target.value)} placeholder="Şəxs və ya hesab axtar..." /></label>'''

content = content.replace(old_toolbar_actions.replace('\r\n', '\n'), new_toolbar_actions.replace('\r\n', '\n'))
content = content.replace(old_toolbar_actions.replace('\n', '\r\n'), new_toolbar_actions.replace('\n', '\r\n'))

# 4. Replace the old reconciliation-table block
old_recon_table = '''              <div className={cx("reconciliation-table", isSparexpert && "is-sparexpert")}>
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
                  {visibleReconciliationRows.map(renderReconRow)}
                </div>
              </div>'''

new_recon_table = '''              <div className={cx("reconciliation-table", isSparexpert && "is-sparexpert", reconViewMode === "cards" ? "is-card-mode" : "is-table-mode")}>
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

content = content.replace(old_recon_table.replace('\r\n', '\n'), new_recon_table.replace('\r\n', '\n'))
content = content.replace(old_recon_table.replace('\n', '\r\n'), new_recon_table.replace('\n', '\r\n'))

with open('daily-app/src/DailyWorkspace.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Applied patch part 2 successfully!")
