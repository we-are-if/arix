import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Bell, Check, Copy, KeyRound, Plus, RefreshCw, Save, Search, Send, ShieldCheck, Trash2, UserRound, Users, X } from "lucide-react";
import type { DailySession } from "./App";

type Permission = { key: string; group: string; label: string };
type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  joinPending: boolean;
  permissions: string[];
  lastLoginAt: string | null;
  createdAt: string | null;
  passwordEnabled: boolean;
};
type Notice = { id: string; title: string; message: string; createdAt: string; createdBy: string; recipientUserId?: string; readAt?: string | null };
type AuditValue = string | number | boolean | null;
type Audit = {
  id: string;
  action: string;
  at: string;
  by: string;
  target?: string;
  entityType?: string;
  entityId?: string;
  details?: string;
  changes?: Array<{ field: string; before: AuditValue; after: AuditValue }>;
};
type AccessRequest = { id: string; name: string; email: string; createdAt: string | null };
type ManagementPayload = { users: ManagedUser[]; permissionCatalog: Permission[]; roleDefaults: Record<string, string[]>; companyJoinCode: string; accessRequests: AccessRequest[]; notifications: Notice[]; audit: Audit[] };

const emptyUser = (): ManagedUser => ({ id: "", name: "", email: "", role: "Müşahidəçi", active: true, joinPending: false, permissions: [], lastLoginAt: null, createdAt: null, passwordEnabled: false });

const auditActionLabels: Record<string, string> = {
  daily_snapshot_initialized: "Daily məlumatları yaradıldı",
  snapshot_saved: "Məlumat paketi saxlanıldı",
  daily_entry_created: "Əməliyyat yaradıldı",
  daily_entry_updated: "Əməliyyat dəyişdirildi",
  daily_entry_deleted: "Əməliyyat silindi",
  daily_entry_invoice_link_changed: "Əməliyyatın qaimə əlaqəsi dəyişdi",
  daily_entry_change_requested: "Əməliyyat düzəlişi istəndi",
  daily_entry_change_approved: "Əməliyyat düzəlişi təsdiqləndi",
  daily_entry_change_rejected: "Əməliyyat düzəlişi rədd edildi",
  daily_entry_update_requested: "Əməliyyat düzəlişi istəndi",
  daily_entry_update_approved: "Əməliyyat düzəlişi təsdiqləndi",
  daily_entry_update_rejected: "Əməliyyat düzəlişi rədd edildi",
  daily_entry_delete_requested: "Əməliyyatın silinməsi istəndi",
  daily_entry_delete_approved: "Əməliyyatın silinməsi təsdiqləndi",
  daily_entry_delete_rejected: "Əməliyyatın silinməsi rədd edildi",
  daily_entry_create_backdated_requested: "Keçmiş tarixə əlavə istəndi",
  daily_entry_create_backdated_approved: "Keçmiş tarixə əlavə təsdiqləndi",
  daily_entry_create_backdated_rejected: "Keçmiş tarixə əlavə rədd edildi",
  daily_invoice_created: "Qaimə yaradıldı",
  daily_invoice_updated: "Qaimə dəyişdirildi",
  daily_invoice_approved: "Qaimə təsdiqləndi",
  daily_invoice_cancelled: "Qaimə ləğv edildi",
  daily_invoice_restarted: "Qaimə başdan başladıldı",
  daily_invoice_restart_copy_created: "Başdan başladılan yeni qaimə saxlanıldı",
  daily_invoice_permanently_deleted: "Qaimə qalıcı silindi",
  daily_day_closed: "Gün bağlandı",
  daily_day_reopened: "Gün yenidən açıldı",
  daily_day_close_updated: "Gün bağlanışı dəyişdirildi",
  daily_customer_debt_changed: "Müştəri borcu dəyişdi",
  daily_past_month_balance_changed: "Əvvəlki aydan qalan dəyişdi",
  daily_financial_cutover: "Maliyyə başlanğıcı eyniləşdirildi",
  daily_directory_changed: "Siyahı dəyişdirildi",
  daily_rules_changed: "Hesablama qaydaları dəyişdi",
  daily_card_limit_settings_changed: "Kart limitləri dəyişdi",
  user_created: "İstifadəçi yaradıldı",
  user_updated: "İstifadəçi dəyişdirildi",
  user_deleted: "İstifadəçi silindi",
  notification_sent: "Bildiriş göndərildi",
  daily_join_code_created: "Dəvət kodu yaradıldı",
  daily_join_code_changed: "Dəvət kodu dəyişdirildi",
  daily_access_approved: "Giriş müraciəti təsdiqləndi",
  daily_access_rejected: "Giriş müraciəti rədd edildi",
};

const auditValue = (value: AuditValue) => {
  if (value === null || value === "") return "—";
  if (value === true) return "Bəli";
  if (value === false) return "Xeyr";
  return String(value);
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", headers: { "content-type": "application/json", ...(init?.headers || {}) }, ...init });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Sorğu tamamlanmadı.");
  return payload as T;
}

export default function DailyManagementView({ session, showPermissionActions = false }: { session: DailySession; showPermissionActions?: boolean }) {
  const canUsers = session.permissions?.includes("daily.users.manage") || session.role.toLocaleLowerCase("az") === "sahib";
  const canNotify = session.permissions?.includes("daily.notifications.manage") || session.role.toLocaleLowerCase("az") === "sahib";
  const canAudit = session.permissions?.includes("daily.audit.view") || session.role.toLocaleLowerCase("az") === "sahib";
  const [tab, setTab] = useState<"users" | "notifications" | "audit">(canUsers ? "users" : canNotify ? "notifications" : "audit");
  const [data, setData] = useState<ManagementPayload | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<ManagedUser>(emptyUser);
  const [password, setPassword] = useState("");
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [joinCodeDraft, setJoinCodeDraft] = useState("");
  const [accessRoles, setAccessRoles] = useState<Record<string, string>>({});
  const [auditSearch, setAuditSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = async () => {
    setBusy(true);
    try {
      const payload = await api<{ data: ManagementPayload }>("/api/daily/management");
      setData(payload.data);
      setJoinCodeDraft(payload.data.companyJoinCode || "");
      setAccessRoles((current) => Object.fromEntries(
        payload.data.accessRequests.map((request) => [request.id, current[request.id] || "Müşahidəçi"]),
      ));
      const activeUsers = payload.data.users.filter((user) => !user.joinPending);
      const keepId = selectedId && activeUsers.some((user) => user.id === selectedId) ? selectedId : activeUsers[0]?.id || "";
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

  const filteredAudit = useMemo(() => {
    const query = auditSearch.trim().toLocaleLowerCase("az");
    if (!query) return data?.audit || [];
    return (data?.audit || []).filter((row) => [
      row.by,
      row.target,
      row.details,
      auditActionLabels[row.action] || row.action,
      ...(row.changes || []).flatMap((change) => [change.field, auditValue(change.before), auditValue(change.after)]),
    ].some((value) => String(value || "").toLocaleLowerCase("az").includes(query)));
  }, [auditSearch, data]);

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

  const saveJoinCode = async (generate = false) => {
    setBusy(true);
    setMessage(null);
    try {
      const payload = await api<{ data: { code: string } }>("/api/daily/join-code", { method: "PUT", body: JSON.stringify(generate ? { generate: true } : { code: joinCodeDraft }) });
      setJoinCodeDraft(payload.data.code);
      setMessage({ tone: "ok", text: "Daily dəvət kodu yeniləndi." });
      await load();
    } catch (error) { setMessage({ tone: "error", text: error instanceof Error ? error.message : "Dəvət kodu yenilənmədi." }); }
    finally { setBusy(false); }
  };

  const decideAccessRequest = async (request: AccessRequest, approve: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/daily/access-requests/${request.id}`, { method: "PATCH", body: JSON.stringify({ approve, role: accessRoles[request.id] || "Müşahidəçi" }) });
      setMessage({ tone: "ok", text: approve ? `${request.name} üçün giriş açıldı.` : `${request.name} müraciəti rədd edildi.` });
      await load();
    } catch (error) { setMessage({ tone: "error", text: error instanceof Error ? error.message : "Giriş qərarı saxlanılmadı." }); }
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
      <div><span>İDARƏETMƏ</span><h1>İstifadəçilər, bildirişlər və audit</h1><p>Daily şirkətinin giriş, rol, icazə, bildiriş və bütün dəyişiklik tarixçəsi.</p></div>
      <button type="button" className="secondary-button" onClick={() => void load()} disabled={busy}><RefreshCw size={16} /> Yenilə</button>
    </header>
    <nav className="management-tabs">
      {canUsers && <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}><Users size={16} /> İstifadəçilər <em>{data?.users.length || 0}</em></button>}
      {canNotify && <button className={tab === "notifications" ? "active" : ""} onClick={() => setTab("notifications")}><Bell size={16} /> Bildirişlər</button>}
      {canAudit && <button className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}><ShieldCheck size={16} /> Dəyişiklik tarixçəsi <em>{data?.audit.length || 0}</em></button>}
    </nav>
    {message && <div className={`management-message ${message.tone}`}><span>{message.text}</span><button onClick={() => setMessage(null)}>×</button></div>}

    {tab === "users" && canUsers && <>
      <div className="management-access-layout">
        <section className="management-join-code">
          <div className="management-section-head"><div><h2>Daily dəvət kodu</h2><small>Bu kod yalnız bu şirkətin Daily müraciətini yaradır; giriş dərhal açılmır.</small></div><ShieldCheck size={18} /></div>
          <div className="join-code-editor"><input value={joinCodeDraft} onChange={(event) => setJoinCodeDraft(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} minLength={8} maxLength={24} /><button type="button" className="icon-button" onClick={() => void navigator.clipboard?.writeText(joinCodeDraft)} title="Kodu kopyala"><Copy size={16} /></button><button type="button" className="secondary-button" disabled={busy} onClick={() => void saveJoinCode(false)}>Saxla</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void saveJoinCode(true)}><RefreshCw size={15} /> Yeni kod</button></div>
        </section>
        <section className="management-access-requests">
          <div className="management-section-head"><div><h2>Giriş müraciətləri</h2><small>Dəvət kodu yazan şəxs yalnız təsdiqdən sonra daxil ola bilər.</small></div><em>{data?.accessRequests.length || 0}</em></div>
          <div className="access-request-list">{data?.accessRequests.length ? data.accessRequests.map((request) => <article key={request.id}><span><b>{request.name}</b><small>{request.email}</small></span><select aria-label={`${request.name} üçün rol`} value={accessRoles[request.id] || "Müşahidəçi"} onChange={(event) => setAccessRoles((current) => ({ ...current, [request.id]: event.target.value }))}>{["Rəhbər", "Mühasib", "Kassir", "Müşahidəçi"].map((role) => <option key={role}>{role}</option>)}</select><div><button type="button" className="icon-danger" disabled={busy} onClick={() => void decideAccessRequest(request, false)} title="Rədd et"><X size={15} /></button><button type="button" className="approve-access" disabled={busy} onClick={() => void decideAccessRequest(request, true)}><Check size={15} /> Təsdiqlə</button></div></article>) : <div className="management-empty">Gözləyən giriş müraciəti yoxdur.</div>}</div>
        </section>
      </div>
      <div className="management-users-layout">
      <section className="management-user-list">
        <div className="management-section-head"><div><h2>Komanda</h2><small>Daily-yə giriş hüququ olan hesablar</small></div><button type="button" onClick={() => { setSelectedId(""); setDraft(emptyUser()); setPassword(""); }}><Plus size={16} /> Yeni</button></div>
        <div className="management-user-rows">{data?.users.filter((user) => !user.joinPending).map((user) => <button type="button" key={user.id} className={selectedId === user.id ? "active" : ""} onClick={() => selectUser(user)}>
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
        {showPermissionActions && <div className="management-section-head">
          <div><h2>İcazələr</h2><small>İcazələri seçin və dəyişiklikləri yadda saxlayın.</small></div>
          <button type="button" disabled={!data?.permissionCatalog.length} onClick={() => {
            const keys = data?.permissionCatalog.map(({ key }) => key) || [];
            setDraft((current) => ({ ...current, permissions: [...new Set([...current.permissions, ...keys])] }));
          }}>Bütün icazələri seç</button>
        </div>}
        <div className="permission-groups">{permissionGroups.map(([group, permissions]) => <fieldset key={group}><legend>{group}</legend>{permissions.map((permission) => <label key={permission.key}><input type="checkbox" checked={draft.permissions.includes(permission.key)} onChange={(e) => setDraft((c) => ({ ...c, permissions: e.target.checked ? [...new Set([...c.permissions, permission.key])] : c.permissions.filter((key) => key !== permission.key) }))} /><span>{permission.label}</span></label>)}</fieldset>)}</div>
        <div className="management-editor-actions"><button type="submit" className="primary-button" disabled={busy}><Save size={16} /> {draft.id ? "Dəyişiklikləri saxla" : "İstifadəçi yarat"}</button></div>
      </form>
      </div>
    </>}

    {tab === "notifications" && canNotify && <div className="management-notification-layout">
      <form className="notification-composer" onSubmit={sendNotification}><div className="management-section-head"><div><h2>Bildiriş göndər</h2><small>Hamıya və ya seçilmiş istifadəçilərə daxili bildiriş göndərin.</small></div><Send size={18} /></div>
        <label><span>Başlıq</span><input value={noticeTitle} onChange={(e) => setNoticeTitle(e.target.value)} maxLength={100} required /></label>
        <label><span>Mətn</span><textarea value={noticeMessage} onChange={(e) => setNoticeMessage(e.target.value)} maxLength={500} required /></label>
        <div className="notification-recipients"><b>Alıcılar</b><small>Seçim etməsəniz bütün aktiv istifadəçilərə gedəcək.</small>{data?.users.filter((user) => user.active).map((user) => <label key={user.id}><input type="checkbox" checked={recipientIds.includes(user.id)} onChange={(e) => setRecipientIds((current) => e.target.checked ? [...current, user.id] : current.filter((id) => id !== user.id))} /><span>{user.name}</span></label>)}</div>
        <button type="submit" className="primary-button" disabled={busy}><Send size={16} /> Göndər</button>
      </form>
      <section className="notification-history"><div className="management-section-head"><div><h2>Son bildirişlər</h2><small>Göndərilən idarəetmə mesajları</small></div></div>{data?.notifications.length ? data.notifications.map((notice) => <article key={notice.id}><i><Bell size={15} /></i><div><b>{notice.title}</b><p>{notice.message}</p><small>{notice.createdBy} · {new Date(notice.createdAt).toLocaleString("az-AZ")}</small></div></article>) : <div className="management-empty">Hələ bildiriş göndərilməyib.</div>}</section>
    </div>}

    {tab === "audit" && canAudit && <section className="management-audit">
      <div className="management-section-head">
        <div><h2>Tam dəyişiklik tarixçəsi</h2><small>Qaimə, əməliyyat, borc, istifadəçi, icazə və sistem dəyişiklikləri</small></div>
        <label className="management-audit-search"><Search size={15} /><input value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} placeholder="Tarixçədə axtar..." />{auditSearch && <button type="button" onClick={() => setAuditSearch("")}><X size={14} /></button>}</label>
      </div>
      <div className="management-audit-list">
        {filteredAudit.length ? filteredAudit.map((row) => <article key={row.id}>
          <i><KeyRound size={15} /></i>
          <div className="management-audit-body">
            <div className="management-audit-title"><b>{auditActionLabels[row.action] || row.action.replaceAll("_", " ")}</b><span>{row.target || "AriX Daily"}</span></div>
            <small><strong>{row.by}</strong> · {new Date(row.at).toLocaleString("az-AZ")}</small>
            {row.details && <p>{row.details}</p>}
            {row.changes?.length ? <details><summary>{row.changes.length} dəyişiklik</summary><div>{row.changes.map((change, index) => <p key={`${row.id}-${change.field}-${index}`}><b>{change.field}</b><span>{auditValue(change.before)}</span><em>→</em><strong>{auditValue(change.after)}</strong></p>)}</div></details> : null}
          </div>
          <time>{new Date(row.at).toLocaleDateString("az-AZ")}</time>
        </article>) : <div className="management-empty">Axtarışa uyğun dəyişiklik tapılmadı.</div>}
      </div>
    </section>}
  </section>;
}
