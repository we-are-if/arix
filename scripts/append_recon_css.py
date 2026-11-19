import sys

css_rules = """
/* ==================== RECONCILIATION REDESIGN (SECTIONS & CARDS) ==================== */

.recon-view-toggle {
  display: inline-flex;
  align-items: center;
  background: var(--arix-nav-active, #f1f5f9);
  padding: 2px;
  border-radius: 8px;
  border: 1px solid var(--arix-line, #e2e8f0);
  gap: 2px;
}

.recon-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 0;
  background: transparent;
  color: var(--arix-muted, #64748b);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.recon-toggle-btn.active {
  background: var(--arix-panel, #ffffff);
  color: var(--arix-text, #0f172a);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.recon-section-block {
  margin-bottom: 14px;
}

.recon-section-divider {
  margin: 10px 0 8px 0;
  border-radius: 9px;
  background: color-mix(in srgb, var(--arix-nav-active, #f8fafc) 80%, var(--arix-panel, #ffffff));
  border: 1px solid var(--arix-line, #e2e8f0);
  padding: 7px 12px;
}

.recon-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.recon-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--arix-text, #0f172a);
}

.recon-section-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--arix-panel, #ffffff);
  border: 1px solid var(--arix-line, #e2e8f0);
}

.recon-section-icon.icon-cash { color: #059669; }
.recon-section-icon.icon-bank { color: #2563eb; }
.recon-section-icon.icon-card { color: #7c3aed; }

.recon-section-count {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--arix-muted, #64748b);
  background: color-mix(in srgb, var(--arix-muted, #64748b) 12%, transparent);
  padding: 1px 7px;
  border-radius: 10px;
}

.recon-section-subtotal {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.recon-section-subtotal small {
  color: var(--arix-muted, #64748b);
  font-weight: 500;
}

.recon-section-subtotal strong {
  font-size: 12.5px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}

.recon-section-subtotal strong.positive { color: #059669; }
.recon-section-subtotal strong.negative { color: #dc2626; }

/* Grid of Cards */
.recon-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 9px;
  padding: 2px 0 6px 0;
}

.recon-desktop-card {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 11px 13px;
  background: var(--arix-panel, #ffffff);
  border: 1px solid var(--arix-line, #e2e8f0);
  border-radius: 12px;
  box-sizing: border-box;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.recon-desktop-card:hover {
  border-color: color-mix(in srgb, var(--arix-primary, #3b82f6) 50%, var(--arix-line, #e2e8f0));
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  transform: translateY(-1.5px);
}

.recon-d-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.recon-d-identity {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.recon-d-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--arix-nav-active, #f8fafc);
  border: 1px solid var(--arix-line, #e2e8f0);
  flex-shrink: 0;
}

.recon-icon-cash { color: #059669; }
.recon-icon-card { color: #7c3aed; }

.recon-d-titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.recon-d-name {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--arix-text, #0f172a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recon-d-current {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
}

.recon-d-label {
  font-size: 9px;
  color: var(--arix-muted, #64748b);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.recon-d-balance {
  font-size: 14.5px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}

.recon-d-balance.positive { color: var(--arix-primary, #2563eb); }
.recon-d-balance.negative { color: #dc2626; }

.recon-d-pills {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(46px, 1fr));
  gap: 5px;
}

.recon-d-pill {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 5px 6px;
  border-radius: 8px;
  background: var(--arix-nav-active, #f8fafc);
  border: 1px solid var(--arix-line, #e2e8f0);
  min-width: 0;
  text-align: center;
}

.recon-d-pill.pill-neutral {
  background: color-mix(in srgb, var(--arix-muted, #64748b) 8%, var(--arix-panel, #ffffff));
}

.recon-d-pill.pill-positive {
  background: #ecfdf5;
  border-color: #a7f3d0;
}

.recon-d-pill.pill-positive .pill-label { color: #059669; }
.recon-d-pill.pill-positive .pill-val { color: #047857; font-weight: 700; }

.recon-d-pill.pill-warning {
  background: #fffbeb;
  border-color: #fde68a;
}

.recon-d-pill.pill-warning .pill-label { color: #d97706; }
.recon-d-pill.pill-warning .pill-val { color: #b45309; font-weight: 700; }

.recon-d-pill.pill-negative {
  background: #fef2f2;
  border-color: #fecaca;
}

.recon-d-pill.pill-negative .pill-label { color: #dc2626; }
.recon-d-pill.pill-negative .pill-val { color: #b91c1c; font-weight: 700; }

.recon-d-pill .pill-label {
  font-size: 8.5px;
  font-weight: 600;
  color: var(--arix-muted, #64748b);
  white-space: nowrap;
}

.recon-d-pill .pill-val {
  font-size: 11px;
  font-weight: 650;
  color: var(--arix-text, #0f172a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}

.recon-d-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 4px;
  border-top: 1px dashed var(--arix-line, #e2e8f0);
}

.recon-d-hint {
  font-size: 10px;
  color: var(--arix-muted, #94a3b8);
  font-weight: 500;
}

.recon-d-chevron {
  color: var(--arix-muted, #94a3b8);
  transition: transform 0.15s ease;
}

.recon-desktop-card:hover .recon-d-chevron {
  transform: translateX(2px);
  color: var(--arix-primary, #3b82f6);
}

/* Grand Total Card */
.recon-grand-total-card {
  margin-top: 14px;
  padding: 12px 16px;
  border-radius: 12px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--arix-primary, #3b82f6) 8%, var(--arix-panel, #ffffff)), color-mix(in srgb, var(--arix-primary, #3b82f6) 3%, var(--arix-panel, #ffffff)));
  border: 1px solid color-mix(in srgb, var(--arix-primary, #3b82f6) 25%, var(--arix-line, #e2e8f0));
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.recon-gt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.recon-gt-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  font-weight: 750;
  color: var(--arix-text, #0f172a);
}

.recon-gt-badge {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--arix-primary, #2563eb);
  background: color-mix(in srgb, var(--arix-primary, #2563eb) 12%, transparent);
  padding: 1px 7px;
  border-radius: 10px;
}

.recon-gt-balance {
  font-size: 17px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--arix-primary, #2563eb);
}

.recon-gt-balance.negative { color: #dc2626; }

.recon-gt-breakdown {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: 8px;
}

.recon-gt-pill {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--arix-panel, #ffffff);
  border: 1px solid var(--arix-line, #e2e8f0);
}

.recon-gt-pill-label {
  font-size: 9.5px;
  color: var(--arix-muted, #64748b);
  font-weight: 600;
  text-transform: uppercase;
}

.recon-gt-pill b {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--arix-text, #0f172a);
  font-variant-numeric: tabular-nums;
}

.recon-gt-pill b.positive { color: #059669; }
.recon-gt-pill b.negative { color: #dc2626; }
"""

with open('daily-app/src/panel-shell.css', 'a', encoding='utf-8') as f:
    f.write(css_rules)

print("Appended reconciliation CSS rules to panel-shell.css")
