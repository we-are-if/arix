import React, { useEffect, useMemo, useState } from "react";
import { Routes, Route, NavLink, useLocation } from "react-router-dom";
import AriXLogo from "./components/AriXLogo";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import ProductActivity from "./pages/ProductActivity";
import Counterparties from "./pages/Counterparties";
import MoneyActivity from "./pages/MoneyActivity";
import OnlineCollections, { type OnlineCollectionSection } from "./pages/OnlineCollections";
import Company, { type CompanySection } from "./pages/Company";
import Reports from "./pages/Reports";
import DocumentCreatePanel, { DocumentCreateMenu, type DocumentCreateKind } from "./components/DocumentCreatePanel";
import { languageOptions, useI18n, useStaticDomTranslation } from "./i18n";

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
  const [currentEmployee, setCurrentEmployee] = useState<CurrentEmployee | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const saved = localStorage.getItem("arix-current-employee");
      if (!saved) return null;
      const parsed = JSON.parse(saved) as CurrentEmployee;
      return employees.find((employee) => employee.id === parsed.id) ?? null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      if (currentEmployee) localStorage.setItem("arix-current-employee", JSON.stringify(currentEmployee));
      else localStorage.removeItem("arix-current-employee");
    } catch {
      /* ignore */
    }
  }, [currentEmployee]);

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
  const [collectionsOpen, setCollectionsOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("arix-collections-open") === "1";
  });
  useEffect(() => {
    if (location.pathname.startsWith("/online-collections")) setCollectionsOpen(true);
  }, [location.pathname]);
  useEffect(() => {
    try {
      localStorage.setItem("arix-collections-open", collectionsOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collectionsOpen]);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createKind, setCreateKind] = useState<DocumentCreateKind | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

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
  const collectionsActive = location.pathname.startsWith("/online-collections");
  const companySections: Array<{ to: string; label: string; section: CompanySection }> = [
    { to: "/company/settings", label: t("nav.settings"), section: "settings" },
    { to: "/company/employees", label: t("nav.employees"), section: "employees" },
    { to: "/company/stores", label: t("nav.stores"), section: "stores" },
    { to: "/company/accounts", label: t("nav.accounts"), section: "accounts" },
    { to: "/company/loyalty", label: t("nav.loyalty"), section: "loyalty" },
    { to: "/company/print-forms", label: t("nav.printForms"), section: "printForms" },
  ];
  const collectionMenuGroups: Array<{
    title: string;
    icon: React.ReactNode;
    items: Array<{ to: string; label: string; section: OnlineCollectionSection }>;
  }> = [
    {
      title: t("nav.onlineCollections"),
      icon: <I.OnlinePay className="h-full w-full" />,
      items: [
        { to: "/online-collections/new", label: t("collections.newCollection"), section: "new" },
        { to: "/online-collections", label: t("collections.operations"), section: "payments" },
        { to: "/online-collections/pos", label: t("collections.allPos"), section: "pos" },
        { to: "/online-collections/commissions", label: t("collections.commissions"), section: "commissions" },
        { to: "/online-collections/payment-settings", label: t("collections.payment"), section: "paymentSettings" },
      ],
    },
  ];
  const hiddenCollectionSections: Array<{ to: string; label: string; section: OnlineCollectionSection }> = [
    { to: "/online-collections/param-pos", label: t("collections.paramPos"), section: "paramPos" },
    { to: "/online-collections/payment-ai", label: t("collections.paymentAi"), section: "paymentAi" },
    { to: "/online-collections/transaction-detail", label: t("collections.operationDetails"), section: "transactionDetail" },
    { to: "/online-collections/payment-links", label: t("collections.paymentLinks"), section: "paymentLinks" },
    { to: "/online-collections/mail-sms", label: t("collections.mailSms"), section: "mailSmsTracking" },
    { to: "/online-collections/notifications", label: t("collections.notifications"), section: "notifications" },
    { to: "/online-collections/cards", label: t("collections.cards"), section: "cardList" },
    { to: "/online-collections/dealer-pos", label: t("collections.dealerPos"), section: "dealerPos" },
    { to: "/online-collections/customers-dealers", label: t("collections.customersDealers"), section: "customersDealers" },
    { to: "/online-collections/graphic-reports", label: t("collections.graphicReports"), section: "graphicReports" },
    { to: "/online-collections/general-reports", label: t("collections.generalReports"), section: "generalReports" },
    { to: "/online-collections/account-debt", label: t("collections.accountDebt"), section: "accountDebt" },
    { to: "/online-collections/account-movements", label: t("collections.accountMovements"), section: "accountMovements" },
    { to: "/online-collections/contracts", label: t("collections.contracts"), section: "contracts" },
    { to: "/online-collections/current-accounts", label: t("collections.currentAccounts"), section: "currentAccounts" },
    { to: "/online-collections/general-settings", label: t("collections.general"), section: "generalSettings" },
    { to: "/online-collections/nt-login", label: t("collections.ntLogin"), section: "ntLogin" },
    { to: "/online-collections/card-settings", label: t("collections.cardSettings"), section: "cardSettings" },
    { to: "/online-collections/dynamic-fields", label: t("collections.dynamicFields"), section: "dynamicFields" },
    { to: "/online-collections/payment-items", label: t("collections.paymentItems"), section: "paymentItems" },
    { to: "/online-collections/bin-filters", label: t("collections.binFilters"), section: "binFilters" },
    { to: "/online-collections/bins", label: t("collections.binTable"), section: "bins" },
    { to: "/online-collections/pages", label: t("collections.paymentPages"), section: "pages" },
    { to: "/online-collections/reconciliation", label: t("collections.reconciliation"), section: "reconciliation" },
    { to: "/online-collections/logs", label: t("collections.webhookLogs"), section: "logs" },
  ];
  const collectionSections = [...collectionMenuGroups.flatMap((group) => group.items), ...hiddenCollectionSections];
  const activeCollectionGroup = collectionMenuGroups.find((group) =>
    group.items.some((item) => item.to === location.pathname)
  )?.title;
  const [openCollectionGroups, setOpenCollectionGroups] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("arix-collection-groups-open");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    if (!activeCollectionGroup) return;
    setOpenCollectionGroups((current) =>
      current.includes(activeCollectionGroup) ? current : [...current, activeCollectionGroup]
    );
  }, [activeCollectionGroup]);
  useEffect(() => {
    try {
      localStorage.setItem("arix-collection-groups-open", JSON.stringify(openCollectionGroups));
    } catch {
      /* ignore */
    }
  }, [openCollectionGroups]);
  const toggleCollectionGroup = (title: string) => {
    setOpenCollectionGroups((current) =>
      current.includes(title) ? current.filter((item) => item !== title) : [...current, title]
    );
  };
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

  if (!currentEmployee) {
    return <LoginScreen isDark={isDark} onLogin={setCurrentEmployee} onThemeToggle={() => setTheme(isDark ? "light" : "dark")} />;
  }
  const currentLanguage = languageOptions.find((item) => item.id === language) ?? languageOptions[0];

  return (
    <div className={cx("min-h-screen", colors.page)}>
      {/* Header */}
      <header className={cx("sticky top-0 z-20 backdrop-blur border-b", colors.header)}>
        <div className="flex w-full items-center justify-between px-3 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className={cx("flex h-10 w-10 items-center justify-center rounded-xl border md:hidden", isDark ? "glass-control-dark border-white/10" : "glass-control border-white/70")}
              aria-label={t("action.openMenu")}
            >
              <I.Menu className="h-5 w-5" />
            </button>
            <AriXLogo className="glass-logo h-11 w-11" />
            <div className="hidden text-lg font-semibold tracking-tight sm:block">AriX Panel</div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative">
              <button
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
              </button>
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
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setCurrentEmployee(null);
                    }}
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

      {mobileMenuOpen && (
        <button
          type="button"
          aria-label={t("action.closeMenu")}
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm md:hidden"
        />
      )}

      <div className={cx(
        "grid w-full grid-cols-1 gap-4 px-3 py-4 pb-24 transition-[grid-template-columns] sm:px-6 sm:py-6 md:pb-6",
        sidebarCollapsed ? "md:grid-cols-[76px_minmax(0,1fr)]" : "md:grid-cols-[240px_minmax(0,1fr)]"
      )}>
        {/* Sidebar */}
        <aside
          className={cx(
            "fixed bottom-3 left-3 top-3 z-50 w-[min(86vw,320px)] self-start transition-transform duration-200 md:sticky md:top-24 md:z-auto md:w-auto md:translate-x-0",
            mobileMenuOpen ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]"
          )}
        >
          <div className={cx("flex h-full max-h-[calc(100vh-1.5rem)] flex-col overflow-hidden rounded-2xl border md:max-h-[calc(100vh-8rem)] md:min-h-[calc(100vh-8rem)]", colors.card)}>
            <nav className="flex flex-1 flex-col overflow-y-auto p-3">
              <div className="relative">
              <button
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
              </button>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                <li>
                  <NavItem to="/" label={t("nav.home")} icon={<I.Home className="h-full w-full" />} />
                </li>
                <li>
                  <NavItem to="/products" label={t("nav.products")} icon={<I.Package className="h-full w-full" />} />
                </li>
                <li>
                  <NavItem to="/product-activity" label={t("nav.productActivity")} icon={<I.Activity className="h-full w-full" />} />
                </li>
                <li>
                  <NavItem to="/money-activity" label={t("nav.moneyActivity")} icon={<I.Wallet className="h-full w-full" />} />
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setCollectionsOpen((value) => !value)}
                    title={sidebarCollapsed ? t("nav.onlineCollections") : undefined}
                    className={cx(
                      "flex h-10 w-full items-center rounded-lg transition",
                      sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3",
                      collectionsActive
                        ? (isDark ? "surface-nav-active text-slate-100" : "surface-nav-active text-indigo-700")
                        : isDark ? "text-slate-300 hover:bg-white/7" : "text-slate-600 hover:bg-white/45"
                    )}
                    aria-expanded={collectionsOpen}
                  >
                    <span className={cx("shrink-0", sidebarCollapsed ? "h-6 w-6" : "h-5 w-5")}>
                      <I.OnlinePay className="h-full w-full" />
                    </span>
                    {!sidebarCollapsed && (
                      <>
                        <span className="min-w-0 flex-1 text-left">{t("nav.onlineCollections")}</span>
                        <I.ChevronDown className={cx("h-4 w-4 shrink-0 transition-transform", collectionsOpen && "rotate-180")} />
                      </>
                    )}
                  </button>
                  {collectionsOpen && (
                    sidebarCollapsed ? (
                      <div className="mt-1 space-y-1 px-1">
                        {collectionSections.map((item) => (
                          <CollapsedSubNavItem key={item.to} to={item.to} label={item.label} icon={<I.OnlinePay className="h-full w-full" />} />
                        ))}
                      </div>
                    ) : (
                      <div className="ml-4 mt-1 space-y-2">
                        {collectionMenuGroups.map((group) => (
                          <div key={group.title} className="space-y-1">
                            <button
                              type="button"
                              onClick={() => toggleCollectionGroup(group.title)}
                              aria-expanded={openCollectionGroups.includes(group.title)}
                              className={cx(
                                "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition",
                                group.items.some((item) => item.to === location.pathname)
                                  ? isDark ? "bg-orange-400/15 text-orange-100" : "bg-orange-50 text-orange-600"
                                  : isDark ? "bg-white/5 text-slate-300 hover:bg-white/10" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                              )}
                            >
                              <span className="h-4 w-4 shrink-0">{group.icon}</span>
                              <span className="min-w-0 truncate">{group.title}</span>
                              <I.ChevronDown
                                className={cx(
                                  "ml-auto h-3.5 w-3.5 shrink-0 transition-transform",
                                  openCollectionGroups.includes(group.title) && "rotate-180"
                                )}
                              />
                            </button>
                            {openCollectionGroups.includes(group.title) && (
                              <div className="ml-4 space-y-1">
                                {group.items.map((item) => (
                                  <SubNavItem key={item.to} to={item.to} label={item.label} icon={<I.OnlinePay className="h-full w-full" />} />
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </li>
                <li>
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
                </li>
                <li>
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
                </li>
                <li>
                  <DisabledNavItem label={t("nav.cashShifts")} icon={<I.Receipt className="h-full w-full" />} />
                </li>
                <li>
                  <DisabledNavItem label={t("nav.financeActivity")} icon={<I.Chart className="h-full w-full" />} />
                </li>
                <li>
                  <NavItem to="/reports" label={t("nav.reports")} icon={<I.Reports className="h-full w-full" />} />
                </li>
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
            <Route path="/" element={<Dashboard colors={colors} />} />
            <Route path="/products" element={<Products isDark={isDark} />} />
            <Route path="/product-activity" element={<ProductActivity isDark={isDark} />} />
            <Route path="/money-activity" element={<MoneyActivity isDark={isDark} />} />
            {collectionSections.map((item) => (
              <Route
                key={item.to}
                path={item.to}
                element={<OnlineCollections isDark={isDark} section={item.section} />}
              />
            ))}
            {companySections.map((item) => (
              <Route
                key={item.to}
                path={item.to}
                element={<Company isDark={isDark} section={item.section} />}
              />
            ))}
            <Route path="/reports" element={<Reports isDark={isDark} />} />
            <Route path="/contacts/suppliers" element={<Counterparties isDark={isDark} kind="suppliers" />} />
            <Route path="/contacts/customers" element={<Counterparties isDark={isDark} kind="customers" />} />
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

      <nav className={cx("fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[80] grid grid-cols-5 gap-1 rounded-[26px] border p-1.5 shadow-[0_18px_46px_rgba(15,23,42,.22)] backdrop-blur-xl md:hidden", isDark ? "border-white/10 bg-slate-950/92" : "border-white/80 bg-white/95")}>
        <BottomNavItem to="/" label={t("nav.home")} icon={<I.Home className="h-full w-full" />} />
        <BottomNavItem to="/products" label={t("nav.products")} icon={<I.Package className="h-full w-full" />} />
        <BottomNavItem to="/product-activity" label={t("nav.stock")} icon={<I.Activity className="h-full w-full" />} />
        <BottomNavItem to="/money-activity" label={t("nav.money")} icon={<I.Wallet className="h-full w-full" />} />
        <button
          type="button"
          onClick={() => setCreateMenuOpen(true)}
          className="surface-primary flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold"
        >
          <I.FilePlus className="h-5 w-5" />
          <span>{t("action.create")}</span>
        </button>
      </nav>

      <footer className={cx("py-6 text-center text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
        {t("footer.demo")}
      </footer>
    </div>
  );
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
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (selected) onLogin(selected);
            }}
          >
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">{t("login.email")}</span>
              <input className={cx("h-12 w-full rounded-xl border px-3 outline-none", control)} defaultValue={selected?.email ?? ""} placeholder="mail@arix.az" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">{t("login.password")}</span>
              <input className={cx("h-12 w-full rounded-xl border px-3 outline-none", control)} type="password" placeholder={t("login.passwordPlaceholder")} />
            </label>
            <button type="submit" className="surface-primary h-12 w-full rounded-xl px-5 text-sm font-semibold">
              {t("login.submit")}
            </button>
            <div className={cx("text-center text-xs", subtle)}>{t("login.demo")}</div>
          </form>
        </div>
      </div>


    </div>
  );
}

