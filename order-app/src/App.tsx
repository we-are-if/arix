import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AriXLogo from "../../src/components/AriXLogo";

type Product = { id: number; name: string; code?: string; sku?: string };
type Match = { source: string; productId: number | null; productName: string; productCode: string; quantity: number | null; confidence: number; needsReview: boolean; alternatives: Array<{ id: number; name: string; code: string }> };
type OrderItem = Match & { preparedQuantity: number | null };
type Order = { id: string; number: string; customerName: string; note?: string; status: Status; items: OrderItem[]; createdBy: string; preparedBy?: string; createdAt: string; readyAt?: string };
type Status = "new" | "preparing" | "ready" | "delivered" | "cancelled";
type BoardStatus = "new" | "preparing" | "ready";
type Session = { id: string; name: string; role: string };
type AuthConfig = { enabled: boolean; googleClientId: string };
type AuthResponse = { data?: Session; pending?: boolean };
type GoogleCredentialResponse = { credential?: string };
type Language = "az" | "tr" | "en" | "ru";

const languageOptions: Array<{ id: Language; short: string; label: string }> = [
  { id: "az", short: "AZ", label: "Azərbaycan" },
  { id: "tr", short: "TR", label: "Türkçe" },
  { id: "en", short: "EN", label: "English" },
  { id: "ru", short: "RU", label: "Русский" },
];

const copy = {
  az: { title: "Sifarişlər", subtitle: "Satışdan gələn sifarişləri qarışıqlıq olmadan hazırlayın.", flow: "BU GÜNÜN AXINI", active: "aktiv sifariş", create: "Sifariş yarat", new: "Yeni", preparing: "Hazırlanır", ready: "Hazır", empty: "Burada sifariş yoxdur", rows: "sətir", logout: "Çıxış", customer: "Müştəri adı", note: "Qeyd", orderText: "Sifariş mətni", match: "Məhsulları uyğunlaşdır", matched: "Uyğunlaşdırılan məhsullar", changeText: "Mətni dəyiş", choose: "Məhsul seçin", send: "Sifarişi göndər", start: "Hazırlamağa başla", back: "Geri qaytar", done: "Hazırdır", edit: "Düzəliş et", delivered: "Təhvil verildi", preparingHint: "WhatsApp mətnini olduğu kimi yapışdırın", ordered: "Sifariş", preparedBy: "Hazırlayan" },
  tr: { title: "Siparişler", subtitle: "Satıştan gelen siparişleri karışıklık olmadan hazırlayın.", flow: "BUGÜNÜN AKIŞI", active: "aktif sipariş", create: "Sipariş oluştur", new: "Yeni", preparing: "Hazırlanıyor", ready: "Hazır", empty: "Burada sipariş yok", rows: "satır", logout: "Çıkış", customer: "Müşteri adı", note: "Not", orderText: "Sipariş metni", match: "Ürünleri eşleştir", matched: "Eşleştirilen ürünler", changeText: "Metni değiştir", choose: "Ürün seçin", send: "Siparişi gönder", start: "Hazırlamaya başla", back: "Geri gönder", done: "Hazır", edit: "Düzenle", delivered: "Teslim edildi", preparingHint: "WhatsApp metnini olduğu gibi yapıştırın", ordered: "Sipariş", preparedBy: "Hazırlayan" },
  en: { title: "Orders", subtitle: "Prepare incoming sales orders without confusion.", flow: "TODAY'S FLOW", active: "active orders", create: "Create order", new: "New", preparing: "Preparing", ready: "Ready", empty: "No orders here", rows: "lines", logout: "Sign out", customer: "Customer name", note: "Note", orderText: "Order text", match: "Match products", matched: "Matched products", changeText: "Edit text", choose: "Select product", send: "Send order", start: "Start preparing", back: "Move back", done: "Mark ready", edit: "Edit", delivered: "Delivered", preparingHint: "Paste the WhatsApp text as received", ordered: "Ordered", preparedBy: "Prepared by" },
  ru: { title: "Заказы", subtitle: "Подготавливайте заказы без путаницы.", flow: "СЕГОДНЯШНИЙ ПОТОК", active: "активных заказов", create: "Создать заказ", new: "Новые", preparing: "Подготовка", ready: "Готово", empty: "Здесь нет заказов", rows: "строк", logout: "Выйти", customer: "Имя клиента", note: "Примечание", orderText: "Текст заказа", match: "Сопоставить товары", matched: "Сопоставленные товары", changeText: "Изменить текст", choose: "Выберите товар", send: "Отправить заказ", start: "Начать подготовку", back: "Вернуть", done: "Готово", edit: "Изменить", delivered: "Доставлено", preparingHint: "Вставьте текст WhatsApp без изменений", ordered: "Заказано", preparedBy: "Подготовил" },
} satisfies Record<Language, Record<string, string>>;

declare global {
  interface Window {
    google?: { accounts: { id: {
      initialize: (options: { client_id: string; callback: (response: GoogleCredentialResponse) => void; auto_select?: boolean; cancel_on_tap_outside?: boolean; use_fedcm_for_prompt?: boolean }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, string | number | boolean>) => void;
    } } };
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

const statusMeta: Record<Status, { label: string; tone: string }> = {
  new: { label: "Yeni", tone: "violet" }, preparing: { label: "Hazırlanır", tone: "amber" }, ready: { label: "Hazır", tone: "green" }, delivered: { label: "Təhvil verildi", tone: "gray" }, cancelled: { label: "Ləğv edildi", tone: "red" },
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, ...init });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Əməliyyat alınmadı.");
  return payload;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  return (await request<{ data: T }>(path, init)).data;
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem("arix-order-language") as Language) || "az");
  const [isDark, setIsDark] = useState(() => localStorage.getItem("arix-order-theme") === "dark");
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const text = copy[language];

  useEffect(() => { localStorage.setItem("arix-order-language", language); document.documentElement.lang = language; }, [language]);
  useEffect(() => { localStorage.setItem("arix-order-theme", isDark ? "dark" : "light"); }, [isDark]);

  const load = useCallback(async () => {
    try {
      const [orderData, productData] = await Promise.all([api<Order[]>("/api/orders"), api<Product[]>("/api/orders/catalog")]);
      setOrders(orderData); setProducts(productData);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Məlumat alınmadı."); }
  }, []);

  useEffect(() => { api<Session | null>("/api/auth/session").then(setSession).catch(() => setSession(null)); }, []);
  useEffect(() => { if (session) void load(); }, [session, load]);

  const grouped = useMemo(() => ({
    new: orders.filter((order) => order.status === "new"),
    preparing: orders.filter((order) => order.status === "preparing"),
    ready: orders.filter((order) => order.status === "ready"),
  }), [orders]);

  if (session === undefined) return <div className="center-state">Yüklənir…</div>;
  if (!session) return <Login language={language} setLanguage={setLanguage} isDark={isDark} setIsDark={setIsDark} onSuccess={(user) => setSession(user)} />;

  const logout = async () => {
    try { await request("/api/auth/logout", { method: "POST" }); } finally { setSession(null); }
  };

  return (
    <main className={`app-shell ${isDark ? "theme-dark" : ""}`}>
      <header className="topbar">
        <div className="brand"><AriXLogo className="header-logo" /><div><strong>AriX Panel</strong><small>Sifariş sistemi</small></div></div>
        <div className="header-actions">
          <div className="header-menu"><button className="header-control language-trigger" onClick={() => { setLanguageMenuOpen((value) => !value); setProfileMenuOpen(false); }}><span className="header-icon">◎</span><b>{languageOptions.find((option) => option.id === language)?.label}</b><em>{language.toUpperCase()}</em><span>⌄</span></button>{languageMenuOpen && <div className="header-popover language-popover">{languageOptions.map((option) => <button key={option.id} className={option.id === language ? "active" : ""} onClick={() => { setLanguage(option.id); setLanguageMenuOpen(false); }}><span>{option.short}</span><b>{option.label}</b>{option.id === language && <i>✓</i>}</button>)}</div>}</div>
          <button className="header-control" onClick={() => setIsDark((current) => !current)} aria-label="Tema"><span>{isDark ? "☾" : "☀"}</span><b>{isDark ? "Dark" : "Light"}</b></button>
          <div className="header-menu"><button className="profile-chip" onClick={() => { setProfileMenuOpen((value) => !value); setLanguageMenuOpen(false); }}><span>{session.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><div><b>{session.name}</b><small>{session.role}</small></div><i>⌄</i></button>{profileMenuOpen && <div className="header-popover profile-popover"><div className="profile-summary"><span>{session.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><div><b>{session.name}</b><small>{session.role}</small></div></div><button className="logout-button" onClick={logout}>{text.logout}</button></div>}</div>
        </div>
      </header>
      {error && <div className="notice" role="alert">{error}<button onClick={() => setError("")}>×</button></div>}
      <section className="page-head"><div><p className="eyebrow">{text.flow}</p><h1>{text.title}</h1><p>{text.subtitle}</p></div><div className="page-actions"><div className="summary"><b>{orders.filter((o) => o.status !== "delivered" && o.status !== "cancelled").length}</b><span>{text.active}</span></div><button className="primary" onClick={() => setCreateOpen(true)}>＋ {text.create}</button></div></section>
      <section className="board">
        {(["new", "preparing", "ready"] as BoardStatus[]).map((status) => <BoardColumn key={status} status={status} orders={grouped[status]} onOpen={setActiveOrder} language={language} />)}
      </section>
      {createOpen && <CreateOrder products={products} language={language} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); void load(); }} />}
      {activeOrder && <OrderDetail order={activeOrder} language={language} onClose={() => setActiveOrder(null)} onChanged={(next) => { setActiveOrder(next); void load(); }} />}
    </main>
  );
}

function BoardColumn({ status, orders, onOpen, language }: { status: BoardStatus; orders: Order[]; onOpen: (order: Order) => void; language: Language }) {
  const meta = statusMeta[status];
  const text = copy[language];
  return <section className="column"><header><span className={`status-dot ${meta.tone}`} /><h2>{text[status]}</h2><b>{orders.length}</b></header><div className="cards">
    {orders.length ? orders.map((order) => <button key={order.id} className="order-card" onClick={() => onOpen(order)}><div className="card-top"><span>{order.number}</span><time>{new Date(order.createdAt).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" })}</time></div><h3>{order.customerName}</h3><ul>{order.items.slice(0, 4).map((item, index) => <li key={`${item.productId}-${index}`}><span>{item.productName}</span><b>{item.quantity} mt</b></li>)}</ul>{order.items.length > 4 && <small>+{order.items.length - 4} məhsul</small>}<footer><span>{order.createdBy}</span><span>{order.items.length} {text.rows}</span></footer></button>) : <div className="empty"><span>✓</span><p>{text.empty}</p></div>}
  </div></section>;
}

function CreateOrder({ products, onClose, onCreated, language }: { products: Product[]; onClose: () => void; onCreated: () => void; language: Language }) {
  const ui = copy[language];
  const [customerName, setCustomerName] = useState(""); const [text, setText] = useState(""); const [note, setNote] = useState("");
  const [matches, setMatches] = useState<Match[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const analyze = async () => { setBusy(true); setError(""); try { setMatches(await api<Match[]>("/api/orders/match", { method: "POST", body: JSON.stringify({ text }) })); } catch (cause) { setError(cause instanceof Error ? cause.message : "Uyğunlaşdırma alınmadı."); } finally { setBusy(false); } };
  const update = (index: number, patch: Partial<Match>) => setMatches((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch, needsReview: false } : item));
  const save = async () => { setBusy(true); setError(""); try { await api("/api/orders", { method: "POST", body: JSON.stringify({ customerName, note, items: matches }) }); onCreated(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Sifariş saxlanmadı."); } finally { setBusy(false); } };
  return <Modal title={`${ui.new} ${ui.title.toLocaleLowerCase(language)}`} subtitle={ui.preparingHint} onClose={onClose} wide>
    <div className="form-grid"><label><span>{ui.customer}</span><input autoFocus value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Abanoz Mobilya" /></label><label><span>{ui.note}</span><input value={note} onChange={(e) => setNote(e.target.value)} /></label></div>
    {!matches.length ? <><label><span>{ui.orderText}</span><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={"30 mt ERSA 528\nHG Beyaz Mat 21m\n00258 - 32 metre"} /></label><button className="primary full" disabled={!text.trim() || busy} onClick={analyze}>{busy ? "…" : ui.match}</button></> : <div className="match-list"><div className="match-head"><b>{ui.matched}</b><button className="text-button" onClick={() => setMatches([])}>{ui.changeText}</button></div>{matches.map((item, index) => <div className={`match-row ${item.needsReview ? "review" : ""}`} key={`${item.source}-${index}`}><div className="source-line">“{item.source}”</div><select value={item.productId ?? ""} onChange={(e) => { const product = products.find((p) => p.id === Number(e.target.value)); if (product) update(index, { productId: product.id, productName: product.name, productCode: product.code || product.sku || "" }); }}><option value="">{ui.choose}</option>{products.map((product) => <option key={product.id} value={product.id}>{product.code || product.sku} · {product.name}</option>)}</select><div className="meter-input"><input type="number" min="0.01" step="0.01" value={item.quantity ?? ""} onChange={(e) => update(index, { quantity: Number(e.target.value) })} /><span>mt</span></div></div>)}<button className="primary full" disabled={!customerName.trim() || matches.some((item) => !item.productId || !item.quantity) || busy} onClick={save}>{busy ? "…" : ui.send}</button></div>}
    {error && <p className="form-error">{error}</p>}
  </Modal>;
}

function OrderDetail({ order, onClose, onChanged, language }: { order: Order; onClose: () => void; onChanged: (order: Order) => void; language: Language }) {
  const ui = copy[language];
  const [items, setItems] = useState(order.items); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const changeStatus = async (status: Status) => { setBusy(true); setError(""); try { const next = await api<Order>(`/api/orders/${order.id}`, { method: "PATCH", body: JSON.stringify({ status, items }) }); onChanged(next); } catch (cause) { setError(cause instanceof Error ? cause.message : "Mərhələ dəyişmədi."); } finally { setBusy(false); } };
  return <Modal title={order.customerName} subtitle={`${order.number} · ${statusMeta[order.status].label}`} onClose={onClose}>
    {order.note && <div className="customer-note">{order.note}</div>}
    <div className="prep-list">{items.map((item, index) => <div className="prep-row" key={`${item.productId}-${index}`}><div><small>{item.productCode}</small><strong>{item.productName}</strong><span>{ui.ordered}: {item.quantity} mt</span></div>{order.status === "preparing" ? <label className="actual"><input type="number" min="0.01" step="0.01" value={item.preparedQuantity ?? ""} onChange={(e) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, preparedQuantity: Number(e.target.value) } : row))} /><span>mt</span></label> : order.status === "ready" ? <b className="prepared">{item.preparedQuantity} mt</b> : null}</div>)}</div>
    {order.preparedBy && <p className="worker">{ui.preparedBy}: <b>{order.preparedBy}</b></p>}{error && <p className="form-error">{error}</p>}
    <div className="modal-actions">{order.status === "new" && <button className="primary full" disabled={busy} onClick={() => changeStatus("preparing")}>{ui.start}</button>}{order.status === "preparing" && <><button className="secondary" disabled={busy} onClick={() => changeStatus("new")}>{ui.back}</button><button className="primary" disabled={busy || items.some((item) => !item.preparedQuantity)} onClick={() => changeStatus("ready")}>{ui.done}</button></>}{order.status === "ready" && <><button className="secondary" onClick={() => changeStatus("preparing")}>{ui.edit}</button><button className="primary" onClick={() => changeStatus("delivered")}>{ui.delivered}</button></>}</div>
  </Modal>;
}

function Login({ onSuccess, language, setLanguage, isDark, setIsDark }: { onSuccess: (user: Session) => void; language: Language; setLanguage: (language: Language) => void; isDark: boolean; setIsDark: (value: boolean | ((current: boolean) => boolean)) => void }) {
  const googleButton = useRef<HTMLDivElement | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [login, setLogin] = useState({ email: "", password: "" });
  const [registration, setRegistration] = useState({ name: "", email: "", password: "", companyCode: "" });
  const [googleCredential, setGoogleCredential] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const googleLogin = useCallback(async (credential: string, inviteCode = "") => {
    setBusy(true); setError("");
    try {
      const payload = await request<AuthResponse>("/api/auth/google", { method: "POST", body: JSON.stringify({ credential, companyCode: inviteCode }) });
      if (payload.pending) { setPending(true); setGoogleCredential(""); return; }
      if (payload.data) onSuccess(payload.data);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Google girişi alınmadı.";
      if (message.toLocaleLowerCase("az").includes("dəvət kodu")) setGoogleCredential(credential);
      setError(message);
    } finally { setBusy(false); }
  }, [onSuccess]);

  useEffect(() => { api<AuthConfig>("/api/auth/config").then(setConfig).catch((cause) => setError(cause instanceof Error ? cause.message : "Giriş parametrləri alınmadı.")); }, []);
  useEffect(() => {
    if (mode !== "login" || !config?.enabled || !config.googleClientId || !googleButton.current) return;
    let cancelled = false;
    loadGoogleScript().then(() => {
      if (cancelled || !googleButton.current || !window.google) return;
      googleButton.current.replaceChildren();
      window.google.accounts.id.initialize({ client_id: config.googleClientId, auto_select: false, cancel_on_tap_outside: true, use_fedcm_for_prompt: true, callback: (response) => { if (response.credential) void googleLogin(response.credential); } });
      window.google.accounts.id.renderButton(googleButton.current, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "rectangular", logo_alignment: "left", width: Math.min(360, googleButton.current.clientWidth || 360), locale: "az" });
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Google giriş xidməti hazır deyil."));
    return () => { cancelled = true; };
  }, [config, googleLogin, mode]);

  const passwordLogin = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const payload = await request<AuthResponse>("/api/auth/password", { method: "POST", body: JSON.stringify(login) });
      if (payload.pending) { setPending(true); return; }
      if (payload.data) onSuccess(payload.data);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Giriş alınmadı.";
      if (message.includes("hesab tapılmadı")) { setRegistration((current) => ({ ...current, email: login.email })); setMode("register"); setError(""); }
      else setError(message);
    } finally { setBusy(false); }
  };
  const register = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { const payload = await request<AuthResponse>("/api/auth/register", { method: "POST", body: JSON.stringify(registration) }); if (payload.pending) setPending(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Müraciət göndərilmədi."); }
    finally { setBusy(false); }
  };

  return <main className={`login ${isDark ? "theme-dark" : ""}`}><div className="login-wrap"><div className="login-tools"><label className="header-select"><select aria-label="Dil" value={language} onChange={(event) => setLanguage(event.target.value as Language)}>{languageOptions.map((option) => <option key={option.id} value={option.id}>{option.short} · {option.label}</option>)}</select></label><button className="header-control login-theme" onClick={() => setIsDark((current) => !current)}>{isDark ? "Dark" : "Light"}</button></div><section className="login-card"><div className="login-brand"><div className="login-logo"><AriXLogo /></div><strong>AriX Panel</strong><small>Əməkdaş girişi</small></div>
    {pending ? <div className="pending-box"><b>Müraciət göndərildi</b><span>Şirkət sahibi təsdiqlədikdən sonra daxil ola bilərsiniz.</span></div> : mode === "login" ? <>
      <form onSubmit={passwordLogin}><label><span>E-poçt</span><input type="email" autoComplete="email" required value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} /></label><label><span>Şifrə</span><input type="password" autoComplete="current-password" required value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} /></label><button disabled={busy} className="primary full">Daxil ol</button></form>
      {config?.enabled && <><div className="separator"><span />və ya<span /></div><div ref={googleButton} className="google-button" /></>}
      <button className="text-button login-link" onClick={() => { setMode("register"); setError(""); }}>Hesabınız yoxdur? Qeydiyyatdan keçin</button>
    </> : <form onSubmit={register}><button type="button" className="text-button back-link" onClick={() => { setMode("login"); setError(""); }}>← Girişə qayıt</button><label><span>Ad soyad</span><input required value={registration.name} onChange={(e) => setRegistration({ ...registration, name: e.target.value })} /></label><label><span>E-poçt</span><input type="email" required value={registration.email} onChange={(e) => setRegistration({ ...registration, email: e.target.value })} /></label><label><span>Şifrə</span><input type="password" minLength={8} required value={registration.password} onChange={(e) => setRegistration({ ...registration, password: e.target.value })} /></label><label><span>Dəvət kodu</span><input className="code-input" required value={registration.companyCode} onChange={(e) => setRegistration({ ...registration, companyCode: e.target.value.toUpperCase() })} /></label><button disabled={busy} className="primary full">Təsdiq üçün göndər</button></form>}
    {googleCredential && !pending && <form className="invite-box" onSubmit={(event) => { event.preventDefault(); void googleLogin(googleCredential, companyCode); }}><b>Bu Google hesabı sistemdə yoxdur</b><span>Şirkət dəvət kodunu daxil edin.</span><input className="code-input" required value={companyCode} onChange={(e) => setCompanyCode(e.target.value.toUpperCase())} placeholder="DƏVƏT KODU" /><button disabled={busy || !companyCode.trim()} className="primary full">Təsdiq üçün müraciət et</button></form>}
    {error && <p className="form-error">{error}</p>}
    <div className="login-notice">Yalnız şirkət tərəfindən icazə verilmiş Google hesabları daxil ola bilər.</div>
  </section></div></main>;
}

function Modal({ title, subtitle, onClose, wide, children }: { title: string; subtitle: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className={`modal ${wide ? "wide" : ""}`}><header><div><h2>{title}</h2><p>{subtitle}</p></div><button className="close" aria-label="Bağla" onClick={onClose}>×</button></header><div className="modal-body">{children}</div></section></div>;
}
