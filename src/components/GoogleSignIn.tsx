import { useEffect, useRef, useState } from "react";
import { requestJson } from "../api";
import { useI18n } from "../i18n";

export type AuthUser = {
  id: string;
  name: string;
  role: string;
  email: string;
  picture?: string;
  companyId?: string;
  passwordChangeRequired?: boolean;
};

type AuthConfig = {
  enabled: boolean;
  required: boolean;
  googleClientId: string;
  demoAvailable: boolean;
};

type GoogleCredentialResponse = { credential?: string };

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: GoogleCredentialResponse) => void; auto_select?: boolean; cancel_on_tap_outside?: boolean; use_fedcm_for_prompt?: boolean }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, string | number | boolean>) => void;
          disableAutoSelect: () => void;
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
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google giriş xidməti yüklənmədi.")), { once: true });
      return;
    }
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

export default function GoogleSignIn({ isDark, demoEmail, onAuthenticated }: { isDark: boolean; demoEmail: string; onAuthenticated: (user: AuthUser) => void }) {
  const { language, t } = useI18n();
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pendingCredential, setPendingCredential] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [registering, setRegistering] = useState(false);
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registrationForm, setRegistrationForm] = useState({ name: "", email: "", password: "", companyCode: "" });

  const passwordLogin = async () => {
    setSubmitting(true);
    setError("");
    setPending(false);
    try {
      const payload = await requestJson<{ data?: AuthUser; pending?: boolean }>("/api/auth/password", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(loginForm),
      });
      if (payload.pending) { setPending(true); return; }
      if (payload.data) onAuthenticated(payload.data);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Giriş mümkün olmadı.";
      if (message.includes("hesab tapılmadı")) {
        setRegistrationForm((current) => ({ ...current, email: loginForm.email }));
        setMode("register");
        setError("");
      } else setError(message);
    }
    finally { setSubmitting(false); }
  };

  const register = async () => {
    setSubmitting(true);
    setError("");
    try {
      const payload = await requestJson<{ pending?: boolean }>("/api/auth/register", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(registrationForm),
      });
      if (payload.pending) setPending(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Müraciət göndərilmədi."); }
    finally { setSubmitting(false); }
  };

  const authenticate = async (credential: string, code = "", joinCode = "") => {
    setSubmitting(true);
    setError("");
    try {
      const payload = await requestJson<{ data?: AuthUser; pending?: boolean }>("/api/auth/google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credential, inviteCode: code, companyCode: joinCode }),
      });
      if (payload.pending) { setPending(true); return; }
      setPendingCredential("");
      if (payload.data) onAuthenticated(payload.data);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : t("login.googleUnavailable");
      if (message.toLocaleLowerCase("az").includes("dəvət kodu")) setPendingCredential(credential);
      if (message.includes("Şirkət kodunu")) { setPendingCredential(credential); setRegistering(true); }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    requestJson<{ data: AuthConfig }>("/api/auth/config")
      .then((payload) => { if (!cancelled) setConfig(payload.data); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : t("login.googleUnavailable")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [t]);

  useEffect(() => {
    if (!config?.enabled || !config.googleClientId || !buttonRef.current) return;
    let cancelled = false;
    setLoading(true);
    loadGoogleScript()
      .then(() => {
        if (cancelled || !buttonRef.current || !window.google) return;
        buttonRef.current.replaceChildren();
        window.google.accounts.id.initialize({
          client_id: config.googleClientId,
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true,
          callback: async (response) => {
            if (!response.credential) return;
            await authenticate(response.credential);
          },
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: "standard",
          theme: isDark ? "filled_black" : "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: Math.min(360, buttonRef.current.clientWidth || 360),
          locale: language === "az" ? "az" : language,
        });
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : t("login.googleUnavailable")))
      .finally(() => setLoading(false));
    return () => { cancelled = true; };
  }, [config, isDark, language, mode, onAuthenticated, t]);

  const demoLogin = async () => {
    setSubmitting(true);
    setError("");
    try {
      const payload = await requestJson<{ data: AuthUser }>("/api/auth/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: demoEmail }),
      });
      onAuthenticated(payload.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("login.googleUnavailable"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      {mode === "login" && <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void passwordLogin(); }}>
        <label className="block text-sm font-medium">E-poçt<input required type="email" autoComplete="email" value={loginForm.email} onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })} className={isDark ? "mt-1.5 h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 outline-none" : "mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 outline-none"} /></label>
        <label className="block text-sm font-medium">Şifrə<input required type="password" autoComplete="current-password" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} className={isDark ? "mt-1.5 h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 outline-none" : "mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 outline-none"} /></label>
        <button disabled={submitting} className="surface-primary h-12 w-full rounded-xl text-sm font-semibold disabled:opacity-60">Daxil ol</button>
      </form>}
      {mode === "login" && config?.enabled && <><div className="flex items-center gap-3 py-1"><span className="h-px flex-1 bg-slate-300/60" /><span className="text-xs text-slate-500">və ya</span><span className="h-px flex-1 bg-slate-300/60" /></div><div ref={buttonRef} className="flex min-h-11 w-full items-center justify-center" /></>}
      {mode === "login" && <button type="button" onClick={() => { setMode("register"); setError(""); }} className="w-full text-center text-sm font-semibold text-indigo-600 hover:text-indigo-500">Hesabınız yoxdur? Qeydiyyatdan keçin</button>}
      {mode === "register" && !pending && <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void register(); }}>
        <button type="button" onClick={() => { setMode("login"); setError(""); }} className="text-sm font-semibold text-indigo-600">← Girişə qayıt</button>
        <div className="rounded-xl bg-indigo-500/10 p-3 text-sm">Şirkətə qoşulmaq üçün məlumatlarınızı və sizə verilən dəvət kodunu daxil edin.</div>
        <label className="block text-sm font-medium">Ad soyad<input required value={registrationForm.name} onChange={(event) => setRegistrationForm({ ...registrationForm, name: event.target.value })} className={isDark ? "mt-1.5 h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 outline-none" : "mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 outline-none"} /></label>
        <label className="block text-sm font-medium">E-poçt<input required type="email" value={registrationForm.email} onChange={(event) => setRegistrationForm({ ...registrationForm, email: event.target.value })} className={isDark ? "mt-1.5 h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 outline-none" : "mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 outline-none"} /></label>
        <label className="block text-sm font-medium">Şifrə<input required minLength={8} type="password" value={registrationForm.password} onChange={(event) => setRegistrationForm({ ...registrationForm, password: event.target.value })} className={isDark ? "mt-1.5 h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 outline-none" : "mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 outline-none"} /></label>
        <label className="block text-sm font-medium">Dəvət kodu<input required value={registrationForm.companyCode} onChange={(event) => setRegistrationForm({ ...registrationForm, companyCode: event.target.value.toUpperCase() })} className={isDark ? "mt-1.5 h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-center font-mono tracking-[0.18em] outline-none" : "mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-center font-mono tracking-[0.18em] outline-none"} /></label>
        <button disabled={submitting} className="surface-primary h-12 w-full rounded-xl text-sm font-semibold disabled:opacity-60">Təsdiq üçün göndər</button>
      </form>}
      {pendingCredential && (
        registering ? <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void authenticate(pendingCredential, "", companyCode); }}>
          <label className="block text-sm">Şirkət kodu<input required value={companyCode} onChange={(event) => setCompanyCode(event.target.value.toUpperCase())} className="mt-2 h-12 w-full rounded-xl border border-slate-400 bg-transparent px-4" /></label>
          <button disabled={submitting} className="surface-primary h-12 w-full rounded-xl">Hesab yaratmaq üçün müraciət et</button>
        </form> :
        <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void authenticate(pendingCredential, inviteCode); }}>
          <label className="block text-sm font-semibold">Əməkdaş dəvət kodu
            <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} maxLength={8} autoComplete="one-time-code" className={isDark ? "mt-2 h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-center font-mono text-lg tracking-[0.2em] text-white outline-none" : "mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-center font-mono text-lg tracking-[0.2em] text-slate-900 outline-none"} placeholder="XXXXXXXX" />
          </label>
          <button type="submit" disabled={submitting || inviteCode.length !== 8} className="surface-primary h-12 w-full rounded-xl px-5 text-sm font-semibold disabled:opacity-50">Kodu təsdiqlə</button>
        </form>
      )}
      {pending && <div role="status" className="rounded-xl bg-amber-500/10 p-4 text-sm">Müraciətiniz göndərildi. Şirkət sahibi təsdiqlədikdən sonra e-poçt və şifrənizlə daxil ola bilərsiniz.</div>}
      {(loading || submitting) && <div className="text-center text-sm text-slate-500">{t("login.checking")}</div>}
      {mode === "login" && !loading && config && !config.enabled && (
        <>
          <div className={isDark ? "rounded-xl bg-amber-400/10 px-3 py-2 text-sm text-amber-200" : "rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700"}>{t("login.googleNotConfigured")}</div>
          {config.demoAvailable && <button type="button" disabled={submitting} onClick={() => void demoLogin()} className="surface-primary h-12 w-full rounded-xl px-5 text-sm font-semibold disabled:opacity-60">{t("login.demoSubmit")}</button>}
        </>
      )}
      {error && <div role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</div>}
    </div>
  );
}
