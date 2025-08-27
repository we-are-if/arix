import React, { useEffect, useMemo, useState } from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import AriXLogo from "./components/AriXLogo";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";

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
const cx = (...s: (string | false | undefined)[]) => s.filter(Boolean).join(" ");

export default function App() {
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
    } catch {}
  }, [theme]);

  const isDark = theme === "dark";
  const colors: Colors = useMemo(
    () => ({
      page: isDark ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-900",
      header: isDark ? "bg-slate-900/70 border-slate-700" : "bg-white/75 border-slate-200",
      card: isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200/70",
      kpiLabel: isDark ? "text-slate-400" : "text-slate-500",
      chip: isDark ? "bg-indigo-950/40 text-indigo-300 border border-indigo-800" : "bg-indigo-50 text-indigo-700 border border-indigo-200",
      tableHead: isDark ? "bg-slate-800 text-slate-300" : "bg-slate-50 text-slate-600",
      grid: isDark ? "#334155" : "#e2e8f0",
      primaryBtn: isDark ? "bg-indigo-500 hover:bg-indigo-400 text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white",
    }),
    [isDark]
  );

  const NavItem = ({ to, children }: { to: string; children: React.ReactNode }) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cx(
          "block px-3 py-2 rounded-lg",
          isActive ? (isDark ? "bg-slate-700" : "bg-slate-100") : isDark ? "hover:bg-slate-700/60" : "hover:bg-slate-100"
        )
      }
    >
      {children}
    </NavLink>
  );

  return (
    <div className={cx("min-h-screen", colors.page)}>
      {/* Header */}
      <header className={cx("sticky top-0 z-20 backdrop-blur border-b", colors.header)}>
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AriXLogo className="h-8 w-8" />
            <div className="font-semibold tracking-tight">AriX Panel</div>
          </div>
          <div className="flex items-center gap-3">
            <div className={cx("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Demo · React + Tailwind + Recharts</div>
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className={cx(
                "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm transition",
                isDark ? "bg-slate-800 border-slate-700 hover:bg-slate-700" : "bg-white/70 border-slate-200 hover:bg-slate-100"
              )}
              aria-label="Tema keçidi"
            >
              {isDark ? "🌙 Dark" : "☀️ Light"}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-12 gap-6">
        {/* Sidebar */}
        <aside className="hidden md:block md:col-span-3 lg:col-span-2">
          <div className={cx("rounded-2xl shadow-sm border", colors.card)}>
            <nav className="p-3">
              <button className={cx("w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl shadow-sm", colors.primaryBtn)}>
                <span className="text-sm font-medium">Sənəd yarat</span>
              </button>
              <ul className="text-sm mt-3 space-y-1">
                <li>
                  <NavItem to="/">Ana səhifə</NavItem>
                </li>
                <li>
                  <NavItem to="/products">Məhsullar və xidmətlər</NavItem>
                </li>
                <li>
                  <span className="block px-3 py-2 rounded-lg opacity-70 cursor-not-allowed">Kassa və növbələr</span>
                </li>
                <li>
                  <span className="block px-3 py-2 rounded-lg opacity-70 cursor-not-allowed">Maliyyə fəaliyyəti</span>
                </li>
                <li>
                  <span className="block px-3 py-2 rounded-lg opacity-70 cursor-not-allowed">Pul fəaliyyəti</span>
                </li>
                <li>
                  <span className="block px-3 py-2 rounded-lg opacity-70 cursor-not-allowed">Hesabatlar</span>
                </li>
              </ul>
            </nav>
          </div>
        </aside>

        {/* Content */}
        <main className="col-span-12 md:col-span-9 lg:col-span-10 xl:col-span-10 space-y-6">
          <Routes>
            <Route path="/" element={<Dashboard colors={colors} />} />
            <Route path="/products" element={<Products colors={colors} isDark={isDark} />} />
          </Routes>
        </main>
      </div>

      <footer className={cx("py-6 text-center text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
        AriX · Demo məqsədi ilə hazırlanmışdır — React · Tailwind · Recharts
      </footer>
    </div>
  );
}
