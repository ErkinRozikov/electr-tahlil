import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Zap, Plus, ClipboardList, Database, LayoutGrid, Search, Camera, Trash2,
  X, Check, AlertTriangle, ShieldAlert, ChevronLeft, Printer, Upload,
  Edit3, Save, FileText, MapPin, User, Hash, LogOut, Loader2,
  Image as ImageIcon,
} from "lucide-react";
import { store, auth } from "./appwrite";   // ← backend қатлами (Appwrite)

/* ============================ ПАЛИТРА / ТОКЕНЛАР ============================ */
const C = {
  ink: "#0d141c", panel: "#11181f", panel2: "#1a242e", line: "#e3e8ee",
  field: "#f4f6f9", muted: "#64748b", white: "#ffffff", live: "#f2a900", blue: "#1f6feb",
  good: "#15803d", goodBg: "#e7f6ec", attn: "#b45309", attnBg: "#fdf3e3", fault: "#b91c1c", faultBg: "#fdeaea",
};
const SEV = {
  critical: { label: "Критик", color: "#b91c1c", bg: "#fdeaea", rank: 4 },
  high: { label: "Юқори", color: "#c2410c", bg: "#fdeee3", rank: 3 },
  medium: { label: "Ўрта", color: "#b45309", bg: "#fdf6e3", rank: 2 },
  low: { label: "Паст", color: "#475569", bg: "#eef1f5", rank: 1 },
};
const STATUS = {
  good: { label: "Соз", color: C.good, bg: C.goodBg, Icon: Check },
  attn: { label: "Эътибор талаб қилади", color: C.attn, bg: C.attnBg, Icon: AlertTriangle },
  fault: { label: "Носоз", color: C.fault, bg: C.faultBg, Icon: ShieldAlert },
};
const EQ_TYPES = [
  "Кучланиш трансформатори", "Куч трансформатори", "Ажратгич (разъединитель)",
  "Узгич (выключатель)", "Кабель линияси", "Ҳаво линияси", "Ҳимоя релеси",
  "Электр ҳисоблагич", "Тақсимлаш қалқони (РУ)", "Конденсатор батареяси",
  "Ер уланиши (заземление)", "Бошқа",
];
const PARAM_SUGGEST = ["Номинал кучланиш", "Номинал ток", "Қувват", "Частота", "Ишлаб чиқарилган йили", "Завод рақами"];
const SEED_DEFECTS = [
  ["Изоляция қаршилиги меъёрдан паст", "Изоляция", "high"],
  ["Контактларнинг қизиши / куйиши", "Контакт", "high"],
  ["Ер уланиши носоз ёки йўқ", "Ҳимоя", "critical"],
  ["Ҳимоя автомати ишламаяпти", "Ҳимоя", "critical"],
  ["Корпус механик шикастланган", "Механик", "medium"],
  ["Намлик / сув таъсири белгилари", "Муҳит", "high"],
  ["Клеммалар бўшаган", "Контакт", "medium"],
  ["Кабель изоляцияси шикастланган", "Изоляция", "high"],
  ["Ортиқча юкланиш белгилари", "Юклама", "high"],
  ["Маркировка (белгилаш) йўқ", "Ҳужжат", "low"],
  ["Чанг / ифлослик тўпланган", "Муҳит", "low"],
  ["Зангланиш / коррозия", "Механик", "medium"],
];

/* ============================ ЁРДАМЧИ ФУНКЦИЯЛАР ============================ */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const MB = 1024 * 1024;
const PHOTO_LIMIT_BYTES = 10 * MB;
const PHOTO_LIMIT_COUNT = 5;
const fmtSize = (b) => (b < MB ? (b / 1024).toFixed(0) + " КБ" : (b / MB).toFixed(1) + " МБ");
const fmtDate = (t) => new Date(t).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });

function compressImage(file, maxDim = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > h && w > maxDim) { h = Math.round((h * maxDim) / w); w = maxDim; }
        else if (h > maxDim) { w = Math.round((w * maxDim) / h); h = maxDim; }
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject; img.src = e.target.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

/* ============================ КИРИШ ГЕЙТИ (AUTH) ============================ */
export default function Root() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => { (async () => { setUser(await auth.current()); setChecking(false); })(); }, []);

  if (checking) {
    return <Centered><Loader2 size={28} className="spin" color={C.muted} /></Centered>;
  }
  if (!user) return <AuthScreen onAuthed={setUser} />;
  return <App user={user} onLogout={async () => { await auth.logout(); setUser(null); }} />;
}

function Centered({ children }) {
  return (
    <div style={{ minHeight: 500, display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif" }}>
      <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
      {children}
    </div>
  );
}

function AuthScreen({ onAuthed }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr("");
    if (!email.trim() || !password) { setErr("Эл. почта ва паролни киритинг."); return; }
    setBusy(true);
    try {
      const u = await auth.login(email.trim(), password);
      onAuthed(u);
    } catch (e) {
      setErr("Кириш амалга ошмади. Эл. почта ёки парол нотўғри.");
      setBusy(false);
    }
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: 560, display: "grid", placeItems: "center", background: "#eef1f5", padding: 16 }}>
      <style>{`input:focus{border-color:${C.blue}!important;background:#fff!important;outline:none}button{font-family:inherit;cursor:pointer}`}</style>
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 16, padding: 26, boxShadow: "0 10px 40px rgba(13,20,28,.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: C.live, display: "grid", placeItems: "center" }}>
            <Zap size={24} color={C.panel} fill={C.panel} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>ЭлектрКўрик</div>
            <div style={{ fontSize: 12, color: C.muted }}>Кўрикдан ўтказиш тизими</div>
          </div>
        </div>

        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>Тизимга кириш</div>

        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Эл. почта" style={authInput} />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Парол"
          onKeyDown={(e) => e.key === "Enter" && submit()} style={authInput} />

        {err && <div style={{ color: C.fault, fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>{err}</div>}

        <button onClick={submit} disabled={busy}
          style={{ width: "100%", border: "none", background: C.live, color: C.panel, borderRadius: 10, padding: "12px", fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {busy && <Loader2 size={17} className="spin" />}
          Кириш
        </button>

        <div style={{ fontSize: 11.5, color: C.muted, textAlign: "center", marginTop: 14, lineHeight: 1.5 }}>
          Аккаунтлар фақат маъмур томонидан яратилади.<br />Кириш маълумотларини олиш учун маъмурга мурожаат қилинг.
        </div>
      </div>
    </div>
  );
}
const authInput = { width: "100%", boxSizing: "border-box", border: `1px solid ${C.line}`, background: C.field, borderRadius: 10, padding: "11px 13px", fontSize: 14.5, marginBottom: 12 };

/* ================================ АСОСИЙ APP ================================ */
function App({ user, onLogout }) {
  const [view, setView] = useState("dash");
  const [inspections, setInspections] = useState([]);
  const [defects, setDefects] = useState([]);
  const [active, setActive] = useState(null);
  const [editId, setEditId] = useState(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        let d = await store.getDefects();
        if (!d) {
          d = SEED_DEFECTS.map(([name, cat, sev]) => ({ id: uid(), name, cat, sev }));
          try { await store.setDefects(d); }
          catch (e) { console.error("Камчиликлар базасини яратиб бўлмади:", e); }
        }
        setDefects(d || []);
        try { setInspections(await store.listInspections()); }
        catch (e) { console.error("Кўрикларни юклаб бўлмади:", e); }
      } catch (e) {
        console.error("Юклаш хатоси:", e);
        setLoadError("Маълумотларни юклашда хатолик. Уланиш ва Appwrite созламаларини текширинг.");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const refresh = useCallback(async () => setInspections(await store.listInspections()), []);

  const nav = [
    { id: "dash", label: "Панель", Icon: LayoutGrid },
    { id: "list", label: "Кўриклар", Icon: ClipboardList },
    { id: "new", label: "Янги кўрик", Icon: Plus, accent: true },
    { id: "defects", label: "Камчиликлар базаси", Icon: Database },
  ];

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: C.ink, background: "#eef1f5", minHeight: 640 }}>
      <style>{`
        * { -webkit-tap-highlight-color: transparent; }
        button { font-family: inherit; cursor: pointer; }
        .mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
        .spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}
        .navbtn:hover { background:#1f2d3a; }
        .card:hover { border-color:#c7d0db; box-shadow:0 4px 14px rgba(13,20,28,.06); }
        .ghost:hover { background:#eef1f5; }
        input:focus, select:focus, textarea:focus { border-color:${C.blue} !important; background:#fff !important; }
        @media print { .no-print { display:none !important; } .print-area { box-shadow:none !important; border:none !important; } body { background:#fff; } }
        @media (max-width: 520px) {
          .grid2 { grid-template-columns: 1fr !important; }
          .app-main { padding-left: 12px !important; padding-right: 12px !important; }
        }
        @media (max-width: 380px) {
          .paramrow { flex-wrap: wrap !important; }
          .paramrow .pcell { flex: 1 1 100% !important; }
        }
      `}</style>

      <header className="no-print" style={{ background: C.panel, color: C.white, padding: "12px 18px", paddingTop: "max(12px, env(safe-area-inset-top))", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: C.live, display: "grid", placeItems: "center" }}>
          <Zap size={20} color={C.panel} fill={C.panel} />
        </div>
        <div style={{ lineHeight: 1.15, flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>ЭлектрКўрик</div>
          <div style={{ fontSize: 11, color: "#8da2b5" }}>Электр қурилмаларни кўрикдан ўтказиш тизими</div>
        </div>
        <span style={{ fontSize: 12.5, color: "#aebccb", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name || user.email}</span>
        <button onClick={onLogout} title="Чиқиш" style={{ display: "flex", alignItems: "center", gap: 5, background: "#1f2d3a", color: "#cdd9e4", border: "none", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, fontWeight: 600 }}>
          <LogOut size={15} /> Чиқиш
        </button>
      </header>

      <nav className="no-print" style={{ background: C.panel2, padding: "0 8px", display: "flex", gap: 2, overflowX: "auto" }}>
        {nav.map((n) => {
          const on = view === n.id;
          return (
            <button key={n.id} className="navbtn" onClick={() => { setActive(null); setEditId(null); setView(n.id); }}
              style={{ display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", border: "none", background: on ? "#eef1f5" : "transparent", color: on ? C.ink : (n.accent ? C.live : "#aebccb"), fontWeight: on || n.accent ? 700 : 600, fontSize: 13.5, padding: "12px 14px", borderTopLeftRadius: 9, borderTopRightRadius: 9, marginTop: 6 }}>
              <n.Icon size={16} /> {n.label}
            </button>
          );
        })}
      </nav>

      <main className="app-main" style={{ maxWidth: 980, margin: "0 auto", padding: "18px 16px 60px" }}>
        {loadError && (
          <div style={{ background: C.faultBg, color: C.fault, border: `1px solid ${C.fault}33`, borderRadius: 10, padding: "12px 14px", marginBottom: 14, fontSize: 13, fontWeight: 600 }}>
            {loadError}
          </div>
        )}
        {!ready ? (
          <div style={{ textAlign: "center", color: C.muted, padding: 60 }}><Loader2 className="spin" /> <div style={{ marginTop: 8 }}>Юкланмоқда…</div></div>
        ) : view === "dash" ? (
          <Dashboard inspections={inspections} defects={defects} go={(v, ins) => { setActive(ins || null); setView(v); }} />
        ) : view === "new" ? (
          <InspectionForm defects={defects} editing={editId ? inspections.find((x) => x.id === editId) : null}
            onDone={async () => { await refresh(); setEditId(null); setView("list"); }}
            onCancel={() => { setEditId(null); setView(editId ? "list" : "dash"); }} />
        ) : view === "list" ? (
          active ? (
            <InspectionDetail ins={active} defects={defects} onBack={() => setActive(null)}
              onEdit={() => { setEditId(active.id); setActive(null); setView("new"); }}
              onDelete={async () => { await store.deleteInspection(active.id); await refresh(); setActive(null); }} />
          ) : (
            <InspectionList inspections={inspections} open={(i) => setActive(i)} />
          )
        ) : (
          <DefectsManager defects={defects} setDefects={async (d) => { setDefects(d); await store.setDefects(d); }} />
        )}
      </main>
    </div>
  );
}

/* ================================ ПАНЕЛЬ ================================ */
function Dashboard({ inspections, defects, go }) {
  const counts = { good: 0, attn: 0, fault: 0 };
  inspections.forEach((i) => { counts[i.status] = (counts[i.status] || 0) + 1; });
  const freq = {};
  inspections.forEach((i) => (i.defectIds || []).forEach((id) => (freq[id] = (freq[id] || 0) + 1)));
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([id, n]) => ({ d: defects.find((x) => x.id === id), n })).filter((x) => x.d);

  const Stat = ({ k, n }) => {
    const st = STATUS[k];
    return (
      <div style={{ flex: 1, minWidth: 120, background: C.white, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: st.color }} className="mono">{n}</div>
        <StatusBadge s={k} />
      </div>
    );
  };
  return (
    <div>
      <h2 style={{ margin: "2px 0 14px", fontSize: 18 }}>Бошқарув панели</h2>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Stat k="good" n={counts.good || 0} />
        <Stat k="attn" n={counts.attn || 0} />
        <Stat k="fault" n={counts.fault || 0} />
        <div style={{ flex: 1, minWidth: 120, background: C.panel, color: C.white, borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 30, fontWeight: 800 }} className="mono">{inspections.length}</div>
          <div style={{ fontSize: 12.5, color: "#9fb0c0", fontWeight: 600 }}>Жами кўриклар</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
        <Section title="Сўнгги кўриклар" action={inspections.length > 0 && <a onClick={() => go("list")} style={{ cursor: "pointer", color: C.blue, fontSize: 13, fontWeight: 600 }}>Барчаси →</a>}>
          {inspections.length === 0
            ? <Empty text="Ҳали кўрик ўтказилмаган." cta="Биринчи кўрикни бошлаш" onCta={() => go("new")} />
            : inspections.slice(0, 4).map((i) => <Row key={i.id} ins={i} onClick={() => go("list", i)} />)}
        </Section>
        {top.length > 0 && (
          <Section title="Энг кўп учрайдиган камчиликлар">
            {top.map(({ d, n }) => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.line}` }}>
                <SevPill k={d.sev} /><span style={{ flex: 1, fontSize: 14 }}>{d.name}</span>
                <span className="mono" style={{ fontWeight: 700, color: C.muted }}>{n}×</span>
              </div>
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}
function Section({ title, children, action }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14.5 }}>{title}</h3>{action}
      </div>
      {children}
    </div>
  );
}
function Row({ ins, onClick }) {
  return (
    <div className="card" onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.line}`, cursor: "pointer" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ins.name}</div>
        <div style={{ fontSize: 12, color: C.muted }}>{ins.type} · {fmtDate(ins.createdAt)}</div>
      </div>
      <StatusBadge s={ins.status} />
    </div>
  );
}
function Empty({ text, cta, onCta }) {
  return (
    <div style={{ textAlign: "center", padding: "24px 10px", color: C.muted }}>
      <div style={{ marginBottom: 12 }}>{text}</div>
      {cta && <button onClick={onCta} style={{ background: C.live, color: C.panel, border: "none", borderRadius: 9, padding: "9px 16px", fontWeight: 700 }}>{cta}</button>}
    </div>
  );
}
function StatusBadge({ s, big }) {
  const st = STATUS[s] || STATUS.good; const { Icon } = st;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: st.color, background: st.bg, fontWeight: 700, borderRadius: 8, padding: big ? "7px 14px" : "3px 10px", fontSize: big ? 14 : 12, border: `1px solid ${st.color}22` }}>
      <Icon size={big ? 16 : 13} /> {st.label}
    </span>
  );
}
function SevPill({ k }) {
  const s = SEV[k] || SEV.low;
  return <span style={{ color: s.color, background: s.bg, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{s.label}</span>;
}

/* ============================ КЎРИКЛАР РЎЙХАТИ ============================ */
function InspectionList({ inspections, open }) {
  const [q, setQ] = useState(""); const [f, setF] = useState("all");
  const filtered = inspections.filter((i) => {
    const okF = f === "all" || i.status === f;
    const okQ = !q || [i.name, i.type, i.owner, i.invNo].filter(Boolean).join(" ").toLowerCase().includes(q.toLowerCase());
    return okF && okQ;
  });
  return (
    <div>
      <h2 style={{ margin: "2px 0 14px", fontSize: 18 }}>Кўриклар ({inspections.length})</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={16} color={C.muted} style={{ position: "absolute", left: 11, top: 12 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Қурилма, эга, инв. рақам бўйича қидириш…" style={{ ...inputStyle, paddingLeft: 34 }} />
        </div>
        <select value={f} onChange={(e) => setF(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="all">Барча ҳолатлар</option><option value="good">Соз</option>
          <option value="attn">Эътибор талаб қилади</option><option value="fault">Носоз</option>
        </select>
      </div>
      {filtered.length === 0 ? (
        <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: 12 }}><Empty text="Натижа топилмади." /></div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {filtered.map((i) => (
            <div key={i.id} className="card" onClick={() => open(i)} style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, cursor: "pointer", display: "flex", gap: 12, alignItems: "center", transition: "all .15s" }}>
              {i.photos?.[0]
                ? <img src={i.photos[0]} alt="" style={{ width: 54, height: 54, borderRadius: 9, objectFit: "cover", flexShrink: 0 }} />
                : <div style={{ width: 54, height: 54, borderRadius: 9, background: C.field, display: "grid", placeItems: "center", flexShrink: 0 }}><ImageIcon size={20} color={C.muted} /></div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{i.name}</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{i.type}{i.owner ? ` · ${i.owner}` : ""} · {fmtDate(i.createdAt)}</div>
                {i.defectIds?.length > 0 && <div style={{ fontSize: 12, color: C.fault, marginTop: 3 }}>{i.defectIds.length} та камчилик аниқланган</div>}
              </div>
              <StatusBadge s={i.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================ КЎРИК ТАФСИЛОТИ ============================ */
function InspectionDetail({ ins, defects, onBack, onEdit, onDelete }) {
  const [confirm, setConfirm] = useState(false);
  const dlist = (ins.defectIds || []).map((id) => defects.find((d) => d.id === id)).filter(Boolean);
  const Line = ({ l, v }) => v ? (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.line}`, gap: 12 }}>
      <span style={{ color: C.muted, fontSize: 13 }}>{l}</span>
      <span style={{ fontWeight: 600, fontSize: 13.5, textAlign: "right" }}>{v}</span>
    </div>
  ) : null;
  const btn = { display: "flex", alignItems: "center", gap: 5, border: `1px solid ${C.line}`, background: C.white, borderRadius: 9, padding: "8px 12px", fontWeight: 600, fontSize: 13 };
  return (
    <div>
      <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={onBack} className="ghost" style={btn}><ChevronLeft size={16} /> Орқага</button>
        <div style={{ flex: 1 }} />
        <button onClick={() => window.print()} className="ghost" style={btn}><Printer size={15} /> Чоп этиш / PDF</button>
        <button onClick={onEdit} className="ghost" style={btn}><Edit3 size={15} /> Таҳрирлаш</button>
        <button onClick={() => setConfirm(true)} style={{ ...btn, border: `1px solid ${C.fault}33`, background: C.faultBg, color: C.fault }}><Trash2 size={15} /> Ўчириш</button>
      </div>
      <div className="print-area" style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: 1 }}>КЎРИК ДАЛОЛАТНОМАСИ</div>
            <h2 style={{ margin: "2px 0 0", fontSize: 21 }}>{ins.name}</h2>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>{ins.type}</div>
          </div>
          <StatusBadge s={ins.status} big />
        </div>
        <div style={{ marginTop: 14 }}>
          <Line l="Эгаси / тегишлилиги" v={ins.owner} />
          <Line l="Инвентар / реестр рақами" v={ins.invNo} />
          <Line l="Жойлашуви" v={ins.location} />
          <Line l="Текширувчи" v={ins.inspector} />
          <Line l="Кўрик санаси" v={fmtDate(ins.createdAt)} />
        </div>
        {ins.params?.filter((p) => p.k && p.v).length > 0 && (
          <Block title="Техник параметрлар">
            <div style={{ background: C.panel, borderRadius: 10, padding: "6px 14px" }}>
              {ins.params.filter((p) => p.k && p.v).map((p, idx, a) => (
                <div key={idx} className="mono" style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: idx === a.length - 1 ? "none" : "1px solid #25323e", color: "#cdd9e4", fontSize: 13 }}>
                  <span style={{ color: "#8da2b5" }}>{p.k}</span>
                  <span style={{ color: C.live, fontWeight: 700 }}>{p.v}{p.u ? " " + p.u : ""}</span>
                </div>
              ))}
            </div>
          </Block>
        )}
        {dlist.length > 0 && (
          <Block title={`Аниқланган камчиликлар (${dlist.length})`}>
            <div style={{ display: "grid", gap: 8 }}>
              {dlist.map((d) => (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, background: C.field, borderRadius: 9, padding: "10px 12px" }}>
                  <SevPill k={d.sev} /><span style={{ flex: 1, fontSize: 14 }}>{d.name}</span>
                  <span style={{ fontSize: 11.5, color: C.muted }}>{d.cat}</span>
                </div>
              ))}
            </div>
          </Block>
        )}
        {ins.note && <Block title="Изоҳ"><p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#334" }}>{ins.note}</p></Block>}
        {ins.photos?.length > 0 && (
          <Block title={`Ҳолатни тасдиқловчи расмлар (${ins.photos.length})`}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
              {ins.photos.map((p, i) => <img key={i} src={p} alt={"расм " + (i + 1)} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 9, border: `1px solid ${C.line}` }} />)}
            </div>
          </Block>
        )}
      </div>
      {confirm && (
        <Modal onClose={() => setConfirm(false)}>
          <h3 style={{ marginTop: 0 }}>Кўрикни ўчириш</h3>
          <p style={{ color: C.muted }}>«{ins.name}» кўриги ва унга тегишли расмлар бутунлай ўчирилади. Давом этасизми?</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={() => setConfirm(false)} className="ghost" style={{ border: `1px solid ${C.line}`, background: C.white, borderRadius: 9, padding: "9px 14px", fontWeight: 600 }}>Бекор</button>
            <button onClick={onDelete} style={{ border: "none", background: C.fault, color: "#fff", borderRadius: 9, padding: "9px 14px", fontWeight: 700 }}>Ўчириш</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Block({ title, children }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: 0.4, marginBottom: 8, textTransform: "uppercase" }}>{title}</div>
      {children}
    </div>
  );
}

/* ============================ ЯНГИ / ТАҲРИР КЎРИК ============================ */
const inputStyle = { width: "100%", boxSizing: "border-box", border: `1px solid ${C.line}`, background: C.field, borderRadius: 9, padding: "10px 12px", fontSize: 14, color: C.ink, outline: "none" };
function Field({ label, icon: Icon, children, hint }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.ink, marginBottom: 6 }}>
        {Icon && <Icon size={14} color={C.muted} />} {label}
      </div>
      {children}
      {hint && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

function InspectionForm({ defects, editing, onDone, onCancel }) {
  const e = editing || {};
  const [name, setName] = useState(e.name || "");
  const [type, setType] = useState(e.type || EQ_TYPES[0]);
  const [owner, setOwner] = useState(e.owner || "");
  const [invNo, setInvNo] = useState(e.invNo || "");
  const [location, setLocation] = useState(e.location || "");
  const [inspector, setInspector] = useState(e.inspector || "");
  const [params, setParams] = useState(e.params?.length ? e.params : [{ k: "Номинал кучланиш", v: "", u: "кВ" }, { k: "Номинал ток", v: "", u: "А" }]);
  const [defectIds, setDefectIds] = useState(e.defectIds || []);
  const [status, setStatus] = useState(e.status || "good");
  const [statusTouched, setStatusTouched] = useState(!!editing);
  const [note, setNote] = useState(e.note || "");
  const [photos, setPhotos] = useState(e.photos || []);   // URL (мавжуд) ёки data: (янги)
  const [photoBytes, setPhotoBytes] = useState(0);          // фақат янги юкланган асл файллар
  const [photoErr, setPhotoErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [defectPick, setDefectPick] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (statusTouched) return;
    const ranks = defectIds.map((id) => SEV[defects.find((d) => d.id === id)?.sev]?.rank || 0);
    const max = Math.max(0, ...ranks);
    setStatus(max >= 4 ? "fault" : max >= 1 ? "attn" : "good");
  }, [defectIds, statusTouched, defects]);

  const setParam = (i, key, val) => setParams((p) => p.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)));
  const addParam = () => setParams((p) => [...p, { k: "", v: "", u: "" }]);
  const rmParam = (i) => setParams((p) => p.filter((_, idx) => idx !== i));

  async function onFiles(ev) {
    setPhotoErr("");
    const files = Array.from(ev.target.files || []);
    if (!files.length) return;
    if (photos.length + files.length > PHOTO_LIMIT_COUNT) { setPhotoErr(`Жами ${PHOTO_LIMIT_COUNT} тагача расм юклаш мумкин.`); ev.target.value = ""; return; }
    const incoming = files.reduce((s, f) => s + f.size, 0);
    if (photoBytes + incoming > PHOTO_LIMIT_BYTES) { setPhotoErr(`Расмлар жами ҳажми 10 МБ дан ошмаслиги керак. Танланди: ${fmtSize(photoBytes + incoming)}.`); ev.target.value = ""; return; }
    setBusy(true);
    try {
      const compressed = [];
      for (const f of files) compressed.push(await compressImage(f));
      setPhotos((p) => [...p, ...compressed]); setPhotoBytes((b) => b + incoming);
    } catch { setPhotoErr("Расмни қайта ишлашда хатолик."); }
    setBusy(false); ev.target.value = "";
  }
  const rmPhoto = (i) => setPhotos((p) => p.filter((_, idx) => idx !== i));

  async function save() {
    if (!name.trim()) { alert("Қурилма номини киритинг."); return; }
    setBusy(true);
    const rec = {
      id: e.id || uid(), name: name.trim(), type, owner: owner.trim(), invNo: invNo.trim(),
      location: location.trim(), inspector: inspector.trim(),
      params: params.filter((p) => p.k.trim() || p.v.trim()),
      defectIds, status, note: note.trim(), photos,
      createdAt: e.createdAt || Date.now(), updatedAt: Date.now(),
    };
    try { await store.saveInspection(rec); onDone(); }
    catch (err) { setBusy(false); setPhotoErr("Сақлашда хатолик: " + (err?.message || "уланишни текширинг")); }
  }

  const barPct = Math.min(100, (photoBytes / PHOTO_LIMIT_BYTES) * 100);
  return (
    <div>
      <h2 style={{ margin: "2px 0 14px", fontSize: 18 }}>{editing ? "Кўрикни таҳрирлаш" : "Янги кўрик"}</h2>
      <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 }}>
        <Field label="Қурилма номи" icon={Zap}>
          <input value={name} onChange={(ev) => setName(ev.target.value)} placeholder="мас: ТМ-630/10 куч трансформатори" style={inputStyle} />
        </Field>
        <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Қурилма тури">
            <select value={type} onChange={(ev) => setType(ev.target.value)} style={inputStyle}>{EQ_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          </Field>
          <Field label="Инвентар / реестр рақами" icon={Hash}>
            <input value={invNo} onChange={(ev) => setInvNo(ev.target.value)} placeholder="мас: INV-2024-0142" style={inputStyle} />
          </Field>
        </div>
        <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Эгаси / тегишлилиги" icon={User}>
            <input value={owner} onChange={(ev) => setOwner(ev.target.value)} placeholder="мас: «Худудий электр тармоқлари» МЧЖ" style={inputStyle} />
          </Field>
          <Field label="Жойлашуви" icon={MapPin}>
            <input value={location} onChange={(ev) => setLocation(ev.target.value)} placeholder="мас: ТП-415, 2-фидер" style={inputStyle} />
          </Field>
        </div>
        <Field label="Текширувчи" icon={User}>
          <input value={inspector} onChange={(ev) => setInspector(ev.target.value)} placeholder="Ф.И.Ш. ва лавозим" style={inputStyle} />
        </Field>

        <div style={{ marginTop: 6, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}><FileText size={14} color={C.muted} /> Техник параметрлар</div>
          <div style={{ display: "grid", gap: 8 }}>
            {params.map((p, i) => (
              <div key={i} className="paramrow" style={{ display: "flex", gap: 6 }}>
                <input list="paramSuggest" value={p.k} onChange={(ev) => setParam(i, "k", ev.target.value)} placeholder="Параметр" className="pcell" style={{ ...inputStyle, flex: 2, minWidth: 0 }} />
                <input value={p.v} onChange={(ev) => setParam(i, "v", ev.target.value)} placeholder="Қиймат" className="mono pcell" style={{ ...inputStyle, flex: 1.4, minWidth: 0 }} />
                <input value={p.u} onChange={(ev) => setParam(i, "u", ev.target.value)} placeholder="Бирлик" className="pcell" style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                <button onClick={() => rmParam(i)} className="ghost" style={{ border: `1px solid ${C.line}`, background: C.white, borderRadius: 9, padding: "0 11px", flexShrink: 0 }}><X size={16} color={C.muted} /></button>
              </div>
            ))}
            <datalist id="paramSuggest">{PARAM_SUGGEST.map((s) => <option key={s} value={s} />)}</datalist>
            <button onClick={addParam} className="ghost" style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 5, border: `1px dashed ${C.line}`, background: C.field, borderRadius: 9, padding: "8px 12px", fontWeight: 600, fontSize: 13, color: C.muted }}><Plus size={15} /> Параметр қўшиш</button>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600 }}><AlertTriangle size={14} color={C.muted} /> Аниқланган камчиликлар</div>
            <button onClick={() => setDefectPick(true)} style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: C.panel, color: "#fff", borderRadius: 8, padding: "7px 12px", fontWeight: 600, fontSize: 13 }}><Plus size={14} /> Базадан танлаш</button>
          </div>
          {defectIds.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13, background: C.field, borderRadius: 9, padding: "12px 14px" }}>Камчилик танланмаган — қурилма соз деб ҳисобланади.</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {defectIds.map((id) => {
                const d = defects.find((x) => x.id === id); if (!d) return null;
                return (
                  <div key={id} style={{ display: "flex", alignItems: "center", gap: 10, background: C.field, borderRadius: 9, padding: "9px 12px" }}>
                    <SevPill k={d.sev} /><span style={{ flex: 1, fontSize: 14 }}>{d.name}</span>
                    <button onClick={() => setDefectIds((p) => p.filter((x) => x !== id))} className="ghost" style={{ border: "none", background: "transparent", padding: 4 }}><X size={16} color={C.muted} /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Field label="Умумий ҳолат (хулоса)" hint="Камчиликлар асосида автомат таклиф қилинади, қўлда ўзгартириш мумкин.">
          <div style={{ display: "flex", gap: 8 }}>
            {Object.keys(STATUS).map((k) => {
              const st = STATUS[k], on = status === k;
              return <button key={k} onClick={() => { setStatus(k); setStatusTouched(true); }} style={{ flex: 1, border: `2px solid ${on ? st.color : C.line}`, background: on ? st.bg : C.white, color: on ? st.color : C.muted, borderRadius: 10, padding: "10px 6px", fontWeight: 700, fontSize: 13 }}>{st.label}</button>;
            })}
          </div>
        </Field>

        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600 }}><Camera size={14} color={C.muted} /> Ҳолатни тасдиқловчи расмлар</div>
            <span className="mono" style={{ fontSize: 12, color: C.muted }}>{photos.length}/{PHOTO_LIMIT_COUNT} · {fmtSize(photoBytes)}/10 МБ</span>
          </div>
          <div style={{ height: 5, background: C.line, borderRadius: 99, overflow: "hidden", marginBottom: 10 }}>
            <div style={{ width: barPct + "%", height: "100%", background: barPct > 90 ? C.fault : C.live, transition: "width .2s" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px,1fr))", gap: 8 }}>
            {photos.map((p, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img src={p} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 9, border: `1px solid ${C.line}` }} />
                <button onClick={() => rmPhoto(i)} style={{ position: "absolute", top: -6, right: -6, width: 24, height: 24, borderRadius: "50%", border: "2px solid #fff", background: C.fault, color: "#fff", display: "grid", placeItems: "center" }}><X size={13} /></button>
              </div>
            ))}
            {photos.length < PHOTO_LIMIT_COUNT && (
              <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ aspectRatio: "1", border: `2px dashed ${C.line}`, background: C.field, borderRadius: 9, display: "grid", placeItems: "center", color: C.muted }}>
                <div style={{ textAlign: "center" }}><Upload size={20} /><div style={{ fontSize: 11, marginTop: 3 }}>{busy ? "…" : "Юклаш"}</div></div>
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={onFiles} style={{ display: "none" }} />
          {photoErr && <div style={{ color: C.fault, fontSize: 12.5, marginTop: 8, fontWeight: 600 }}>{photoErr}</div>}
        </div>

        <Field label="Изоҳ">
          <textarea value={note} onChange={(ev) => setNote(ev.target.value)} rows={3} placeholder="Қўшимча кузатувлар, тавсиялар…" style={{ ...inputStyle, resize: "vertical" }} />
        </Field>

        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button onClick={onCancel} className="ghost" style={{ border: `1px solid ${C.line}`, background: C.white, borderRadius: 10, padding: "12px 18px", fontWeight: 600 }}>Бекор қилиш</button>
          <button onClick={save} disabled={busy} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, border: "none", background: C.live, color: C.panel, borderRadius: 10, padding: "12px", fontWeight: 800, fontSize: 15 }}>
            {busy ? <Loader2 size={17} className="spin" /> : <Save size={17} />} {busy ? "Сақланмоқда…" : "Кўрикни сақлаш"}
          </button>
        </div>
      </div>

      {defectPick && (
        <DefectPicker defects={defects} selected={defectIds} onClose={() => setDefectPick(false)}
          onToggle={(id) => setDefectIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))} />
      )}
    </div>
  );
}

function DefectPicker({ defects, selected, onToggle, onClose }) {
  const [q, setQ] = useState("");
  const cats = [...new Set(defects.map((d) => d.cat))];
  const filt = defects.filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()) || d.cat.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal onClose={onClose} wide>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Камчиликни танлаш</h3>
        <button onClick={onClose} className="ghost" style={{ border: "none", background: "transparent", padding: 4 }}><X size={20} color={C.muted} /></button>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Қидириш…" style={{ ...inputStyle, marginBottom: 12 }} />
      <div style={{ maxHeight: 360, overflowY: "auto", display: "grid", gap: 6 }}>
        {cats.map((cat) => {
          const items = filt.filter((d) => d.cat === cat);
          if (!items.length) return null;
          return (
            <div key={cat}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, margin: "8px 2px 4px" }}>{cat}</div>
              {items.map((d) => {
                const on = selected.includes(d.id);
                return (
                  <button key={d.id} onClick={() => onToggle(d.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left", border: `1.5px solid ${on ? C.blue : C.line}`, background: on ? "#eef4ff" : C.white, borderRadius: 9, padding: "10px 12px", marginBottom: 4 }}>
                    <span style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${on ? C.blue : C.line}`, background: on ? C.blue : "#fff", display: "grid", placeItems: "center", flexShrink: 0 }}>{on && <Check size={13} color="#fff" />}</span>
                    <span style={{ flex: 1, fontSize: 14 }}>{d.name}</span><SevPill k={d.sev} />
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <button onClick={onClose} style={{ width: "100%", marginTop: 12, border: "none", background: C.panel, color: "#fff", borderRadius: 10, padding: "12px", fontWeight: 700 }}>Тайёр ({selected.length} танланди)</button>
    </Modal>
  );
}

/* ============================ КАМЧИЛИКЛАР БАЗАСИ ============================ */
function DefectsManager({ defects, setDefects }) {
  const [edit, setEdit] = useState(null);
  const [q, setQ] = useState("");
  const cats = [...new Set(defects.map((d) => d.cat))].sort();
  const filt = defects.filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()) || d.cat.toLowerCase().includes(q.toLowerCase()));
  const blank = { name: "", cat: cats[0] || "Умумий", sev: "medium" };
  function saveDefect() {
    if (!edit.name.trim() || !edit.cat.trim()) return;
    if (edit.id) setDefects(defects.map((d) => (d.id === edit.id ? edit : d)));
    else setDefects([...defects, { ...edit, id: uid() }]);
    setEdit(null);
  }
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Камчиликлар базаси ({defects.length})</h2>
        <button onClick={() => setEdit(blank)} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: C.live, color: C.panel, borderRadius: 9, padding: "9px 14px", fontWeight: 700 }}><Plus size={16} /> Янги камчилик</button>
      </div>
      <p style={{ color: C.muted, fontSize: 13, marginTop: 0 }}>Базани қўлда тўлдиринг ва янгиланг — у барча кўрикларда қайта ишлатилади.</p>
      <div style={{ position: "relative", marginBottom: 14 }}>
        <Search size={16} color={C.muted} style={{ position: "absolute", left: 11, top: 12 }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Қидириш…" style={{ ...inputStyle, paddingLeft: 34 }} />
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {filt.map((d) => (
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, background: C.white, border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px 14px" }}>
            <SevPill k={d.sev} />
            <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{d.name}</div><div style={{ fontSize: 11.5, color: C.muted }}>{d.cat}</div></div>
            <button onClick={() => setEdit(d)} className="ghost" style={{ border: `1px solid ${C.line}`, background: C.white, borderRadius: 8, padding: 7 }}><Edit3 size={15} color={C.muted} /></button>
            <button onClick={() => setDefects(defects.filter((x) => x.id !== d.id))} className="ghost" style={{ border: `1px solid ${C.line}`, background: C.white, borderRadius: 8, padding: 7 }}><Trash2 size={15} color={C.fault} /></button>
          </div>
        ))}
      </div>
      {edit && (
        <Modal onClose={() => setEdit(null)}>
          <h3 style={{ marginTop: 0 }}>{edit.id ? "Камчиликни таҳрирлаш" : "Янги камчилик"}</h3>
          <Field label="Камчилик номи"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="мас: Изоляция қаршилиги паст" style={inputStyle} autoFocus /></Field>
          <Field label="Тоифа (категория)"><input list="catList" value={edit.cat} onChange={(e) => setEdit({ ...edit, cat: e.target.value })} placeholder="мас: Изоляция" style={inputStyle} /><datalist id="catList">{cats.map((c) => <option key={c} value={c} />)}</datalist></Field>
          <Field label="Жиддийлик даражаси">
            <div style={{ display: "flex", gap: 6 }}>
              {Object.keys(SEV).map((k) => {
                const s = SEV[k], on = edit.sev === k;
                return <button key={k} onClick={() => setEdit({ ...edit, sev: k })} style={{ flex: 1, border: `2px solid ${on ? s.color : C.line}`, background: on ? s.bg : C.white, color: on ? s.color : C.muted, borderRadius: 9, padding: "9px 4px", fontWeight: 700, fontSize: 12.5 }}>{s.label}</button>;
              })}
            </div>
          </Field>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => setEdit(null)} className="ghost" style={{ border: `1px solid ${C.line}`, background: C.white, borderRadius: 9, padding: "10px 16px", fontWeight: 600 }}>Бекор</button>
            <button onClick={saveDefect} style={{ border: "none", background: C.panel, color: "#fff", borderRadius: 9, padding: "10px 18px", fontWeight: 700 }}>Сақлаш</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ============================ МОДАЛ ============================ */
function Modal({ children, onClose, wide }) {
  return (
    <div onClick={onClose} className="no-print" style={{ position: "fixed", inset: 0, background: "rgba(13,20,28,.5)", display: "grid", placeItems: "center", padding: 16, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 20, width: "100%", maxWidth: wide ? 520 : 420, boxShadow: "0 20px 50px rgba(0,0,0,.25)" }}>{children}</div>
    </div>
  );
}
