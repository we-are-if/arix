import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Bell, Check, KeyRound, Plus, RefreshCw, Save, Send, ShieldCheck, Trash2, UserRound, Users } from "lucide-react";
import type { DailySession } from "./App";

type Permission = { key: string; group: string; label: string };
type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  permissions: string[];
  lastLoginAt: string | null;
  createdAt: string | null;
  passwordEnabled: boolean;
};
type Notice = { id: string; title: string; message: string; createdAt: string; createdBy: string; recipientUserId?: string; readAt?: string | null };
type Audit = { id: string; action: string; at: string; by: string; target?: string };
type ManagementPayload = { users: ManagedUser[]; permissionCatalog: Permission[]; roleDefaults: Record<string, string[]>; notifications: Notice[]; audit: Audit[] };

const emptyUser = (): ManagedUser => ({ id: "", name: "", email: "", role: "Müşahidəçi", active: true, permissions: [], lastLoginAt: null, createdAt: null, passwordEnabled: false });

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", headers: { "content-type": "application/json", ...(init?.headers || {}) }, ...init });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Sorğu tamamlanmadı.");
  return payload as T;
}

export default function DailyManagementView({ session }: { session: DailySession }) {
  const canUsers = session.permissions?.includes("daily.users.manage") || session.role.toLocaleLowerCase("az") === "sahib";
  const canNotify = session.permissions?.includes("daily.notifications.manage") || session.role.toLocaleLowerCase("az") === "sahib";
  const [tab, setTab] = useState<"users" | "notifications" | "audit">(canUsers ? "users" : "notifications");
  const [data, setData] = useState<ManagementPayload | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<ManagedUser>(emptyUser);
  const [password, setPassword] = useState("");
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = async () => {
    setBusy(true);
    try {
      const payload = await api<{ data: ManagementPayload }>("/api/daily/management");
      setData(payload.data);
      const keepId = selectedId && payload.data.users.some((user) => user.id === selectedId) ? selectedId : payload.data.users[0]?.id || "";
      setSelectedId(keepId);
      const selected = payload.data.users.find((user) => user.id === keepId);
      if (selected) setDraft({ ...selected, permissions: [...selected.permissions] });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "İdarəetmə məlumatları alınmadı." });
    } finally { setBusy(false); }
  };

  useEffect(() => { void load(); }, []);

  const permissionGroups = useMemo(() => {
    const groups = new Map<string, Permission[]>();
    for (const permission of data?.permissionCatalog || []) groups.set(permission.group, [...(groups.get(permission.group) || []), permission]);
    return [...groups.entries()];
  }, [data]);

  const selectUser = (user: ManagedUser) => {
    setSelectedId(user.id);
    setDraft({ ...user, permissions: [...user.permissions] });
    setPassword("");
    setMessage(null);
  };

  const chooseRole = (role: string) => {
    const defaults = data?.roleDefaults[role.toLocaleLowerCase("az")] || [];
    setDraft((current) => ({ ...current, role, permissions: [...defaults] }));
  };

  const saveUser = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const body = JSON.stringify({ name: draft.name, email: draft.email, role: draft.role, active: draft.active, permissions: draft.permissions, password: password || undefined });
      const payload = await api<{ data: ManagedUser; temporaryPassword?: string }>(draft.id ? `/api/daily/users/${draft.id}` : "/api/daily/users", { method: draft.id ? "PATCH" : "POST", body });
      setMessage({ tone: "ok", text: payload.temporaryPassword ? `İstifadəçi yaradıldı. Müvəqqəti şifrə: ${payload.temporaryPassword}` : "İstifadəçi məlumatları saxlanıldı." });
      setPassword("");
      await load();
    } catch (error) { setMessage({ tone: "error", text: error instanceof Error ? error.message : "İstifadəçi saxlanmadı." }); }
    finally { setBusy(false); }
  };

  const deleteUser = async () => {
    if (!draft.id || !window.confirm(`${draft.name} istifadəçisini silmək istəyirsiniz?`)) return;
    setBusy(true);
    try {
      await api(`/api/daily/users/${draft.id}`, { method: "DELETE" });
      setSelectedId("");
      setDraft(emptyUser());
      setMessage({ tone: "ok", text: "İstifadəçi silindi." });
      await load();
    } catch (error) { setMessage({ tone: "error", text: error instanceof Error ? error.message : "İstifadəçi silinmədi." }); }
    finally { setBusy(false); }
  };

  const sendNotification = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = await api<{ data: { recipients: number } }>("/api/daily/notifications", { method: "POST", body: JSON.stringify({ title: noticeTitle, message: noticeMessage, recipientIds }) });
      setMessage({ tone: "ok", text: `Bildiriş ${payload.data.recipients} istifadəçiyə göndərildi.` });
      setNoticeTitle(""); setNoticeMessage(""); setRecipientIds([]);
      await load();
    } catch (error) { setMessage({ tone: "error", text: error instanceof Error ? error.message : "Bildiriş göndərilmədi." }); }
    finally { setBusy(false); }
  };

  if (!data && busy) return <section className="management-loading"><RefreshCw className="spin" /><span>İdarəetmə paneli açılır...</span></section>;

  return <section className="daily-management-page">
    <header className="management-heading">
      <div><span>İDARƏETMƏ</span><h1>İstifadəçilər və bildirişlər</h1><p>Daily şirkətinin giriş, rol, icazə və daxili bildiriş nəzarəti.</p></div>
      <button type="button" className="secondary-button" onClick={() => void load()} disabled={busy}><RefreshCw size={16} /> Yenilə</button>
    </header>
    <nav className="management-tabs">
      {canUsers && <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}><Users size={16} /> İstifadəçilər <em>{data?.users.length || 0}</em></button>}
      {canNotify && <button className={tab === "notifications" ? "active" : ""} onClick={() => setTab("notifications")}><Bell size={16} /> Bildirişlər</button>}
      {canUsers && <button className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}><ShieldCheck size={16} /> Əməliyyat tarixçəsi</button>}
    </nav>
    {message && <div className={`management-message ${message.tone}`}><span>{message.text}</span><button onClick={() => setMessage(null)}>×</button></div>}

    {tab === "users" && canUsers && <div className="management-users-layout">
      <section className="management-user-list">
        <div className="management-section-head"><div><h2>Komanda</h2><small>Daily-yə giriş hüququ olan hesablar</small></div><button type="button" onClick={() => { setSelectedId(""); setDraft(emptyUser()); setPassword(""); }}><Plus size={16} /> Yeni</button></div>
        <div className="management-user-rows">{data?.users.map((user) => <button type="button" key={user.id} className={selectedId === user.id ? "active" : ""} onClick={() => selectUser(user)}>
          <span className="management-avatar">{user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</span>
          <span><b>{user.name}</b><small>{user.email}</small></span><em className={user.active ? "active" : "inactive"}>{user.active ? "Aktiv" : "Bağlı"}</em>
        </button>)}</div>
      </section>
      <form className="management-user-editor" onSubmit={saveUser}>
        <div className="management-section-head"><div><h2>{draft.id ? "İstifadəçi məlumatları" : "Yeni istifadəçi"}</h2><small>Rol şablonu seçin, sonra lazım olan icazələri dəqiqləşdirin.</small></div>{draft.id && <button type="button" className="icon-danger" onClick={() => void deleteUser()} title="İstifadəçini sil"><Trash2 size={16} /></button>}</div>
        <div className="management-form-grid">
          <label><span>Ad və soyad</span><input value={draft.name} onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))} required /></label>
          <label><span>E-poçt</span><input type="email" value={draft.email} onChange={(e) => setDraft((c) => ({ ...c, email: e.target.value }))} required /></label>
          <label><span>Rol</span><select value={draft.role} onChange={(e) => chooseRole(e.target.value)}>{["Sahib", "Rəhbər", "Mühasib", "Kassir", "Müşahidəçi"].map((role) => <option key={role}>{role}</option>)}</select></label>
          <label><span>{draft.passwordEnabled ? "Yeni şifrə (dəyişmək üçün)" : "Şifrə"}</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={draft.id ? "Dəyişmirsə boş saxlayın" : "Boş qalsa avtomatik yaranır"} /></label>
        </div>
        <label className="management-active-toggle"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft((c) => ({ ...c, active: e.target.checked }))} /><span><b>Hesab aktivdir</b><small>Bağlandıqda istifadəçi dərhal giriş hüququnu itirir.</small></span></label>
        <div className="permission-groups">{permissionGroups.map(([group, permissions]) => <fieldset key={group}><legend>{group}</legend>{permissions.map((permission) => <label key={permission.key}><input type="checkbox" checked={draft.permissions.includes(permission.key)} onChange={(e) => setDraft((c) => ({ ...c, permissions: e.target.checked ? [...new Set([...c.permissions, permission.key])] : c.permissions.filter((key) => key !== permission.key) }))} /><span>{permission.label}</span></label>)}</fieldset>)}</div>
        <div className="management-editor-actions"><button type="submit" className="primary-button" disabled={busy}><Save size={16} /> {draft.id ? "Dəyişiklikləri saxla" : "İstifadəçi yarat"}</button></div>
      </form>
    </div>}

    {tab === "notifications" && canNotify && <div className="management-notification-layout">
      <form className="notification-composer" onSubmit={sendNotification}><div className="management-section-head"><div><h2>Bildiriş göndər</h2><small>Hamıya və ya seçilmiş istifadəçilərə daxili bildiriş göndərin.</small></div><Send size={18} /></div>
        <label><span>Başlıq</span><input value={noticeTitle} onChange={(e) => setNoticeTitle(e.target.value)} maxLength={100} required /></label>
        <label><span>Mətn</span><textarea value={noticeMessage} onChange={(e) => setNoticeMessage(e.target.value)} maxLength={500} required /></label>
        <div className="notification-recipients"><b>Alıcılar</b><small>Seçim etməsəniz bütün aktiv istifadəçilərə gedəcək.</small>{data?.users.filter((user) => user.active).map((user) => <label key={user.id}><input type="checkbox" checked={recipientIds.includes(user.id)} onChange={(e) => setRecipientIds((current) => e.target.checked ? [...current, user.id] : current.filter((id) => id !== user.id))} /><span>{user.name}</span></label>)}</div>
        <button type="submit" className="primary-button" disabled={busy}><Send size={16} /> Göndər</button>
      </form>
      <section className="notification-history"><div className="management-section-head"><div><h2>Son bildirişlər</h2><small>Göndərilən idarəetmə mesajları</small></div></div>{data?.notifications.length ? data.notifications.map((notice) => <article key={notice.id}><i><Bell size={15} /></i><div><b>{notice.title}</b><p>{notice.message}</p><small>{notice.createdBy} · {new Date(notice.createdAt).toLocaleString("az-AZ")}</small></div></article>) : <div className="management-empty">Hələ bildiriş göndərilməyib.</div>}</section>
    </div>}

    {tab === "audit" && canUsers && <section className="management-audit"><div className="management-section-head"><div><h2>İdarəetmə tarixçəsi</h2><small>İstifadəçi və bildiriş dəyişiklikləri</small></div></div>{data?.audit.map((row) => <article key={row.id}><i><KeyRound size={15} /></i><span><b>{row.by}</b><small>{row.action.replaceAll("_", " ")} · {row.target || "Daily"}</small></span><time>{new Date(row.at).toLocaleString("az-AZ")}</time></article>)}</section>}
  </section>;
}
