import {
  FACTS,
  DEMO,
  validateRequest,
  localCard,
  localFollowup,
  reviewCard,
  assessAnswers,
  answerKeys,
  confirmDraft,
  queueQuestion,
  takeNextQuestion,
} from "./domain.js";
import { townData } from "./town-data.js";
import { tileArt } from "./tile-art.js";
import { seedDemo } from "./seed.js";
import { putFile, deleteFile, fileUrl, kindOf, MAX_BYTES, ACCEPT, uploadMaterial, listMaterials, removeMaterial, useServerHeaders } from "./material-store.js";
const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
const icon = (n) => `<img class="icon" src="icons/${n}.svg" alt="">`;
// ロゴ：木組みの継手（蟻継ぎ）。藍＝語り手と町の過去、檜＝次の担い手
const logo = (size, join = false) =>
  `<svg class="logo ${join ? "logo-join" : ""}" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true"><path class="logo-l" d="M4 12H20V18L30 14V34L20 30V36H4Z" fill="#1C3A6E"/><path class="logo-r" d="M21.5 12H44V36H21.5V31.2L31.5 35.2V12.8L21.5 16.8Z" fill="#F2A93B"/></svg>`;
const key = "tsugite-workspace-v1";
let wid = localStorage.getItem("tsugite-id") || crypto.randomUUID();
localStorage.setItem("tsugite-id", wid);
let state;
try {
  state = JSON.parse(localStorage.getItem(key));
} catch {}
if (!state || !Array.isArray(state.requests) || !Array.isArray(state.measurements)) state = { requests: [], measurements: [] };
let config = { aiReady: false, storage: "browser", requiresCode: false },
  page = "hub",
  active = state.requests[0]?.id,
  code = sessionStorage.getItem("tsugite-access") || "",
  busy = false,
  liveAbort = null,
  test = null,
  saveMessage = "この端末に保存";
const current = () => state.requests.find((r) => r.id === active);
const headers = () => ({
  "content-type": "application/json",
  "x-workspace-id": wid,
  "x-demo-access-code": code,
});
useServerHeaders(headers);
// サーバーがあるか（静的プレビューでは無い）。資料のファイルをサーバーに置くかどうかに使う
const serverFiles = () => config.storage !== "browser";
async function api(route, data) {
  const res = await fetch("/api/" + route, {
    signal: AbortSignal.timeout(50000),
    method: data === undefined ? "GET" : "POST",
    headers: headers(),
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const out = await res.json();
  if (!res.ok) throw Error(out.error || "通信を確認してください");
  return out;
}
function toast(text) {
  $(".toast")?.remove();
  const n = document.createElement("div");
  n.className = "toast";
  n.setAttribute("role", "status");
  n.textContent = text;
  document.body.append(n);
  setTimeout(() => n.remove(), 5000);
}
let saveChain = Promise.resolve();
function save() {
  localStorage.setItem(key, JSON.stringify(state));
  if (config.storage !== "browser") {
    const snapshot = JSON.stringify(state);
    saveChain = saveChain.then(async () => {
      try {
        const r = await fetch("/api/workspace/" + wid, { method: "PUT", headers: headers(), body: snapshot });
        if (!r.ok) throw Error();
        saveMessage = config.storage === "firestore" ? "Firestoreに保存" : "この端末とサーバーに保存";
      } catch {
        saveMessage = "端末に保存済み・サーバー保存は未完了";
        toast(saveMessage);
      }
    });
  }
}
function stopLive() {
  liveAbort?.abort();
  liveAbort = null;
}
window.addEventListener("pagehide", stopLive);
let entering = true;
function go(p) {
  if (busy) {
    toast("処理中です。少しお待ちください。");
    return;
  }
  stopLive();
  if (p !== page) entering = true;
  page = p;
  document.body.classList.remove("menu-open");
  render();
  window.scrollTo(0, 0);
}
const statuses = {
  requested: "聞き取り待ち",
  interview: "聞き取り中",
  draft: "内容を確認",
  confirmed: "確認済み",
};
function shell(content) {
  const history = state.requests
    .map(
      (r) =>
        `<button class="history" data-request="${r.id}"><span class="history-q">${esc(r.question)}</span><span class="history-meta">${esc(r.event)}／${statuses[r.status] || ""}</span></button>`,
    )
    .join("");
  $("#app").innerHTML =
    `<aside><button class="close-menu" aria-label="メニューを閉じる">${icon("close")}</button><a class="brand" href="#" data-page="hub">${logo(40)}<span><strong>ツギ<span class="wm-b">キキ</span></strong><small>継ぐために、聞く。</small></span></a><nav class="side-nav" aria-label="主なメニュー"><button class="nav-item ${page === "hub" ? "is-current" : ""}" data-page="hub">${icon("leaf")}ホーム</button><button class="nav-item ${["welcome", "place", "regions"].includes(page) && intakePurpose() !== "record" ? "is-current" : ""}" id="view-entry">${icon("compass")}行事の段取りを調べる<small>町の歴史・行事の段取り</small></button><button class="nav-item nav-record ${["interview", "materials"].includes(page) || (page === "welcome" && intakePurpose() === "record") ? "is-current" : ""}" id="record-entry">${icon("mic")}行事の段取りを残す<small>語り手の方はこちら</small></button></nav><details class="side-history" ${state.requests.length ? "open" : ""}><summary>これまでの相談<span>${state.requests.length}</span></summary>${history || '<p class="side-empty">まだありません。町の名前から探してみてください。</p>'}</details><div class="side-bottom"><button class="settings" id="settings">${icon("settings")}設定</button><p class="side-label">${config.aiReady ? "Google AI 接続設定あり" : "体験モード（ルール処理）"}<br>生の音声は保存しません</p></div></aside><main><div class="scrim" aria-hidden="true"></div><header class="topbar"><button class="mobile-menu" aria-label="メニューを開く" aria-expanded="false">${icon("menu")}</button><a class="product" href="#" data-page="hub">${logo(28)}<span>ツギ<span class="wm-b">キキ</span></span></a><span class="status"><span class="status-dot ${config.aiReady ? "on" : ""}"></span>${config.aiReady ? "AI接続設定あり" : "体験モード"}</span></header><div class="page ${entering ? "page-enter" : ""}">${content}</div><footer class="footer"><p>デモに登場する町・人物・語りは、すべて架空のものです。実在の地域の知識ではありません。</p><p>${esc(saveMessage)}。${config.aiReady ? "Geminiの生成結果は、語り手と確認してから利用します。" : "現在の聞き取りと整理は体験用のルール処理です。"}</p></footer></main><dialog id="dialog"></dialog>`;
  entering = false;
  document.querySelectorAll("[data-page]").forEach(
    (b) =>
      (b.onclick = (e) => {
        e.preventDefault();
        go(b.dataset.page);
      }),
  );
  document.querySelectorAll("[data-request]").forEach(
    (b) =>
      (b.onclick = () => {
        if (busy) return toast("処理中です。少しお待ちください。");
        stopLive();
        active = b.dataset.request;
        go(
          current().kind === "materials" && current().status === "requested"
            ? "materials"
            : current().status === "requested"
            ? "request"
            : current().status === "interview"
              ? "interview"
              : "review",
        );
      }),
  );
  $(".mobile-menu").onclick = () => document.body.classList.add("menu-open");
  $(".close-menu").onclick = () => document.body.classList.remove("menu-open");
  $(".scrim").onclick = () => document.body.classList.remove("menu-open");
  $("#settings").onclick = settings;
  $("#view-entry").onclick = () => startIntake("view");
  $("#record-entry").onclick = () => startIntake("record");
}
function modal(html, bind = () => {}) {
  const d = $("#dialog");
  d.innerHTML = html;
  d.showModal();
  bind(d);
  d.querySelector("[data-close]")?.addEventListener("click", () => d.close());
  d.onclick = (e) => {
    if (e.target === d) d.close();
  };
}
function render() {
  if (page === "welcome") welcome();
  else if (page === "hub") hub();
  else if (page === "regions") regions();
  else if (page === "place") placePage();
  else if (page === "materials") materialsPage();
  else if (page === "request") requestPage();
  else if (page === "interview") interview();
  else if (page === "review") review();
  else if (page === "metrics") metrics();
  else if (page === "test") testPage();
  else if (page === "knowledge") knowledge();
}
let pendingAsk = "",
  placeName = "",
  placeDraft = "",
  hearing = { env: "", values: [], area: "", note: "" },
  intake = { history: [], purpose: "", typed: new Set() };
const hearingSteps = [
  {
    key: "env",
    multi: false,
    placeholder: "例：駅まで歩ける静かな住宅地、雪の少ないところ",
    q: "どんな場所で暮らしたいですか？",
    options: [
      ["sea", "海や川の近く"],
      ["mountain", "山や田畑のそば"],
      ["town", "町なか・商店街のそば"],
      ["any", "まだ決めていない"],
    ],
  },
  {
    key: "values",
    multi: true,
    placeholder: "例：古い町並みを残す活動に関わりたい",
    q: "暮らしの中で、大事にしたいことは？",
    hint: "いくつ選んでも大丈夫です。",
    options: [
      ["festival", "祭りや地域の行事"],
      ["food", "食べ物や農の営み"],
      ["trade", "商いや仕事のつながり"],
      ["quiet", "静かで落ち着いた暮らし"],
      ["family", "子育てや近所づきあい"],
    ],
  },
  {
    key: "area",
    multi: false,
    placeholder: "例：北陸、実家のある県の近く",
    q: "考えている方面はありますか？",
    options: [
      ["tohoku", "東北"],
      ["kansai", "関西"],
      ["setouchi", "瀬戸内・四国"],
      ["other", "そのほか"],
      ["any", "こだわらない"],
    ],
  },
];
const purposes = [
  ["view", "行事の段取りを知りたい", "祭りや行事の進め方を、前の担い手に聞く"],
  ["record", "行事の段取りを残したい", "自分が担ってきた祭りや行事のやり方を、聞き取りで残す"],
];
const topics = [
  ["steps", "行事の段取りや当番", "の祭りや行事の段取りと当番は、どうなっているの？"],
  ["festival", "由来と、いつから続いているか", "の祭りや行事は、いつから、どんな経緯で続いているの？"],
    ["roles", "当番・役割分担", "の祭りや行事には、どんな役割や当番があって、どう決めるの？"],
  ["rain", "雨の日・天気が悪いとき", "の祭りや行事は、雨の日や天気が悪いときはどうするの？"],
  ["tools", "道具・備品の置き場と管理", "の祭りや行事で使う道具や備品は、どこにあって、誰が管理しているの？"],
  ["money", "費用・寄付・会計", "の祭りや行事の費用は、どう集めて、何に使うの？"],
  ["contacts", "連絡先・届け出", "の祭りや行事の準備で、どこに連絡や届け出が必要なの？"],
  ["handover", "担い手集め・引き継ぎ", "の祭りや行事の担い手は、どう集めて、次の人にどう引き継いでいるの？"],
];
const choiceList = (items, cls = "") =>
  `<div class="choices ${cls}">${items.map(([v, l, s], i) => `<button class="choice" style="--i:${i}" data-v="${v}" data-l="${l}"><strong>${l}</strong>${s ? `<span>${s}</span>` : ""}</button>`).join("")}</div>`;
// どの質問を出すかは、それまでの答えから決まる
function intakeStep() {
  const a = Object.fromEntries(intake.history.map((x) => [x.key, x.value]));
  if (!a.purpose) return "purpose";
  if (a.purpose === "record") return !a.place ? "place" : !a.name ? "name" : a.how ? "done" : "how";
  if (!a.place) return "place";
  return "topic" in a ? "done" : "topic";
}
function finishIntake() {
  const a = Object.fromEntries(intake.history.map((x) => [x.key, x.value]));
  if (a.purpose === "record") {
    state.profile = { name: String(a.name || "").trim().slice(0, 40), updatedAt: new Date().toISOString() };
    save();
    return startRecording(a.place, a.how, state.profile.name);
  }
  if (a.place) {
    const t = topics.find(([k]) => k === a.topic);
    const first = t ? a.place + t[2] : a.topic && a.topic !== "none" ? a.topic : "";
    return openPlace(a.place, first);
  }
  const texts = intake.history.filter((x) => x.text).map((x) => x.text);
  hearing = {
    env: a.env || "",
    values: a.values || [],
    area: a.area || "",
    note: [...texts, a.note].filter(Boolean).join("\n"),
    texts,
  };
  const box = $(".intake-current");
  if (box) box.innerHTML = '<p class="searching" role="status">お答えに合う地域を探しています</p>';
  setTimeout(() => go("regions"), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 900);
}
function startRecording(place, how = "talk", name = "") {
  const demo = /青葉/.test(place);
  if (how === "files") {
    const existing = state.requests.find((x) => x.kind === "materials" && x.place === place);
    if (existing) {
      active = existing.id;
      return go("materials");
    }
  }
  const r =
    how === "files"
      ? create(`${place}の祭り・行事の資料（PDF・写真）`, demo, demo ? DEMO.event : place, "行事の資料", name)
      : demo
    ? create(DEMO.question, true, DEMO.event, DEMO.task, name)
    : create(`${place}の祭りや行事について、段取りを聞かせてください。`, false, place, "行事の段取り", name);
  if (!r) return;
  r.place = place;
  if (how === "files") {
    r.kind = "materials";
    save();
    return go("materials");
  }
  save();
  beginInterview();
}
// Spotifyの初期設定のような、画像つきの大きなタイル。multi のときは押すたびに選択が切り替わる
const tileCheck = `<span class="tile-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg></span>`;
const tiles = (options, multi = false) =>
  `<div class="tiles">${options.map(([v, l], i) => `<button type="button" class="tile" style="--i:${i}" ${multi ? `data-t="${v}" aria-pressed="false"` : `data-v="${v}"`} data-l="${l}"><span class="tile-art">${tileArt(v)}</span><span class="tile-label">${l}</span>${tileCheck}</button>`).join("")}</div>`;
function questionFor(step) {
  const a = Object.fromEntries(intake.history.map((x) => [x.key, x.value]));
  if (step === "purpose") return { q: "こんにちは。今日は、どちらをしますか？", body: choiceList(purposes) };
  if (step === "name")
    return {
      q: "お名前を教えてください。",
      hint: "呼ばれている名前で大丈夫です。お話の語り手として、この名前で記録します。",
      body: `<form class="free" id="free-form" style="--i:0"><label class="sr-only" for="free">お名前</label><input class="field field-place" id="free" autocomplete="name" maxlength="40" placeholder="例：田中、山田さん" value="${esc(state.profile?.name || "")}" required><button class="primary-btn">次へ</button></form>`,
    };
  if (step === "place")
    return {
      q: a.purpose === "record" ? "どの町の、祭りや行事の段取りを残しますか？" : "どの町の、祭りや行事ですか？",
      hint: "市町村名でも、地区や通りの名前でも大丈夫です。",
      body: `<form class="free" id="free-form" style="--i:0"><label class="sr-only" for="free">町や地区の名前</label><input class="field field-place" id="free" autocomplete="off" maxlength="80" placeholder="例：青葉地区、○○市△△町" required><button class="primary-btn">次へ</button></form><div class="choices compact" style="--i:1"><button class="choice-sm" data-v="青葉地区" data-l="青葉地区（架空）">架空の「青葉地区」で試す</button></div>`,
    };
  if (step === "how")
    return {
      q: "どんな形で残しますか？",
      hint: "あとから、もう一方も追加できます。",
      body: choiceList([
        ["talk", "話して残す", "聞き役のAIが質問しながら、行事の段取りを文字にします"],
        ["files", "資料を登録する", "行事の記録や当番表、昔の祭りの写真・PDFをアップロードします"],
      ]),
    };
  if (step === "topic")
    return {
      q: `${a.place}の祭りや行事の、どんなことを知りたいですか？`,
      hint: "選んだことから、AIがまず資料と地域の人の語りをもとに答えます。",
      body: `${tiles(topics)}<form class="free" id="free-form" style="--i:4"><label class="sr-only" for="free">知りたいことを書く</label><input class="field" id="free" autocomplete="off" maxlength="1000" placeholder="自分の言葉で書く（例：提灯は、いつから準備を始めるの？）" required><button class="secondary-btn">次へ</button></form><div class="choices compact" style="--i:5"><button class="choice-sm" data-v="none" data-l="とくに決めていない">とくに決めていない</button></div>`,
    };
  const s = hearingSteps.find((x) => x.key === step);
  if (s)
    return {
      q: s.q,
      hint: s.hint,
      body: s.multi
        ? `<form id="multi-form">${tiles(s.options, true)}<label class="label own-words" for="free" style="--i:${s.options.length}">自分の言葉でも書けます</label><input class="field" id="free" autocomplete="off" maxlength="300" placeholder="${s.placeholder}" style="--i:${s.options.length}"><div class="intake-next" style="--i:${s.options.length + 1}"><button class="primary-btn">次へ</button><button type="button" class="text-btn" id="skip">とくにない</button></div></form>`
        : `${tiles(s.options)}<label class="label own-words" for="free" style="--i:${s.options.length}">選択肢にないときは、自分の言葉で</label><form class="free" id="free-form" style="--i:${s.options.length}"><input class="field" id="free" autocomplete="off" maxlength="300" placeholder="${s.placeholder}"><button class="secondary-btn">次へ</button></form>`,
    };
  return {
    q: "ほかに、気になることはありますか？",
    hint: "なければ、そのまま候補を見られます。",
    body: `<form class="free" id="free-form" style="--i:0"><label class="sr-only" for="free">気になること</label><input class="field" id="free" autocomplete="off" maxlength="1000" placeholder="例：雪が多くても、昔ながらの祭りがある町がいい"><button class="primary-btn">候補を見る</button></form>`,
  };
}
const intakePurpose = () => intake.history.find((x) => x.key === "purpose")?.value;
function startIntake(purpose) {
  const [v, l] = purposes.find(([k]) => k === purpose);
  intake.history = [{ key: "purpose", value: v, label: l, q: questionFor("purpose").q }];
  go("welcome");
}
function recentTowns() {
  const seen = new Map();
  for (const [name, log] of Object.entries(townChats)) if (log.length) seen.set(name, log.at(-1).at || 0);
  for (const r of state.requests) {
    const name = r.place;
    if (name && !seen.has(name)) seen.set(name, Date.parse(r.createdAt) || 0);
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n).slice(0, 6);
}
const bookIcon = `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Z"/><path d="M13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13Z"/></svg>`,
  micIcon = `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`,
  phoneIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>`;
// 祭りの提灯の列（飾り）。紙張りの朱と生成りを交互に、縄に沿って吊るす
function lanterns(count = 5, width = 900, cls = "") {
  const items = Array.from({ length: count }, (_, i) => {
    const x = ((i + 0.5) / count) * width,
      t = x / width,
      y = 18 * (1 - t) ** 2 + 2 * t * (1 - t) * 64 + 18 * t ** 2,
      red = i % 2 === 0;
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><g class="lantern" style="--d:${(i * 0.37).toFixed(2)}s"><g class="lantern-swing"><line x1="0" y1="0" x2="0" y2="9" stroke="#2b2723" stroke-width="1.5"/><rect x="-11" y="9" width="22" height="6" rx="1.5" fill="#2b2723"/><ellipse class="lantern-body" cx="0" cy="40" rx="23" ry="26" fill="${red ? "#e0482a" : "#fffaf0"}" stroke="${red ? "#a8301a" : "#e8d9bf"}"/><path d="M-21 30Q0 25 21 30M-23 40Q0 35 23 40M-21 50Q0 45 21 50" fill="none" stroke="${red ? "#a8301a" : "#e8d9bf"}" stroke-width="1"/><text x="0" y="47" text-anchor="middle" font-size="19" font-weight="600" font-family="Klee One, sans-serif" fill="${red ? "#2b2723" : "#e0482a"}">${red ? "祭" : "町"}</text><rect x="-11" y="65" width="22" height="6" rx="1.5" fill="#2b2723"/><line x1="0" y1="71" x2="0" y2="84" stroke="#f2a93b" stroke-width="2"/></g></g></g>`;
  }).join("");
  return `<svg class="lanterns ${cls}" viewBox="0 0 ${width} 160" preserveAspectRatio="xMidYMin meet" aria-hidden="true"><path d="M0 18Q${width / 2} 64 ${width} 18" fill="none" stroke="#2b2723" stroke-width="1.5"/>${items}</svg>`;
}
// 祭りの写真（public/images/matsuri.jpg）があれば、ホームの背景に敷く
const heroPhoto = new Image();
heroPhoto.onload = () => {
  document.documentElement.style.setProperty("--hero-photo", "url(images/matsuri.jpg)");
  document.documentElement.classList.add("has-hero-photo");
};
heroPhoto.src = "images/matsuri.jpg";
function hub() {
  const first = !intake.typed.has("hub"),
    q = "こんにちは。今日は、どちらをしますか？",
    towns = recentTowns(),
    ongoing = state.requests.filter((r) => r.status !== "confirmed").slice(0, 3);
  shell(
    `<section class="intake hub ${first ? "is-entering" : ""}"><div class="hub-hero">${lanterns()}<div class="hub-head">${logo(84, first)}<div><p class="intake-hello">町の昔を、そこで暮らした人に聞く。</p><h1 class="intake-q"><span class="sr-only">${q}</span><span class="typed" aria-hidden="true" data-text="${q}">${first ? "" : q}</span></h1></div></div></div><div class="intake-body"><div class="hub-actions" style="--i:0"><button class="hub-card is-main" data-start="view">${bookIcon}<strong>行事の段取りを調べる</strong><span>祭りや行事の段取りと当番を、地域の人の語りと記録から調べます。前の担当者に聞けなかったことも、ここで確認できます。</span><em>はじめる</em></button><button class="hub-card" data-start="record">${micIcon}<strong>行事の段取りを残す</strong><span>自分が担ってきた祭りや行事のやり方を、聞かれるままに話して残します。</span><em>はじめる</em></button></div><div class="hub-lower" style="--i:1">${towns.length ? `<section class="hub-section"><h2>最近見た町</h2><div class="choices compact">${towns.map((n) => `<button class="town-chip" data-town="${esc(n)}">${esc(n)}</button>`).join("")}</div></section>` : `<section class="hub-section"><h2>まずは試してみる</h2><div class="choices compact"><button class="town-chip" data-town="青葉地区">架空の「青葉地区」</button></div></section>`}${ongoing.length ? `<section class="hub-section"><h2>続きから</h2><ul class="resume-list">${ongoing.map((r) => `<li><button class="resume" data-request="${r.id}"><span><strong>${esc(r.question)}</strong><small>${esc(r.place || r.event)}</small></span><em class="pill">${statuses[r.status] || ""}</em></button></li>`).join("")}</ul></section>` : ""}</div></div><div class="wave-band" aria-hidden="true"></div></section>`,
  );
  document.querySelectorAll("[data-start]").forEach((b) => (b.onclick = () => startIntake(b.dataset.start)));
  document.querySelectorAll("[data-town]").forEach((b) => (b.onclick = () => openPlace(b.dataset.town)));
  typeQuestion(first, "hub");
}
function welcome() {
  const step = intakeStep();
  if (step === "done") intake.history.pop();
  if (intakeStep() === "purpose") {
    page = "hub";
    return hub();
  }
  const cur = intakeStep(),
    { q, hint, body } = questionFor(cur),
    stepId = cur + intake.history.length,
    first = !intake.typed.has(stepId);
  const keyLabel = { purpose: "目的", knows: "町名", place: "町", name: "お名前", topic: "知りたいこと", how: "残し方", env: "場所", values: "大事なこと", area: "方面", note: "ほか" };
  const past = intake.history
    .map((x) => `<li><span>${keyLabel[x.key] || ""}</span><b>${esc(x.label)}</b></li>`)
    .join("");
  const a0 = Object.fromEntries(intake.history.map((x) => [x.key, x.value])),
    total = a0.purpose === "record" ? 4 : 3,
    nowAt = Math.min(intake.history.length + 1, total),
    progress = `<div class="progress" role="img" aria-label="${total}問中${nowAt}問目">${Array.from({ length: total }, (_, i) => `<span class="${i < nowAt - 1 ? "done" : i === nowAt - 1 ? "now" : ""}"></span>`).join("")}<small>${nowAt} / ${total}</small></div>`;
  shell(
    `<section class="intake ${first ? "is-entering" : ""}"><div class="intake-top">${progress}<ul class="past-chips">${past}</ul></div><div class="intake-current"><h1 class="intake-q" aria-live="polite"><span class="sr-only">${esc(q)}</span><span class="typed" aria-hidden="true" data-text="${esc(q)}">${first ? "" : esc(q)}</span></h1>${hint ? `<p class="intake-hint">${esc(hint)}</p>` : ""}<div class="intake-body">${body}</div>${intake.history.length ? '<div class="intake-back"><button class="back-btn" id="back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>ひとつ前に戻る</button><button class="back-btn" id="restart"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/></svg>ホームに戻る</button></div>' : ""}</div></section>`,
  );
  const qText = q;
  const commit = (key, value, label, text = "") => {
    intake.history.push({ key, value, label, q: qText, text });
    if (intakeStep() === "done") finishIntake();
    else render();
  };
  document.querySelectorAll(".intake [data-v]").forEach(
    (b) =>
      (b.onclick = () => {
        commit(cur, b.dataset.v, b.dataset.l);
      }),
  );
  $("#free-form") &&
    ($("#free-form").onsubmit = (e) => {
      e.preventDefault();
      const v = $("#free").value.trim();
      if (cur !== "note" && !v) return toast("入力するか、選択肢から選んでください。");
      if (hearingSteps.some((x) => x.key === cur)) return commit(cur, "", v, v);
      commit(cur, v, v || "とくになし");
    });
  $("#multi-form") &&
    ($("#multi-form").onsubmit = (e) => {
      e.preventDefault();
      const picked = [...document.querySelectorAll('#multi-form .tile[aria-pressed="true"]')].map((t) => ({ value: t.dataset.t, dataset: t.dataset })),
        text = $("#free").value.trim();
      if (!picked.length && !text) return toast("ひとつ以上選ぶか、自分の言葉で書いてください。");
      commit(
        cur,
        picked.map((x) => x.value),
        [...picked.map((x) => x.dataset.l), text].filter(Boolean).join("、"),
        text,
      );
    });
  $("#skip") && ($("#skip").onclick = () => commit(cur, [], "とくにない"));
  document.querySelectorAll(".tile[data-t]").forEach(
    (t) => (t.onclick = () => t.setAttribute("aria-pressed", String(t.getAttribute("aria-pressed") !== "true"))),
  );
  $("#back") &&
    ($("#back").onclick = () => {
      intake.history.pop();
      render();
    });
  $("#restart") &&
    ($("#restart").onclick = () => {
      intake.history = [];
      go("hub");
    });
  typeQuestion(first, stepId);
}
function typeQuestion(animate, stepId) {
  const el = $(".typed"),
    sec = $(".intake");
  if (!el || !sec) return;
  el.textContent = el.dataset.text;
  const done = () => {
    sec.classList.add("is-ready");
    intake.typed.add(stepId);
    sec.querySelector("#free")?.focus({ preventScroll: true });
  };
  if (!animate || matchMedia("(prefers-reduced-motion: reduce)").matches) return done();
  // 見出しは一括でフェードイン → 選択肢が順に現れる
  requestAnimationFrame(() => setTimeout(done, intake.history.length ? 60 : 350));
}
function openPlace(name, question = "") {
  placeName = name.slice(0, 80);
  placeDraft = "";
  pendingAsk = question;
  go("place");
  loadPlace(placeName);
}
// ---------- 資料（PDF・写真）を残す ----------
let pendingFiles = [];
const visibilities = [
  ["town", "町の人だけ"],
  ["keepers", "行事の担い手だけ"],
  ["public", "だれでも"],
];
const visLabel = (v) => visibilities.find(([k]) => k === v)?.[1] || "町の人だけ";
const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + "MB" : Math.max(1, Math.round(n / 1024)) + "KB");
function addFiles(list) {
  for (const file of list) {
    const kind = kindOf(file.type);
    if (!kind) {
      toast(`「${file.name}」は登録できない形式です。PDF、写真（JPEG・PNG・WebP）、動画（MP4・MOV・WebM）を選んでください。`);
      continue;
    }
    if (file.size > MAX_BYTES) {
      toast(`「${file.name}」は20MBを超えています。小さくしてから登録してください。`);
      continue;
    }
    pendingFiles.push({
      id: crypto.randomUUID(),
      file,
      kind,
      preview: kind === "写真" ? URL.createObjectURL(file) : "",
      title: file.name.replace(/\.[^.]+$/, ""),
      era: "",
      source: "",
      description: "",
      visibility: "town",
      consent: false,
    });
  }
  materialsPage();
}
function thumbHtml(m, preview = "") {
  return m.kind === "写真"
    ? `<img class="thumb" ${preview ? `src="${preview}"` : `data-thumb="${m.id}"`} alt="">`
    : `<span class="thumb thumb-pdf" aria-hidden="true">${m.kind === "動画" ? "動画" : "PDF"}</span>`;
}
async function fillThumbs(root = document) {
  for (const img of root.querySelectorAll("[data-thumb]")) {
    const url = await fileUrl(img.dataset.thumb);
    if (url) img.src = url;
    else img.replaceWith(Object.assign(document.createElement("span"), { className: "thumb thumb-missing", textContent: "表示できません" }));
  }
}
async function openMaterial(id) {
  const url = await fileUrl(id);
  if (!url) return toast("この資料のファイルを開けませんでした。登録した端末にしかない資料かもしれません。");
  window.open(url, "_blank", "noopener");
}
// カメラで撮る。スマホはOSのカメラ（capture入力）、パソコンはブラウザ内で撮影する。撮った写真は通常の登録と同じ流れに入る
function openCamera() {
  const coarse = matchMedia("(pointer: coarse)").matches;
  if (coarse || !navigator.mediaDevices?.getUserMedia) return $("#camera-input").click();
  let stream = null;
  const stop = () => stream?.getTracks().forEach((t) => t.stop());
  modal(
    `<h2>カメラで撮る</h2><p class="small">写したいものを枠に入れて「撮影する」を押してください。映像は保存されず、撮った1枚だけが資料になります。</p><div class="camera-box"><video id="cam" autoplay playsinline muted></video><p class="camera-msg" id="cam-msg" role="status">カメラを起動しています…</p></div><div class="dialog-actions"><button class="secondary-btn" id="cam-cancel">やめる</button><button class="primary-btn" id="cam-shot" disabled>撮影する</button></div>`,
    (d) => {
      const video = d.querySelector("#cam");
      d.addEventListener("close", stop, { once: true });
      d.querySelector("#cam-cancel").onclick = () => d.close();
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
        .then((s) => {
          stream = s;
          video.srcObject = s;
          d.querySelector("#cam-msg").remove();
          d.querySelector("#cam-shot").disabled = false;
        })
        .catch((e) => {
          d.querySelector("#cam-msg").textContent =
            e.name === "NotAllowedError"
              ? "カメラの使用が許可されていません。ブラウザのアドレスバーの設定から、カメラを許可してください。"
              : "カメラを起動できませんでした。カメラが接続されているか確認するか、写真のファイルを選んでください。";
        });
      d.querySelector("#cam-shot").onclick = () => {
        const c = document.createElement("canvas");
        c.width = video.videoWidth;
        c.height = video.videoHeight;
        c.getContext("2d").drawImage(video, 0, 0);
        c.toBlob(
          (blob) => {
            if (!blob) return toast("撮影できませんでした。もう一度お試しください。");
            const stamp = new Date().toLocaleString("ja-JP").replace(/[/: ]/g, "-");
            d.close();
            addFiles([new File([blob], `撮影-${stamp}.jpg`, { type: "image/jpeg" })]);
          },
          "image/jpeg",
          0.9,
        );
      };
    },
  );
}
function materialsPage() {
  const r = current();
  if (!r) return go("hub");
  const place = r.place || r.event,
    saved = r.materials || [];
  const pending = pendingFiles
    .map(
      (p, i) =>
        `<form class="upload-item" data-pending="${i}">${thumbHtml(p, p.preview)}<div class="upload-fields"><p class="upload-name">${esc(p.file.name)}<small>${p.kind}・${fmtSize(p.file.size)}</small></p><label class="label">資料の名前<input class="field" name="title" value="${esc(p.title)}" required maxlength="120"></label><div class="row-2"><label class="label">年代<input class="field" name="era" value="${esc(p.era)}" placeholder="例：昭和40年ごろ" maxlength="60"></label><label class="label">作った人・出どころ<input class="field" name="source" value="${esc(p.source)}" placeholder="例：自治会の当番表、祖父のアルバム" maxlength="120"></label></div><label class="label">${p.kind === "写真" ? "何が写っていますか" : "どんなことが書かれていますか"}<textarea class="field" name="description" maxlength="1000" placeholder="${p.kind === "写真" ? "例：昔の夏祭りの神輿。提灯を吊るしていた場所が分かる。" : "例：夏祭りの当番表と、準備の日程がのっている。"}">${esc(p.description)}</textarea></label><label class="label">見られる人<select class="field" name="visibility">${visibilities.map(([v, l]) => `<option value="${v}" ${p.visibility === v ? "selected" : ""}>${l}</option>`).join("")}</select></label><label class="check"><input type="checkbox" name="consent" ${p.consent ? "checked" : ""}>${p.kind === "写真" ? "写っている人や持ち主に、残してよいか確認しました。" : "この資料を共有してよいか、持ち主や作った人に確認しました。"}</label><div class="upload-actions"><button class="primary-btn">登録する</button><button type="button" class="text-btn" data-cancel="${i}">取り消す</button></div></div></form>`,
    )
    .join("");
  const list = saved
    .map(
      (m) =>
        `<li class="saved-item">${thumbHtml(m)}<div><strong>${esc(m.title)}</strong><small>${esc(m.kind)}${m.era ? "・" + esc(m.era) : ""}・${visLabel(m.visibility)}${m.local ? "・この端末のみ" : ""}</small>${m.description ? `<p class="small">${esc(m.description)}</p>` : ""}<div class="saved-actions"><button class="text-btn" data-open="${m.id}">開く</button><button class="text-btn danger" data-remove="${m.id}">削除</button></div></div></li>`,
    )
    .join("");
  shell(
    `<section class="page-header"><h1>${esc(place)}の祭り・行事の資料を残す</h1><p>行事の記録や当番表、昔の祭りの写真・PDFを登録できます。登録した資料は、町のチャットで、段取りの答えの根拠として示されます。</p></section><div class="review-layout"><section class="paper-card upload-card"><label class="dropzone" for="file-input"><input type="file" id="file-input" accept="${ACCEPT}" multiple class="sr-only"><span class="dropzone-title">PDF・写真・動画を選ぶ</span><span class="small">ここにドラッグしても追加できます。PDF・写真・動画（MP4・MOV・WebM）、1ファイル20MBまで。動画は、タイトルと説明が回答の根拠になります（動画の中身は読み取りません）。</span></label><div class="capture-row"><button type="button" class="secondary-btn" id="take-photo"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg>カメラで撮る</button><input type="file" id="camera-input" accept="image/*" capture="environment" class="sr-only" tabindex="-1"><span class="small">古い写真や資料のページを、その場で撮って残せます。</span></div>${pending ? `<div class="upload-list">${pending}</div>` : ""}</section><div class="review-sidebar"><section class="side-card"><h3>登録した資料<span class="count">${saved.length}</span></h3>${list ? `<ul class="saved-list">${list}</ul>` : '<p class="small">まだありません。</p>'}</section><section class="side-card"><h3>ほかの残し方</h3><p class="small">資料にまつわる思い出や、行事の段取りは、話して残すこともできます。</p><button class="secondary-btn" id="to-talk">話して残す</button><button class="text-btn" id="to-town">${esc(place)}のページを見る</button></section><p class="small upload-note">${serverFiles() ? `登録した資料はサーバーに保存され、${esc(place)}のページを見る人が見られます${config.materialStorage === "cloud-storage" ? "" : "（いまはデモ用のサーバー内保存）"}。` : "登録した資料は、この端末のブラウザに保存されます。"}</p></div></div>`,
  );
  fillThumbs();
  const input = $("#file-input"),
    drop = $(".dropzone");
  input.onchange = () => addFiles([...input.files]);
  $("#camera-input").onchange = (e) => addFiles([...e.target.files]);
  $("#take-photo").onclick = openCamera;
  drop.ondragover = (e) => {
    e.preventDefault();
    drop.classList.add("is-over");
  };
  drop.ondragleave = () => drop.classList.remove("is-over");
  drop.ondrop = (e) => {
    e.preventDefault();
    drop.classList.remove("is-over");
    addFiles([...e.dataTransfer.files]);
  };
  document.querySelectorAll("[data-pending]").forEach((form) => {
    const p = pendingFiles[form.dataset.pending];
    form.oninput = form.onchange = (e) => {
      const t = e.target;
      if (t.name) p[t.name] = t.type === "checkbox" ? t.checked : t.value;
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (!p.title.trim()) return toast("資料の名前を入れてください。");
      if (!p.consent) return toast("残してよいかの確認にチェックを入れてください。");
      const meta = {
        place,
        title: p.title.trim().slice(0, 120),
        era: p.era.trim().slice(0, 60),
        source: p.source.trim().slice(0, 120),
        description: p.description.trim().slice(0, 1000),
        visibility: p.visibility,
        consent: true,
        addedBy: r.speaker,
      };
      const btn = form.querySelector(".primary-btn");
      btn.disabled = true;
      btn.textContent = "登録しています…";
      let rec = null;
      if (serverFiles()) {
        try {
          rec = await uploadMaterial(p.file, meta);
        } catch (err) {
          // 入力の不備（形式・大きさ・確認）はそのまま伝える。通信の失敗などは、この端末への保存に切り替える
          if ([400, 411, 413, 415].includes(err.status)) {
            btn.disabled = false;
            btn.textContent = "登録する";
            return toast(err.message);
          }
        }
      }
      if (!rec) {
        try {
          await putFile(p.id, p.file);
        } catch {
          btn.disabled = false;
          btn.textContent = "登録する";
          return toast("保存できませんでした。通信やブラウザの容量を確認してください。");
        }
        const { consent, place: _p, ...rest } = meta;
        rec = { id: p.id, kind: p.kind, type: p.file.type, name: p.file.name, size: p.file.size, ...rest, addedAt: new Date().toISOString(), local: true };
        if (serverFiles()) toast("サーバーに送れなかったため、この端末に保存しました。");
      }
      r.materials ||= [];
      r.materials.push(rec);
      delete serverMats[place];
      if (p.preview) URL.revokeObjectURL(p.preview);
      pendingFiles = pendingFiles.filter((x) => x !== p);
      save();
      toast(`「${p.title}」を登録しました。`);
      materialsPage();
    };
  });
  document.querySelectorAll("[data-cancel]").forEach(
    (b) =>
      (b.onclick = () => {
        const p = pendingFiles[b.dataset.cancel];
        if (p?.preview) URL.revokeObjectURL(p.preview);
        pendingFiles.splice(b.dataset.cancel, 1);
        materialsPage();
      }),
  );
  document.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => openMaterial(b.dataset.open)));
  document.querySelectorAll("[data-remove]").forEach(
    (b) =>
      (b.onclick = () => {
        const m = r.materials.find((x) => x.id === b.dataset.remove);
        modal(
          `<h2>資料を削除しますか？</h2><p>「${esc(m.title)}」を削除します。ファイルも消え、元に戻せません。</p><div class="dialog-actions"><button class="secondary-btn" data-close>やめる</button><button class="primary-btn" id="do-remove">削除する</button></div>`,
          () =>
            ($("#do-remove").onclick = async () => {
              if (m.server) {
                try {
                  await removeMaterial(m.id);
                } catch (err) {
                  if (err.status !== 404) return toast(err.message);
                }
              }
              r.materials = r.materials.filter((x) => x !== m);
              delete serverMats[place];
              try {
                await deleteFile(m.id);
              } catch {}
              save();
              $("#dialog").close();
              toast("資料を削除しました。");
              materialsPage();
            }),
        );
      }),
  );
  $("#to-talk").onclick = beginInterview;
  $("#to-town").onclick = () => openPlace(place);
}

// ---------- 町のチャット：AIが資料をもとに答え、根拠と連絡先を示す ----------
const chatKey = "tsugite-town-chats-v1";
let townChats = {};
try {
  townChats = JSON.parse(localStorage.getItem(chatKey)) || {};
} catch {}
let townBusy = false,
  townTab = "chat";
function saveChats() {
  try {
    for (const log of Object.values(townChats)) if (log.length > 40) log.splice(0, log.length - 40);
    localStorage.setItem(chatKey, JSON.stringify(townChats));
  } catch {}
}
function placeRequests() {
  const n = placeName.replace(/\s/g, "");
  return state.requests.filter((r) => {
    const e = String(r.place || r.event || "").replace(/\s/g, "");
    return n && (e.includes(n) || n.includes(e.replace(/の.*$/, "")));
  });
}
// サーバーにある町の資料（みんなが登録したもの）と、町の情報。町のページを開くたびに読み直す
let serverMats = {},
  serverTowns = {};
async function loadPlace(name) {
  if (!serverFiles() || !name) return;
  try {
    const out = await api("town?place=" + encodeURIComponent(name));
    serverMats[name] = out.materials || [];
    if (out.town) serverTowns[name] = out.town;
    if (page === "place" && placeName === name) placePage();
  } catch {}
}
const townFor = (name) => townData(name) || serverTowns[name] || null;
function placeMaterials() {
  const local = placeRequests().flatMap((r) => (r.materials || []).map((m) => ({ ...m, requestId: r.id })));
  const ids = new Set(local.map((m) => m.id));
  return [...local, ...(serverMats[placeName] || []).filter((m) => !ids.has(m.id))];
}
// 日本語の質問と資料の説明を、漢字・カタカナを含む2文字の重なりで照らし合わせる
const bigrams = (t) => {
  const s = String(t).replace(/[\s、。「」『』！？!?・（）()]/g, ""),
    out = new Set();
  for (let i = 0; i < s.length - 1; i++) {
    const b = s.slice(i, i + 2);
    if (/[\u4e00-\u9fff\u30a0-\u30ff]/.test(b)) out.add(b);
  }
  return out;
};
function matchMaterials(question) {
  const q = bigrams(question.replaceAll(placeName, ""));
  return placeMaterials()
    .map((m) => {
      const t = bigrams(`${m.title} ${m.era} ${m.source} ${m.description}`);
      return { m, score: [...q].filter((b) => t.has(b)).length };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((x) => x.m);
}
const materialSource = (m) => ({
  id: "mat-" + m.id,
  title: `「${m.title}」`,
  author: m.source || `${m.addedBy || "住民"}が登録`,
  year: m.era || "年代不明",
  kind: `${m.kind}（住民が登録）`,
  excerpt: m.description || "説明は登録されていません",
  where: "住民の方がツギキキに登録した資料です",
  fileId: m.id,
  fileKind: m.kind,
});
// 体験用の回答。登録された資料と、語り手が確認した手引きだけを根拠にする
function localTownAnswer(question) {
  const town = townFor(placeName),
    cited = [],
    cite = (src) => {
      let i = cited.findIndex((c) => c.id === src.id);
      if (i < 0) i = cited.push(src) - 1;
      return `[${i + 1}]`;
    },
    parts = [],
    materials = new Set();
  const best = placeRequests()
    .filter((r) => r.card)
    .map((r) => ({ r, keys: answerKeys(question, r.card) }))
    .filter((x) => x.keys.length)
    .sort((a, b) => b.keys.length - a.keys.length)[0];
  if (best) {
    const { r, keys } = best;
    const src = {
      id: "card-" + r.id,
      title: `${r.speaker}の語り「${r.card.title}」`,
      author: r.speaker,
      year: new Date(r.card.confirmedAt).toLocaleDateString("ja-JP"),
      kind: "聞き取り（語り手が確認済み）",
      excerpt: keys.map((k) => `${r.card.facts[k].label}：${r.card.facts[k].value}`).join("\n"),
      requestId: r.id,
    };
    parts.push(
      `地域の方の語りでは、${keys.map((k) => `${r.card.facts[k].label}は「${r.card.facts[k].value}」`).join("、")}とのことです${cite(src)}。`,
    );
  }
  if (town) {
    for (const k of (town.knowledge || []).filter((k) => k.words.test(question)).slice(0, best ? 1 : 2)) {
      parts.push(k.text.replace(/\[(\w+)\]/g, (_, id) => cite(town.sources.find((s) => s.id === id))));
      k.materials.forEach((m) => materials.add(m));
    }
  }
  const matMaterials = [];
  for (const m of matchMaterials(question)) {
    const src = materialSource(m);
    matMaterials.push(src);
    parts.push(
      `住民の方が登録した${m.kind}「${m.title}」${m.era ? `（${m.era}）` : ""}があります${cite(src)}。${m.description ? `説明には「${m.description.slice(0, 80)}${m.description.length > 80 ? "…" : ""}」とあります。` : ""}`,
    );
  }
  const fromTown = (ids) => (town ? ids.map((id) => town.sources.find((s) => s.id === id)) : []);
  if (!parts.length)
    return {
      text: town
        ? "この質問に答えられる資料は、まだ登録されていません。わからないことを推測で答えることはしません。地域の方に聞いてみませんか？"
        : `${placeName}の資料は、まだツギキキに登録されていません。わからないことを推測で答えることはしません。図書館の郷土資料や、役所の文化財・生涯学習の担当で調べられることがあります。地域の方に聞いてみることもできます。`,
      citations: [],
      materials: [],
      askable: true,
      mode: "experience",
    };
  return {
    text: parts.join("\n\n"),
    citations: cited,
    materials: [...fromTown([...materials]), ...matMaterials],
    askable: false,
    mode: "experience",
  };
}
async function askTown(question) {
  const log = (townChats[placeName] ||= []);
  log.push({ role: "user", text: question, at: Date.now(), fresh: true });
  townBusy = true;
  saveChats();
  placePage();
  let reply;
  if (config.aiReady) {
    try {
      // バックエンドの受け口（docs/frontend-town-chat.md）。未実装なら体験用の回答に切り替える
      const stories = placeRequests()
        .filter((r) => r.card?.confirmedAt)
        .map((r) => ({
          requestId: r.id,
          speaker: r.speaker,
          title: r.card.title,
          confirmedAt: r.card.confirmedAt,
          facts: FACTS.map(([k]) => r.card.facts[k])
            .filter((f) => f?.status === "stated")
            .map((f) => ({ label: f.label, value: f.value })),
        }));
      const history = log.slice(-11, -1).map((m) => ({ role: m.role, text: m.text }));
      reply = await api("town-answer", { place: placeName, question, history, stories });
    } catch {}
  }
  if (!reply) {
    await new Promise((r) => setTimeout(r, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700));
    reply = localTownAnswer(question);
  }
  log.push({ role: "assistant", ...reply, question, at: Date.now(), fresh: true });
  townBusy = false;
  saveChats();
  if (page === "place") placePage();
}
// 裏取りの印：文ごとに、挙げた根拠が別々の資料いくつか数える（AIの判断ではなく、引用の数で決まる）
function markCorroboration(text, citations) {
  return String(text).replace(/((?:\[\d+\])+)/g, (group) => {
    const ids = new Set([...group.matchAll(/\[(\d+)\]/g)].map((x) => citations?.[x[1] - 1]?.id ?? "?" + x[1]));
    return group + (ids.size >= 2 ? "\u0001M\u0001" : "");
  });
}
function renderAnswer(m, idx) {
  const body = esc(markCorroboration(m.text, m.citations))
    .replace(/\u0001M\u0001/g, '<span class="corro multi" title="別々の資料が、同じ内容を挙げています">複数の資料で確認</span>')
    .replace(/\n/g, "<br>")
    .replace(
      /\[(\d+)\]/g,
      (_, n) =>
        `<button class="cite" data-msg="${idx}" data-cite="${n - 1}" aria-label="根拠${n}を見る">${n}</button>`,
    );
  // 根拠は回答の下に1行の札で。押すと抜粋が開く（主張の横の番号と同じもの）
  const cites = (m.citations || [])
    .map(
      (c, i) =>
        `<button class="src-chip" data-msg="${idx}" data-cite="${i}"><b>${i + 1}</b>${esc(c.title.replace(/^「|」$/g, ""))}</button>`,
    )
    .join("");
  const citedIds = new Set((m.citations || []).map((c) => c.id));
  // 資料の案内は、根拠に挙げていないものだけ（重複させない）
  const mats = (m.materials || [])
    .filter((s) => !citedIds.has(s.id))
    .map(
      (s) =>
        `<li class="material ${s.fileId ? "has-file" : ""}">${s.fileId ? thumbHtml({ id: s.fileId, kind: s.fileKind }) : ""}<div><span class="material-kind">${esc(s.kind)}</span><strong>${esc(s.title)}</strong><small>${esc(s.where || "")}</small>${s.fileId ? `<button class="text-btn" data-open="${s.fileId}">資料を開く</button>` : ""}</div></li>`,
    )
    .join("");
  const n = (m.citations || []).length;
  return `<div class="msg assistant ${m.fresh ? "is-new" : ""}"><p class="who">${logo(18)}ツギキキ　${n ? `資料${n}件をもとに回答` : "資料に記録がありません"}${m.mode === "experience" ? "（体験用）" : ""}</p><div class="answer"><p class="answer-text">${body}</p>${cites ? `<div class="src-row"><span class="src-label">根拠</span>${cites}</div>` : ""}${mats ? `<div class="answer-materials"><p class="answer-label">こんな資料もあります</p><ul class="material-list">${mats}</ul></div>` : ""}${m.askable ? `<div class="answer-ask"><button class="secondary-btn" data-ask="${idx}">この質問を地域の人に聞く</button><span class="small">語り部への次の聞き取りのテーマになります。</span></div>` : ""}</div></div>`;
}
function contactsHtml(town) {
  if (town)
    return `<ul class="contact-list">${town.contacts.map((c) => `<li><strong>${esc(c.name)}</strong><span>${esc(c.role)}</span><a class="tel" href="tel:${c.tel.replace(/-/g, "")}">${phoneIcon}${esc(c.tel)}</a><small>${esc(c.hours)}</small></li>`).join("")}</ul><p class="small">電話番号はデモ用の架空のものです。</p>`;
  const q = (w) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeName + " " + w)}`;
  return `<p class="small">この町の連絡先は、まだ登録されていません。次の窓口で、町の歴史を教えてもらえることがあります。</p><ul class="contact-list"><li><strong>図書館の郷土資料コーナー</strong><span>町史や古い地図、写真の資料</span><a href="${q("図書館")}" target="_blank" rel="noopener">「${esc(placeName)} 図書館」をGoogleマップで検索</a></li><li><strong>公民館・地区センター</strong><span>地域の行事や語り部の紹介</span><a href="${q("公民館")}" target="_blank" rel="noopener">「${esc(placeName)} 公民館」をGoogleマップで検索</a></li><li><strong>役所の文化財・生涯学習の担当</strong><span>史跡や地名の由来について</span><a href="${q("役所")}" target="_blank" rel="noopener">「${esc(placeName)} 役所」をGoogleマップで検索</a></li></ul><p class="map-note">${esc(placeName)}の周辺を検索します（あなたの現在地ではありません）。</p>`;
}
function placePage() {
  if (!placeName) return go("hub");
  const town = townFor(placeName),
    region = Object.values(regionInfo).find((r) => r.name === placeName),
    log = townChats[placeName] || [],
    stories = placeRequests().filter((r) => r.card),
    uploads = placeMaterials();
  const intro = `<div class="msg assistant"><p class="who">${logo(18)}ツギキキ</p><div class="answer"><p class="answer-text">${esc(placeName)}について、資料と地域の方の語りをもとにお答えします。根拠は番号で示し、わからないことは推測しません。下の質問例からどうぞ。</p></div></div>`;
  const msgs = log
    .map((m, i) =>
      m.role === "user"
        ? `<div class="msg user ${m.fresh ? "is-new" : ""}"><p class="sr-only">あなた</p><p class="bubble">${esc(m.text)}</p></div>`
        : renderAnswer(m, i),
    )
    .join("");
  log.forEach((m) => delete m.fresh);
  const srcCount = (town ? town.sources.length : 0) + uploads.length,
    mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(region ? region.query : placeName)}`,
    suggestions = town ? town.suggestions : [`${placeName}の祭りや行事の段取りは？`, `${placeName}の祭りの準備や当番は？`],
    materialsHtml = `${town || uploads.length ? `<ul class="material-list">${(town ? town.sources : []).map((s) => `<li class="material"><div><span class="material-kind">${esc(s.kind)}</span><strong>${esc(s.title)}</strong><small>${esc(s.where)}</small></div></li>`).join("")}${uploads.map((m) => `<li class="material has-file">${thumbHtml(m)}<div><span class="material-kind">${esc(m.kind)}（住民が登録）</span><strong>${esc(m.title)}</strong><small>${esc(m.era || "年代不明")}・${visLabel(m.visibility)}</small><button class="text-btn" data-open="${m.id}">開く</button></div></li>`).join("")}</ul>` : '<p class="small">まだ登録されていません。</p>'}${stories.length ? `<p class="answer-label">地域の方の語り（確認済み）</p><ul class="story-list">${stories.map((r) => `<li><button class="story" data-request="${r.id}"><span class="story-q">${esc(r.card.title)}</span><span class="story-meta">${esc(r.speaker)}</span></button></li>`).join("")}</ul>` : ""}`;
  const tab = (id, label) => `<button role="tab" class="seg" data-tab="${id}" aria-selected="${townTab === id}">${label}</button>`;
  shell(
    `<div class="town"><section class="town-band">${lanterns(3, 300, "band-lanterns")}<div class="band-text"><span class="band-kicker">町の記録</span><h1>${esc(placeName)}</h1><span class="band-sub">${town ? town.note : region ? region.position : "地域の記録"}　資料${srcCount}件・確認済みの語り${stories.length}件</span></div><div class="band-actions"><a class="band-btn" href="${mapUrl}" target="_blank" rel="noopener">地図で見る</a></div></section><div class="seg-tabs town-tabs" role="tablist" aria-label="表示">${tab("chat", "聞く")}${tab("contacts", "連絡先")}${tab("materials", "資料")}</div><div class="town-layout" data-view="${townTab}"><section class="town-chat chat" aria-label="${esc(placeName)}について聞く"><div class="chat-log" aria-live="polite">${intro}${msgs}${townBusy ? '<div class="msg assistant is-new"><p class="typing" role="status"><span></span><span></span><span></span>資料を調べています</p></div>' : ""}</div><form class="chat-bottom" id="town-form"><div class="suggest">${suggestions.map((x) => `<button type="button" class="suggest-chip" data-suggest="${esc(x)}">${esc(x)}</button>`).join("")}</div><div class="composer"><label class="sr-only" for="town-q">祭りや行事について聞きたいこと</label><textarea id="town-q" rows="1" maxlength="1000" placeholder="町について聞きたいこと" ${townBusy ? "disabled" : ""}>${esc(placeDraft)}</textarea><button type="button" class="round" id="dictate" aria-label="声で入力する">${icon("mic")}</button><button class="round primary" aria-label="質問する" ${townBusy ? "disabled" : ""}>${icon("send")}</button></div></form></section><div class="town-side" role="complementary" aria-label="${esc(placeName)}の情報"><div class="seg-tabs side-tabs" role="tablist" aria-label="町の情報"><button role="tab" class="seg" data-tab="contacts" aria-selected="${townTab !== "materials"}">直接たずねる</button><button role="tab" class="seg" data-tab="materials" aria-selected="${townTab === "materials"}">この町の資料</button></div><section class="side-panel panel-contacts" id="contacts" aria-label="直接たずねる">${contactsHtml(town)}</section><section class="side-panel panel-materials" aria-label="この町の資料">${materialsHtml}</section></div></div></div>`,
  );
  document.querySelectorAll("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        townTab = b.dataset.tab;
        $(".town-layout").dataset.view = townTab;
        document.querySelectorAll("[data-tab]").forEach((x) => {
          const on = x.dataset.tab === townTab || (x.closest(".side-tabs") && x.dataset.tab === "contacts" && townTab === "chat");
          x.setAttribute("aria-selected", String(on));
        });
      }),
  );
  document.querySelectorAll(".side-tabs [data-tab='contacts']").forEach((x) => x.setAttribute("aria-selected", String(townTab !== "materials")));
  const logEl = $(".chat-log"),
    lastQ = [...logEl.querySelectorAll(".msg.user")].at(-1);
  logEl.scrollTop = lastQ ? lastQ.offsetTop - 12 : 0;
  $("#dictate").onclick = () => dictate($("#town-q"));
  $("#town-q").oninput = (e) => (placeDraft = e.target.value);
  $("#town-q").onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      $("#town-form").requestSubmit();
    }
  };
  $("#town-form").onsubmit = (e) => {
    e.preventDefault();
    const q = $("#town-q").value.trim();
    if (!q || townBusy) return;
    placeDraft = "";
    askTown(q);
  };
  document.querySelectorAll("[data-suggest]").forEach((b) => (b.onclick = () => !townBusy && askTown(b.dataset.suggest)));
  document.querySelectorAll("[data-cite]").forEach(
    (b) =>
      (b.onclick = () => {
        const c = log[b.dataset.msg]?.citations?.[b.dataset.cite];
        if (!c) return;
        modal(
          `<h2>根拠 ${Number(b.dataset.cite) + 1}</h2><p><strong>${esc(c.title)}</strong><br>${esc(c.author)}　${esc(c.year)}　${esc(c.kind)}</p><blockquote class="source-quote">${esc(c.excerpt || "抜粋は登録されていません").replace(/\n/g, "<br>")}</blockquote>${c.where ? `<p class="small">${esc(c.where)}</p>` : ""}${c.fileId ? (c.fileKind === "写真" ? `<img class="cite-photo" data-thumb="${c.fileId}" alt="${esc(c.title)}">` : `<p><button class="secondary-btn" data-open="${c.fileId}">資料を開く</button></p>`) : ""}${c.url ? `<p><a href="${esc(c.url)}" target="_blank" rel="noopener">資料を開く</a></p>` : ""}<div class="dialog-actions">${c.requestId ? `<button class="secondary-btn" id="open-card">語りの手引きを見る</button>` : ""}<button class="primary-btn" data-close>閉じる</button></div>`,
          (d) => {
            fillThumbs(d);
            d.querySelector("[data-open]")?.addEventListener("click", (e) => openMaterial(e.target.dataset.open));
            $("#open-card")?.addEventListener("click", () => {
              $("#dialog").close();
              active = c.requestId;
              go("review");
            });
          },
        );
      }),
  );
  document.querySelectorAll("[data-ask]").forEach(
    (b) =>
      (b.onclick = () => {
        const m = log[b.dataset.ask];
        const fictional = /青葉/.test(placeName);
        const same = state.requests.find((x) => x.status !== "confirmed" && x.question === m.question && x.place === placeName);
        if (same) {
          active = same.id;
          m.askable = false;
          m.asked = true;
          saveChats();
          toast("地域の人への質問として残っています。");
          return go("request");
        }
        const r = create(m.question, false, fictional ? DEMO.event : placeName, fictional ? DEMO.task : "町の歴史・暮らし");
        if (!r) return;
        r.place = placeName;
        m.askable = false;
        m.asked = true;
        save();
        saveChats();
        toast("地域の人への質問として残しました。");
        go("request");
      }),
  );
  fillThumbs();
  document.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => openMaterial(b.dataset.open)));
  if (pendingAsk && !townBusy) {
    const q = pendingAsk;
    pendingAsk = "";
    askTown(q);
  }
}
function create(question, sample = false, event = DEMO.event, task = DEMO.task, speaker = "") {
  try {
    if (state.requests.length >= 40) throw Error("この端末では40件まで保存できます。記録を書き出してチームにご相談ください。");
    const r = validateRequest({ question, sampleData: sample, event, task, speaker: speaker || DEMO.speaker });
    state.requests.unshift(r);
    active = r.id;
    save();
    return r;
  } catch (e) {
    toast(e.message);
    return null;
  }
}
function stepper(n) {
  const names = ["聞きたいこと", "話を聞く", "確かめて残す"];
  return `<ol class="stepper" aria-label="聞き取りの流れ">${names.map((x, i) => `<li ${i + 1 === n ? 'aria-current="step"' : ""} class="${i + 1 < n ? "done" : ""}"><span>${i + 1}</span>${x}</li>`).join("")}</ol>`;
}
function requestPage() {
  const r = current();
  if (!r) return go("hub");
  shell(
    `<section class="page-header">${stepper(1)}<h1>経験者に聞く準備ができました。</h1><p>本番では、地域の協力者と一緒に聞き取りを始めます。</p></section><div class="review-layout"><article class="paper-card"><p class="meta">${esc(r.event)} / ${esc(r.task)}</p><h2>${esc(r.question)}</h2><p class="small">この質問を出発点に、場所・段取り・その理由を聞き取ります。分からないことは「未確認」として残します。</p><div class="dialog-actions"><button class="primary-btn" id="begin">経験者に聞く</button></div></article><section class="side-card"><h3>今回のデモ</h3><p class="small">架空の地域で流れを試せます。語り手はあなたが演じるか、用意した台詞を入力してください。実際に送信・依頼する機能はありません。</p></section></div>`,
  );
  $("#begin").onclick = beginInterview;
}
function turn(role, text) {
  return { id: crypto.randomUUID(), role, text, at: new Date().toISOString() };
}
function beginInterview() {
  if (busy) return;
  stopLive();
  let r = current();
  if (!r) return;
  const previous = r.card,
    nextQuestion = takeNextQuestion(r);
  r.status = "interview";
  if (nextQuestion)
    r.turns.push(turn("assistant", "次の担い手から追加の質問です。「" + nextQuestion + "」について教えていただけますか？"));
  else if (!r.turns.length) r.turns.push(turn("assistant", localFollowup(r, [])));
  else if (previous)
    r.turns.push(
      turn(
        "assistant",
        `前回は「${previous.title}」のお話を伺いました。${
          FACTS.filter(([k]) => previous.facts[k].status === "unknown")
            .map(([, l]) => l)
            .join("・") || "その後の変更"
        }について、続けて教えていただけますか？`,
      ),
    );
  r.metrics.interviewStartedAt ||= Date.now();
  save();
  go("interview");
}
function requestSide(r) {
  return `<div class="review-sidebar"><section class="side-card"><h3>届いている質問</h3><p class="request-quote">${esc(r.currentQuestion || r.question)}</p><p class="meta">${esc(r.event)}<br>${esc(r.task)}</p><hr><label>話す人<input id="speaker" class="field" value="${esc(r.speaker)}"></label><p class="hint">「いつもの場所」も、初めての人に伝わる名前に。知らないことは、知らないままで大丈夫です。</p></section><section class="side-card"><h3>資料を添える<span class="count">${(r.materials || []).length}</span></h3><p class="small">お話に関係する文献のPDFや、昔の写真を一緒に残せます。</p><button type="button" class="secondary-btn" data-page="materials">PDF・写真を登録する</button></section></div>`;
}
function interview() {
  const r = current();
  if (!r) return go("hub");
  const composerHtml = `<div class="composer"><label class="sr-only" for="utterance">お話を入力</label><textarea id="utterance" placeholder="ここに入力してください" required maxlength="8000"></textarea><button type="button" class="round" id="dictate" aria-label="声でお話を入力">${icon("mic")}</button><button class="round primary" ${busy ? "disabled" : ""} aria-label="お話を伝える">${icon("send")}</button></div><div class="inline-actions"><button type="button" class="text-btn" id="sample">架空の台詞を入力</button></div>`;
  shell(
    `<section class="page-header">${stepper(2)}<h1>いつもの言葉で、教えてください。</h1><p>下書きを作ったあとに、内容を一緒に確認できます。</p></section><div class="work-layout">${requestSide(r)}<section class="chat"><header class="chat-top"><h2>${esc(r.speaker)}のお話</h2><small>${config.aiReady ? "Gemini" : "体験用の聞き役"}</small></header><div class="chat-log" aria-live="polite">${r.turns.map((t) => `<div class="msg ${t.role}"><p class="who">${t.role === "user" ? esc(r.speaker) : "ツギキキ"}</p><p class="bubble">${esc(t.text)}</p></div>`).join("")}</div><div id="live-status"></div><form class="chat-bottom" id="talk-form">${
      config.aiReady
        ? `<div class="voice-hero"><button type="button" class="voice-btn" id="live" aria-label="声で話しかける">${icon("mic")}</button><p class="voice-title">押して、話しかける</p><p class="voice-note">最大5分。声は保存せず、文字にして記録します。</p></div><div class="voice-secondary"><button type="button" class="secondary-btn" id="show-text" aria-expanded="false" aria-controls="text-entry">文字で入力する</button><button type="button" class="secondary-btn" id="finish" ${busy ? "disabled" : ""}>手引きの下書きを作る</button></div><div id="text-entry" class="text-entry" hidden>${composerHtml}</div>`
        : `${composerHtml}<div class="inline-actions"><button type="button" class="secondary-btn" id="finish" ${busy ? "disabled" : ""}>手引きの下書きを作る</button></div>`
    }</form></section></div>`,
  );
  $("#speaker").onchange = (e) => {
    r.speaker = e.target.value;
    save();
  };
  $(".chat-log").scrollTop = $(".chat-log").scrollHeight;
  $("#talk-form").onsubmit = async (e) => {
    e.preventDefault();
    await say($("#utterance").value);
  };
  $("#dictate").onclick = () => dictate($("#utterance"));
  $("#show-text")?.addEventListener("click", (e) => {
    const box = $("#text-entry"),
      open = box.hidden;
    box.hidden = !open;
    e.currentTarget.setAttribute("aria-expanded", String(open));
    if (open) $("#utterance").focus();
  });
  $("#sample").onclick = () => {
    const n = r.turns.filter((t) => t.role === "user").length;
    $("#utterance").value = DEMO.lines[n % DEMO.lines.length];
    r.sampleData = true;
    toast("架空の台詞です。「お話を伝える」で入力できます。");
  };
  $("#finish").onclick = finish;
  $("#live")?.addEventListener("click", startLive);
}
async function say(text) {
  if (liveAbort) return toast("音声会話を終了してから入力してください。");
  if (busy || !text.trim()) return;
  const r = current();
  r.turns.push(turn("user", text.trim()));
  busy = true;
  save();
  render();
  try {
    const response = config.aiReady
      ? await api("followup", {
          request: { question: r.currentQuestion || r.question, event: r.event, task: r.task },
          turns: r.turns,
          previousCard: r.card || null,
        })
      : { text: localFollowup(r, r.turns) };
    r.turns.push(turn("assistant", response.text));
    if (response.usage) r.metrics.lastUsage = response.usage;
    save();
  } catch (e) {
    toast(e.message);
  } finally {
    busy = false;
    render();
  }
}
async function finish() {
  if (liveAbort) {
    stopLive();
    toast("音声会話を終了しました。内容を確認してから下書きを作ってください。");
    return;
  }
  const r = current();
  if (!r.turns.some((t) => t.role === "user")) return toast("まず、語り手のお話をひとつ入力してください。");
  if (busy) return;
  busy = true;
  render();
  try {
    const out = config.aiReady
      ? await api("card", { request: { event: r.event, task: r.task, question: r.question }, turns: r.turns })
      : { card: localCard(r.turns) };
    r.draft = out.card;
    delete r.reviewValues;
    if (!out.card.title || out.card.title === "雨の日の提灯準備") r.draft.title = r.task + "の手引き";
    r.status = "draft";
    r.metrics.reviewStartedAt = Date.now();
    save();
    page = "review";
  } catch (e) {
    toast(e.message);
  } finally {
    busy = false;
    render();
  }
}
function review() {
  const r = current();
  if (!r) return go("hub");
  const draft = r.status !== "confirmed",
    c = draft ? r.draft : r.card;
  if (!c) return go("request");
  const unknown = FACTS.filter(([k]) => c.facts[k].status === "unknown");
  shell(
    `<section class="page-header">${stepper(3)}<h1>${draft ? "この内容で、伝わりますか？" : "次の準備で、また使える。"}</h1><p>${draft ? "元のお話を確かめながら、必要なら書き直してください。" : "質問から聞き取った内容を、出どころと一緒に残しました。"}</p></section><div class="review-layout"><article class="paper-card"><p class="meta">${esc(r.event)}／${esc(r.speaker)}</p><h2>${esc(c.title)}</h2>${draft ? "" : '<p class="verified">語り手と確認済み</p><br>'}<div class="facts">${FACTS.map(
      ([k, label]) => {
        const f = c.facts[k];
        return `<section class="fact"><label class="fact-label" for="fact-${k}">${label}${f.status === "unknown" ? "<span>未確認</span>" : ""}</label>${draft ? `<textarea class="field" id="fact-${k}">${esc(r.reviewValues?.[k] ?? f.value)}</textarea>` : `<p class="fact-value ${f.status === "unknown" ? "unknown" : ""}">${esc(f.value)}</p>`}</section>`;
      },
    ).join(
      "",
    )}</div></article><div class="review-sidebar"><section class="side-card"><h3>${draft ? "確認して残す" : "この手引きを使う"}</h3>${draft ? `<p class="small">人名・時刻・条件を確認してください。修正した内容も、確認時の追記として残ります。</p><label class="check"><input type="checkbox" id="confirm">語り手と内容を確認しました。未確認の項目は、そのまま残します。</label><button class="primary-btn full" id="save-card">確認して残す</button>` : `<p class="small">${new Date(c.confirmedAt).toLocaleDateString("ja-JP")} に確認<br>${r.sampleData ? "架空データでの体験です。" : ""}</p><div class="settings-buttons"><button class="primary-btn" id="ask-memory">この記憶に聞く</button><button class="secondary-btn" id="print">印刷・PDFにする</button><button class="secondary-btn" id="measure">探しやすさを測る</button></div>`}</section><section class="side-card"><h3>次に聞きたいこと</h3>${unknown.length ? `<ul class="unknown-list">${unknown.map(([, l]) => `<li>${l}</li>`).join("")}</ul>` : '<p class="small">今回の6項目はお話が揃いました。実施前に変更がないか確かめましょう。</p>'}<button class="text-btn" id="resume">前回の続きから話を聞く</button></section></div></div>`,
  );
  if (draft)
    for (const [k] of FACTS) {
      $("#fact-" + k).oninput = (e) => {
        r.reviewValues ||= {};
        r.reviewValues[k] = e.target.value;
        localStorage.setItem(key, JSON.stringify(state));
      };
      $("#fact-" + k).onchange = save;
    }
  $("#resume").onclick = beginInterview;
  $("#save-card")?.addEventListener("click", () => {
    try {
      const values = Object.fromEntries(FACTS.map(([k]) => [k, $("#fact-" + k).value]));
      const reviewed = confirmDraft(r, c, values, $("#confirm").checked);
      r.turns = reviewed.turns;
      r.card = reviewed.card;
      delete r.reviewValues;
      r.status = "confirmed";
      r.metrics.reviewSeconds = Math.round((Date.now() - r.metrics.reviewStartedAt) / 1000);
      r.metrics.corrections = reviewed.corrections;
      save();
      render();
      toast("確認した手引きを残しました。");
    } catch (error) {
      toast(error.message);
    }
  });
  $("#ask-memory")?.addEventListener("click", () => go("knowledge"));
  $("#print")?.addEventListener("click", () => print());
  $("#measure")?.addEventListener("click", measurementSetup);
}
function knowledge() {
  const r = current();
  if (!r?.card) return go("hub");
  shell(
    `<section class="page-header"><h1>あの人の経験に、いつでも聞ける。</h1><p>${esc(r.speaker)}が確認したお話から答えます。本人の代わりに判断することはできません。</p></section><section class="knowledge paper-card"><div id="memory-log"><p class="source-quote">${esc(r.task)}について、知りたいことはありますか？</p></div><form id="memory-form" class="composer"><label class="sr-only" for="memory-question">記憶に聞きたいこと</label><textarea id="memory-question" required placeholder="雨の日はどこで準備するの？"></textarea><button class="round primary" aria-label="記憶に質問する">${icon("send")}</button></form><button class="text-btn" id="back-card">確認済みの手引きを見る</button></section>`,
  );
  $("#back-card").onclick = () => go("review");
  $("#memory-form").onsubmit = async (e) => {
    e.preventDefault();
    const q = $("#memory-question").value.trim();
    if (!q) return;
    const button = $("#memory-form button");
    button.disabled = true;
    busy = true;
    try {
      const result = config.aiReady
        ? await api("answer", { question: q, card: r.card })
        : { keys: answerKeys(q, r.card) };
      const keys = result.keys || [];
      const log = $("#memory-log");
      const queueId = "queue-" + crypto.randomUUID();
      log.insertAdjacentHTML("beforeend", `<p class="memory-q">${esc(q)}</p>${keys.length ? keys.map((k) => `<section class="memory-a"><p class="fact-label">${esc(r.card.facts[k].label)}</p><p class="fact-value">${esc(r.card.facts[k].value)}</p><blockquote class="small">${r.card.facts[k].sourceIds.map((id) => esc(r.turns.find((t) => t.id === id)?.text || "")).join("<br>")}</blockquote></section>`).join("") : `<p class="source-quote">そのことは、まだ記録されていません。次の聞き取りで確認しましょう。</p><button class="secondary-btn" id="${queueId}">この質問を次の聞き取りへ</button>`}`);
      $("#memory-question").value = "";
      $("#" + queueId)?.addEventListener("click", () => {
        queueQuestion(r, q);
        save();
        toast("次の聞き取りに質問を残しました。");
        $("#" + queueId).disabled = true;
      });
    } catch (err) {
      toast(err.message);
    } finally {
      busy = false;
      button.disabled = false;
    }
  };
}
function dictate(target) {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) return toast("このブラウザでは音声入力を利用できません。文字で入力できます。");
  const r = new Speech();
  r.lang = "ja-JP";
  r.interimResults = false;
  r.onresult = (e) => {
    target.value += (target.value ? "\n" : "") + e.results[0][0].transcript;
    target.focus();
  };
  r.onerror = () => toast("音声を取得できませんでした。マイクの許可を確認してください。");
  r.start();
  toast("お話しください。音声認識はブラウザの機能を利用します。");
}
let liveTick = null,
  liveEndsAt = 0;
async function startLive() {
  if (busy || liveAbort) return;
  const controller = new AbortController();
  liveAbort = controller;
  const r = current();
  try {
    const { startConversation } = await import("./live.js");
    if (controller.signal.aborted) return;
    $("#live").disabled = true;
    await startConversation({
      signal: controller.signal,
      getToken: () => api("live-token", {}),
      request: r,
      onTurn: (role, text) => {
        r.turns.push(turn(role, text));
        save();
        const p = document.createElement("div");
        p.className = "msg " + role;
        p.innerHTML = `<p class="who">${role === "user" ? esc(r.speaker) : "ツギキキ"}</p><p class="bubble">${esc(text)}</p>`;
        $(".chat-log")?.append(p);
        if ($(".chat-log")) $(".chat-log").scrollTop = $(".chat-log").scrollHeight;
      },
      onStatus: (text, stop) => {
        const n = $("#live-status");
        if (!n) return;
        const waiting = /準備/.test(text);
        $("#talk-form")?.classList.add("is-live");
        n.className = "live-panel";
        n.innerHTML = `<p class="live-title"><span class="live-dot" aria-hidden="true"></span>${waiting ? "つなげています" : "聞いています"}</p><div class="live-wave" aria-hidden="true">${"<span></span>".repeat(11)}</div><p class="live-note" role="status">${esc(text)}${waiting ? "" : ' 残り <b id="live-left"></b>'}</p>`;
        if (!waiting) {
          liveEndsAt ||= Date.now() + 300000;
          const left = () => {
            const sec = Math.max(0, Math.round((liveEndsAt - Date.now()) / 1000)),
              el = $("#live-left");
            if (el) el.textContent = `${Math.floor(sec / 60)}分${String(sec % 60).padStart(2, "0")}秒`;
          };
          left();
          clearInterval(liveTick);
          liveTick = setInterval(left, 1000);
        }
        if (stop) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "live-stop";
          b.textContent = "会話を終了する";
          b.onclick = stop;
          n.append(b);
        }
      },
      onEnd: (error) => {
        clearInterval(liveTick);
        liveEndsAt = 0;
        if (liveAbort === controller) liveAbort = null;
        render();
        if (error) toast(error);
      },
    });
  } catch (error) {
    if (liveAbort === controller) liveAbort = null;
    render();
    toast(error.message);
  }
}
const regionInfo = {
  tohoku: {
    name: "東北の里山",
    image: "satoyama",
    query: "東北地方",
    hint: "山あいの田畑と、雪の季節を越えて受け継がれてきた祭りのある暮らし。",
    position: "日本の北東部",
    topic: "祭りや雪国の暮らし",
    tags: { env: ["mountain"], values: ["festival", "food", "quiet"], words: /山|田舎|里|雪|東北|田んぼ|農/ },
  },
  kansai: {
    name: "関西の町並み",
    image: "kansai",
    query: "関西地方",
    hint: "古い通りと商店街、人が集まる場所の記憶が残る町なかの暮らし。",
    position: "本州の中西部",
    topic: "商店街や町の行事",
    tags: { env: ["town"], values: ["trade", "festival", "family"], words: /町並み|商い|商店|関西|京都|大阪|通り/ },
  },
  setouchi: {
    name: "瀬戸内の海辺",
    image: "setouchi",
    query: "瀬戸内海",
    hint: "港と島をつなぐ船、漁や海の恵みとともにある穏やかな日常。",
    position: "本州・四国・九州に囲まれた海域",
    topic: "海辺の日常や島の記憶",
    tags: { env: ["sea"], values: ["food", "quiet", "family"], words: /海|島|港|瀬戸内|漁|船/ },
  },
};
const answerLabel = (key, v) => hearingSteps.find((s) => s.key === key).options.find(([x]) => x === v)?.[1];
function matchRegions() {
  return Object.entries(regionInfo)
    .map(([k, r]) => {
      const reasons = [];
      if (r.tags.env.includes(hearing.env)) reasons.push(answerLabel("env", hearing.env));
      for (const v of hearing.values) if (r.tags.values.includes(v)) reasons.push(answerLabel("values", v));
      if (hearing.area === k) reasons.push(answerLabel("area", k) + "方面");
      if (hearing.note && r.tags.words.test(hearing.note)) reasons.push("書いてくださった希望");
      const blocked = hearing.area && !["any", "other", k].includes(hearing.area);
      return { k, r, reasons, score: blocked ? -1 : reasons.length };
    })
    .sort((a, b) => b.score - a.score);
}
// AIが候補を並べ直した結果。答えが変わったら取り直す（失敗したら簡単な振り分けのまま）
let aiRegions = { sig: "", data: null };
function askAiRegions(sig, answers) {
  aiRegions = { sig, data: null };
  const candidates = Object.entries(regionInfo).map(([id, r]) => ({ id, name: r.name, hint: r.hint, topic: r.topic, position: r.position }));
  api("regions", { candidates, answers })
    .then((out) => {
      if (aiRegions.sig !== sig) return;
      aiRegions.data = out.regions;
      if (page === "regions") regions();
    })
    .catch(() => {
      if (aiRegions.sig === sig) aiRegions.data = [];
      if (page === "regions") regions();
    });
}
function regions() {
  const answered = [
    answerLabel("env", hearing.env),
    ...hearing.values.map((v) => answerLabel("values", v)),
    hearing.area ? answerLabel("area", hearing.area) : "",
    ...(hearing.texts || []),
  ].filter(Boolean);
  let list = matchRegions();
  const sig = JSON.stringify(hearing);
  if (config.aiReady && aiRegions.sig !== sig) askAiRegions(sig, [...answered, hearing.note].filter(Boolean));
  const ai = config.aiReady && aiRegions.sig === sig ? aiRegions.data : null,
    aiWaiting = config.aiReady && aiRegions.sig === sig && !ai,
    aiUsed = Boolean(ai?.length);
  if (aiUsed) {
    const local = Object.fromEntries(list.map((x) => [x.k, x]));
    list = ai
      .filter((a) => local[a.id])
      .map((a) => ({ ...local[a.id], reasons: a.reasons.length ? a.reasons : local[a.id].reasons, score: a.fit && local[a.id].score >= 0 ? 1 : local[a.id].score < 0 ? -1 : 0 }));
  }
  const fits = list.filter((x) => x.score > 0),
    shown = fits.length ? fits : list.filter((x) => x.score >= 0);
  shell(
    `<section class="hero hero-small"><h1>合いそうな地域の候補</h1><p class="lead">${answered.length ? `「${answered.map(esc).join("」「")}」をもとに選びました。` : "お答えをもとに選びました。"}${fits.length ? "" : "ぴったり合う候補がなかったため、登録済みの地域をすべて表示しています。"}</p><button class="text-btn" data-page="welcome" id="redo">答えを変える</button></section><form class="refine" id="refine-form"><label class="label" for="refine">条件を書き足して、探し直す</label><div class="free"><input class="field" id="refine" autocomplete="off" maxlength="300" placeholder="例：港町で、漁の祭りが残っているところ" required><button class="secondary-btn">探し直す</button></div></form>${hearing.area === "other" ? '<p class="notice">「そのほか」の方面は、まだ地域の記録がありません。取材が進んだら候補に加わります。</p>' : ""}<div class="region-grid">${shown
      .map(
        ({ k, r, reasons }) =>
          `<article class="region-card"><figure class="region-photo"><img src="images/${r.image}.jpg" alt="${r.name}の風景イメージ" loading="lazy" width="640" height="427"><figcaption>AIで作った風景イメージ</figcaption></figure><div class="region-body"><p class="meta">${r.position}</p><h2>${r.name}</h2><p>${r.hint}</p>${reasons.length ? `<p class="reasons"><span>合う点</span>${reasons.map((x) => `<em>${esc(x)}</em>`).join("")}</p>` : ""}<div class="region-links"><button class="primary-btn" data-region="${k}">この地域の話を見る</button><a class="text-btn" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.query)}" target="_blank" rel="noopener">地図で見る</a></div></div></article>`,
      )
      .join(
        "",
      )}</div><p class="small region-note">${aiUsed ? "候補は、登録済みの地域の中からAIがお答えをもとに並べました。" : aiWaiting ? "AIが候補を見直しています…" : "候補は体験用の簡単な振り分けです。"}写真は実在の特定の町や語り手を紹介するものではありません。</p>`,
  );
  $("#redo").onclick = () => go("welcome");
  $("#refine-form").onsubmit = (e) => {
    e.preventDefault();
    const v = $("#refine").value.trim();
    if (!v) return;
    hearing.texts = [...(hearing.texts || []), v];
    hearing.note = [hearing.note, v].filter(Boolean).join("\n");
    regions();
    toast("書き足した条件で、候補を探し直しました。");
  };
  document.querySelectorAll("[data-region]").forEach(
    (b) => (b.onclick = () => openPlace(regionInfo[b.dataset.region].name)),
  );
}
function settings() {
  modal(
    `<h2>会話と保存の設定</h2><p>${config.aiReady ? "Google AIの接続設定があります。利用時の通信で接続を確認します。" : "Google AIは未接続です。体験モードでは、この端末で流れを試せます。"}<br>保存：${esc(saveMessage)}</p>${config.requiresCode ? '<label>チームのデモアクセスコード<input class="field" type="password" id="access" autocomplete="off"></label><button class="secondary-btn" id="set-access">接続する</button>' : ""}<details class="settings-group"><summary>検証と記録</summary><div class="settings-buttons"><button class="secondary-btn" id="metrics">測定結果を見る</button><button class="secondary-btn" id="export-json">記録を保存</button><button class="secondary-btn" id="export-csv">測定CSVを保存</button></div><p>測定は実際に操作した結果だけ記録します。架空データ・チーム内テストも区別します。</p></details><div class="dialog-actions"><button class="secondary-btn" data-close>閉じる</button></div>`,
    () => {
      $("#metrics").onclick = () => {
        $("#dialog").close();
        go("metrics");
      };
      $("#export-json").onclick = () =>
        download("ツギキキ_記録.json", JSON.stringify(state, null, 2), "application/json");
      $("#export-csv").onclick = exportCSV;
      $("#set-access")?.addEventListener("click", async () => {
        code = $("#access").value;
        sessionStorage.setItem("tsugite-access", code);
        try {
          await api("workspace/" + wid);
          save();
          toast("接続を確認しました。");
        } catch (e) {
          toast(e.message);
        }
      });
    },
  );
}
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportCSV() {
  const cols = [
    "id",
    "participant",
    "role",
    "condition",
    "seconds",
    "score",
    "criticalErrors",
    "reviewed",
    "sampleData",
  ];
  const rows = state.measurements.map((m) =>
    cols.map((k) => '"' + String(m[k] ?? "").replaceAll('"', '""') + '"').join(","),
  );
  download("ツギキキ_測定.csv", "\uFEFF" + cols.join(",") + "\n" + rows.join("\n"), "text/csv;charset=utf-8");
}
function measurementSetup() {
  const r = current();
  if (!r?.card) return toast("先に手引きを確認してください。");
  modal(
    `<h2>探しやすさを測る</h2><p>4つの質問に答える時間と正答数を測ります。比較は別の協力者、または出題順を変えて行ってください。同じ内容の2回目は記憶の影響を受けます。</p><label>参加者の記号<input class="field" id="participant" placeholder="P01（実名は不要）"></label><label>協力者の区分<select class="field" id="participant-role"><option value="team">チーム内テスト</option><option value="stakeholder">実際の行事の担い手</option></select></label><label>見るもの<select class="field" id="condition"><option value="transcript">聞き取りの全文</option><option value="card">確認済みの手引き</option></select></label><div class="dialog-actions"><button class="secondary-btn" data-close>戻る</button><button class="primary-btn" id="start-test">計測を始める</button></div>`,
    () => {
      $("#start-test").onclick = () => {
        if (!$("#participant").value.trim()) return toast("参加者の記号を入力してください。");
        test = {
          id: crypto.randomUUID(),
          requestId: r.id,
          participant: $("#participant").value.trim(),
          role: $("#participant-role").value,
          condition: $("#condition").value,
          startedAt: Date.now(),
          sampleData: r.sampleData,
        };
        $("#dialog").close();
        go("test");
      };
    },
  );
}
function testPage() {
  const r = current();
  shell(
    `<section class="page-header"><h1>資料を見て、4つの質問に答えてください。</h1><p>分からない場合は「未確認」で構いません。回答を提出するまでの時間を測ります。</p></section><div class="test-layout"><section class="paper-card test-source"><h2>${test.condition === "card" ? "確認済みの手引き" : "聞き取りの全文"}</h2>${test.condition === "card" ? FACTS.map(([k, l]) => `<div class="fact"><p class="fact-label">${l}</p><p class="fact-value">${esc(r.card.facts[k].value)}</p></div>`).join("") : r.turns.map((t) => `<p class="small">${t.role === "user" ? esc(r.speaker) : "聞き役"}</p><p class="source-quote">${esc(t.text)}</p>`).join("")}</section><form class="paper-card" id="answers">${[
      ["when", "何時に集まりますか？"],
      ["where", "雨の日は、どこで準備しますか？"],
      ["why", "その場所で準備するのはなぜですか？"],
      ["contact", "外につるすか迷ったら、誰に確認しますか？"],
    ]
      .map(
        ([k, l]) =>
          `<div class="test-question"><label for="answer-${k}">${l}</label><textarea class="field" id="answer-${k}" required></textarea></div>`,
      )
      .join("")}<button class="primary-btn full">回答を提出して計測を止める</button></form></div>`,
  );
  $("#answers").onsubmit = (e) => {
    e.preventDefault();
    const answers = Object.fromEntries(
      ["when", "where", "why", "contact"].map((k) => [k, $("#answer-" + k).value]),
    );
    const m = {
      ...test,
      seconds: Math.round((Date.now() - test.startedAt) / 1000),
      answers: assessAnswers(r.card, answers),
      reviewed: false,
      createdAt: new Date().toISOString(),
    };
    state.measurements.push(m);
    save();
    test = null;
    go("metrics");
    score(m);
  };
}
function score(m) {
  modal(
    `<h2>回答を人が確認する</h2><p>元の手引きと照らして採点します。未確認を断定した場合も、誤りとして扱ってください。</p>${m.answers.map((a, i) => `<label>${esc(a.label)}</label><p>期待する内容：${esc(a.expected)}<br>回答：${esc(a.answer)}</p><select class="field" id="score-${i}"><option value="">採点してください</option><option value="1">正しい</option><option value="0">誤り・不足</option></select>`).join("")}<label>安全や当日の実施に影響する誤りの数<input class="field" id="critical" type="number" min="0" max="4" value="0"></label><div class="dialog-actions"><button class="secondary-btn" data-close>後で採点</button><button class="primary-btn" id="score-save">採点を保存</button></div>`,
    () => {
      $("#score-save").onclick = () => {
        const scores = m.answers.map((_, i) => $("#score-" + i).value);
        if (scores.some((x) => x === "")) return toast("4問とも採点してください。");
        m.score = scores.reduce((n, x) => n + Number(x), 0);
        m.criticalErrors = Number($("#critical").value);
        m.reviewed = true;
        save();
        $("#dialog").close();
        render();
      };
    },
  );
}
function median(values) {
  if (!values.length) return "—";
  const v = values.toSorted((a, b) => a - b),
    n = v.length;
  return Math.round(n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) + "秒";
}
function metrics() {
  const m = state.measurements,
    confirmed = state.requests.filter((r) => r.status === "confirmed");
  shell(
    `<section class="page-header"><h1>次の担い手が、使えるか。</h1><p>数値が空欄なのは、まだ測っていないためです。チーム内テストと当事者テストは分けて判断します。</p></section><section class="metrics"><div class="metric-row"><article class="metric-tile"><span>全文から探す時間・中央値</span><strong>${median(m.filter((x) => x.condition === "transcript").map((x) => x.seconds))}</strong><span>${m.filter((x) => x.condition === "transcript").length}件</span></article><article class="metric-tile"><span>手引きから探す時間・中央値</span><strong>${median(m.filter((x) => x.condition === "card").map((x) => x.seconds))}</strong><span>${m.filter((x) => x.condition === "card").length}件</span></article><article class="metric-tile"><span>語り手の確認時間・中央値</span><strong>${median(confirmed.map((r) => r.metrics.reviewSeconds))}</strong><span>${confirmed.length}件・修正合計${confirmed.reduce((n, r) => n + (r.metrics.corrections || 0), 0)}項目</span></article></div><div class="metric-controls"><button class="secondary-btn" id="new-test">この手引きで計測する</button><button class="text-btn" id="csv">測定CSVを保存</button></div><div class="table-wrap"><table><thead><tr><th>参加者</th><th>区分</th><th>資料</th><th>時間</th><th>正答</th><th>影響する誤り</th><th>内容</th><th>採点</th></tr></thead><tbody>${m.map((x) => `<tr><td>${esc(x.participant)}</td><td>${x.role === "team" ? "チーム内" : "当事者"}</td><td>${x.condition === "card" ? "手引き" : "全文"}</td><td>${x.seconds}秒</td><td>${x.reviewed ? x.score + "/4" : "未採点"}</td><td>${x.reviewed ? x.criticalErrors : "—"}</td><td>${x.sampleData ? "架空データ" : "入力データ"}</td><td><button class="text-btn" data-score="${x.id}">確認する</button></td></tr>`).join("") || '<tr><td colspan="8" class="empty">測定結果はまだありません。</td></tr>'}</tbody></table></div></section>`,
  );
  $("#new-test").onclick = measurementSetup;
  $("#csv").onclick = exportCSV;
  document
    .querySelectorAll("[data-score]")
    .forEach((b) => (b.onclick = () => score(m.find((x) => x.id === b.dataset.score))));
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") document.body.classList.remove("menu-open");
});
render();
(async () => {
  try {
    config = await api("config");
    if (config.storage !== "browser" && (!config.requiresCode || code)) {
      const saved = await api("workspace/" + wid);
      if (saved.data && state.requests.length === 0) {
        state = saved.data;
        active = state.requests[0]?.id;
        localStorage.setItem(key, JSON.stringify(state));
      }
    }
    if (seedDemo(state)) save();
    saveMessage =
      config.storage === "firestore"
        ? "Firestoreと端末に保存"
        : config.storage === "browser"
          ? "この端末のブラウザに保存"
          : "この端末とサーバーに保存";
    render();
  } catch {
    if (config.storage === "browser") {
      if (seedDemo(state)) save();
      saveMessage = "この端末のブラウザに保存";
      render();
    } else toast("サーバー保存は未接続です。設定を確認してください。");
  }
})();
