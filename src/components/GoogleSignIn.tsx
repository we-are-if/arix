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
            setSubmitting(true);
            setError("");
            try {
              const payload = await requestJson<{ data: AuthUser }>("/api/auth/google", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ credential: response.credential }),
              });
              onAuthenticated(payload.data);
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : t("login.googleUnavailable"));
            } finally {
              setSubmitting(false);
            }
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
  }, [config, isDark, language, onAuthenticated, t]);

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
      {config?.enabled && <div ref={buttonRef} className="flex min-h-11 w-full items-center justify-center" />}
      {(loading || submitting) && <div className="text-center text-sm text-slate-500">{t("login.checking")}</div>}
      {!loading && config && !config.enabled && (
        <>
          <div className={isDark ? "rounded-xl bg-amber-400/10 px-3 py-2 text-sm text-amber-200" : "rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700"}>{t("login.googleNotConfigured")}</div>
          {config.demoAvailable && <button type="button" disabled={submitting} onClick={() => void demoLogin()} className="surface-primary h-12 w-full rounded-xl px-5 text-sm font-semibold disabled:opacity-60">{t("login.demoSubmit")}</button>}
        </>
      )}
      {error && <div role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</div>}
    </div>
  );
}
