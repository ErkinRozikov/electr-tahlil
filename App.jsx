import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Zap, Plus, ClipboardList, Database, LayoutGrid, Search, Camera, Trash2,
  X, Check, AlertTriangle, ShieldAlert, ChevronLeft, Printer, Upload,
  Edit3, Save, FileText, MapPin, User, Hash, LogOut, Loader2,
  Image as ImageIcon,
} from "lucide-react";
import { store, auth } from "./appwrite";   // ← backend қатлами (Appwrite)
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

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
const DEFAULT_REPORT = {
  templateFileId: "",
  templateName: "",
};
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

/* ============================ WORD ДАЛОЛАТНОМА ============================ */
// Word шаблонга қўйиладиган якорлар (placeholder'лар) рўйхати
const ACT_TAGS = [
  ["{qurilma_nomi}", "Қурилма номи"],
  ["{qurilma_turi}", "Қурилма тури"],
  ["{egasi}", "Эгаси / тегишлилиги"],
  ["{inv_raqam}", "Инвентар рақами"],
  ["{joylashuv}", "Жойлашуви"],
  ["{tekshiruvchi}", "Текширувчи"],
  ["{sana}", "Кўрик санаси"],
  ["{holat}", "Умумий ҳолат"],
  ["{parametrlar}", "Техник параметрлар (рўйхат)"],
  ["{kamchiliklar}", "Аниқланган камчиликлар (рўйхат)"],
  ["{izoh}", "Изоҳ"],
  ["{rasmlar}", "Қурилма расмлари (2 тадан)"],
];

const IMG_MARKER = "@@RASMLAR@@";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const TARGET_W_EMU = 2700000; // ~2.95 дюйм — ёзув кенглигининг ярми

function buildActData(ins, defects, cfg) {
  const dlist = (ins.defectIds || []).map((id) => defects.find((d) => d.id === id)).filter(Boolean);
  const params = (ins.params || []).filter((p) => p.k && p.v);
  return {
    qurilma_nomi: ins.name || "",
    qurilma_turi: ins.type || "",
    egasi: ins.owner || "",
    inv_raqam: ins.invNo || "",
    joylashuv: ins.location || "",
    tekshiruvchi: ins.inspector || "",
    sana: fmtDate(ins.createdAt),
    holat: (STATUS[ins.status] || STATUS.good).label,
    izoh: ins.note || "",
    parametrlar: params.map((p) => `${p.k}: ${p.v}${p.u ? " " + p.u : ""}`).join("\n"),
    // Камчиликлар — тоифасиз, фақат номи
    kamchiliklar: dlist.length ? dlist.map((d, i) => `${i + 1}. ${d.name}`).join("\n") : "Камчиликлар аниқланмади",
    rasmlar: IMG_MARKER,
  };
}

// ── Расмларни OOXML орқали жойлаш (учинчи тараф модулисиз) ──
function imgDims(b) {
  if (b[0] === 0x89 && b[1] === 0x50) return { w: (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], h: (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23], ext: "png" };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], ext: "jpeg" };
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
  }
  return { w: 4, h: 3, ext: "jpeg" };
}
function drawingXml(rid, id, wEmu, hEmu) {
  return `<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${wEmu}" cy="${hEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="Rasm ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="Rasm ${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="${NS_R}" r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${wEmu}" cy="${hEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}
const cellXml = (inner) => `<w:tc><w:tcPr><w:tcW w:w="4513" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${inner || ""}</w:p></w:tc>`;
function tableXml(cells) {
  let rows = "";
  for (let i = 0; i < cells.length; i += 2) rows += `<w:tr>${cellXml(cells[i])}${cellXml(cells[i + 1])}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="fixed"/><w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="0"/></w:tblPr><w:tblGrid><w:gridCol w:w="4513"/><w:gridCol w:w="4513"/></w:tblGrid>${rows}</w:tbl>`;
}
function addImages(zip, photos, ctr) {
  if (!photos || !photos.length) return "";
  const relsPath = "word/_rels/document.xml.rels";
  let rels = zip.file(relsPath).asText();
  let maxRid = 0;
  (rels.match(/Id="rId(\d+)"/g) || []).forEach((s) => { const n = +s.match(/\d+/)[0]; if (n > maxRid) maxRid = n; });
  const cells = [];
  photos.forEach((bytes) => {
    const d = imgDims(bytes);
    ctr.n += 1;
    const name = `img_kurik_${ctr.n}.${d.ext}`;
    zip.file(`word/media/${name}`, bytes, { binary: true });
    const rid = "rId" + (++maxRid);
    rels = rels.replace("</Relationships>", `<Relationship Id="${rid}" Type="${NS_R}/image" Target="media/${name}"/></Relationships>`);
    cells.push(drawingXml(rid, 9000 + ctr.n, TARGET_W_EMU, Math.round(TARGET_W_EMU * d.h / d.w)));
  });
  zip.file(relsPath, rels);
  let ct = zip.file("[Content_Types].xml").asText();
  ["jpeg", "png", "jpg"].forEach((ext) => {
    if (!ct.includes(`Extension="${ext}"`)) ct = ct.replace("</Types>", `<Default Extension="${ext}" ContentType="${ext === "png" ? "image/png" : "image/jpeg"}"/></Types>`);
  });
  zip.file("[Content_Types].xml", ct);
  return tableXml(cells);
}
function replaceMarker(xml, tableStr) {
  const mi = xml.indexOf(IMG_MARKER);
  if (mi === -1) return xml;
  const pStart = Math.max(xml.lastIndexOf("<w:p>", mi), xml.lastIndexOf("<w:p ", mi));
  const pEnd = xml.indexOf("</w:p>", mi) + "</w:p>".length;
  return xml.slice(0, pStart) + (tableStr || "") + xml.slice(pEnd);
}
async function fetchPhotos(ins) {
  const out = [];
  for (const u of (ins.photos || [])) {
    if (typeof u !== "string") continue;
    try { const r = await fetch(u); if (r.ok) out.push(new Uint8Array(await r.arrayBuffer())); } catch (e) {}
  }
  return out;
}

function triggerDownload(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function fetchTemplate(cfg) {
  if (!cfg || !cfg.templateFileId) throw new Error("Аввал «Далолатнома шакли» бўлимида Word шаблон юкланг.");
  const url = store.templateUrl(cfg.templateFileId);
  return fetch(url).then((r) => { if (!r.ok) throw new Error("Шаблонни юклаб бўлмади."); return r.arrayBuffer(); });
}
function renderTemplate(ab, data) {
  const zip = new PizZip(ab);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render(data);
  return zip;
}
const safeName = (s) => (s || "kurik").replace(/[^0-9A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ]+/g, "_").slice(0, 40);

// Битта кўрик → битта Word (расмлар билан)
async function downloadAct(ins, defects, cfg) {
  const ab = await fetchTemplate(cfg);
  const zip = renderTemplate(ab, buildActData(ins, defects, cfg));
  const table = addImages(zip, await fetchPhotos(ins), { n: 0 });
  zip.file("word/document.xml", replaceMarker(zip.file("word/document.xml").asText(), table));
  const blob = zip.generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  triggerDownload(blob, `Далолатнома_${safeName(ins.name)}.docx`);
}

// Бир нечта кўрик → битта Word (ҳар бири янги саҳифада, расмлари билан)
async function downloadActBatch(list, defects, cfg) {
  if (!list.length) return;
  const ab = await fetchTemplate(cfg);
  const PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  const ctr = { n: 0 };
  const splitBody = (xml) => {
    const s = xml.indexOf("<w:body>") + "<w:body>".length;
    let e = xml.lastIndexOf("<w:sectPr");
    if (e === -1) e = xml.lastIndexOf("</w:body>");
    return { head: xml.slice(0, s), content: xml.slice(s, e), tail: xml.slice(e) };
  };
  const base = renderTemplate(ab, buildActData(list[0], defects, cfg));
  const t0 = addImages(base, await fetchPhotos(list[0]), ctr);
  const first = splitBody(replaceMarker(base.file("word/document.xml").asText(), t0));
  let merged = first.content;
  for (let i = 1; i < list.length; i++) {
    const z = renderTemplate(ab, buildActData(list[i], defects, cfg));
    const ti = addImages(base, await fetchPhotos(list[i]), ctr); // медиа/рухсат BASE'га
    merged += PAGE_BREAK + splitBody(replaceMarker(z.file("word/document.xml").asText(), ti)).content;
  }
  base.file("word/document.xml", first.head + merged + first.tail);
  const blob = base.generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  triggerDownload(blob, `Далолатномалар_${list.length}_та.docx`);
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
            <div style={{ fontWeight: 800, fontSize: 18 }}>Электр қурилма кўриги</div>
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
          Аккаунтлар фақат администратор томонидан яратилади.<br />Кириш маълумотларини олиш учун администраторга мурожаат қилинг.
        </div>
      </div>
    </div>
  );
}
const authInput = { width: "100%", boxSizing: "border-box", border: `1px solid ${C.line}`, background: C.field, borderRadius: 10, padding: "11px 13px", fontSize: 14.5, marginBottom: 12 };

/* ================================ АСОСИЙ APP ================================ */
function App({ user, onLogout }) {
  const isAdmin = (user.labels || []).includes("admin");
  const [view, setView] = useState("dash");
  const [inspections, setInspections] = useState([]);
  const [defects, setDefects] = useState([]);
  const [reportCfg, setReportCfg] = useState(DEFAULT_REPORT);
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
          if (isAdmin) { try { await store.setDefects(d); } catch (e) { console.error(e); } }
        }
        setDefects(d || []);
        try { const cfg = await store.getReportConfig(); if (cfg) setReportCfg({ ...DEFAULT_REPORT, ...cfg }); }
        catch (e) {}
        try { setInspections(await store.listInspections()); }
        catch (e) { console.error("Кўрикларни юклаб бўлмади:", e); }
      } catch (e) {
        console.error("Юклаш хатоси:", e);
        setLoadError("Маълумотларни юклашда хатолик. Уланиш ва Appwrite созламаларини текширинг.");
      } finally {
        setReady(true);
      }
    })();
  }, [isAdmin]);

  const refresh = useCallback(async () => setInspections(await store.listInspections()), []);

  const nav = [
    { id: "dash", label: "Панель", Icon: LayoutGrid },
    { id: "list", label: "Кўриклар", Icon: ClipboardList },
    { id: "new", label: "Янги кўрик", Icon: Plus, accent: true },
    ...(isAdmin ? [
      { id: "defects", label: "Камчиликлар базаси", Icon: Database },
      { id: "settings", label: "Далолатнома шакли", Icon: FileText },
    ] : []),
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
          <div style={{ fontWeight: 800, fontSize: 16 }}>Электр қурилма кўриги</div>
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
            <InspectionDetail ins={active} defects={defects} reportCfg={reportCfg} onBack={() => setActive(null)}
              onEdit={() => { setEditId(active.id); setActive(null); setView("new"); }}
              onDelete={async () => { await store.deleteInspection(active.id); await refresh(); setActive(null); }} />
          ) : (
            <InspectionList inspections={inspections} defects={defects} reportCfg={reportCfg} open={(i) => setActive(i)} />
          )
        ) : view === "settings" && isAdmin ? (
          <ReportSettings cfg={reportCfg} onSave={async (c) => { setReportCfg(c); await store.setReportConfig(c); }} />
        ) : view === "defects" && isAdmin ? (
          <DefectsManager defects={defects} setDefects={async (d) => { setDefects(d); await store.setDefects(d); }} />
        ) : (
          <Dashboard inspections={inspections} defects={defects} go={(v, ins) => { setActive(ins || null); setView(v); }} />
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
function InspectionList({ inspections, defects, reportCfg, open }) {
  const [q, setQ] = useState(""); const [f, setF] = useState("all");
  const [selectMode, setSelectMode] = useState(false);
  const [sel, setSel] = useState({});
  const [busy, setBusy] = useState(false);
  const filtered = inspections.filter((i) => {
    const okF = f === "all" || i.status === f;
    const okQ = !q || [i.name, i.type, i.owner, i.invNo].filter(Boolean).join(" ").toLowerCase().includes(q.toLowerCase());
    return okF && okQ;
  });
  const selIds = Object.keys(sel).filter((id) => sel[id]);
  const toggle = (id) => setSel((s) => ({ ...s, [id]: !s[id] }));
  const allChecked = filtered.length > 0 && filtered.every((i) => sel[i.id]);
  const toggleAll = () => {
    if (allChecked) setSel({});
    else { const n = {}; filtered.forEach((i) => (n[i.id] = true)); setSel(n); }
  };
  const exitSelect = () => { setSelectMode(false); setSel({}); };

  async function batchWord() {
    const list = filtered.filter((i) => sel[i.id]);
    if (!list.length) return;
    setBusy(true);
    try { await downloadActBatch(list, defects, reportCfg); exitSelect(); }
    catch (e) { alert("Word яратишда хатолик: " + (e?.message || "шаблонни текширинг")); }
    setBusy(false);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Кўриклар ({inspections.length})</h2>
        {!selectMode ? (
          <button onClick={() => setSelectMode(true)} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${C.line}`, background: C.white, borderRadius: 9, padding: "8px 12px", fontWeight: 600, fontSize: 13 }}>
            <FileText size={15} /> Кўп танлаб Word'га
          </button>
        ) : (
          <button onClick={exitSelect} className="ghost" style={{ border: `1px solid ${C.line}`, background: C.white, borderRadius: 9, padding: "8px 12px", fontWeight: 600, fontSize: 13 }}>Бекор</button>
        )}
      </div>

      {selectMode && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#eef4ff", border: `1px solid ${C.blue}33`, borderRadius: 10, padding: "10px 14px", marginBottom: 12, flexWrap: "wrap" }}>
          <button onClick={toggleAll} className="ghost" style={{ border: `1px solid ${C.line}`, background: C.white, borderRadius: 8, padding: "6px 10px", fontSize: 12.5, fontWeight: 600 }}>
            {allChecked ? "Танлашни бекор" : "Барчасини танлаш"}
          </button>
          <span style={{ flex: 1, fontSize: 13, color: C.ink, fontWeight: 600 }}>{selIds.length} та танланди</span>
          <button onClick={batchWord} disabled={busy || selIds.length === 0}
            style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: selIds.length ? C.blue : "#9bb3d6", color: "#fff", borderRadius: 9, padding: "9px 14px", fontWeight: 700, fontSize: 13 }}>
            {busy ? <Loader2 size={15} className="spin" /> : <FileText size={15} />} Битта Word'га жамлаш
          </button>
        </div>
      )}

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
          {filtered.map((i) => {
            const checked = !!sel[i.id];
            return (
              <div key={i.id} className="card" onClick={() => (selectMode ? toggle(i.id) : open(i))}
                style={{ background: checked ? "#eef4ff" : C.white, border: `1px solid ${checked ? C.blue : C.line}`, borderRadius: 12, padding: 14, cursor: "pointer", display: "flex", gap: 12, alignItems: "center", transition: "all .15s" }}>
                {selectMode && (
                  <span style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${checked ? C.blue : C.line}`, background: checked ? C.blue : "#fff", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    {checked && <Check size={14} color="#fff" />}
                  </span>
                )}
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
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================ КЎРИК ТАФСИЛОТИ ============================ */
function InspectionDetail({ ins, defects, reportCfg, onBack, onEdit, onDelete }) {
  const cfg = reportCfg || DEFAULT_REPORT;
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
        <button onClick={async () => { try { await downloadAct(ins, defects, cfg); } catch (e) { alert("Word яратишда хатолик: " + (e?.message || "шаблонни текширинг")); } }}
          style={{ ...btn, border: "none", background: C.blue, color: "#fff" }}><FileText size={15} /> Word далолатнома</button>
        <button onClick={onEdit} className="ghost" style={btn}><Edit3 size={15} /> Таҳрирлаш</button>
        <button onClick={() => setConfirm(true)} style={{ ...btn, border: `1px solid ${C.fault}33`, background: C.faultBg, color: C.fault }}><Trash2 size={15} /> Ўчириш</button>
      </div>
      <div className="print-area" style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: 1 }}>КЎРИК МАЪЛУМОТЛАРИ</div>
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

/* ============================ ДАЛОЛАТНОМА ШАКЛИ (АДМИН) ============================ */
function ReportSettings({ cfg, onSave }) {
  const [templateFileId, setTemplateFileId] = useState(cfg.templateFileId || "");
  const [templateName, setTemplateName] = useState(cfg.templateName || "");
  const [tplBusy, setTplBusy] = useState(false);
  const [showTags, setShowTags] = useState(true);
  const [copied, setCopied] = useState("");
  const tplRef = useRef(null);

  async function onTemplate(ev) {
    const file = ev.target.files?.[0]; ev.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".docx")) { alert("Фақат .docx файл юкланг."); return; }
    setTplBusy(true);
    try {
      if (templateFileId) { try { await store.deleteTemplate(templateFileId); } catch (e) {} }
      const id = await store.uploadTemplate(file);
      setTemplateFileId(id); setTemplateName(file.name);
      await onSave({ templateFileId: id, templateName: file.name });
    } catch (e) { alert("Шаблон юклашда хатолик: " + (e?.message || "")); }
    setTplBusy(false);
  }
  async function removeTemplate() {
    if (templateFileId) { try { await store.deleteTemplate(templateFileId); } catch (e) {} }
    setTemplateFileId(""); setTemplateName("");
    await onSave({ templateFileId: "", templateName: "" });
  }
  function copyTag(tag) {
    try { navigator.clipboard.writeText(tag); setCopied(tag); setTimeout(() => setCopied(""), 1200); } catch (e) {}
  }

  return (
    <div>
      <h2 style={{ margin: "2px 0 6px", fontSize: 18 }}>Далолатнома шакли</h2>
      <p style={{ color: C.muted, fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>
        Word (.docx) шаблон юкланг. Шаблонга якорларни (мас: <span className="mono" style={{ color: C.blue }}>{"{qurilma_nomi}"}</span>) ёзинг — далолатнома яратилганда улар кўрик маълумотлари билан тўлдирилади.
      </p>

      <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}>Word шаблон (.docx)</div>
        {templateName ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.field, borderRadius: 9, padding: "10px 12px" }}>
            <FileText size={18} color={C.blue} />
            <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{templateName}</span>
            <button onClick={() => tplRef.current?.click()} className="ghost" style={{ border: `1px solid ${C.line}`, background: C.white, borderRadius: 8, padding: "6px 10px", fontSize: 12.5, fontWeight: 600 }}>Алмаштириш</button>
            <button onClick={removeTemplate} className="ghost" style={{ border: "none", background: "transparent", padding: 4 }}><X size={16} color={C.muted} /></button>
          </div>
        ) : (
          <button onClick={() => tplRef.current?.click()} disabled={tplBusy}
            style={{ display: "flex", alignItems: "center", gap: 7, border: `2px dashed ${C.line}`, background: C.field, borderRadius: 9, padding: "11px 16px", fontWeight: 600, fontSize: 13.5, color: C.muted }}>
            {tplBusy ? <Loader2 size={16} className="spin" /> : <Upload size={16} />} {tplBusy ? "Юкланмоқда…" : "Word шаблон юклаш"}
          </button>
        )}
        <input ref={tplRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onTemplate} style={{ display: "none" }} />

        <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.line}` }}>
          <button onClick={() => setShowTags((v) => !v)} className="ghost" style={{ border: "none", background: "transparent", color: C.ink, fontSize: 13, fontWeight: 700, padding: 0 }}>
            {showTags ? "▼" : "▶"} Якорлар рўйхати
          </button>
          {showTags && (
            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 2 }}>Якорни босиб нусхаланг, кейин Word шаблонга жойланг:</div>
              {ACT_TAGS.map(([tag, label]) => (
                <button key={tag} onClick={() => copyTag(tag)} className="ghost"
                  style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", border: `1px solid ${C.line}`, background: C.white, borderRadius: 8, padding: "8px 12px" }}>
                  <span className="mono" style={{ color: C.blue, fontWeight: 700, fontSize: 13, minWidth: 150 }}>{tag}</span>
                  <span style={{ flex: 1, color: C.muted, fontSize: 12.5 }}>{label}</span>
                  <span style={{ fontSize: 11, color: copied === tag ? C.good : C.muted, fontWeight: 600 }}>{copied === tag ? "✓ нусхаланди" : "нусхалаш"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
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
