// 登録された資料（PDF・写真）の本体をブラウザのIndexedDBに置く。
// 説明などの情報は request.materials に入り、通常の保存（サーバーのworkspace）に乗る。
// サーバー側のファイル保存は未実装（docs/frontend-town-chat.md の「資料の受け口」）。
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

const urls = new Map();
export async function fileUrl(id) {
  if (urls.has(id)) return urls.get(id);
  try {
    const blob = await getFile(id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urls.set(id, url);
    return url;
  } catch {
    return null;
  }
}
export const MAX_BYTES = 20 * 1024 * 1024;
export const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";
export function kindOf(type) {
  return type === "application/pdf" ? "PDF資料" : type.startsWith("image/") ? "写真" : null;
}
