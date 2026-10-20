import React, { useEffect, useMemo, useState } from "react";
import { Navigate, Routes, Route, NavLink, useLocation } from "react-router-dom";
import { createPortal } from "react-dom";
import AriXLogo from "./components/AriXLogo";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import ProductActivity from "./pages/ProductActivity";
import Counterparties from "./pages/Counterparties";
import MoneyActivity from "./pages/MoneyActivity";
import Company, { type CompanySection } from "./pages/Company";
import Reports from "./pages/Reports";
import Accounting from "./pages/Accounting";
import Trash from "./pages/Trash";
import DocumentCreatePanel, { DocumentCreateMenu, type DocumentCreateKind } from "./components/DocumentCreatePanel";
import { languageOptions, useI18n, useStaticDomTranslation } from "./i18n";
import GoogleSignIn, { type AuthUser } from "./components/GoogleSignIn";
import { requestJson } from "./api";

type Colors = {
  page: string;
  header: string;
  card: string;
  kpiLabel: string;
  chip: string;
  tableHead: string;
  grid: string;
  primaryBtn: string;
};
type CurrentEmployee = {
  id: string;
  name: string;
  role: string;
  email: string;
  picture?: string;
  companyId?: string;
  passwordChangeRequired?: boolean;
  permissions?: string[];
};
const cx = (...s: (string | false | undefined)[]) => s.filter(Boolean).join(" ");

const employees: CurrentEmployee[] = [
  { id: "arif", name: "Arif Mahmud", role: "Sahib", email: "arifmd@icloud.com" },
  { id: "ekrem", name: "Ekrem Tiryaki", role: "Rəhbər", email: "ekrem@arix.az" },
  { id: "serkan", name: "Serkan Şeremet", role: "Satış rəhbəri", email: "serkan@arix.az" },
  { id: "sami", name: "Sami", role: "Anbar əməliyyatları", email: "sami@arix.az" },
  { id: "mustafa", name: "Mustafa Yazman", role: "Maliyyə", email: "mustafa@arix.az" },
];

const I = {
  Home: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 11.5 12 4l9 7.5" /><path d="M5 10.5V20h5v-5h4v5h5v-9.5" />
    </svg>
  ),
  Package: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m3 7 9-4 9 4-9 4-9-4Z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" />
    </svg>
  ),
  Activity: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M20 11a8 8 0 0 0-13.7-5.5" />
      <path d="M6.3 5.5H10" />
      <path d="M6.3 5.5V2" />
      <path d="M4 13a8 8 0 0 0 13.7 5.5" />
      <path d="M17.7 18.5H14" />
      <path d="M17.7 18.5V22" />
    </svg>
  ),
  Receipt: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  ),
  Chart: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 15 4-4 3 3 5-7" />
    </svg>
  ),
  Wallet: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12" /><path d="M16 13h5" />
    </svg>
  ),
  Menu: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  ),
  Bell: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" />
    </svg>
  ),
  OnlinePay: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 11h18" /><path d="M7 15h4" />
      <path d="M16.5 3.5a4 4 0 0 1 4 4" /><path d="M16.5 6a1.5 1.5 0 0 1 1.5 1.5" />
    </svg>
  ),
  Reports: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),
  Trash: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="m18 7-1 13H7L6 7" /><path d="M10 11v5M14 11v5" />
    </svg>
  ),
  Contacts: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M16 20a4 4 0 0 0-8 0" /><circle cx="12" cy="8" r="4" />
      <path d="M20 19a3 3 0 0 0-2.5-2.95" /><path d="M17 4.3a4 4 0 0 1 0 7.4" />
    </svg>
  ),
  Company: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M8 19v-2a4 4 0 0 1 8 0v2" />
      <circle cx="12" cy="9" r="3" />
      <path d="M4 19v-1.4a3 3 0 0 1 3-3" />
      <path d="M20 19v-1.4a3 3 0 0 0-3-3" />
      <circle cx="5.8" cy="10.2" r="2" />
      <circle cx="18.2" cy="10.2" r="2" />
    </svg>
  ),
  Supplier: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 7h11v10H3z" /><path d="M14 10h3.5l3.5 3.5V17h-7" />
      <circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /><path d="M5 11h5" />
    </svg>
  ),
  Customer: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="9" cy="8" r="3.5" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M17 10.5h4" /><path d="M19 8.5v4" />
    </svg>
  ),
  ChevronDown: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  FilePlus: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M12 12v6M9 15h6" />
    </svg>
  ),
  Panel: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 5h16v14H4z" /><path d="M9 5v14" />
    </svg>
  ),
  Globe: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18" /><path d="M12 3a15 15 0 0 0 0 18" />
    </svg>
  ),
};

export default function App() {
  const location = useLocation();
  const { language, setLanguage, t } = useI18n();
  useStaticDomTranslation();
  // Tema (localStorage + sistem defaultu)
  const [theme, setTheme] = useState<string>(() => {
    if (typeof window === "undefined") return "light";
    const saved = localStorage.getItem("arix-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  useEffect(() => {
    try {
      localStorage.setItem("arix-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("arix-sidebar-collapsed") === "1";
  });
  useEffect(() => {
    try {
      localStorage.setItem("arix-sidebar-collapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);
  const [currentEmployee, setCurrentEmployee] = useState<CurrentEmployee | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    requestJson<{ data: AuthUser | null }>("/api/auth/session")
      .then((payload) => { if (!cancelled) setCurrentEmployee(payload.data); })
      .catch(() => { if (!cancelled) setCurrentEmployee(null); })
      .finally(() => { if (!cancelled) setAuthLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const [contactsOpen, setContactsOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("arix-contacts-open") === "1";
  });
  useEffect(() => {
    if (location.pathname.startsWith("/contacts")) setContactsOpen(true);
  }, [location.pathname]);
  useEffect(() => {
    try {
      localStorage.setItem("arix-contacts-open", contactsOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [contactsOpen]);
  const [companyOpen, setCompanyOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("arix-company-open") === "1";
  });
  useEffect(() => {
    if (location.pathname.startsWith("/company")) setCompanyOpen(true);
  }, [location.pathname]);
  useEffect(() => {
    try {
      localStorage.setItem("arix-company-open", companyOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [companyOpen]);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createKind, setCreateKind] = useState<DocumentCreateKind | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [joinRequests, setJoinRequests] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  const isDark = theme === "dark";
  const colors: Colors = useMemo(
    () => ({
      page: isDark ? "surface-page-dark text-slate-100" : "surface-page text-slate-900",
      header: isDark ? "glass-header-dark border-white/10" : "glass-header border-white/70",
      card: isDark ? "glass-panel-dark" : "glass-panel",
      kpiLabel: isDark ? "text-slate-400" : "text-slate-500",
      chip: isDark ? "glass-control-dark text-indigo-200 border" : "glass-control text-indigo-700 border",
      tableHead: isDark ? "bg-white/5 text-slate-300" : "bg-white/35 text-slate-600",
      grid: isDark ? "rgba(148,163,184,.24)" : "rgba(148,163,184,.34)",
      primaryBtn: "surface-primary",
    }),
    [isDark]
  );

  const NavItem = ({ to, label, icon }: { to: string; label: string; icon: React.ReactNode }) => (
    <NavLink
      to={to}
      title={sidebarCollapsed ? label : undefined}
      className={({ isActive }) =>
        cx(
          "flex h-10 items-center rounded-lg transition",
          sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3",
          isActive
            ? (isDark ? "surface-nav-active text-slate-100" : "surface-nav-active text-indigo-700")
            : isDark ? "text-slate-300 hover:bg-white/7" : "text-slate-600 hover:bg-white/45"
        )
      }
    >
      <span className={cx("shrink-0", sidebarCollapsed ? "h-6 w-6" : "h-5 w-5")}>{icon}</span>
      {!sidebarCollapsed && <span>{label}</span>}
    </NavLink>
  );

  const DisabledNavItem = ({ label, icon }: { label: string; icon: React.ReactNode }) => (
    <span
      title={sidebarCollapsed ? label : undefined}
      className={cx(
        "flex h-10 items-center rounded-lg opacity-60",
        sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3"
      )}
    >
      <span className={cx("shrink-0", sidebarCollapsed ? "h-6 w-6" : "h-5 w-5")}>{icon}</span>
      {!sidebarCollapsed && <span>{label}</span>}
    </span>
  );

  const contactsActive = location.pathname.startsWith("/contacts");
  const companyActive = location.pathname.startsWith("/company");
  const can = (permission: string) => currentEmployee?.role.toLocaleLowerCase("az") === "sahib" || Boolean(currentEmployee?.permissions?.includes(permission));
  const companySections: Array<{ to: string; label: string; section: CompanySection; permission: string }> = [
    { to: "/company/settings", label: t("nav.settings"), section: "settings", permission: "company.view" },
    { to: "/company/employees", label: t("nav.employees"), section: "employees", permission: "employees.manage" },
    { to: "/company/stores", label: t("nav.stores"), section: "stores", permission: "company.view" },
    { to: "/company/accounts", label: t("nav.accounts"), section: "accounts", permission: "company.view" },
    { to: "/company/loyalty", label: t("nav.loyalty"), section: "loyalty", permission: "company.view" },
    { to: "/company/print-forms", label: t("nav.printForms"), section: "printForms", permission: "company.view" },
    { to: "/company/e-documents", label: t("nav.eDocuments"), section: "eDocuments", permission: "company.view" },
    { to: "/company/payment-integrations", label: t("nav.paymentIntegrations"), section: "paymentIntegrations", permission: "company.view" },
  ].filter((item) => can(item.permission)) as Array<{ to: string; label: string; section: CompanySection; permission: string }>;
  const guard = (permission: string, content: React.ReactNode) => can(permission) ? content : <Navigate to="/" replace />;
  const SubNavItem = ({ to, label, icon }: { to: string; label: string; icon: React.ReactNode }) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cx(
          "flex h-10 items-center gap-2 rounded-lg px-3 text-sm transition",
          isActive
            ? (isDark ? "text-indigo-200 bg-white/7" : "text-indigo-700 bg-indigo-50")
            : isDark ? "text-slate-400 hover:bg-white/7 hover:text-slate-200" : "text-slate-600 hover:bg-white/45 hover:text-slate-800"
        )
      }
    >
      <span className="h-4 w-4 shrink-0">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
    </NavLink>
  );

  const CollapsedSubNavItem = ({ to, label, icon }: { to: string; label: string; icon: React.ReactNode }) => (
    <NavLink
      to={to}
      title={label}
      className={({ isActive }) =>
        cx(
          "flex h-9 items-center justify-center rounded-lg transition",
          isActive
            ? (isDark ? "text-indigo-200 bg-white/7" : "text-indigo-700 bg-indigo-50")
            : isDark ? "text-slate-400 hover:bg-white/7 hover:text-slate-200" : "text-slate-600 hover:bg-white/45 hover:text-slate-800"
        )
      }
    >
      <span className="h-4 w-4 shrink-0">{icon}</span>
    </NavLink>
  );
  const BottomNavItem = ({ to, label, icon }: { to: string; label: string; icon: React.ReactNode }) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cx(
          "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold transition",
          isActive
            ? (isDark ? "bg-indigo-400/15 text-indigo-100" : "bg-indigo-50 text-indigo-700")
            : isDark ? "text-slate-400" : "text-slate-500"
        )
      }
    >
      <span className="h-5 w-5 shrink-0">{icon}</span>
      <span className="w-full truncate text-center">{label}</span>
    </NavLink>
  );
  const MobileDrawerLink = ({ to, label, icon, nested = false }: { to: string; label: string; icon: React.ReactNode; nested?: boolean }) => (
    <NavLink
      to={to}
      onClick={() => setMobileMenuOpen(false)}
      className={({ isActive }) => cx(
        "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium",
        nested && "ml-6",
        isActive
          ? isDark ? "bg-white/10 text-indigo-100" : "bg-indigo-50 text-indigo-700"
          : isDark ? "text-slate-300" : "text-slate-700"
      )}
    >
      <span className="h-5 w-5 shrink-0">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
    </NavLink>
  );

  const openMobileMenu = () => {
    setSidebarCollapsed(false);
    setCreateMenuOpen(false);
    setMobileMenuOpen(true);
  };

  const logout = async () => {
    try {
      await requestJson("/api/auth/logout", { method: "POST" });
    } finally {
      window.google?.accounts?.id.disableAutoSelect();
      setProfileMenuOpen(false);
      setCurrentEmployee(null);
    }
  };

  useEffect(() => {
    if (!currentEmployee || currentEmployee.role.toLocaleLowerCase("az") !== "sahib") { setJoinRequests([]); return; }
    let cancelled = false;
    const load = () => requestJson<{ data: Array<{ id: string; name: string; email: string }> }>("/api/auth/requests")
      .then((payload) => { if (!cancelled) setJoinRequests(payload.data); })
      .catch(() => { if (!cancelled) setJoinRequests([]); });
    void load();
    const timer = window.setInterval(load, 30000);
    const refresh = () => void load();
    window.addEventListener("arix:employee-requests-changed", refresh);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener("arix:employee-requests-changed", refresh); };
  }, [currentEmployee]);

  if (authLoading) {
    return <div className={cx("flex min-h-screen items-center justify-center", colors.page)}><div className="flex flex-col items-center gap-3"><AriXLogo className="h-20 w-20" /><span className={colors.kpiLabel}>{t("login.checking")}</span></div></div>;
  }
  if (!currentEmployee) {
    return <LoginScreen isDark={isDark} onLogin={setCurrentEmployee} onThemeToggle={() => setTheme(isDark ? "light" : "dark")} />;
  }
  if (currentEmployee.passwordChangeRequired) {
    return <PasswordChangeScreen isDark={isDark} onChanged={(user) => setCurrentEmployee(user)} />;
  }
  const currentLanguage = languageOptions.find((item) => item.id === language) ?? languageOptions[0];

  return (
    <div className={cx("min-h-screen", colors.page)}>
      {/* Header */}
      <header className={cx("sticky top-0 z-40 backdrop-blur border-b", colors.header)}>
        <div className="flex w-full items-center justify-between px-3 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <AriXLogo className="glass-logo h-11 w-11" />
            <div className="hidden text-lg font-semibold tracking-tight sm:block">AriX Panel</div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative">
              {can("documents.create") && <button
                type="button"
                onClick={() => {
                  setLanguageMenuOpen((value) => !value);
                  setProfileMenuOpen(false);
                }}
                className={cx(
                  "inline-flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition",
                  isDark ? "glass-control-dark border-white/10 hover:bg-white/10" : "glass-control border-white/70 hover:bg-white/75"
                )}
                aria-label={t("language.select")}
                aria-expanded={languageMenuOpen}
              >
                <I.Globe className="h-5 w-5" />
                <span className="hidden sm:inline">{currentLanguage.label}</span>
                <span className="sm:hidden">{currentLanguage.short}</span>
                <I.ChevronDown className={cx("h-3.5 w-3.5 transition-transform", languageMenuOpen && "rotate-180")} />
              </button>}
              {languageMenuOpen && (
                <div className={cx("surface-popover absolute right-0 top-12 z-50 w-52 rounded-2xl border p-2 shadow-xl", isDark ? "glass-panel-dark border-white/10" : "glass-panel border-white/70")}>
                  {languageOptions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setLanguage(item.id);
                        setLanguageMenuOpen(false);
                      }}
                      className={cx(
                        "flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition",
                        item.id === language
                          ? isDark ? "surface-nav-active text-indigo-100" : "surface-nav-active text-indigo-700"
                          : isDark ? "text-slate-300 hover:bg-white/7" : "text-slate-700 hover:bg-white/70"
                      )}
                    >
                      <span className={cx("flex h-7 w-9 items-center justify-center rounded-lg text-xs font-bold", item.id === language ? "bg-indigo-600 text-white" : isDark ? "bg-white/10" : "bg-slate-100")}>{item.short}</span>
                      <span className="flex-1 font-medium">{item.label}</span>
                      {item.id === language && <span className="text-indigo-500">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className={cx(
                "inline-flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition",
                isDark ? "glass-control-dark border-white/10 hover:bg-white/10" : "glass-control border-white/70 hover:bg-white/75"
              )}
              aria-label={t("theme.toggle")}
            >
              {isDark ? "🌙 Dark" : "☀️ Light"}
            </button>
            {currentEmployee.role.toLocaleLowerCase("az") === "sahib" && <div className="relative">
              <button type="button" onClick={() => { setNotificationMenuOpen((value) => !value); setProfileMenuOpen(false); setLanguageMenuOpen(false); }} className={cx("relative flex h-11 w-11 items-center justify-center rounded-xl border", isDark ? "glass-control-dark border-white/10" : "glass-control border-white/70")} aria-label="Bildirişlər">
                <I.Bell className="h-5 w-5" />
                {joinRequests.length > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{joinRequests.length}</span>}
              </button>
              {notificationMenuOpen && <div className={cx("surface-popover absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border p-2 shadow-xl", isDark ? "glass-panel-dark border-white/10" : "glass-panel border-white/70")}>
                <div className="px-3 py-2 text-sm font-semibold">Bildirişlər</div>
                {joinRequests.length === 0 ? <div className={cx("px-3 py-5 text-center text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Yeni bildiriş yoxdur</div> : joinRequests.map((item) => <NavLink key={item.id} to="/company/employees" onClick={() => setNotificationMenuOpen(false)} className={cx("block rounded-xl px-3 py-3 text-sm", isDark ? "hover:bg-white/7" : "hover:bg-slate-50")}><div className="font-semibold">Yeni əməkdaş müraciəti</div><div className={isDark ? "text-slate-400" : "text-slate-500"}>{item.name} · {item.email}</div></NavLink>)}
              </div>}
            </div>}
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((value) => !value)}
                className={cx(
                  "flex h-11 items-center gap-2 rounded-xl border px-2.5 transition",
                  isDark ? "glass-control-dark border-white/10 hover:bg-white/10" : "glass-control border-white/70 hover:bg-white/80"
                )}
                aria-expanded={profileMenuOpen}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/12 text-xs font-bold text-indigo-600">
                  {currentEmployee.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}
                </div>
                <div className="hidden min-w-0 text-left sm:block">
                  <div className="truncate text-sm font-semibold leading-4">{currentEmployee.name}</div>
                  <div className={cx("truncate text-[11px] leading-3.5", isDark ? "text-slate-400" : "text-slate-500")}>{currentEmployee.role}</div>
                </div>
                <I.ChevronDown className={cx("h-4 w-4 shrink-0 transition-transform", profileMenuOpen && "rotate-180")} />
              </button>
              {profileMenuOpen && (
                <div className={cx("surface-popover absolute right-0 top-12 z-50 w-72 rounded-2xl border p-2 shadow-xl", isDark ? "glass-panel-dark border-white/10" : "glass-panel border-white/70")}>
                  <div className={cx("rounded-xl border p-3", isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50/80")}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/12 text-sm font-bold text-indigo-600">
                        {currentEmployee.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{currentEmployee.name}</div>
                        <div className={cx("truncate text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{currentEmployee.email}</div>
                        <div className={cx("truncate text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{currentEmployee.role}</div>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className={cx("mt-2 flex h-10 w-full items-center justify-center rounded-xl text-sm font-semibold", isDark ? "text-rose-200 hover:bg-rose-400/10" : "text-rose-600 hover:bg-rose-50")}
                  >
                    {t("action.logout")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {mobileMenuOpen && createPortal(
        <div className="fixed inset-0 z-[9999] md:hidden">
          <button
            type="button"
            aria-label={t("action.closeMenu")}
            onClick={() => setMobileMenuOpen(false)}
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm"
          />
          <aside className={cx(
            "absolute bottom-3 left-3 top-3 flex w-[min(86vw,340px)] flex-col overflow-hidden rounded-2xl border shadow-2xl",
            isDark ? "border-white/10 bg-slate-950 text-slate-100" : "border-white/80 bg-white text-slate-900"
          )}>
            <div className={cx("flex h-14 shrink-0 items-center justify-between border-b px-3", isDark ? "border-white/10" : "border-slate-200/70")}>
              <div className="flex min-w-0 items-center gap-2">
                <AriXLogo className="h-8 w-8 shrink-0" />
                <span className="truncate text-sm font-semibold">AriX Panel</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className={cx("flex h-9 w-9 items-center justify-center rounded-lg border text-xl", isDark ? "border-white/10 text-slate-200" : "border-slate-200 text-slate-600")}
                aria-label={t("action.closeMenu")}
              >
                ×
              </button>
            </div>
            <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setCreateMenuOpen(true);
                }}
                className="surface-primary mb-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold"
              >
                <I.FilePlus className="h-5 w-5" />
                <span>{t("action.createDocument")}</span>
              </button>
              <div className="space-y-1">
                <MobileDrawerLink to="/" label={t("nav.home")} icon={<I.Home className="h-full w-full" />} />
                {can("products.view") && <MobileDrawerLink to="/products" label={t("nav.products")} icon={<I.Package className="h-full w-full" />} />}
                {can("documents.view") && <MobileDrawerLink to="/product-activity" label={t("nav.productActivity")} icon={<I.Activity className="h-full w-full" />} />}
                {can("money.view") && <MobileDrawerLink to="/money-activity" label={t("nav.moneyActivity")} icon={<I.Wallet className="h-full w-full" />} />}
                {can("counterparties.view") && <div className={cx("px-3 pb-1 pt-3 text-xs font-semibold uppercase", isDark ? "text-slate-500" : "text-slate-400")}>{t("nav.counterparties")}</div>}
                {can("counterparties.view") && <MobileDrawerLink nested to="/contacts/suppliers" label={t("nav.suppliers")} icon={<I.Supplier className="h-full w-full" />} />}
                {can("counterparties.view") && <MobileDrawerLink nested to="/contacts/customers" label={t("nav.customers")} icon={<I.Customer className="h-full w-full" />} />}
                {companySections.length > 0 && <div className={cx("px-3 pb-1 pt-3 text-xs font-semibold uppercase", isDark ? "text-slate-500" : "text-slate-400")}>{t("nav.company")}</div>}
                {companySections.map((item) => (
                  <MobileDrawerLink key={item.to} nested to={item.to} label={item.label} icon={<I.Company className="h-full w-full" />} />
                ))}
                <div className={cx("my-2 border-t", isDark ? "border-white/10" : "border-slate-200")} />
                {can("accounting.view") && <MobileDrawerLink to="/accounting" label={t("nav.financeActivity")} icon={<I.Chart className="h-full w-full" />} />}
                {can("reports.view") && <MobileDrawerLink to="/reports" label={t("nav.reports")} icon={<I.Reports className="h-full w-full" />} />}
                {can("trash.manage") && <MobileDrawerLink to="/trash" label={t("nav.trash")} icon={<I.Trash className="h-full w-full" />} />}
              </div>
            </nav>
          </aside>
        </div>,
        document.body
      )}

      <div className={cx(
        "grid w-full grid-cols-1 gap-4 px-3 py-4 pb-24 transition-[grid-template-columns] sm:px-6 sm:py-6 md:pb-6",
        sidebarCollapsed ? "md:grid-cols-[76px_minmax(0,1fr)]" : "md:grid-cols-[240px_minmax(0,1fr)]"
      )}>
        {/* Sidebar */}
        <aside
          className="hidden self-start md:sticky md:top-24 md:block"
        >
          <div className={cx("flex h-full max-h-[calc(100vh-1.5rem)] flex-col overflow-hidden rounded-2xl border md:max-h-[calc(100vh-8rem)] md:min-h-[calc(100vh-8rem)]", colors.card)}>
            <nav className="flex flex-1 flex-col overflow-y-auto p-3">
              <div className="relative">
              {can("documents.create") && <button
                type="button"
                onClick={() => setCreateMenuOpen((value) => !value)}
                className={cx(
                  "inline-flex h-11 w-full items-center justify-center rounded-xl",
                  sidebarCollapsed ? "px-0" : "gap-2 px-3",
                  colors.primaryBtn
                )}
                title={sidebarCollapsed ? t("action.createDocument") : undefined}
              >
                <I.FilePlus className={cx("shrink-0", sidebarCollapsed ? "h-6 w-6" : "h-5 w-5")} />
                {!sidebarCollapsed && <span className="text-sm font-medium">{t("action.createDocument")}</span>}
              </button>}
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                <li>
                  <NavItem to="/" label={t("nav.home")} icon={<I.Home className="h-full w-full" />} />
                </li>
                {can("products.view") && <li>
                  <NavItem to="/products" label={t("nav.products")} icon={<I.Package className="h-full w-full" />} />
                </li>}
                {can("documents.view") && <li>
                  <NavItem to="/product-activity" label={t("nav.productActivity")} icon={<I.Activity className="h-full w-full" />} />
                </li>}
                {can("money.view") && <li>
                  <NavItem to="/money-activity" label={t("nav.moneyActivity")} icon={<I.Wallet className="h-full w-full" />} />
                </li>}
                {can("counterparties.view") && <li>
                  <button
                    type="button"
                    onClick={() => setContactsOpen((v) => !v)}
                    title={sidebarCollapsed ? t("nav.counterparties") : undefined}
                    className={cx(
                      "flex h-10 w-full items-center rounded-lg transition",
                      sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3",
                      contactsActive
                        ? (isDark ? "surface-nav-active text-slate-100" : "surface-nav-active text-indigo-700")
                        : isDark ? "text-slate-300 hover:bg-white/7" : "text-slate-600 hover:bg-white/45"
                    )}
                    aria-expanded={contactsOpen}
                  >
                    <span className={cx("shrink-0", sidebarCollapsed ? "h-6 w-6" : "h-5 w-5")}>
                      <I.Contacts className="h-full w-full" />
                    </span>
                    {!sidebarCollapsed && (
                      <>
                        <span className="min-w-0 flex-1 text-left">{t("nav.counterparties")}</span>
                        <I.ChevronDown className={cx("h-4 w-4 shrink-0 transition-transform", contactsOpen && "rotate-180")} />
                      </>
                    )}
                  </button>
                  {contactsOpen && (
                    sidebarCollapsed ? (
                      <div className="mt-1 space-y-1 px-1">
                        <CollapsedSubNavItem to="/contacts/suppliers" label={t("nav.suppliers")} icon={<I.Supplier className="h-full w-full" />} />
                        <CollapsedSubNavItem to="/contacts/customers" label={t("nav.customers")} icon={<I.Customer className="h-full w-full" />} />
                      </div>
                    ) : (
                      <div className="ml-8 mt-1 space-y-1">
                        <SubNavItem to="/contacts/suppliers" label={t("nav.suppliers")} icon={<I.Supplier className="h-full w-full" />} />
                        <SubNavItem to="/contacts/customers" label={t("nav.customers")} icon={<I.Customer className="h-full w-full" />} />
                      </div>
                    )
                  )}
                </li>}
                {companySections.length > 0 && <li>
                  <button
                    type="button"
                    onClick={() => setCompanyOpen((value) => !value)}
                    title={sidebarCollapsed ? t("nav.company") : undefined}
                    className={cx(
                      "flex h-10 w-full items-center rounded-lg transition",
                      sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3",
                      companyActive
                        ? (isDark ? "surface-nav-active text-slate-100" : "surface-nav-active text-indigo-700")
                        : isDark ? "text-slate-300 hover:bg-white/7" : "text-slate-600 hover:bg-white/45"
                    )}
                    aria-expanded={companyOpen}
                  >
                    <span className={cx("shrink-0", sidebarCollapsed ? "h-6 w-6" : "h-5 w-5")}>
                      <I.Company className="h-full w-full" />
                    </span>
                    {!sidebarCollapsed && (
                      <>
                        <span className="min-w-0 flex-1 text-left">{t("nav.company")}</span>
                        <I.ChevronDown className={cx("h-4 w-4 shrink-0 transition-transform", companyOpen && "rotate-180")} />
                      </>
                    )}
                  </button>
                  {companyOpen && (
                    sidebarCollapsed ? (
                      <div className="mt-1 space-y-1 px-1">
                        {companySections.map((item) => (
                          <CollapsedSubNavItem key={item.to} to={item.to} label={item.label} icon={<I.Company className="h-full w-full" />} />
                        ))}
                      </div>
                    ) : (
                      <div className="ml-8 mt-1 space-y-1">
                        {companySections.map((item) => (
                          <SubNavItem key={item.to} to={item.to} label={item.label} icon={<I.Company className="h-full w-full" />} />
                        ))}
                      </div>
                    )
                  )}
                </li>}
                <li>
                  <DisabledNavItem label={t("nav.cashShifts")} icon={<I.Receipt className="h-full w-full" />} />
                </li>
                {can("accounting.view") && <li>
                  <NavItem to="/accounting" label={t("nav.financeActivity")} icon={<I.Chart className="h-full w-full" />} />
                </li>}
                {can("reports.view") && <li>
                  <NavItem to="/reports" label={t("nav.reports")} icon={<I.Reports className="h-full w-full" />} />
                </li>}
                {can("trash.manage") && <li>
                  <NavItem to="/trash" label={t("nav.trash")} icon={<I.Trash className="h-full w-full" />} />
                </li>}
              </ul>
              <button
                type="button"
                onClick={() => setSidebarCollapsed((v) => !v)}
                className={cx(
                  "mt-auto flex h-10 items-center rounded-lg text-sm transition",
                  sidebarCollapsed ? "justify-center px-0" : "justify-between px-3",
                  isDark ? "text-slate-300 hover:bg-white/7" : "text-slate-600 hover:bg-white/45"
                )}
                title={sidebarCollapsed ? t("action.expandSidebar") : t("action.collapseSidebar")}
              >
                <I.Panel className={cx("shrink-0", sidebarCollapsed ? "h-6 w-6" : "h-5 w-5")} />
                {!sidebarCollapsed && <span>{t("action.collapse")}</span>}
              </button>
            </nav>
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0 space-y-6">
          <Routes>
            <Route path="/" element={guard("dashboard.view", <Dashboard colors={colors} />)} />
            <Route path="/products" element={guard("products.view", <Products isDark={isDark} />)} />
            <Route path="/product-activity" element={guard("documents.view", <ProductActivity isDark={isDark} />)} />
            <Route path="/money-activity" element={guard("money.view", <MoneyActivity isDark={isDark} />)} />
            <Route path="/online-collections/*" element={<Navigate to="/company/payment-integrations" replace />} />
            {companySections.map((item) => (
              <Route
                key={item.to}
                path={item.to}
                element={guard(item.permission, <Company isDark={isDark} section={item.section} />)}
              />
            ))}
            <Route path="/reports" element={guard("reports.view", <Reports isDark={isDark} />)} />
            <Route path="/accounting" element={guard("accounting.view", <Accounting isDark={isDark} />)} />
            <Route path="/trash" element={guard("trash.manage", <Trash isDark={isDark} />)} />
            <Route path="/contacts/suppliers" element={guard("counterparties.view", <Counterparties isDark={isDark} kind="suppliers" />)} />
            <Route path="/contacts/customers" element={guard("counterparties.view", <Counterparties isDark={isDark} kind="customers" />)} />
          </Routes>
        </main>
      </div>

      {createMenuOpen && (
        <DocumentCreateMenu
          isDark={isDark}
          onClose={() => setCreateMenuOpen(false)}
          onPick={(kind) => {
            setCreateKind(kind);
            setCreateMenuOpen(false);
          }}
        />
      )}

      {createKind && (
        <DocumentCreatePanel
          kind={createKind}
          isDark={isDark}
          onClose={() => setCreateKind(null)}
        />
      )}

      <nav className={cx("fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[80] grid grid-flow-col auto-cols-fr gap-1 rounded-[26px] border p-1.5 shadow-[0_18px_46px_rgba(15,23,42,.22)] backdrop-blur-xl md:hidden", isDark ? "border-white/10 bg-slate-950/92" : "border-white/80 bg-white/95")}>
        <BottomNavItem to="/" label={t("nav.home")} icon={<I.Home className="h-full w-full" />} />
        {can("products.view") && <BottomNavItem to="/products" label={t("nav.products")} icon={<I.Package className="h-full w-full" />} />}
        {can("documents.view") && <BottomNavItem to="/product-activity" label={t("nav.stock")} icon={<I.Activity className="h-full w-full" />} />}
        {can("money.view") && <BottomNavItem to="/money-activity" label={t("nav.money")} icon={<I.Wallet className="h-full w-full" />} />}
        <button
          type="button"
          onClick={openMobileMenu}
          aria-expanded={mobileMenuOpen}
          className={cx(
            "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold transition",
            mobileMenuOpen
              ? isDark ? "bg-indigo-400/15 text-indigo-100" : "bg-indigo-50 text-indigo-700"
              : isDark ? "text-slate-400" : "text-slate-500"
          )}
        >
          <I.Menu className="h-5 w-5" />
          <span>{t("nav.menu")}</span>
        </button>
      </nav>

      <footer className={cx("py-6 text-center text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
        {t("footer.demo")}
      </footer>
    </div>
  );
}

function PasswordChangeScreen({ isDark, onChanged }: { isDark: boolean; onChanged: (user: CurrentEmployee) => void }) {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (form.newPassword !== form.confirmPassword) { setError("Yeni şifrələr eyni deyil."); return; }
    setSaving(true); setError("");
    try {
      const payload = await requestJson<{ data: CurrentEmployee }>("/api/auth/change-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      onChanged(payload.data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Şifrə yenilənmədi."); }
    finally { setSaving(false); }
  };
  const field = isDark ? "border-white/10 bg-white/5 text-white" : "border-slate-200 bg-white text-slate-900";
  return <div className={cx("flex min-h-screen items-center justify-center px-4", isDark ? "surface-page-dark text-slate-100" : "surface-page text-slate-900")}>
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className={cx("w-full max-w-md rounded-3xl border p-6 shadow-2xl", isDark ? "glass-panel-dark border-white/10" : "glass-panel border-white/70")}>
      <AriXLogo className="mx-auto h-16 w-16" /><h1 className="mt-4 text-center text-2xl font-semibold">Yeni şifrə yaradın</h1><p className={cx("mt-2 text-center text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Təhlükəsizlik üçün ilkin şifrənizi ilk girişdə dəyişin.</p>
      <div className="mt-6 space-y-3">
        <label className="block text-sm font-medium">İlkin şifrə<input required type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} className={cx("mt-1.5 h-12 w-full rounded-xl border px-4 outline-none", field)} /></label>
        <label className="block text-sm font-medium">Yeni şifrə<input required minLength={8} type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} className={cx("mt-1.5 h-12 w-full rounded-xl border px-4 outline-none", field)} /></label>
        <label className="block text-sm font-medium">Yeni şifrəni təkrar edin<input required minLength={8} type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} className={cx("mt-1.5 h-12 w-full rounded-xl border px-4 outline-none", field)} /></label>
      </div>
      {error && <div className="mt-3 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-600">{error}</div>}
      <button disabled={saving} className="surface-primary mt-5 h-12 w-full rounded-xl text-sm font-semibold disabled:opacity-60">Şifrəni yenilə və davam et</button>
    </form>
  </div>;
}

function LoginScreen({
  isDark,
  onLogin,
  onThemeToggle,
}: {
  isDark: boolean;
  onLogin: (employee: CurrentEmployee) => void;
  onThemeToggle: () => void;
}) {
  const { language, setLanguage, t } = useI18n();
  const selected = employees[0];
  const panel = isDark ? "glass-panel-dark text-slate-100 border-white/10" : "glass-panel text-slate-900 border-white/70";
  const control = isDark ? "glass-control-dark border-white/10 text-slate-100" : "glass-control border-white/70 text-slate-800";
  const subtle = isDark ? "text-slate-400" : "text-slate-500";

  return (
    <div className={cx("flex min-h-screen items-center justify-center px-4 py-8", isDark ? "surface-page-dark text-slate-100" : "surface-page text-slate-900")}>
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-end gap-2">
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as typeof language)}
            className={cx("h-10 rounded-xl border px-3 text-sm outline-none", control)}
            aria-label={t("language.select")}
          >
            {languageOptions.map((item) => <option key={item.id} value={item.id}>{item.short} · {item.label}</option>)}
          </select>
          <button
            type="button"
            onClick={onThemeToggle}
            className={cx("h-10 rounded-xl border px-4 text-sm", control)}
          >
            {isDark ? "Dark" : "Light"}
          </button>
        </div>

        <div className={cx("overflow-hidden rounded-[28px] border p-6 shadow-2xl", panel)}>
          <div className="mb-7 text-center">
            <div className="mx-auto mb-4 flex h-28 w-28 items-center justify-center rounded-[28px]">
              <AriXLogo className="glass-logo h-24 w-24" />
            </div>
            <div className="text-3xl font-semibold tracking-tight">AriX Panel</div>
            <div className={cx("mt-2 text-sm", subtle)}>{t("login.employee")}</div>
          </div>
          <GoogleSignIn isDark={isDark} demoEmail={selected.email} onAuthenticated={onLogin} />
          <div className={cx("mt-4 text-center text-xs", subtle)}>{t("login.googleNotice")}</div>
        </div>
      </div>


    </div>
  );
}

