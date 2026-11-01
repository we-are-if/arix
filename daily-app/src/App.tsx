import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { LockKeyhole, Mail, Moon, Sun } from "lucide-react";
import AriXLogo from "./AriXLogo";

const DailyWorkspace = lazy(() => import("./DailyWorkspace"));

export type DailySession = {
  id: string;
  name: string;
  role: string;
  email?: string;
  permissions?: string[];
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
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(() => localStorage.getItem("arix-daily-theme") === "dark" ? "dark" : "light");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
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
            body: JSON.stringify({ credential, remember }),
          }).then((payload) => {
            if (payload.data) onSuccess(payload.data);
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
  }, [config, onSuccess, remember, theme]);

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
      else setError("Hesabın aktivləşdirilməsi gözlənilir.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Giriş alınmadı.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="daily-auth-screen">
    <button className="daily-auth-theme" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label="Mövzunu dəyiş">
      {theme === "dark" ? <Moon size={18} /> : <Sun size={18} />}
    </button>
    <main className="daily-auth-card">
      <div className="daily-auth-brand"><AriXLogo /><div><b>AriX Daily</b><span>Gündəlik maliyyə axını</span></div></div>
      <div className="daily-auth-heading"><LockKeyhole size={22} /><div><h1>Hesabınıza daxil olun</h1><p>Maliyyə məlumatları yalnız icazəli istifadəçilər üçün açıqdır.</p></div></div>
      <form onSubmit={submit}>
        <label>E-poçt<input type="email" autoComplete="username" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required /></label>
        <label>Şifrə<input type="password" autoComplete="current-password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required /></label>
        <label className="daily-auth-remember"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Məni yadda saxla</label>
        {error && <div className="daily-auth-error">{error}</div>}
        <button className="daily-auth-submit" type="submit" disabled={busy}>{busy ? "Giriş edilir..." : "Daxil ol"}</button>
      </form>
      {config?.googleClientId && <><div className="daily-auth-divider"><span>və ya</span></div><div className="daily-google-button" ref={googleButtonRef} /></>}
      <footer><Mail size={14} /> Giriş problemi olduqda sistem rəhbərinə müraciət edin.</footer>
    </main>
  </div>;
}

export default function App() {
  const previewSession = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    && new URLSearchParams(window.location.search).has("preview");
  const [session, setSession] = useState<DailySession | null | undefined>(() => previewSession
    ? { id: "preview", name: "Demo yönetici", role: "owner", permissions: ["daily.*"] }
    : undefined);

  useEffect(() => {
    if (previewSession) return;
    let cancelled = false;
    void authRequest<AuthResponse>("/api/daily-auth/session")
      .then((payload) => { if (!cancelled) setSession(payload.data ?? null); })
      .catch(() => { if (!cancelled) setSession(null); });
    return () => { cancelled = true; };
  }, [previewSession]);

  const logout = async () => {
    await authRequest("/api/daily-auth/logout", { method: "POST", body: "{}" }).catch(() => undefined);
    setSession(null);
  };

  if (session === undefined) return <LoadingScreen />;
  if (!session) return <Login onSuccess={setSession} />;
  return <Suspense fallback={<LoadingScreen />}><DailyWorkspace session={session} onLogout={logout} /></Suspense>;
}
