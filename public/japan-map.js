// 地図で地方 → 都道府県と段階的に絞り込む。地図は地理院タイル（淡色地図）、描画はLeaflet（public/lib/leaflet）
// 座標は各都道府県庁のおおよその位置。候補の振り分けに使うだけなので厳密さは求めない
export const REGIONS = [
  {
    id: "hokkaido",
    name: "北海道",
    center: [43.4, 142.8],
    zoom: 6,
    key: "other",
    prefs: [["北海道", 43.06, 141.35]],
  },
  {
    id: "tohoku",
    name: "東北",
    center: [39.3, 140.7],
    zoom: 7,
    key: "tohoku",
    prefs: [
      ["青森県", 40.82, 140.74],
      ["岩手県", 39.7, 141.15],
      ["宮城県", 38.27, 140.87],
      ["秋田県", 39.72, 140.1],
      ["山形県", 38.24, 140.36],
      ["福島県", 37.75, 140.47],
    ],
  },
  {
    id: "kanto",
    name: "関東",
    center: [36.0, 139.7],
    zoom: 8,
    key: "other",
    prefs: [
      ["茨城県", 36.34, 140.45],
      ["栃木県", 36.57, 139.88],
      ["群馬県", 36.39, 139.06],
      ["埼玉県", 35.86, 139.65],
      ["千葉県", 35.61, 140.12],
      ["東京都", 35.69, 139.69],
      ["神奈川県", 35.45, 139.64],
    ],
  },
  {
    id: "chubu",
    name: "中部",
    center: [36.3, 137.8],
    zoom: 7,
    key: "other",
    prefs: [
      ["新潟県", 37.9, 139.02],
      ["富山県", 36.7, 137.21],
      ["石川県", 36.59, 136.63],
      ["福井県", 36.07, 136.22],
      ["山梨県", 35.66, 138.57],
      ["長野県", 36.65, 138.18],
      ["岐阜県", 35.39, 136.72],
      ["静岡県", 34.98, 138.38],
      ["愛知県", 35.18, 136.91],
    ],
  },
  {
    id: "kinki",
    name: "近畿",
    center: [34.6, 135.6],
    zoom: 8,
    key: "kansai",
    prefs: [
      ["三重県", 34.73, 136.51],
      ["滋賀県", 35.0, 135.87],
      ["京都府", 35.02, 135.76],
      ["大阪府", 34.69, 135.52],
      ["兵庫県", 34.69, 135.18],
      ["奈良県", 34.69, 135.83],
      ["和歌山県", 34.23, 135.17],
    ],
  },
  {
    id: "chugoku",
    name: "中国",
    center: [34.9, 132.9],
    zoom: 8,
    key: "setouchi",
    prefs: [
      ["鳥取県", 35.5, 134.24],
      ["島根県", 35.47, 133.05],
      ["岡山県", 34.66, 133.93],
      ["広島県", 34.4, 132.46],
      ["山口県", 34.19, 131.47],
    ],
  },
  {
    id: "shikoku",
    name: "四国",
    center: [33.7, 133.5],
    zoom: 8,
    key: "setouchi",
    prefs: [
      ["徳島県", 34.07, 134.56],
      ["香川県", 34.34, 134.04],
      ["愛媛県", 33.84, 132.77],
      ["高知県", 33.56, 133.53],
    ],
  },
  {
    id: "kyushu",
    name: "九州・沖縄",
    center: [32.2, 130.6],
    zoom: 7,
    key: "other",
    prefs: [
      ["福岡県", 33.61, 130.42],
      ["佐賀県", 33.25, 130.3],
      ["長崎県", 32.74, 129.87],
      ["熊本県", 32.79, 130.74],
      ["大分県", 33.24, 131.61],
      ["宮崎県", 31.91, 131.42],
      ["鹿児島県", 31.56, 130.56],
      ["沖縄県", 26.21, 127.68],
    ],
  },
];
// 瀬戸内に面する県は、近畿・九州でも瀬戸内の候補に寄せる
const SETOUCHI = new Set([
  "兵庫県",
  "岡山県",
  "広島県",
  "山口県",
  "香川県",
  "愛媛県",
  "大分県",
  "福岡県",
]);
export const candidateKey = (region, pref) =>
  pref && SETOUCHI.has(pref) ? "setouchi" : region.key;

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

// 地図の描画：国土地理院タイル＋Leaflet
function leafletEngine(mapEl) {
  const L = window.L;
  if (!L) return null;
  const map = L.map(mapEl, {
    zoomControl: true,
    scrollWheelZoom: false,
    attributionControl: true,
    minZoom: 4,
    maxZoom: 12,
  }).setView([36.6, 137.5], 5);
  L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
    attribution:
      '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>',
    maxZoom: 18,
  }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  setTimeout(() => map.invalidateSize(), 60);
  return {
    clear: () => layer.clearLayers(),
    pin(lat, lng, label, selected, onClick) {
      const m = L.marker([lat, lng], {
        icon: L.divIcon({
          className: "",
          html: `<span class="mp-pin ${selected ? "is-on" : ""}">${esc(label)}</span>`,
          iconSize: null,
        }),
        keyboard: true,
        title: label,
      });
      m.on("click", onClick);
      m.addTo(layer);
    },
    fly: (c, z) => map.flyTo(c, z, { duration: 0.7 }),
    destroy: () => map.remove(),
  };
}

/**
 * root に地図ピッカーを描く。onPick({ region, pref }) は「決める」を押したときに呼ばれる。
 * Leaflet が読めない（オフライン等）ときは、ボタンの一覧だけで同じ絞り込みができる。
 */
export function mountMapPicker(
  root,
  { onPick, confirmLabel = "この地域で決める" } = {},
) {
  let region = null,
    pref = null,
    eng = null;
  root.innerHTML = `<div class="mp"><div class="mp-crumbs" aria-live="polite"></div><div class="mp-map" role="img" aria-label="日本地図。下のボタンでも選べます"></div><div class="mp-list"></div><div class="mp-foot"></div></div>`;
  const crumbs = root.querySelector(".mp-crumbs"),
    list = root.querySelector(".mp-list"),
    foot = root.querySelector(".mp-foot"),
    mapEl = root.querySelector(".mp-map");
  let gone = false;
  const draw = () => {
    eng?.clear();
    crumbs.innerHTML = `<button type="button" class="mp-crumb" data-lv="0">日本全国</button>${region ? `<span>›</span><button type="button" class="mp-crumb" data-lv="1">${esc(region.name)}</button>` : ""}${pref ? `<span>›</span><b>${esc(pref)}</b>` : ""}`;
    if (!region) {
      REGIONS.forEach((r) =>
        eng?.pin(r.center[0], r.center[1], r.name, false, () => pickRegion(r)),
      );
      list.innerHTML = REGIONS.map(
        (r) =>
          `<button type="button" class="mp-opt" data-region="${r.id}">${esc(r.name)}</button>`,
      ).join("");
      foot.innerHTML = `<p class="mp-hint">地方を選ぶと、都道府県に絞り込めます。</p>`;
      eng?.fly([36.6, 137.5], 5);
    } else {
      region.prefs.forEach(([n, lat, lng]) =>
        eng?.pin(lat, lng, n, n === pref, () => pickPref(n)),
      );
      list.innerHTML = region.prefs
        .map(
          ([n]) =>
            `<button type="button" class="mp-opt ${n === pref ? "is-on" : ""}" data-pref="${esc(n)}" aria-pressed="${n === pref}">${esc(n)}</button>`,
        )
        .join("");
      foot.innerHTML = `<button type="button" class="primary-btn mp-ok">${pref ? `${esc(pref)}で${confirmLabel.replace(/^この地域で/, "")}` : `${esc(region.name)}全体で${confirmLabel.replace(/^この地域で/, "")}`}</button>`;
      if (!pref) eng?.fly(region.center, region.zoom);
    }
    crumbs.querySelectorAll("[data-lv]").forEach(
      (b) =>
        (b.onclick = () => {
          if (b.dataset.lv === "0") region = null;
          pref = null;
          draw();
        }),
    );
    list
      .querySelectorAll("[data-region]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            pickRegion(REGIONS.find((r) => r.id === b.dataset.region))),
      );
    list
      .querySelectorAll("[data-pref]")
      .forEach((b) => (b.onclick = () => pickPref(b.dataset.pref)));
    foot
      .querySelector(".mp-ok")
      ?.addEventListener("click", () => onPick?.({ region, pref }));
  };
  const pickRegion = (r) => {
    region = r;
    pref = r.prefs.length === 1 ? r.prefs[0][0] : null;
    draw();
    if (pref) eng?.fly(r.center, r.zoom);
  };
  const pickPref = (n) => {
    pref = n;
    const p = region.prefs.find(([x]) => x === n);
    if (p) eng?.fly([p[1], p[2]], Math.max(region.zoom, 9));
    draw();
  };
  const use = (e) => {
    if (gone) return e?.destroy?.();
    eng?.destroy?.();
    eng = e;
    mapEl.classList.toggle("is-off", !e);
    draw();
  };
  draw();
  use(leafletEngine(mapEl));
  return {
    destroy: () => {
      gone = true;
      eng?.destroy?.();
    },
  };
}
