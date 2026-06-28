// ============================================================================
//  appwrite.js — Электр қурилмаларни кўрикдан ўтказиш тизими (backend қатлами)
//  Appwrite Web SDK v26 (позицион параметрли усул). Ўрнатиш: npm install appwrite
// ============================================================================

import { Client, Account, Databases, Storage, ID, Query, Permission, Role } from "appwrite";

// ── Созламалар (.env дан) ────────────────────────────────────────────────────
const ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT;        // мас: https://fra.cloud.appwrite.io/v1
const PROJECT  = import.meta.env.VITE_APPWRITE_PROJECT;
const DB       = import.meta.env.VITE_APPWRITE_DB;
const COL_INSP = import.meta.env.VITE_APPWRITE_COL_INSPECTIONS; // "inspections"
const COL_DEF  = import.meta.env.VITE_APPWRITE_COL_DEFECTS;     // "defects"
const BUCKET   = import.meta.env.VITE_APPWRITE_BUCKET;          // "photos"

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT);
export const account = new Account(client);
const databases = new Databases(client);
const storage = new Storage(client);

// ── Ёрдамчилар ────────────────────────────────────────────────────────────────
function dataUrlToFile(dataUrl, name = `photo_${Date.now()}.jpg`) {
  const [head, b64] = dataUrl.split(",");
  const mime = (head.match(/:(.*?);/) || [, "image/jpeg"])[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}
function fileViewUrl(fileId) {
  const r = storage.getFileView(BUCKET, fileId);
  return typeof r === "string" ? r : (r && r.href) || String(r);
}
function fileIdFromUrl(url) {
  const m = String(url).match(/\/files\/([^/]+)\//);
  return m ? m[1] : null;
}
function docToRecord(d) {
  const ids = JSON.parse(d.photoIds || "[]");
  return {
    id: d.$id,
    name: d.name || "", type: d.type || "", owner: d.owner || "",
    invNo: d.invNo || "", location: d.location || "", inspector: d.inspector || "",
    params: JSON.parse(d.params || "[]"),
    defectIds: JSON.parse(d.defectIds || "[]"),
    status: d.status || "good", note: d.note || "",
    photos: ids.map(fileViewUrl),   // App.jsx <img src={photo}> билан мос
    createdAt: d.createdAt, updatedAt: d.updatedAt,
  };
}

// ── Авторизация ──────────────────────────────────────────────────────────────
export const auth = {
  async register(email, password, name) {
    await account.create(ID.unique(), email, password, name);
    await account.createEmailPasswordSession(email, password);
    return account.get();
  },
  async login(email, password) {
    await account.createEmailPasswordSession(email, password);
    return account.get();
  },
  async logout() { try { await account.deleteSession("current"); } catch (e) {} },
  async current() { try { return await account.get(); } catch (e) { return null; } },
};

// ── Маълумотлар қатлами ──────────────────────────────────────────────────────
export const store = {
  async getDefects() {
    try {
      const d = await databases.getDocument(DB, COL_DEF, "defectlist");
      return JSON.parse(d.data || "[]");
    } catch (e) { return null; } // топилмаса — App.jsx ўзи seed қилади
  },
  async setDefects(arr) {
    const data = { data: JSON.stringify(arr) };
    try {
      await databases.updateDocument(DB, COL_DEF, "defectlist", data);
    } catch (e) {
      await databases.createDocument(DB, COL_DEF, "defectlist", data);
    }
  },

  async listInspections() {
    try {
      const res = await databases.listDocuments(DB, COL_INSP, [
        Query.orderDesc("createdAt"), Query.limit(100),
      ]);
      return res.documents.map(docToRecord);
    } catch (e) { console.error("listInspections:", e); return []; }
  },

  async saveInspection(rec) {
    const user = await auth.current();

    let oldIds = [];
    let exists = false;
    try {
      const old = await databases.getDocument(DB, COL_INSP, rec.id);
      oldIds = JSON.parse(old.photoIds || "[]");
      exists = true;
    } catch (e) {}

    const photoIds = [];
    for (const p of rec.photos || []) {
      if (typeof p === "string" && p.startsWith("data:")) {
        const created = await storage.createFile(BUCKET, ID.unique(), dataUrlToFile(p));
        photoIds.push(created.$id);
      } else if (typeof p === "string") {
        const id = fileIdFromUrl(p);
        if (id) photoIds.push(id);
      }
    }
    for (const id of oldIds) {
      if (!photoIds.includes(id)) { try { await storage.deleteFile(BUCKET, id); } catch (e) {} }
    }

    const data = {
      name: rec.name, type: rec.type, owner: rec.owner || "", invNo: rec.invNo || "",
      location: rec.location || "", inspector: rec.inspector || "",
      params: JSON.stringify(rec.params || []),
      defectIds: JSON.stringify(rec.defectIds || []),
      status: rec.status || "good", note: rec.note || "",
      photoIds: JSON.stringify(photoIds),
      createdAt: new Date(rec.createdAt || Date.now()).toISOString(),
      updatedAt: new Date().toISOString(),
      userId: user ? user.$id : "",
    };

    if (exists) {
      // Таҳрирлаш — рухсатлар ўзгармайди
      await databases.updateDocument(DB, COL_INSP, rec.id, data);
    } else {
      // Янги — фақат эгаси ва админ кўра/ўзгартира олади
      const perms = user ? [
        Permission.read(Role.user(user.$id)),
        Permission.update(Role.user(user.$id)),
        Permission.delete(Role.user(user.$id)),
        Permission.read(Role.label("admin")),
        Permission.update(Role.label("admin")),
        Permission.delete(Role.label("admin")),
      ] : undefined;
      await databases.createDocument(DB, COL_INSP, rec.id, data, perms);
    }
  },

  // ── Далолатнома шакли (фақат админ ўзгартиради, ҳамма ўқийди) ──
  async getReportConfig() {
    try {
      const d = await databases.getDocument(DB, COL_DEF, "reportconfig");
      return JSON.parse(d.data || "{}");
    } catch (e) { return null; }
  },
  async setReportConfig(cfg) {
    const data = { data: JSON.stringify(cfg) };
    try {
      await databases.updateDocument(DB, COL_DEF, "reportconfig", data);
    } catch (e) {
      await databases.createDocument(DB, COL_DEF, "reportconfig", data);
    }
  },

  async deleteInspection(id) {
    try {
      const doc = await databases.getDocument(DB, COL_INSP, id);
      for (const fid of JSON.parse(doc.photoIds || "[]")) {
        try { await storage.deleteFile(BUCKET, fid); } catch (e) {}
      }
    } catch (e) {}
    await databases.deleteDocument(DB, COL_INSP, id);
  },
};
