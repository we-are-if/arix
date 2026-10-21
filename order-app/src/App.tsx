import { useCallback, useEffect, useMemo, useState } from "react";

type Product = { id: number; name: string; code?: string; sku?: string };
type Match = { source: string; productId: number | null; productName: string; productCode: string; quantity: number | null; confidence: number; needsReview: boolean; alternatives: Array<{ id: number; name: string; code: string }> };
type OrderItem = Match & { preparedQuantity: number | null };
type Order = { id: string; number: string; customerName: string; note?: string; status: Status; items: OrderItem[]; createdBy: string; preparedBy?: string; createdAt: string; readyAt?: string };
type Status = "new" | "preparing" | "ready" | "delivered" | "cancelled";
type BoardStatus = "new" | "preparing" | "ready";
type Session = { id: string; name: string; role: string };

const statusMeta: Record<Status, { label: string; tone: string }> = {
  new: { label: "Yeni", tone: "violet" }, preparing: { label: "Hazırlanır", tone: "amber" }, ready: { label: "Hazır", tone: "green" }, delivered: { label: "Təhvil verildi", tone: "gray" }, cancelled: { label: "Ləğv edildi", tone: "red" },
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, ...init });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Əməliyyat alınmadı.");
  return payload.data;
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [orderData, productData] = await Promise.all([api<Order[]>("/api/orders"), api<Product[]>("/api/products")]);
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
  if (!session) return <Login onSuccess={(user) => setSession(user)} />;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">A</span><div><strong>AriX Sifariş</strong><small>Anbar hazırlama lövhəsi</small></div></div>
        <div className="header-actions"><span className="user-chip">{session.name}</span><button className="primary" onClick={() => setCreateOpen(true)}>+ Sifariş yarat</button></div>
      </header>
      {error && <div className="notice" role="alert">{error}<button onClick={() => setError("")}>×</button></div>}
      <section className="page-head"><div><p className="eyebrow">BU GÜNÜN AXINI</p><h1>Sifarişlər</h1><p>Satışdan gələn sifarişləri qarışıqlıq olmadan hazırlayın.</p></div><div className="summary"><b>{orders.filter((o) => o.status !== "delivered" && o.status !== "cancelled").length}</b><span>aktiv sifariş</span></div></section>
      <section className="board">
        {(["new", "preparing", "ready"] as BoardStatus[]).map((status) => <BoardColumn key={status} status={status} orders={grouped[status]} onOpen={setActiveOrder} />)}
      </section>
      {createOpen && <CreateOrder products={products} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); void load(); }} />}
      {activeOrder && <OrderDetail order={activeOrder} onClose={() => setActiveOrder(null)} onChanged={(next) => { setActiveOrder(next); void load(); }} />}
    </main>
  );
}

function BoardColumn({ status, orders, onOpen }: { status: BoardStatus; orders: Order[]; onOpen: (order: Order) => void }) {
  const meta = statusMeta[status];
  return <section className="column"><header><span className={`status-dot ${meta.tone}`} /><h2>{meta.label}</h2><b>{orders.length}</b></header><div className="cards">
    {orders.length ? orders.map((order) => <button key={order.id} className="order-card" onClick={() => onOpen(order)}><div className="card-top"><span>{order.number}</span><time>{new Date(order.createdAt).toLocaleTimeString("az", { hour: "2-digit", minute: "2-digit" })}</time></div><h3>{order.customerName}</h3><ul>{order.items.slice(0, 4).map((item, index) => <li key={`${item.productId}-${index}`}><span>{item.productName}</span><b>{item.quantity} mt</b></li>)}</ul>{order.items.length > 4 && <small>+{order.items.length - 4} məhsul</small>}<footer><span>{order.createdBy}</span><span>{order.items.length} sətir</span></footer></button>) : <div className="empty"><span>✓</span><p>Burada sifariş yoxdur</p></div>}
  </div></section>;
}

function CreateOrder({ products, onClose, onCreated }: { products: Product[]; onClose: () => void; onCreated: () => void }) {
  const [customerName, setCustomerName] = useState(""); const [text, setText] = useState(""); const [note, setNote] = useState("");
  const [matches, setMatches] = useState<Match[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const analyze = async () => { setBusy(true); setError(""); try { setMatches(await api<Match[]>("/api/orders/match", { method: "POST", body: JSON.stringify({ text }) })); } catch (cause) { setError(cause instanceof Error ? cause.message : "Uyğunlaşdırma alınmadı."); } finally { setBusy(false); } };
  const update = (index: number, patch: Partial<Match>) => setMatches((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch, needsReview: false } : item));
  const save = async () => { setBusy(true); setError(""); try { await api("/api/orders", { method: "POST", body: JSON.stringify({ customerName, note, items: matches }) }); onCreated(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Sifariş saxlanmadı."); } finally { setBusy(false); } };
  return <Modal title="Yeni sifariş" subtitle="WhatsApp mətnini olduğu kimi yapışdırın" onClose={onClose} wide>
    <div className="form-grid"><label><span>Müştəri adı</span><input autoFocus value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Məsələn, Abanoz Mobilya" /></label><label><span>Qeyd</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Çatdırılma və ya xüsusi qeyd" /></label></div>
    {!matches.length ? <><label><span>Sifariş mətni</span><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={"30 mt ERSA 528\nHG Beyaz Mat 21m\n00258 - 32 metre"} /></label><div className="hint">Hər məhsulu ayrıca sətirdə yazın. Kod, SKU və məhsul adı istifadə oluna bilər.</div><button className="primary full" disabled={!text.trim() || busy} onClick={analyze}>{busy ? "Yoxlanır…" : "Məhsulları uyğunlaşdır"}</button></> : <div className="match-list"><div className="match-head"><b>Uyğunlaşdırılan məhsullar</b><button className="text-button" onClick={() => setMatches([])}>Mətni dəyiş</button></div>{matches.map((item, index) => <div className={`match-row ${item.needsReview ? "review" : ""}`} key={`${item.source}-${index}`}><div className="source-line">“{item.source}” {item.needsReview && <em>Yoxlayın</em>}</div><select value={item.productId ?? ""} onChange={(e) => { const product = products.find((p) => p.id === Number(e.target.value)); if (product) update(index, { productId: product.id, productName: product.name, productCode: product.code || product.sku || "" }); }}><option value="">Məhsul seçin</option>{products.map((product) => <option key={product.id} value={product.id}>{product.code || product.sku} · {product.name}</option>)}</select><div className="meter-input"><input type="number" min="0.01" step="0.01" value={item.quantity ?? ""} onChange={(e) => update(index, { quantity: Number(e.target.value) })} /><span>mt</span></div></div>)}<button className="primary full" disabled={!customerName.trim() || matches.some((item) => !item.productId || !item.quantity) || busy} onClick={save}>{busy ? "Saxlanır…" : "Sifarişi göndər"}</button></div>}
    {error && <p className="form-error">{error}</p>}
  </Modal>;
}

function OrderDetail({ order, onClose, onChanged }: { order: Order; onClose: () => void; onChanged: (order: Order) => void }) {
  const [items, setItems] = useState(order.items); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const changeStatus = async (status: Status) => { setBusy(true); setError(""); try { const next = await api<Order>(`/api/orders/${order.id}`, { method: "PATCH", body: JSON.stringify({ status, items }) }); onChanged(next); } catch (cause) { setError(cause instanceof Error ? cause.message : "Mərhələ dəyişmədi."); } finally { setBusy(false); } };
  return <Modal title={order.customerName} subtitle={`${order.number} · ${statusMeta[order.status].label}`} onClose={onClose}>
    {order.note && <div className="customer-note">{order.note}</div>}
    <div className="prep-list">{items.map((item, index) => <div className="prep-row" key={`${item.productId}-${index}`}><div><small>{item.productCode}</small><strong>{item.productName}</strong><span>Sifariş: {item.quantity} mt</span></div>{order.status === "preparing" ? <label className="actual"><input type="number" min="0.01" step="0.01" value={item.preparedQuantity ?? ""} onChange={(e) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, preparedQuantity: Number(e.target.value) } : row))} /><span>mt hazır</span></label> : order.status === "ready" ? <b className="prepared">{item.preparedQuantity} mt</b> : null}</div>)}</div>
    {order.preparedBy && <p className="worker">Hazırlayan: <b>{order.preparedBy}</b></p>}{error && <p className="form-error">{error}</p>}
    <div className="modal-actions">{order.status === "new" && <button className="primary full" disabled={busy} onClick={() => changeStatus("preparing")}>Hazırlamağa başla</button>}{order.status === "preparing" && <><button className="secondary" disabled={busy} onClick={() => changeStatus("new")}>Geri qaytar</button><button className="primary" disabled={busy || items.some((item) => !item.preparedQuantity)} onClick={() => changeStatus("ready")}>Hazırdır</button></>}{order.status === "ready" && <><button className="secondary" onClick={() => changeStatus("preparing")}>Düzəliş et</button><button className="primary" onClick={() => changeStatus("delivered")}>Təhvil verildi</button></>}</div>
  </Modal>;
}

function Login({ onSuccess }: { onSuccess: (user: Session) => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setError(""); try { onSuccess(await api<Session>("/api/auth/password", { method: "POST", body: JSON.stringify({ email, password }) })); } catch (cause) { setError(cause instanceof Error ? cause.message : "Giriş alınmadı."); } };
  return <main className="login"><form onSubmit={submit}><div className="brand login-brand"><span className="brand-mark">A</span><div><strong>AriX Sifariş</strong><small>Satış və anbar komandası</small></div></div><h1>Xoş gəldiniz</h1><p>AriX əməkdaş hesabınızla daxil olun.</p><label><span>E-poçt</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label><label><span>Şifrə</span><input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>{error && <p className="form-error">{error}</p>}<button className="primary full">Daxil ol</button></form></main>;
}

function Modal({ title, subtitle, onClose, wide, children }: { title: string; subtitle: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className={`modal ${wide ? "wide" : ""}`}><header><div><h2>{title}</h2><p>{subtitle}</p></div><button className="close" aria-label="Bağla" onClick={onClose}>×</button></header><div className="modal-body">{children}</div></section></div>;
}
