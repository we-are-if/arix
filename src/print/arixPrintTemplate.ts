import type { PrintFormConfig, PrintSettings } from "./printSettings";

const escapePrintHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const arixPlatformBrand = () => `
  <div class="arix-brand">
    <svg class="arix-logo" viewBox="20 12 70 76" aria-hidden="true">
      <polygon points="30,80 46,20 70,20 54,80" fill="#34d399"></polygon>
      <path d="M62 40 L84 62" stroke="#4f7ddc" stroke-width="10" stroke-linecap="round"></path>
      <path d="M84 40 L62 62" stroke="#4f7ddc" stroke-width="10" stroke-linecap="round"></path>
    </svg>
    <div class="arix-wordmark">
      <strong>AriX</strong>
      <span>Sənəd sistemi</span>
    </div>
  </div>
`;

const companyBrand = (companyLogo: string) => `
  <div class="company-brand">
    <img class="company-logo" src="${escapePrintHtml(companyLogo)}" alt="" />
  </div>
`;

export const arixPrintBaseCss = `
  :root { --arix-primary: #4f46e5; --arix-ink: #1e293b; --arix-muted: #64748b; --arix-line: #dfe5ee; --arix-soft: #f7f8fb; --arix-soft-indigo: #f3f3ff; }
  * { box-sizing: border-box; }
  body { margin: 0; color: var(--arix-ink); background: #fff; font-family: Arial, "Segoe UI", sans-serif; font-size: 10px; line-height: 1.35; }
  .arix-doc-header { margin-bottom: 12px; background: #fff; }
  .arix-header-main { display: grid; grid-template-columns: minmax(150px, 1fr) minmax(120px, 1fr) minmax(190px, 1fr); align-items: center; gap: 18px; padding: 4px 0 13px; }
  .arix-brand { display: flex; align-items: center; gap: 8px; min-width: 150px; }
  .arix-logo { width: 35px; height: 38px; }
  .company-brand { display: flex; min-width: 0; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .company-logo { width: auto; max-width: 130px; height: 42px; object-fit: contain; object-position: center; }
  .arix-wordmark strong { display: block; color: var(--arix-ink); font-size: 19px; font-weight: 700; line-height: 1; }
  .arix-wordmark span { display: block; margin-top: 4px; color: var(--arix-muted); font-size: 7px; font-weight: 400; }
  .arix-doc-identity { min-width: 0; text-align: right; }
  .arix-doc-identity .eyebrow { color: var(--arix-primary); font-size: 8px; font-weight: 600; }
  .arix-doc-identity h1 { margin: 3px 0 0; color: var(--arix-ink); font-size: 18px; font-weight: 600; line-height: 1.15; }
  .arix-doc-identity p { margin: 4px 0 0; color: var(--arix-muted); font-size: 9px; }
  .arix-meta-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); overflow: hidden; border: 1px solid var(--arix-line); border-radius: 8px; background: var(--arix-soft); }
  .arix-meta-item { min-width: 0; padding: 7px 9px; border-right: 1px solid var(--arix-line); }
  .arix-meta-item:last-child { border-right: 0; }
  .arix-meta-item span { display: block; color: var(--arix-muted); font-size: 8px; font-weight: 400; }
  .arix-meta-item strong { display: block; overflow: hidden; margin-top: 2px; font-size: 9px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
  .arix-section-title { display: flex; align-items: center; gap: 10px; margin: 15px 0 7px; color: var(--arix-ink); font-size: 10px; font-weight: 600; }
  .arix-section-title:after { content: ""; height: 1px; flex: 1; background: var(--arix-line); }
  .arix-table { width: 100%; border-collapse: collapse; border: 1px solid var(--arix-line); font-size: 9px; color: var(--arix-ink); }
  .arix-table th, .arix-table td { height: 28px; border: 1px solid var(--arix-line); padding: 5px 7px; vertical-align: middle; color: var(--arix-ink); font-size: 9px; font-weight: 400; line-height: 1.25; }
  .arix-table th:last-child, .arix-table td:last-child { border-right: 0; }
  .arix-table tbody tr:last-child td, .arix-table tfoot tr:last-child td { border-bottom: 0; }
  .arix-table th { background: var(--arix-soft); color: var(--arix-muted); font-size: 9px; font-weight: 600; }
  .arix-table tbody tr:nth-child(even) td:not(.pallet):not(.full) { background: #fbfcfd; }
  .arix-table tfoot td { background: var(--arix-soft); color: var(--arix-ink); font-size: 9px; font-weight: 600; }
  .arix-number { text-align: right; font-variant-numeric: tabular-nums; }
  .arix-center { text-align: center; }
  .arix-doc-footer { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-top: 14px; padding-top: 7px; border-top: 1px solid var(--arix-line); color: var(--arix-muted); font-size: 8px; }
  .arix-doc-footer strong { color: var(--arix-primary); }
  .arix-footer-note { margin-top: 5px; color: var(--arix-muted); font-size: 8px; line-height: 1.4; white-space: pre-line; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
`;

export const renderArixPrintHeader = ({
  title,
  subtitle,
  documentNo,
  date,
  status,
  source,
  settings,
  form,
}: {
  title: string;
  subtitle: string;
  documentNo: string;
  date: string;
  status: string;
  source: string;
  settings?: PrintSettings;
  form?: PrintFormConfig;
}) => `
  <header class="arix-doc-header">
    <div class="arix-header-main">
      ${arixPlatformBrand()}
      ${form?.showLogo === false || !settings?.companyLogo ? `<div></div>` : companyBrand(settings.companyLogo)}
      <div class="arix-doc-identity">
        <div class="eyebrow">AriX sənəd sistemi</div>
        <h1>${escapePrintHtml(title)}</h1>
        <p>${escapePrintHtml(subtitle)}</p>
      </div>
    </div>
    ${form?.showMeta === false ? "" : `<div class="arix-meta-strip">
      <div class="arix-meta-item"><span>Sənəd</span><strong>${escapePrintHtml(documentNo)}</strong></div>
      <div class="arix-meta-item"><span>Tarix</span><strong>${escapePrintHtml(date)}</strong></div>
      <div class="arix-meta-item"><span>Status</span><strong>${escapePrintHtml(status)}</strong></div>
      <div class="arix-meta-item"><span>Mənbə</span><strong>${escapePrintHtml(source)}</strong></div>
    </div>`}
  </header>
`;

export const renderArixPrintFooter = (documentNo: string, settings?: PrintSettings, form?: PrintFormConfig) => `
  ${form?.showFooter === false ? "" : `
    <footer class="arix-doc-footer">
      <span><strong>${escapePrintHtml(settings?.companyName || "AriX")}</strong>${form?.footerInfo ? ` · ${escapePrintHtml(form.footerInfo)}` : ""}</span>
      <span>${escapePrintHtml(documentNo)}</span>
    </footer>
    ${form?.footerNote ? `<div class="arix-footer-note">${escapePrintHtml(form.footerNote)}</div>` : ""}
  `}
`;
