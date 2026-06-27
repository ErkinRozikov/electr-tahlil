// ============================================================================
//  appwrite.js — Электр қурилмаларни кўрикдан ўтказиш тизими учун backend қатлами
//  Appwrite Web SDK (object-parameter usul, 2026 версия). Ўрнатиш: npm install appwrite
//  Бу файл аввалги window.storage ўрнига ишлайди — App.jsx қолган қисми ўзгармайди.
// ============================================================================

import { Client, Account, Databases, Storage, ID, Query } from "appwrite";

// ── Созламалар (.env дан олинади) ──────────────────────────────────────────
const ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT;       // мас: https://fra.cloud.appwrite.io/v1
const PROJECT  = import.meta.env.VITE_APPWRITE_PROJECT;
const DB       = import.meta.env.VITE_APPWRITE_DB;
const COL_INSP = import.meta.env.VITE_APPWRITE_COL_INSPECTIONS; // "inspections"
const COL_DEF  = import.meta.env.VITE_APPWRITE_COL_DEFECTS;     // "defects"
const BUCKET   = import.meta.env.VITE_APPWRITE_BUCKET;          // "photos"

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT);
export const account = new Account(client);
const databases = new Databases(client);
const storage = new Storage(client);

// ── Ёрдамчилар ──────────────────────────────────────────────────────────────
function dataUrlToFile(dataUrl, name = `photo_${Date.now()}.jpg`) {
  const [head, b64] = dataUrl.split(",");
  const mime = (head.match(/:(.*?);/) || [, "image/jpeg"])[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}
function fileViewUrl(fileId) {
  const r = storage.getFileView({ bucketId: BUCKET, fileId });
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
    photos: ids.map(fileViewUrl),     // App.jsx <img src={photo}> билан мос (URL матн)
    createdAt: d.createdAt, updatedAt: d.updatedAt,
  };
}

// ── Авторизация ──────────────────────────────────────────────────────────────
export const auth = {
  async register(email, password, name) {
    await account.create({ userId: ID.unique(), email, password, name });
    await account.createEmailPasswordSession({ email, password });
    return account.get();
  },
  async login(email, password) {
    await account.createEmailPasswordSession({ email, password });
    return account.get();
  },
  async logout() { try { await account.deleteSession({ sessionId: "current" }); } catch (e) {} },
  async current() { try { return await account.get(); } catch (e) { return null; } },
};

// ── Маълумотлар қатлами (аввалги `store` билан бир хил интерфейс) ─────────────
export const store = {
  // Камчиликлар базаси — битта ҳужжатда JSON сифатида (жамоавий)
  async getDefects() {
    try {
      const d = await databases.getDocument({ databaseId: DB, collectionId: COL_DEF, documentId: "defectlist" });
      return JSON.parse(d.data || "[]");
    } catch (e) { return null; } // топилмаса — App.jsx ўзи seed қилади
  },
  async setDefects(arr) {
    const data = { data: JSON.stringify(arr) };
    try {
      await databases.updateDocument({ databaseId: DB, collectionId: COL_DEF, documentId: "defectlist", data });
    } catch (e) {
      await databases.createDocument({ databaseId: DB, collectionId: COL_DEF, documentId: "defectlist", data });
    }
  },

  async listInspections() {
    try {
      const res = await databases.listDocuments({
        databaseId: DB, collectionId: COL_INSP,
        queries: [Query.orderDesc("createdAt"), Query.limit(100)],
      });
      return res.documents.map(docToRecord);
    } catch (e) { console.error("listInspections:", e); return []; }
  },

  async saveInspection(rec) {
    const user = await auth.current();

    // Эски расм ID'ларини олиш (таҳрирлашда ўчирилганларини аниқлаш учун)
    let oldIds = [];
    try {
      const old = await databases.getDocument({ databaseId: DB, collectionId: COL_INSP, documentId: rec.id });
      oldIds = JSON.parse(old.photoIds || "[]");
    } catch (e) {}

    // Расмларни қайта ишлаш: data: → юклаш, URL → мавжуд ID
    const photoIds = [];
    for (const p of rec.photos || []) {
      if (typeof p === "string" && p.startsWith("data:")) {
        const created = await storage.createFile({ bucketId: BUCKET, fileId: ID.unique(), file: dataUrlToFile(p) });
        photoIds.push(created.$id);
      } else if (typeof p === "string") {
        const id = fileIdFromUrl(p);
        if (id) photoIds.push(id);
      }
    }
    // Олиб ташланган расмларни хотирадан ўчириш
    for (const id of oldIds) {
      if (!photoIds.includes(id)) { try { await storage.deleteFile({ bucketId: BUCKET, fileId: id }); } catch (e) {} }
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

    try {
      await databases.updateDocument({ databaseId: DB, collectionId: COL_INSP, documentId: rec.id, data });
    } catch (e) {
      await databases.createDocument({ databaseId: DB, collectionId: COL_INSP, documentId: rec.id, data });
    }
  },

  async deleteInspection(id) {
    try {
      const doc = await databases.getDocument({ databaseId: DB, collectionId: COL_INSP, documentId: id });
      for (const fid of JSON.parse(doc.photoIds || "[]")) {
        try { await storage.deleteFile({ bucketId: BUCKET, fileId: fid }); } catch (e) {}
      }
    } catch (e) {}
    await databases.deleteDocument({ databaseId: DB, collectionId: COL_INSP, documentId: id });
  },
};
