import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowRight, BarChart3, Boxes, Building2, Check, ChevronDown, CreditCard, ExternalLink, FileCheck2, Globe2, Landmark, Mail, Moon, Phone, ReceiptText, ShieldCheck, Sun, Workflow } from "lucide-react";
import AriXLogo from "../../src/components/AriXLogo";
import { content, type Language } from "./i18n";
import "./styles.css";

const capabilityIcons = [Building2, Workflow, Boxes, Landmark, CreditCard, ReceiptText, FileCheck2, BarChart3];
const documentNames = ["Commercial Invoice", "Proforma Invoice", "Packing List", "E-Fatura", "E-İrsaliye", "E-Arşiv"];

const moduleMeta = [
  { icon: Building2, name: "AriX Panel", href: "https://dev.arix.az/" },
  { icon: Workflow, name: "AriX Order", href: "https://order.arix.az/" },
  { icon: Landmark, name: "AriX Banks", href: null },
  { icon: CreditCard, name: "AriX Payments", href: null },
];

function App() {
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem("arix-language") as Language) || "tr");
  const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem("arix-theme") as "light" | "dark") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  const c = content[language];
  const modules = moduleMeta.map((module, index) => ({ ...module, label:c.moduleLabels[index], text:c.moduleTexts[index], status:module.href ? c.enter : c.pending }));

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("arix-theme", theme); }, [theme]);
  useEffect(() => { document.documentElement.lang = language; localStorage.setItem("arix-language", language); }, [language]);

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="AriX ana sayfa">
          <AriXLogo className="brand-mark" />
          <span><b>AriX</b><small>{c.system}</small></span>
        </a>
        <nav aria-label="Ana menü">
          <a href="#platform">{c.nav[0]}</a><a href="#belgeler">{c.nav[1]}</a><a href="#guven">{c.nav[2]}</a>
        </nav>
        <div className="header-tools">
          <label className="language-control"><Globe2 /><select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label="Language"><option value="tr">TR</option><option value="az">AZ</option><option value="en">EN</option></select></label>
          <button className="theme-control" type="button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={c.theme}>{theme === "light" ? <Moon /> : <Sun />}</button>
          <details className="system-menu">
          <summary>{c.login} <ChevronDown size={16} /></summary>
          <div className="system-menu-panel">
            {modules.map(({ icon: Icon, name, label, href }) => href ? (
              <a href={href} key={name}><Icon /><span><b>{name}</b><small>{label}</small></span><ExternalLink /></a>
            ) : (
              <div className="system-menu-pending" key={name}><Icon /><span><b>{name}</b><small>{label}</small></span></div>
            ))}
          </div>
          </details>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">{c.eyebrow}</p>
          <h1>AriX</h1>
          <p className="hero-lead">{c.lead}</p>
          <div className="hero-actions">
            <a className="primary" href="#platform">{c.discover} <ArrowRight size={18} /></a><a className="secondary" href="#moduller">{c.viewModules}</a>
          </div>
          <ul className="hero-points">
            {c.points.map(point => <li key={point}><Check size={16} /> {point}</li>)}
          </ul>
        </div>
        <div className="hero-visual" aria-label="AriX sipariş onay formu örneği">
          <div className="visual-bar"><span /><span /><span /><b>{c.preview}</b></div><img src="/approval-preview.png" alt={c.previewAlt} />
        </div>
      </section>

      <section className="proof-band" id="platform">
        {c.proof.map(item => <p key={item}>{item}</p>)}
      </section>

      <section className="modules" id="moduller">
        <div className="section-heading">
          <p className="eyebrow">{c.moduleEyebrow}</p><h2>{c.moduleTitle}</h2><p>{c.moduleLead}</p>
        </div>
        <div className="module-grid">
          {modules.map(({ icon: Icon, name, label, text, href }) => href ? (
            <a href={href} className="module-item" key={name}>
              <Icon aria-hidden="true" />
              <div><small>{label}</small><h3>{name}</h3><p>{text}</p></div>
              <ArrowRight aria-hidden="true" />
            </a>
          ) : (
            <div className="module-item is-pending" key={name}>
              <Icon aria-hidden="true" />
              <div><small>{label}</small><h3>{name}</h3><p>{text}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="capabilities">
        <div className="section-heading">
          <p className="eyebrow">{c.platformEyebrow}</p><h2>{c.platformTitle}</h2><p>{c.platformLead}</p>
        </div>
        <div className="capability-grid">
          {capabilityIcons.map((Icon, index) => (
            <article key={c.capabilityTitles[index]}>
              <Icon aria-hidden="true" />
              <h3>{c.capabilityTitles[index]}</h3><p>{c.capabilityTexts[index]}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="document-section" id="belgeler">
        <div className="document-copy">
          <p className="eyebrow">{c.financeEyebrow}</p><h2>{c.financeTitle}</h2><p>{c.financeLead}</p>
          <div className="document-list">
            <span><Landmark /> {c.financeList[0]}</span><span><CreditCard /> {c.financeList[1]}</span><span><FileCheck2 /> {c.financeList[2]}</span>
          </div>
        </div>
        <div className="metric-panel">
          {c.steps.map((step,index) => <div key={step}><strong>0{index+1}</strong><span>{step}</span></div>)}
        </div>
      </section>

      <section className="document-catalog">
        <div className="section-heading">
          <p className="eyebrow">{c.docsEyebrow}</p><h2>{c.docsTitle}</h2><p>{c.docsLead}</p>
        </div>
        <div className="document-grid">
          {documentNames.map((name,index) => (
            <article key={name}>
              <FileCheck2 aria-hidden="true" />
              <div><h3>{name}</h3><p>{c.docTexts[index]}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="security" id="guven">
        <ShieldCheck />
        <div><p className="eyebrow">{c.securityEyebrow}</p><h2>{c.securityTitle}</h2><p>{c.securityLead}</p></div><a href="#iletisim">{c.contactUs} <ArrowRight size={17} /></a>
      </section>

      <section className="contact" id="iletisim">
        <div>
          <p className="eyebrow">{c.contactEyebrow}</p><h2>{c.contactTitle}</h2><p>{c.contactLead}</p>
        </div>
        <div className="contact-links">
          <a href="tel:+905404283938"><Phone /><span><small>{c.phone}</small><b>+90 540 428 39 38</b></span></a><a href="mailto:arif@arix.az"><Mail /><span><small>{c.direct}</small><b>arif@arix.az</b></span></a><a href="mailto:info@arix.az"><Mail /><span><small>{c.info}</small><b>info@arix.az</b></span></a>
        </div>
      </section>

      <footer>
        <div className="brand"><AriXLogo className="brand-mark" /><span><b>AriX</b><small>{c.system}</small></span></div>
        <p><a href="tel:+905404283938">+90 540 428 39 38</a> · <a href="mailto:info@arix.az">info@arix.az</a></p>
        <span>© 2026 AriX</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
