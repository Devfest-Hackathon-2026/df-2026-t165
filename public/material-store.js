// 登録された資料（PDF・写真）のファイル本体の置き場所。
// サーバーがあるときは /api/materials に送り、町の人みんなで見られるようにする（Firestore＋Cloud Storage、またはサーバーのローカル保存）。
// サーバーに送れないとき（静的プレビュー・通信失敗）は、この端末のブラウザ（IndexedDB）に置く。
const DB = "tsugite-materials",
  STORE = "files";
let dbPromise;
function db() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function run(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode),
      req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}
export const putFile = (id, blob) => run("readwrite", (s) => s.put(blob, id));
export const getFile = (id) => run("readonly", (s) => s.get(id));
export const deleteFile = (id) => run("readwrite", (s) => s.delete(id));

// サーバーへの送受信。ヘッダー（作業領域ID・デモアクセスコード）は app.js から渡してもらう
let headersFn = () => ({});
export function useServerHeaders(fn) {
  headersFn = fn;
}
const authHeaders = () => {
  const h = { ...headersFn() };
  delete h["content-type"];
  return h;
};
async function readJson(res) {
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(Error(out.error || "通信を確認してください"), { status: res.status });
  return out;
}
/** ファイルと説明をサーバーに送る。成功するとサーバーの記録（id は新しく振られる）を返す */
export async function uploadMaterial(file, meta) {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("meta", JSON.stringify(meta));
  const res = await fetch("/api/materials", { method: "POST", headers: authHeaders(), body: form, signal: AbortSignal.timeout(120000) });
  return (await readJson(res)).material;
}
export async function listMaterials(place) {
  const res = await fetch("/api/materials?place=" + encodeURIComponent(place), { headers: authHeaders(), signal: AbortSignal.timeout(15000) });
  return (await readJson(res)).materials || [];
}
export async function removeMaterial(id) {
  const res = await fetch("/api/materials/" + encodeURIComponent(id), { method: "DELETE", headers: authHeaders() });
  return readJson(res);
}

const urls = new Map();
/** 資料を表示するためのURL。まずこの端末、なければサーバーから取ってくる */
export async function fileUrl(id) {
  if (urls.has(id)) return urls.get(id);
  let blob = null;
  try {
    blob = await getFile(id);
  } catch {}
  if (!blob) {
    try {
      const res = await fetch("/api/materials/" + encodeURIComponent(id) + "/file", { headers: authHeaders() });
      if (res.ok) blob = await res.blob();
    } catch {}
  }
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  return url;
}
export const MAX_BYTES = 20 * 1024 * 1024;
export const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm";
export function kindOf(type) {
  return type === "application/pdf" ? "PDF資料" : type.startsWith("image/") ? "写真" : /^video\/(mp4|quicktime|webm)$/.test(type) ? "動画" : null;
}
