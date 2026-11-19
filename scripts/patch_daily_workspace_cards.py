import sys, re

sys.stdout.reconfigure(encoding='utf-8')

with open('daily-app/src/DailyWorkspace.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add renderSparexpertReconCard right before reconSections
render_sparexpert_card_code = '''
  const renderSparexpertReconCard = ([name, received, previous, expense, supplier, transfer = 0]: ReconciliationRow) => {
    const current = previous + received - supplier - expense + (transfer || 0);
    const { cleanName, badgeText, badgeClass } = getAccountDisplayInfo(name, true, accountCatalog, false);
    const acc = accountCatalog.find((a) => a.id === name || a.name === name);
    const channelBank = acc?.channel || badgeText;

    return (
      <article
        key={name}
        className="sp-recon-card clickable-recon-row"
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
        <div className="sp-recon-card-head">
          <div className="sp-recon-card-identity">
            <span className="sp-recon-card-icon">
              {badgeClass === "bank" ? (
                <BankLogo bank={channelBank} size={22} />
              ) : badgeClass === "cash" ? (
                <Banknote size={19} className="sp-icon-cash" />
              ) : (
                <CreditCard size={19} className="sp-icon-card" />
              )}
            </span>
            <div className="sp-recon-card-titles">
              <span className="sp-recon-card-name" title={cleanName}>{cleanName}</span>
              <span className={cx("recon-badge", badgeClass)}>{badgeText}</span>
            </div>
          </div>
          <div className="sp-recon-card-current">
            <span className="sp-recon-card-label">Cari qalıq</span>
            <strong className={cx("sp-recon-card-balance", current < 0 ? "negative" : "positive")}>
              {formatMoney(current, "AZN")}
            </strong>
          </div>
        </div>

        {/* 5 Pills in Google Sheet exact sequence: Əvvəl -> Qəbul -> Ödəniş -> Rasxod -> Köçürmə (en sonda) */}
        <div className="sp-recon-card-pills">
          <div className="sp-recon-pill pill-neutral" title="Əvvəldən qalıq">
            <span className="sp-pill-label">Əvvəl</span>
            <span className="sp-pill-val">{formatMoney(previous, "AZN")}</span>
          </div>
          <div className={cx("sp-recon-pill", received > 0 && "pill-positive")} title="Vəsait qəbulu / Mədaxil">
            <span className="sp-pill-label">+Qəbul</span>
            <span className="sp-pill-val">{formatMoney(received, "AZN")}</span>
          </div>
          <div className={cx("sp-recon-pill", supplier > 0 && "pill-warning")} title="Təchizatçı ödənişi (TÖ)">
            <span className="sp-pill-label">−Ödəniş</span>
            <span className="sp-pill-val">{formatMoney(supplier, "AZN")}</span>
          </div>
          <div className={cx("sp-recon-pill", expense > 0 && "pill-negative")} title="Rasxod / Xərclər">
            <span className="sp-pill-label">−Rasxod</span>
            <span className="sp-pill-val">{formatMoney(expense, "AZN")}</span>
          </div>
          <div className={cx("sp-recon-pill", transfer > 0 ? "pill-positive" : transfer < 0 ? "pill-negative" : "")} title="Daxili Köçürmə (en sonda)">
            <span className="sp-pill-label">±Köçürmə</span>
            <span className="sp-pill-val">
              {transfer !== 0 ? (transfer > 0 ? `+${formatMoney(transfer, "AZN")}` : formatMoney(transfer, "AZN")) : "0 ₼"}
            </span>
          </div>
        </div>

        <div className="sp-recon-card-footer">
          <span className="sp-recon-card-hint">Günün dökümünə baxmaq üçün toxunun</span>
          <ChevronRight size={13} className="sp-recon-chevron" />
        </div>
      </article>
    );
  };
'''

target_recon_row_end = '    );\n  };\n\n  const reconSections = useMemo(() => {'
if target_recon_row_end not in content:
    target_recon_row_end = '    );\r\n  };\r\n\r\n  const reconSections = useMemo(() => {'

if target_recon_row_end in content:
    content = content.replace(
        target_recon_row_end,
        '    );\n  };\n' + render_sparexpert_card_code + '\n  const reconSections = useMemo(() => {'
    )
    print("Added renderSparexpertReconCard successfully!")
else:
    print("Could not find target_recon_row_end!")
    sys.exit(1)

# 2. Update the reconciliation table rendering in JSX
old_recon_render = '''              <div className={cx("reconciliation-table", isSparexpert && "is-sparexpert")}>
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

new_recon_render = '''              {isSparexpert ? (
                <div className="reconciliation-table is-sparexpert-cards">
                  <div className="reconciliation-body">
                    {reconSections.map((section) => (
                      <div key={section.key} className="recon-group-block">
                        <div className="recon-group-divider">
                          <div className="recon-group-divider-content">
                            <div className="recon-group-title">
                              <span className={cx("recon-group-icon", `icon-${section.key}`)}>{section.icon}</span>
                              <strong>{section.title}</strong>
                              <span className="recon-group-count">{section.rows.length} hesab</span>
                            </div>
                            <div className="recon-group-subtotal">
                              <small>Cəmi qalıq:</small>
                              <strong className={section.totals.current < 0 ? "negative" : "positive"}>
                                {formatMoney(section.totals.current, "AZN")}
                              </strong>
                            </div>
                          </div>
                        </div>
                        <div className="sp-recon-cards-list">
                          {section.rows.map(renderSparexpertReconCard)}
                        </div>
                      </div>
                    ))}

                    {/* SparExpert Grand Total Summary Card */}
                    <div className="sp-recon-grand-total">
                      <div className="sp-gt-head">
                        <div className="sp-gt-title">
                          <WalletCards size={17} />
                          <strong>Ümumi Cəmi Qalıq</strong>
                          <span className="sp-gt-count">{detailReconciliationRows.length} hesab</span>
                        </div>
                        <strong className={reconciliationTotals.previous + reconciliationTotals.received - reconciliationTotals.supplier - reconciliationTotals.expense + (reconciliationTotals.transfer || 0) < 0 ? "sp-gt-balance negative" : "sp-gt-balance positive"}>
                          {formatMoney(
                            reconciliationTotals.previous + reconciliationTotals.received - reconciliationTotals.supplier - reconciliationTotals.expense + (reconciliationTotals.transfer || 0),
                            "AZN"
                          )}
                        </strong>
                      </div>
                      <div className="sp-gt-breakdown">
                        {reconSections.map((sec) => (
                          <div key={sec.key} className="sp-gt-pill">
                            <span className="sp-gt-pill-label">{sec.title.replace(" Hesabları", "")}</span>
                            <b className={sec.totals.current < 0 ? "negative" : "positive"}>
                              {formatMoney(sec.totals.current, "AZN")}
                            </b>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="reconciliation-table">
                  <div className="reconciliation-head">
                    <span className="recon-head-person">Şəxs / Hesab</span>
                    <span className="recon-head-current">Cari qalıq</span>
                    <span className="recon-head-previous">Əvvəldən qalıq</span>
                    <span className="recon-head-received">Vəsait qəbulu</span>
                    <span className="recon-head-expense">Xərc</span>
                    <span className="recon-head-supplier">Təchizatçıya ödəniş</span>
                  </div>
                  <div className="reconciliation-mobile-head" aria-hidden="true">
                    <span>Ad / Hesab</span>
                    <span>Cari qalıq</span>
                    <span>Əvvəldən</span>
                    <span>Qəbul</span>
                    <span>Xərc</span>
                    <span>Təchizatçı öd.</span>
                  </div>
                  <div className="reconciliation-body">
                    {visibleReconciliationRows.map(renderReconRow)}
                  </div>
                </div>
              )}'''

content = content.replace(old_recon_render.replace('\r\n', '\n'), new_recon_render.replace('\r\n', '\n'))
content = content.replace(old_recon_render.replace('\n', '\r\n'), new_recon_render.replace('\n', '\r\n'))

with open('daily-app/src/DailyWorkspace.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated reconciliation rendering in DailyWorkspace.tsx successfully!")
