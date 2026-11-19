import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('daily-app/src/styles.css', 'r', encoding='utf-8') as f:
    css_content = f.read()

sparexpert_card_css = '''
/* ==================== SPARXPERT RECONCILIATION CARDS (ISOLATED) ==================== */
.reconciliation-table.is-sparexpert-cards {
  display: flex !important;
  flex-direction: column !important;
  gap: 0 !important;
  border: none !important;
  background: transparent !important;
  width: 100% !important;
}

.reconciliation-table.is-sparexpert-cards .reconciliation-head,
.reconciliation-table.is-sparexpert-cards .reconciliation-mobile-head {
  display: none !important;
}

.reconciliation-table.is-sparexpert-cards .reconciliation-body {
  display: flex !important;
  flex-direction: column !important;
  gap: 14px !important;
  padding: 6px 6px 20px 6px !important;
  overflow-y: auto !important;
}

.reconciliation-table.is-sparexpert-cards .recon-group-block {
  display: flex !important;
  flex-direction: column !important;
  background: color-mix(in srgb, var(--panel, #ffffff) 97%, var(--muted, #64748b)) !important;
  border: 1px solid var(--line, #e2e8f0) !important;
  border-radius: 14px !important;
  overflow: hidden !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03) !important;
}

.reconciliation-table.is-sparexpert-cards .recon-group-divider {
  display: block !important;
  background: color-mix(in srgb, var(--panel, #ffffff) 65%, var(--arix-nav-active, #f1f5f9)) !important;
  border-bottom: 1px solid var(--line, #e2e8f0) !important;
  padding: 10px 14px !important;
}

.reconciliation-table.is-sparexpert-cards .recon-group-divider-content {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 10px !important;
}

.reconciliation-table.is-sparexpert-cards .recon-group-title {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  font-size: 13px !important;
  font-weight: 750 !important;
  color: var(--text, #0f172a) !important;
}

.reconciliation-table.is-sparexpert-cards .recon-group-icon {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}
.reconciliation-table.is-sparexpert-cards .recon-group-icon.icon-cash { color: #059669 !important; }
.reconciliation-table.is-sparexpert-cards .recon-group-icon.icon-bank { color: #2563eb !important; }
.reconciliation-table.is-sparexpert-cards .recon-group-icon.icon-card { color: #7c3aed !important; }

.reconciliation-table.is-sparexpert-cards .recon-group-count {
  font-size: 10.5px !important;
  font-weight: 600 !important;
  background: color-mix(in srgb, var(--muted, #64748b) 12%, transparent) !important;
  padding: 1px 7px !important;
  border-radius: 9px !important;
  color: var(--muted, #64748b) !important;
}

.reconciliation-table.is-sparexpert-cards .recon-group-subtotal {
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  font-size: 11.5px !important;
}

.reconciliation-table.is-sparexpert-cards .recon-group-subtotal small {
  color: var(--muted, #64748b) !important;
  font-weight: 500 !important;
}

.reconciliation-table.is-sparexpert-cards .recon-group-subtotal strong {
  font-size: 13px !important;
  font-weight: 800 !important;
  font-variant-numeric: tabular-nums !important;
}
.reconciliation-table.is-sparexpert-cards .recon-group-subtotal strong.positive { color: #059669 !important; }
.reconciliation-table.is-sparexpert-cards .recon-group-subtotal strong.negative { color: #dc2626 !important; }

.sp-recon-cards-list {
  display: flex !important;
  flex-direction: column !important;
  gap: 10px !important;
  padding: 10px !important;
}

/* THE CARD CONTAINER - 100% independent from article styles */
div.sp-recon-card {
  display: flex !important;
  flex-direction: column !important;
  background: var(--panel, #ffffff) !important;
  border: 1px solid var(--line, #e2e8f0) !important;
  border-radius: 12px !important;
  padding: 12px 14px !important;
  gap: 11px !important;
  width: 100% !important;
  box-sizing: border-box !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04) !important;
  transition: all 0.16s ease !important;
  cursor: pointer !important;
  min-height: unset !important;
  height: auto !important;
}

div.sp-recon-card:hover {
  border-color: color-mix(in srgb, var(--primary, #2563eb) 45%, var(--line, #e2e8f0)) !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.07) !important;
  transform: translateY(-1px);
}

.sp-recon-card-head {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 10px !important;
  width: 100% !important;
}

.sp-recon-card-identity {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  min-width: 0 !important;
}

.sp-recon-card-icon {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 34px !important;
  height: 34px !important;
  border-radius: 9px !important;
  background: color-mix(in srgb, var(--muted, #64748b) 9%, var(--panel, #ffffff)) !important;
  flex-shrink: 0 !important;
}

.sp-icon-cash { color: #059669 !important; }
.sp-icon-card { color: #7c3aed !important; }

.sp-recon-card-titles {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  min-width: 0 !important;
  flex-wrap: wrap !important;
}

.sp-recon-card-name {
  font-size: 14px !important;
  font-weight: 700 !important;
  color: var(--text, #0f172a) !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.sp-recon-card-current {
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-end !important;
  flex-shrink: 0 !important;
}

.sp-recon-card-label {
  font-size: 9px !important;
  color: var(--muted, #64748b) !important;
  font-weight: 600 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.05em !important;
}

.sp-recon-card-balance {
  font-size: 15px !important;
  font-weight: 850 !important;
  font-variant-numeric: tabular-nums !important;
  letter-spacing: -0.01em !important;
}
.sp-recon-card-balance.positive { color: #059669 !important; }
.sp-recon-card-balance.negative { color: #dc2626 !important; }

/* 5 Pills in Google Sheet exact sequence: Əvvəl -> +Qəbul -> −Ödəniş -> −Rasxod -> ±Köçürmə */
.sp-recon-card-pills {
  display: grid !important;
  grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
  gap: 7px !important;
  width: 100% !important;
}

@media (max-width: 620px) {
  .sp-recon-card-pills {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }
}

.sp-recon-pill {
  display: flex !important;
  flex-direction: column !important;
  gap: 2px !important;
  padding: 6px 8px !important;
  border-radius: 8px !important;
  background: color-mix(in srgb, var(--muted, #64748b) 6%, var(--panel, #ffffff)) !important;
  border: 1px solid var(--line, #e2e8f0) !important;
  min-width: 0 !important;
  text-align: center !important;
}

.sp-pill-label {
  font-size: 9.5px !important;
  font-weight: 600 !important;
  color: var(--muted, #64748b) !important;
  text-transform: uppercase !important;
  letter-spacing: 0.03em !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.sp-pill-val {
  font-size: 12px !important;
  font-weight: 700 !important;
  font-variant-numeric: tabular-nums !important;
  color: var(--text, #0f172a) !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.sp-recon-pill.pill-positive {
  background: color-mix(in srgb, #10b981 12%, var(--panel, #ffffff)) !important;
  border-color: color-mix(in srgb, #10b981 30%, transparent) !important;
}
.sp-recon-pill.pill-positive .sp-pill-val { color: #059669 !important; font-weight: 750 !important; }

.sp-recon-pill.pill-warning {
  background: color-mix(in srgb, #f59e0b 12%, var(--panel, #ffffff)) !important;
  border-color: color-mix(in srgb, #f59e0b 30%, transparent) !important;
}
.sp-recon-pill.pill-warning .sp-pill-val { color: #d97706 !important; font-weight: 750 !important; }

.sp-recon-pill.pill-negative {
  background: color-mix(in srgb, #ef4444 12%, var(--panel, #ffffff)) !important;
  border-color: color-mix(in srgb, #ef4444 30%, transparent) !important;
}
.sp-recon-pill.pill-negative .sp-pill-val { color: #dc2626 !important; font-weight: 750 !important; }

.sp-recon-card-footer {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding-top: 6px !important;
  border-top: 1px dashed color-mix(in srgb, var(--line, #e2e8f0) 70%, transparent) !important;
  color: var(--muted, #64748b) !important;
  font-size: 11px !important;
  width: 100% !important;
}

.sp-recon-card-hint {
  font-size: 11px !important;
  color: var(--muted, #64748b) !important;
}

.sp-recon-chevron {
  opacity: 0.6 !important;
  transition: transform 0.15s ease !important;
}

div.sp-recon-card:hover .sp-recon-chevron {
  opacity: 1 !important;
  transform: translateX(3px) !important;
}

/* SparExpert Grand Total Summary Card */
.sp-recon-grand-total {
  margin-top: 6px !important;
  padding: 14px 16px !important;
  background: color-mix(in srgb, var(--primary, #2563eb) 6%, var(--panel, #ffffff)) !important;
  border: 1px solid color-mix(in srgb, var(--primary, #2563eb) 24%, var(--line, #e2e8f0)) !important;
  border-radius: 14px !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 10px !important;
}

.sp-gt-head {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 10px !important;
}

.sp-gt-title {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  font-size: 13px !important;
  font-weight: 750 !important;
  color: var(--text, #0f172a) !important;
}

.sp-gt-count {
  font-size: 10.5px !important;
  font-weight: 600 !important;
  padding: 2px 7px !important;
  border-radius: 9px !important;
  background: color-mix(in srgb, var(--primary, #2563eb) 12%, transparent) !important;
  color: var(--primary, #2563eb) !important;
}

.sp-gt-balance {
  font-size: 16px !important;
  font-weight: 850 !important;
  font-variant-numeric: tabular-nums !important;
}
.sp-gt-balance.positive { color: #059669 !important; }
.sp-gt-balance.negative { color: #dc2626 !important; }

.sp-gt-breakdown {
  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  gap: 8px !important;
}

.sp-gt-pill {
  display: flex !important;
  flex-direction: column !important;
  gap: 3px !important;
  padding: 6px 10px !important;
  border-radius: 9px !important;
  background: color-mix(in srgb, var(--panel, #ffffff) 85%, transparent) !important;
  border: 1px solid color-mix(in srgb, var(--line, #e2e8f0) 80%, transparent) !important;
  text-align: center !important;
}

.sp-gt-pill-label {
  font-size: 10px !important;
  font-weight: 600 !important;
  color: var(--muted, #64748b) !important;
  text-transform: uppercase !important;
}

.sp-gt-pill b {
  font-size: 12.5px !important;
  font-weight: 750 !important;
  font-variant-numeric: tabular-nums !important;
}
.sp-gt-pill b.positive { color: #059669 !important; }
.sp-gt-pill b.negative { color: #dc2626 !important; }
'''

idx = css_content.find('/* ==================== SPARXPERT RECONCILIATION CARDS')
if idx != -1:
    css_content = css_content[:idx]

css_content = css_content.rstrip() + '\n' + sparexpert_card_css

with open('daily-app/src/styles.css', 'w', encoding='utf-8') as f:
    f.write(css_content)

print("Updated daily-app/src/styles.css with refined card styles successfully!")
