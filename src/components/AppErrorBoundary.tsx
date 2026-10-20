import { Component, type ErrorInfo, type ReactNode } from "react";
import type { AppLanguage } from "../i18n";

type Props = { children: ReactNode };
type State = { error: Error | null; errorCode: string; retryKey: number };

const messages: Record<AppLanguage, {
  eyebrow: string;
  title: string;
  description: string;
  retry: string;
  home: string;
  code: string;
}> = {
  az: {
    eyebrow: "Tətbiq xətası",
    title: "Bu bölmə açıla bilmədi",
    description: "Məlumatlarınız qorunur. Səhifəni yenidən yoxlayın və ya ana səhifəyə qayıdın.",
    retry: "Yenidən yoxla",
    home: "Ana səhifəyə qayıt",
    code: "Xəta kodu",
  },
  tr: {
    eyebrow: "Uygulama hatası",
    title: "Bu bölüm açılamadı",
    description: "Verileriniz korunuyor. Sayfayı yeniden deneyin veya ana sayfaya dönün.",
    retry: "Tekrar dene",
    home: "Ana sayfaya dön",
    code: "Hata kodu",
  },
  en: {
    eyebrow: "Application error",
    title: "This section could not be opened",
    description: "Your data is safe. Try the page again or return to the dashboard.",
    retry: "Try again",
    home: "Return to dashboard",
    code: "Error code",
  },
  ru: {
    eyebrow: "Ошибка приложения",
    title: "Не удалось открыть этот раздел",
    description: "Ваши данные сохранены. Повторите попытку или вернитесь на главную страницу.",
    retry: "Повторить",
    home: "Вернуться на главную",
    code: "Код ошибки",
  },
};

const getLanguage = (): AppLanguage => {
  const value = localStorage.getItem("arix-language");
  return value === "tr" || value === "en" || value === "ru" ? value : "az";
};

const makeErrorCode = () => `ARX-${Date.now().toString(36).toUpperCase()}`;

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorCode: "", retryKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, errorCode: makeErrorCode() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.state.errorCode}] Unhandled React error`, error, info.componentStack);
  }

  retry = () => {
    this.setState((state) => ({ error: null, errorCode: "", retryKey: state.retryKey + 1 }));
  };

  render() {
    if (!this.state.error) return <div key={this.state.retryKey}>{this.props.children}</div>;

    const text = messages[getLanguage()];
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-100 p-4 text-slate-900 sm:p-8">
        <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">A</div>
            <div>
              <div className="text-base font-semibold">AriX Panel</div>
              <div className="text-xs font-semibold uppercase text-rose-600">{text.eyebrow}</div>
            </div>
          </div>
          <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">{text.title}</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-600 sm:text-base">{text.description}</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={this.retry} className="h-11 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700">
              {text.retry}
            </button>
            <button type="button" onClick={() => window.location.assign("/")} className="h-11 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              {text.home}
            </button>
          </div>
          <p className="mt-6 text-xs text-slate-400">{text.code}: {this.state.errorCode}</p>
        </section>
      </main>
    );
  }
}
