import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, LockKeyhole, Mail, Moon, Sun, UserPlus } from "lucide-react";
import AriXLogo from "./AriXLogo";

const DailyWorkspace = lazy(() => import("./DailyWorkspace"));

export type DailyCompanyFeatures = {
  qaime?: boolean;
};

export type DailyCompany = {
  id: string;
  name: string;
  features?: DailyCompanyFeatures;
};

export type DailySession = {
  id: string;
  name: string;
  role: string;
  email?: string;
  picture?: string;
  permissions?: string[];
  companyId?: string;
  company?: DailyCompany;
  availableCompanies?: DailyCompany[];
};

type AuthConfig = { enabled: boolean; googleClientId: string };
type AuthResponse = { data?: DailySession; pending?: boolean; error?: string };
type AuthConfigResponse = { data: AuthConfig };

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, string | number | boolean>) => void;
        };
      };
    };
  }
}

let googleScriptPromise: Promise<void> | null = null;
function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google giriş xidməti yüklənmədi."));
    document.head.appendChild(script);
  });
  return googleScriptPromise;
}

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({})) as AuthResponse;
  if (!response.ok) throw new Error(payload.error || `Sunucu cavab vermədi (${response.status}).`);
  return payload as T;
}

function LoadingScreen() {
  return <div className="daily-auth-screen"><div className="daily-auth-loading"><AriXLogo /><span>AriX Daily açılır...</span></div></div>;
}

function Login({ onSuccess }: { onSuccess: (session: DailySession) => void }) {
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [form, setForm] = useState({ email: "", password: "" });
  const [registration, setRegistration] = useState({ name: "", email: "", password: "", companyCode: "" });
  const resetToken = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("reset") || "" : "";
  const resetCompanyId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("company") || "" : "";
  const [reset, setReset] = useState({ email: "", password: "", confirm: "" });
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState<"login" | "register" | "reset-request" | "reset-confirm">(resetToken ? "reset-confirm" : "login");
  const [pending, setPending] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("arix-daily-theme");
    if (saved === "dark" || saved === "light") return saved;
    if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("arix-daily-theme", theme);
  }, [theme]);

  useEffect(() => {
    void authRequest<AuthConfigResponse>("/api/daily-auth/config").then((payload) => setConfig(payload.data)).catch((cause) => setError(cause instanceof Error ? cause.message : "Giriş parametrləri alınmadı."));
  }, []);

  useEffect(() => {
    if (!config?.enabled || !config.googleClientId || !googleButtonRef.current) return;
    let cancelled = false;
    void loadGoogleScript().then(() => {
      if (cancelled || !window.google || !googleButtonRef.current) return;
      googleButtonRef.current.replaceChildren();
      window.google.accounts.id.initialize({
        client_id: config.googleClientId,
        auto_select: false,
        cancel_on_tap_outside: true,
        use_fedcm_for_prompt: true,
        callback: ({ credential }) => {
          if (!credential) return;
          setBusy(true);
          setError("");
          void authRequest<AuthResponse>("/api/daily-auth/google", {
            method: "POST",
            body: JSON.stringify({ credential, remember, companyCode: joinCode }),
          }).then((payload) => {
            if (payload.data) onSuccess(payload.data);
            else if (payload.pending) setPending(true);
            else setError("Hesabın aktivləşdirilməsi gözlənilir.");
          }).catch((cause) => setError(cause instanceof Error ? cause.message : "Google girişi alınmadı."))
            .finally(() => setBusy(false));
        },
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: "standard", theme: theme === "dark" ? "filled_black" : "outline", size: "large",
        text: "continue_with", shape: "rectangular", logo_alignment: "left",
        width: Math.min(360, Math.max(240, window.innerWidth - 74)), locale: "az",
      });
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Google giriş xidməti hazır deyil."));
    return () => { cancelled = true; };
  }, [config, joinCode, onSuccess, remember, theme]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = await authRequest<AuthResponse>("/api/daily-auth/password", {
        method: "POST",
        body: JSON.stringify({ ...form, remember }),
      });
      if (payload.data) onSuccess(payload.data);
      else if (payload.pending) setPending(true);
      else setError("Hesabın aktivləşdirilməsi gözlənilir.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Giriş alınmadı.");
    } finally {
      setBusy(false);
    }
  };

  const register = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setPending(false);
    try {
      const payload = await authRequest<AuthResponse>("/api/daily-auth/register", {
        method: "POST",
        body: JSON.stringify(registration),
      });
      if (payload.pending) setPending(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Giriş müraciəti göndərilmədi.");
    } finally {
      setBusy(false);
    }
  };

  const requestPasswordReset = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = await authRequest<{ message?: string }>("/api/daily-auth/password-reset-request", { method: "POST", body: JSON.stringify({ email: reset.email }) });
      setNotice(payload.message || "Bu e-poçt qeydiyyatlıdırsa, şifrə yeniləmə bağlantısı göndərildi.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Şifrə yeniləmə bağlantısı göndərilmədi."); }
    finally { setBusy(false); }
  };

  const confirmPasswordReset = async (event: FormEvent) => {
    event.preventDefault();
    if (reset.password !== reset.confirm) { setError("Şifrələr eyni deyil."); return; }
    setBusy(true);
    setError("");
    try {
      await authRequest("/api/daily-auth/password-reset-confirm", { method: "POST", body: JSON.stringify({ token: resetToken, password: reset.password, companyId: resetCompanyId }) });
      window.history.replaceState({}, document.title, window.location.pathname);
      setMode("login");
      setReset({ email: "", password: "", confirm: "" });
      setNotice("Şifrəniz yeniləndi. Yeni şifrənizlə daxil ola bilərsiniz.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Şifrə yenilənmədi."); }
    finally { setBusy(false); }
  };

  return <div className="daily-auth-screen">
    <button className="daily-auth-theme" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label="Mövzunu dəyiş">
      {theme === "dark" ? <Moon size={18} /> : <Sun size={18} />}
    </button>
    <main className="daily-auth-card">
      <div className="daily-auth-brand"><AriXLogo /><div><b>AriX Daily</b><span>Gündəlik maliyyə axını</span></div></div>
      <div className="daily-auth-heading">{mode === "login" ? <LockKeyhole size={22} /> : <UserPlus size={22} />}<div><h1>{mode === "login" ? "Hesabınıza daxil olun" : "Daily-yə qoşulma müraciəti"}</h1><p>{mode === "login" ? "Maliyyə məlumatları yalnız icazəli istifadəçilər üçün açıqdır." : "Dəvət kodu müraciət yaradır; giriş yalnız rəhbər təsdiqindən sonra açılır."}</p></div></div>
      {pending ? <div className="daily-auth-pending"><LockKeyhole size={20} /><div><b>Müraciət göndərildi</b><span>Daily rəhbəri təsdiqlədikdən sonra hesabınızla daxil ola bilərsiniz.</span></div><button type="button" onClick={() => { setPending(false); setMode("login"); }}>Girişə qayıt</button></div> : mode === "reset-request" ? <form onSubmit={requestPasswordReset}>
        <button type="button" className="daily-auth-back" onClick={() => { setMode("login"); setError(""); setNotice(""); }}><ArrowLeft size={15} /> Girişə qayıt</button>
        <label>E-poçt<input type="email" autoComplete="email" value={reset.email} onChange={(event) => setReset((current) => ({ ...current, email: event.target.value }))} required /></label>
        <p className="daily-auth-help">Qeydiyyatlı e-poçtunuza 30 dəqiqəlik, tək istifadəlik şifrə yeniləmə bağlantısı göndəriləcək.</p>
        {error && <div className="daily-auth-error">{error}</div>}{notice && <div className="daily-auth-notice">{notice}</div>}
        <button className="daily-auth-submit" type="submit" disabled={busy}>{busy ? "Göndərilir..." : "Bağlantı göndər"}</button>
      </form> : mode === "reset-confirm" ? <form onSubmit={confirmPasswordReset}>
        <label>Yeni şifrə<input type="password" autoComplete="new-password" minLength={8} value={reset.password} onChange={(event) => setReset((current) => ({ ...current, password: event.target.value }))} required /></label>
        <label>Yeni şifrəni təkrar edin<input type="password" autoComplete="new-password" minLength={8} value={reset.confirm} onChange={(event) => setReset((current) => ({ ...current, confirm: event.target.value }))} required /></label>
        <p className="daily-auth-help">Şifrəniz ən az 8 simvol olmalıdır. Bu bağlantı bir dəfə istifadə olunur.</p>
        {error && <div className="daily-auth-error">{error}</div>}
        <button className="daily-auth-submit" type="submit" disabled={busy}>{busy ? "Yenilənir..." : "Şifrəni yenilə"}</button>
      </form> : mode === "login" ? <>
        <form onSubmit={submit}>
          <label>E-poçt<input type="email" autoComplete="username" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required /></label>
          <label>Şifrə<input type="password" autoComplete="current-password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required /></label>
          <label className="daily-auth-remember"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Məni yadda saxla</label>
          {error && <div className="daily-auth-error">{error}</div>}
          {notice && <div className="daily-auth-notice">{notice}</div>}
          <button className="daily-auth-submit" type="submit" disabled={busy}>{busy ? "Giriş edilir..." : "Daxil ol"}</button>
        </form>
        {config?.googleClientId && <><div className="daily-auth-divider"><span>və ya</span></div><label className="daily-auth-join-code">Dəvət kodu <small>Yalnız ilk qoşulma üçün</small><input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} maxLength={24} placeholder="XXXXXXXX" /></label><div className="daily-google-button" ref={googleButtonRef} /></>}
        {["localhost", "127.0.0.1"].includes(window.location.hostname) && (
          <button
            type="button"
            className="daily-auth-submit"
            style={{ marginTop: 12, background: "#0284c7" }}
            onClick={() => onSuccess({ id: "daily-local-dev", name: "Lokal İdarəçi", role: "Sahib", permissions: [] })}
          >
            ⚡ Lokal İdarəçi Kimi Daxil Ol (Test)
          </button>
        )}
        <button type="button" className="daily-auth-forgot" onClick={() => { setMode("reset-request"); setError(""); setNotice(""); }}>Şifrəni unutmusunuz?</button>
        <button type="button" className="daily-auth-mode" onClick={() => { setMode("register"); setError(""); }}><UserPlus size={15} /> Hesabınız yoxdur? Müraciət göndərin</button>
      </> : <form onSubmit={register}>
        <button type="button" className="daily-auth-back" onClick={() => { setMode("login"); setError(""); }}><ArrowLeft size={15} /> Girişə qayıt</button>
        <label>Ad və soyad<input value={registration.name} onChange={(event) => setRegistration((current) => ({ ...current, name: event.target.value }))} required /></label>
        <label>E-poçt<input type="email" autoComplete="email" value={registration.email} onChange={(event) => setRegistration((current) => ({ ...current, email: event.target.value }))} required /></label>
        <label>Şifrə<input type="password" autoComplete="new-password" minLength={8} value={registration.password} onChange={(event) => setRegistration((current) => ({ ...current, password: event.target.value }))} required /></label>
        <label>Dəvət kodu<input className="daily-auth-code-input" value={registration.companyCode} onChange={(event) => setRegistration((current) => ({ ...current, companyCode: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") }))} minLength={8} maxLength={24} required /></label>
        {error && <div className="daily-auth-error">{error}</div>}
        <button className="daily-auth-submit" type="submit" disabled={busy}>{busy ? "Göndərilir..." : "Təsdiq üçün göndər"}</button>
      </form>}
      <footer><Mail size={14} /> Giriş problemi olduqda sistem rəhbərinə müraciət edin.</footer>
    </main>
  </div>;
}

export default function App() {
  const spareRelease = import.meta.env.VITE_SPAREXPERT_RELEASE === "1";
  const isLocalHost = Boolean(import.meta.env.DEV) && ["localhost", "127.0.0.1"].includes(window.location.hostname);

  const getLocalDevSession = (): DailySession => {
    const urlParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("company") : null;
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("arix-daily-local-company") : "sparexpert";
    const companyId = urlParam === "azart" || urlParam === "azartmembran" ? "azartmembran" : urlParam === "sparexpert" ? "sparexpert" : (saved === "azartmembran" ? "azartmembran" : "sparexpert");
    const isSpare = companyId === "sparexpert";
    return {
      id: "daily-local-dev",
      name: "Lokal İdarəçi (Test)",
      role: "Sahib",
      companyId,
      company: {
        id: companyId,
        name: isSpare ? "SparExpert" : "Azart Membran",
        features: { qaime: !isSpare },
      },
      availableCompanies: [
        { id: "sparexpert", name: "SparExpert", features: { qaime: false } },
        { id: "azartmembran", name: "Azart Membran", features: { qaime: true } },
      ],
      permissions: [],
    };
  };

  const [session, setSession] = useState<DailySession | null | undefined>(() => isLocalHost
    ? getLocalDevSession()
    : undefined);
  const [spareLedgerReady, setSpareLedgerReady] = useState<boolean | undefined>();
  const spareSession = (session?.company?.id ?? session?.companyId) === "sparexpert";

  useEffect(() => {
    if (!spareRelease || !spareSession) return;
    let cancelled = false;
    void authRequest<{ data?: { state?: { entries?: unknown[] } } }>("/api/daily")
      .then(({ data }) => { if (!cancelled) setSpareLedgerReady(Boolean(data?.state?.entries?.length)); })
      .catch(() => { if (!cancelled) setSpareLedgerReady(false); });
    return () => { cancelled = true; };
  }, [spareRelease, spareSession]);

  useEffect(() => {
    let cancelled = false;
    void authRequest<AuthResponse>("/api/daily-auth/session")
      .then((payload) => {
        if (!cancelled) {
          if (payload.data) setSession(payload.data);
          else if (isLocalHost) setSession(getLocalDevSession());
          else setSession(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          if (isLocalHost) setSession(getLocalDevSession());
          else setSession(null);
        }
      });
    return () => { cancelled = true; };
  }, [isLocalHost]);

  const logout = async () => {
    await authRequest("/api/daily-auth/logout", { method: "POST", body: "{}" }).catch(() => undefined);
    setSession(null);
  };

  if (session === undefined) return <LoadingScreen />;
  if (!session) return <Login onSuccess={setSession} />;
  if (spareRelease && !spareSession) {
    return <main className="daily-auth-screen"><section className="daily-auth-loading">
      <span>Bu ünvan SpareXpert hesabı üçündür.</span>
      <a href="/">AriX Daily-yə qayıt</a>
      <button type="button" onClick={logout}>Başqa hesabla daxil ol</button>
    </section></main>;
  }
  if (spareRelease && spareLedgerReady === undefined) return <LoadingScreen />;
  if (spareRelease && !spareLedgerReady) {
    return <main className="daily-auth-screen"><section className="daily-auth-loading">
      <span>SpareXpert məlumatları hələ köçürülür.</span>
      <button type="button" onClick={() => window.location.reload()}>Yenilə</button>
    </section></main>;
  }
  return <Suspense fallback={<LoadingScreen />}><DailyWorkspace session={session} onLogout={logout} /></Suspense>;
}
