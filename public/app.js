import {
  FACTS,
  DEMO,
  validateRequest,
  localCard,
  localFollowup,
  reviewCard,
  assessAnswers,
  answerKeys,
} from "./domain.js";
import { townData } from "./town-data.js";
import { putFile, deleteFile, fileUrl, kindOf, MAX_BYTES, ACCEPT } from "./material-store.js";
const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
const icon = (n) => `<img class="icon" src="icons/${n}.svg" alt="">`;
const key = "tsugite-workspace-v1";
let wid = localStorage.getItem("tsugite-id") || crypto.randomUUID();
localStorage.setItem("tsugite-id", wid);
let state;
try {
  state = JSON.parse(localStorage.getItem(key));
} catch {}
state ||= { requests: [], measurements: [] };
let config = { aiReady: false, storage: "browser", requiresCode: false },
  page = "hub",
  active = state.requests[0]?.id,
  code = sessionStorage.getItem("tsugite-access") || "",
  busy = false,
  test = null,
  saveMessage = "この端末に保存";
const current = () => state.requests.find((r) => r.id === active);
const headers = () => ({
  "content-type": "application/json",
  "x-workspace-id": wid,
  "x-demo-access-code": code,
});
async function api(route, data) {
  const res = await fetch("/api/" + route, {
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
function go(p) {
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
    `<aside><button class="close-menu" aria-label="メニューを閉じる">${icon("close")}</button><a class="brand" href="#" data-page="hub"><span class="brand-mark" aria-hidden="true">継</span><span><strong>ツギテ</strong><small>町の記憶を、次の担い手へ</small></span></a><nav class="side-nav" aria-label="主なメニュー"><button class="nav-item ${page === "hub" ? "is-current" : ""}" data-page="hub">${icon("leaf")}ホーム</button><button class="nav-item ${["welcome", "place", "regions"].includes(page) && intakePurpose() !== "record" ? "is-current" : ""}" id="view-entry">${icon("compass")}町の記録を見る<small>町の歴史・行事の段取り</small></button><button class="nav-item nav-record ${["interview", "materials"].includes(page) || (page === "welcome" && intakePurpose() === "record") ? "is-current" : ""}" id="record-entry">${icon("mic")}町の記録を残す<small>語り手の方はこちら</small></button></nav><details class="side-history" ${state.requests.length ? "open" : ""}><summary>これまでの相談<span>${state.requests.length}</span></summary>${history || '<p class="side-empty">まだありません。町の名前から探してみてください。</p>'}</details><div class="side-bottom"><button class="settings" id="settings">${icon("settings")}設定</button><p class="side-label">${config.aiReady ? "Google AI 接続設定あり" : "体験モード（ルール処理）"}<br>生の音声は保存しません</p></div></aside><main><div class="scrim" aria-hidden="true"></div><header class="topbar"><button class="mobile-menu" aria-label="メニューを開く" aria-expanded="false">${icon("menu")}</button><a class="product" href="#" data-page="hub">ツギテ</a>${page !== "hub" ? `<a class="home-link" href="#" data-page="hub">ホームに戻る</a>` : ""}<span class="status"><span class="status-dot ${config.aiReady ? "on" : ""}"></span>${config.aiReady ? "AI接続設定あり" : "体験モード"}</span></header><div class="page">${content}</div><footer class="footer"><p>青葉地区・田中さんは架空の地区と人物です。初期のお話はデモ用の創作です。</p><p>${esc(saveMessage)}。${config.aiReady ? "Geminiの生成結果は、語り手と確認してから利用します。" : "現在の聞き取りと整理は体験用のルール処理です。"}</p></footer></main><dialog id="dialog"></dialog>`;
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
  ["view", "町の記録を見たい", "住んでいた町、いま住む町、これから住む町のこと"],
  ["record", "町の記録を残したい", "自分の知っている町の話を、聞き取りで残す"],
];
const topics = [
  ["festival", "祭りや行事のいわれ", "の祭りや行事は、いつから続いているの？"],
  ["names", "地名や通りの名前の由来", "という地名の由来は？"],
  ["steps", "行事の段取りや当番", "の行事の準備は、どんな段取りで進めるの？"],
  ["life", "昔の暮らしや仕事", "では、昔どんな暮らしをしていたの？"],
  ["change", "町の移り変わり", "は、昔と比べてどう変わったの？"],
];
const choiceList = (items, cls = "") =>
  `<div class="choices ${cls}">${items.map(([v, l, s], i) => `<button class="choice" style="--i:${i}" data-v="${v}" data-l="${l}"><strong>${l}</strong>${s ? `<span>${s}</span>` : ""}</button>`).join("")}</div>`;
// どの質問を出すかは、それまでの答えから決まる
function intakeStep() {
  const a = Object.fromEntries(intake.history.map((x) => [x.key, x.value]));
  if (!a.purpose) return "purpose";
  if (a.purpose === "record") return !a.place ? "place" : a.how ? "done" : "how";
  if (!a.knows) return "knows";
  if (a.knows === "yes") {
    if (!a.place) return "place";
    return "topic" in a ? "done" : "topic";
  }
  for (const s of hearingSteps) if (!(s.key in a)) return s.key;
  return "note" in a ? "done" : "note";
}
function finishIntake() {
  const a = Object.fromEntries(intake.history.map((x) => [x.key, x.value]));
  if (a.purpose === "record") return startRecording(a.place, a.how);
  if (a.place) {
    const t = topics.find(([k]) => k === a.topic);
    const first = t ? (t[0] === "names" ? `「${a.place}」` : a.place) + t[2] : a.topic && a.topic !== "none" ? a.topic : "";
    return openPlace(a.place, first);
  }
  hearing = { env: a.env || "", values: a.values || [], area: a.area || "", note: a.note || "" };
  const box = $(".intake-current");
  if (box) box.innerHTML = '<p class="searching" role="status">お答えに合う地域を探しています</p>';
  setTimeout(() => go("regions"), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 900);
}
function startRecording(place, how = "talk") {
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
      ? create(`${place}の資料（PDF・写真）`, demo, demo ? DEMO.event : place, "町の資料")
      : demo
    ? create(DEMO.question, true)
    : create(`${place}について、残しておきたいお話を聞かせてください。`, false, place, "町の記録");
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
function questionFor(step) {
  const a = Object.fromEntries(intake.history.map((x) => [x.key, x.value]));
  if (step === "purpose") return { q: "こんにちは。今日は、どちらをしますか？", body: choiceList(purposes) };
  if (step === "knows")
    return {
      q: "知りたい町は、もう決まっていますか？",
      body: choiceList([
        ["yes", "決まっている", "町や地区の名前を入力します"],
        ["no", "まだ決まっていない", "いくつか質問して、合いそうな地域を挙げます"],
      ]),
    };
  if (step === "place")
    return {
      q: a.purpose === "record" ? "どの町のお話を残しますか？" : "どの町のことを知りたいですか？",
      hint: "市町村名でも、地区や通りの名前でも大丈夫です。",
      body: `<form class="free" id="free-form" style="--i:0"><label class="sr-only" for="free">町や地区の名前</label><input class="field field-place" id="free" autocomplete="off" maxlength="80" placeholder="例：青葉地区、○○市△△町" required><button class="primary-btn">次へ</button></form><div class="choices compact" style="--i:1"><button class="choice-sm" data-v="青葉地区" data-l="青葉地区（架空）">架空の「青葉地区」で試す</button>${a.purpose === "view" ? '<button class="choice-sm" data-switch="unknown">町の名前が決まっていない</button>' : ""}</div>`,
    };
  if (step === "how")
    return {
      q: "どんな形で残しますか？",
      hint: "あとから、もう一方も追加できます。",
      body: choiceList([
        ["talk", "話して残す", "聞き役のAIが質問しながら、お話を文字にします"],
        ["files", "資料を登録する", "町史や文献のPDF、昔の写真をアップロードします"],
      ]),
    };
  if (step === "topic")
    return {
      q: `${a.place}の、どんなことを知りたいですか？`,
      hint: "選んだことから、AIがまず資料と地域の人の語りをもとに答えます。",
      body: `${choiceList(topics, "grid-2")}<form class="free" id="free-form" style="--i:4"><label class="sr-only" for="free">知りたいことを書く</label><input class="field" id="free" autocomplete="off" maxlength="1000" placeholder="自分の言葉で書く（例：駅前の商店街はいつできたの？）" required><button class="secondary-btn">次へ</button></form><div class="choices compact" style="--i:5"><button class="choice-sm" data-v="none" data-l="とくに決めていない">とくに決めていない</button></div>`,
    };
  const s = hearingSteps.find((x) => x.key === step);
  if (s)
    return {
      q: s.q,
      hint: s.hint,
      body: s.multi
        ? `<form id="multi-form"><div class="choices chips-wrap">${s.options.map(([v, l], i) => `<label class="chip" style="--i:${i}"><input type="checkbox" value="${v}" data-l="${l}"><span>${l}</span></label>`).join("")}</div><div class="intake-next" style="--i:${s.options.length}"><button class="primary-btn">次へ</button><button type="button" class="text-btn" id="skip">とくにない</button></div></form>`
        : `<div class="choices chips-wrap">${s.options.map(([v, l], i) => `<button class="chip-btn" style="--i:${i}" data-v="${v}" data-l="${l}">${l}</button>`).join("")}</div>`,
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
function hub() {
  const first = !intake.typed.has("hub"),
    q = "こんにちは。今日は、どちらをしますか？",
    towns = recentTowns(),
    ongoing = state.requests.filter((r) => r.status !== "confirmed").slice(0, 3);
  shell(
    `<section class="intake hub ${first ? "is-entering" : ""}"><p class="intake-hello">町の昔を、そこで暮らした人に聞く。</p><h1 class="intake-q"><span class="sr-only">${q}</span><span class="typed" aria-hidden="true" data-text="${q}">${first ? "" : q}</span></h1><div class="intake-body"><div class="hub-actions" style="--i:0"><button class="hub-card" data-start="view">${icon("compass")}<strong>町の記録を見る</strong><span>町の歴史や行事の段取りを、資料と地域の人の語りから調べます。</span></button><button class="hub-card" data-start="record">${icon("mic")}<strong>町の記録を残す</strong><span>自分の知っている話や、文献のPDF・昔の写真を残します。</span></button></div>${towns.length ? `<section class="hub-section" style="--i:1"><h2>最近見た町</h2><div class="choices compact">${towns.map((n) => `<button class="choice-sm town-chip" data-town="${esc(n)}">${esc(n)}</button>`).join("")}</div></section>` : `<p class="hub-try" style="--i:1"><button class="text-btn" data-town="青葉地区">架空の「青葉地区」で試してみる</button></p>`}${ongoing.length ? `<section class="hub-section" style="--i:2"><h2>続きから</h2><ul class="story-list is-waiting">${ongoing.map((r) => `<li><button class="story" data-request="${r.id}"><span class="story-q">${esc(r.question)}</span><span class="story-meta">${esc(r.place || r.event)}　${statuses[r.status] || ""}</span></button></li>`).join("")}</ul></section>` : ""}</div></section>`,
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
  const past = intake.history
    .map(
      (x, i) =>
        `<li><span class="past-q">${esc(x.q || "")}</span><span class="past-a">${esc(x.label)}</span></li>`,
    )
    .join("");
  shell(
    `<section class="intake ${first ? "is-entering" : ""}">${intake.history.length ? `<ol class="intake-past">${past}</ol>` : `<p class="intake-hello">町の昔を、そこで暮らした人に聞く。</p>`}<div class="intake-current"><h1 class="intake-q" aria-live="polite"><span class="sr-only">${esc(q)}</span><span class="typed" aria-hidden="true" data-text="${esc(q)}">${first ? "" : esc(q)}</span></h1>${hint ? `<p class="intake-hint">${esc(hint)}</p>` : ""}<div class="intake-body">${body}</div>${intake.history.length ? '<div class="intake-back"><button class="text-btn" id="back">ひとつ前に戻る</button><button class="text-btn" id="restart">ホームに戻る</button></div>' : ""}</div></section>`,
  );
  const qText = q;
  const commit = (key, value, label) => {
    intake.history.push({ key, value, label, q: qText });
    if (intakeStep() === "done") finishIntake();
    else render();
  };
  document.querySelectorAll(".intake [data-v]").forEach(
    (b) =>
      (b.onclick = () => {
        commit(cur, b.dataset.v, b.dataset.l);
      }),
  );
  document.querySelectorAll("[data-switch]").forEach(
    (b) =>
      (b.onclick = () => {
        intake.history = [
          { key: "purpose", value: "view", label: "町の記録を見たい", q: questionFor("purpose").q },
          { key: "knows", value: "no", label: "まだ決まっていない", q: questionFor("knows").q },
        ];
        render();
      }),
  );
  $("#free-form") &&
    ($("#free-form").onsubmit = (e) => {
      e.preventDefault();
      const v = $("#free").value.trim();
      if (cur !== "note" && !v) return toast("入力するか、下の選択肢から選んでください。");
      commit(cur, v, v || "とくになし");
    });
  $("#multi-form") &&
    ($("#multi-form").onsubmit = (e) => {
      e.preventDefault();
      const picked = [...document.querySelectorAll("#multi-form input:checked")];
      if (!picked.length) return toast("ひとつ以上選ぶか、「とくにない」を押してください。");
      commit(
        cur,
        picked.map((x) => x.value),
        picked.map((x) => x.dataset.l).join("、"),
      );
    });
  $("#skip") && ($("#skip").onclick = () => commit(cur, [], "とくにない"));
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
  const text = el.dataset.text,
    reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const done = () => {
    el.textContent = text;
    sec.classList.add("is-ready");
    intake.typed.add(stepId);
    sec.querySelector("#free")?.focus({ preventScroll: true });
  };
  if (!animate || reduced) return done();
  let i = 0;
  const tick = () => {
    if (!el.isConnected) return;
    el.textContent = text.slice(0, ++i);
    if (i < text.length) setTimeout(tick, 45);
    else setTimeout(done, 180);
  };
  setTimeout(tick, intake.history.length ? 150 : 600);
}
function openPlace(name, question = "") {
  placeName = name.slice(0, 80);
  placeDraft = "";
  pendingAsk = question;
  go("place");
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
      toast(`「${file.name}」は登録できない形式です。PDF、JPEG、PNG、WebPを選んでください。`);
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
    : `<span class="thumb thumb-pdf" aria-hidden="true">PDF</span>`;
}
async function fillThumbs(root = document) {
  for (const img of root.querySelectorAll("[data-thumb]")) {
    const url = await fileUrl(img.dataset.thumb);
    if (url) img.src = url;
    else img.replaceWith(Object.assign(document.createElement("span"), { className: "thumb thumb-missing", textContent: "この端末にありません" }));
  }
}
async function openMaterial(id) {
  const url = await fileUrl(id);
  if (!url) return toast("この資料のファイルは、この端末に保存されていません。");
  window.open(url, "_blank", "noopener");
}
function materialsPage() {
  const r = current();
  if (!r) return go("hub");
  const place = r.place || r.event,
    saved = r.materials || [];
  const pending = pendingFiles
    .map(
      (p, i) =>
        `<form class="upload-item" data-pending="${i}">${thumbHtml(p, p.preview)}<div class="upload-fields"><p class="upload-name">${esc(p.file.name)}<small>${p.kind}・${fmtSize(p.file.size)}</small></p><label class="label">資料の名前<input class="field" name="title" value="${esc(p.title)}" required maxlength="120"></label><div class="row-2"><label class="label">年代<input class="field" name="era" value="${esc(p.era)}" placeholder="例：昭和40年ごろ" maxlength="60"></label><label class="label">作った人・出どころ<input class="field" name="source" value="${esc(p.source)}" placeholder="例：自治会の記念誌、祖父のアルバム" maxlength="120"></label></div><label class="label">${p.kind === "写真" ? "何が写っていますか" : "どんなことが書かれていますか"}<textarea class="field" name="description" maxlength="1000" placeholder="${p.kind === "写真" ? "例：駅ができる前の田んぼ。奥に見えるのが今の公民館のあたり。" : "例：夏祭りが始まった経緯と、最初の年の写真がのっている。"}">${esc(p.description)}</textarea></label><label class="label">見られる人<select class="field" name="visibility">${visibilities.map(([v, l]) => `<option value="${v}" ${p.visibility === v ? "selected" : ""}>${l}</option>`).join("")}</select></label><label class="check"><input type="checkbox" name="consent" ${p.consent ? "checked" : ""}>${p.kind === "写真" ? "写っている人や持ち主に、残してよいか確認しました。" : "この資料を共有してよいか、持ち主や作った人に確認しました。"}</label><div class="upload-actions"><button class="primary-btn">登録する</button><button type="button" class="text-btn" data-cancel="${i}">取り消す</button></div></div></form>`,
    )
    .join("");
  const list = saved
    .map(
      (m) =>
        `<li class="saved-item">${thumbHtml(m)}<div><strong>${esc(m.title)}</strong><small>${esc(m.kind)}${m.era ? "・" + esc(m.era) : ""}・${visLabel(m.visibility)}</small>${m.description ? `<p class="small">${esc(m.description)}</p>` : ""}<div class="saved-actions"><button class="text-btn" data-open="${m.id}">開く</button><button class="text-btn danger" data-remove="${m.id}">削除</button></div></div></li>`,
    )
    .join("");
  shell(
    `<section class="page-header"><h1>${esc(place)}の資料を残す</h1><p>町史や文献のPDF、昔の写真を登録できます。登録した資料は、町のチャットで回答の根拠として示されます。</p></section><div class="review-layout"><section class="paper-card upload-card"><label class="dropzone" for="file-input"><input type="file" id="file-input" accept="${ACCEPT}" multiple class="sr-only"><span class="dropzone-title">PDFや写真を選ぶ</span><span class="small">ここにドラッグしても追加できます。PDF・JPEG・PNG・WebP、1ファイル20MBまで。</span></label>${pending ? `<div class="upload-list">${pending}</div>` : ""}</section><div class="review-sidebar"><section class="side-card"><h3>登録した資料<span class="count">${saved.length}</span></h3>${list ? `<ul class="saved-list">${list}</ul>` : '<p class="small">まだありません。</p>'}</section><section class="side-card"><h3>ほかの残し方</h3><p class="small">資料にまつわる思い出や、写真の場所のことは、話して残すこともできます。</p><button class="secondary-btn" id="to-talk">話して残す</button><button class="text-btn" id="to-town">${esc(place)}のページを見る</button></section><p class="small upload-note">登録した資料は、いまはこの端末のブラウザに保存されます（サーバーへの保存は準備中）。</p></div></div>`,
  );
  fillThumbs();
  const input = $("#file-input"),
    drop = $(".dropzone");
  input.onchange = () => addFiles([...input.files]);
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
      try {
        await putFile(p.id, p.file);
      } catch {
        return toast("この端末に保存できませんでした。ブラウザの容量を確認してください。");
      }
      r.materials ||= [];
      r.materials.push({
        id: p.id,
        kind: p.kind,
        type: p.file.type,
        name: p.file.name,
        size: p.file.size,
        title: p.title.trim().slice(0, 120),
        era: p.era.trim().slice(0, 60),
        source: p.source.trim().slice(0, 120),
        description: p.description.trim().slice(0, 1000),
        visibility: p.visibility,
        addedBy: r.speaker,
        addedAt: new Date().toISOString(),
      });
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
          `<h2>資料を削除しますか？</h2><p>「${esc(m.title)}」を削除します。この端末からファイルも消え、元に戻せません。</p><div class="dialog-actions"><button class="secondary-btn" data-close>やめる</button><button class="primary-btn" id="do-remove">削除する</button></div>`,
          () =>
            ($("#do-remove").onclick = async () => {
              r.materials = r.materials.filter((x) => x !== m);
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
let townBusy = false;
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
function placeMaterials() {
  return placeRequests().flatMap((r) => (r.materials || []).map((m) => ({ ...m, requestId: r.id })));
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
  where: "住民の方がツギテに登録した資料です",
  fileId: m.id,
  fileKind: m.kind,
});
// 体験用の回答。登録された資料と、語り手が確認した手引きだけを根拠にする
function localTownAnswer(question) {
  const town = townData(placeName),
    cited = [],
    cite = (src) => {
      let i = cited.findIndex((c) => c.id === src.id);
      if (i < 0) i = cited.push(src) - 1;
      return `[${i + 1}]`;
    },
    parts = [],
    materials = new Set();
  if (town) {
    for (const k of town.knowledge.filter((k) => k.words.test(question)).slice(0, 2)) {
      parts.push(k.text.replace(/\[(\w+)\]/g, (_, id) => cite(town.sources.find((s) => s.id === id))));
      k.materials.forEach((m) => materials.add(m));
    }
  }
  for (const r of placeRequests().filter((r) => r.card)) {
    const keys = answerKeys(question, r.card);
    if (!keys.length) continue;
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
        : `${placeName}の資料は、まだツギテに登録されていません。わからないことを推測で答えることはしません。図書館の郷土資料や、役所の文化財・生涯学習の担当で調べられることがあります。地域の方に聞いてみることもできます。`,
      citations: [],
      materials: [],
      askable: true,
      mode: "experience",
    };
  return {
    text: parts.join("\n\n") + "\n\nさらに詳しく知りたいときは、資料を見たり、「直接たずねる」の連絡先に聞いたりできます。",
    citations: cited,
    materials: [...fromTown([...materials]), ...matMaterials],
    askable: false,
    mode: "experience",
  };
}
async function askTown(question) {
  const log = (townChats[placeName] ||= []);
  log.push({ role: "user", text: question, at: Date.now() });
  townBusy = true;
  saveChats();
  placePage();
  let reply;
  if (config.aiReady) {
    try {
      // バックエンドの受け口（docs/frontend-town-chat.md）。未実装なら体験用の回答に切り替える
      reply = await api("town-answer", { place: placeName, question, history: log.slice(-10) });
    } catch {}
  }
  if (!reply) {
    await new Promise((r) => setTimeout(r, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700));
    reply = localTownAnswer(question);
  }
  log.push({ role: "assistant", ...reply, question, at: Date.now() });
  townBusy = false;
  saveChats();
  if (page === "place") placePage();
}
function renderAnswer(m, idx) {
  const body = esc(m.text)
    .replace(/\n/g, "<br>")
    .replace(
      /\[(\d+)\]/g,
      (_, n) =>
        `<button class="cite" data-msg="${idx}" data-cite="${n - 1}" aria-label="根拠${n}を見る">${n}</button>`,
    );
  const cites = (m.citations || [])
    .map(
      (c, i) =>
        `<li><button class="cite-row" data-msg="${idx}" data-cite="${i}"><span class="cite-no">${i + 1}</span><span><strong>${esc(c.title)}</strong><small>${esc(c.author)}　${esc(c.year)}　${esc(c.kind)}</small></span></button></li>`,
    )
    .join("");
  const mats = (m.materials || [])
    .map(
      (s) =>
        `<li class="material ${s.fileId ? "has-file" : ""}">${s.fileId ? thumbHtml({ id: s.fileId, kind: s.fileKind }) : ""}<div><span class="material-kind">${esc(s.kind)}</span><strong>${esc(s.title)}</strong><small>${esc(s.where || "")}</small>${s.fileId ? `<button class="text-btn" data-open="${s.fileId}">資料を開く</button>` : ""}</div></li>`,
    )
    .join("");
  return `<div class="msg assistant"><p class="who">ツギテ${m.mode === "experience" ? "（体験用の回答）" : ""}</p><div class="answer"><p class="answer-text">${body}</p>${cites ? `<div class="answer-sources"><p class="answer-label">この回答の根拠</p><ol class="cite-list">${cites}</ol></div>` : ""}${mats ? `<div class="answer-materials"><p class="answer-label">こんな資料があります</p><ul class="material-list">${mats}</ul></div>` : ""}${m.askable ? `<div class="answer-ask"><button class="secondary-btn" data-ask="${idx}">この質問を地域の人に聞く</button><span class="small">語り部への次の聞き取りのテーマになります。</span></div>` : ""}</div></div>`;
}
function contactsHtml(town) {
  if (town)
    return `<ul class="contact-list">${town.contacts.map((c) => `<li><strong>${esc(c.name)}</strong><span>${esc(c.role)}</span><a href="tel:${c.tel.replace(/-/g, "")}">${esc(c.tel)}</a><small>${esc(c.hours)}</small></li>`).join("")}</ul><p class="small">電話番号はデモ用の架空のものです。</p>`;
  const q = (w) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeName + " " + w)}`;
  return `<p class="small">この町の連絡先は、まだ登録されていません。次の窓口で、町の歴史を教えてもらえることがあります。</p><ul class="contact-list"><li><strong>図書館の郷土資料コーナー</strong><span>町史や古い地図、写真の資料</span><a href="${q("図書館")}" target="_blank" rel="noopener">近くの図書館を地図で探す</a></li><li><strong>公民館・地区センター</strong><span>地域の行事や語り部の紹介</span><a href="${q("公民館")}" target="_blank" rel="noopener">近くの公民館を地図で探す</a></li><li><strong>役所の文化財・生涯学習の担当</strong><span>史跡や地名の由来について</span><a href="${q("役所")}" target="_blank" rel="noopener">役所を地図で探す</a></li></ul>`;
}
function placePage() {
  if (!placeName) return go("hub");
  const town = townData(placeName),
    region = Object.values(regionInfo).find((r) => r.name === placeName),
    log = townChats[placeName] || [],
    stories = placeRequests().filter((r) => r.card),
    uploads = placeMaterials();
  const intro = `<div class="msg assistant"><p class="who">ツギテ</p><div class="answer"><p class="answer-text">${esc(placeName)}について、登録された資料と、地域の方が確かめた語りをもとにお答えします。答えには、どの資料を参照したかを番号で示します。わからないことは推測せず、地域の方に聞く質問として残せます。</p>${town ? `<div class="suggest">${town.suggestions.map((s) => `<button class="choice-sm" data-suggest="${esc(s)}">${esc(s)}</button>`).join("")}</div>` : ""}</div></div>`;
  const msgs = log
    .map((m, i) =>
      m.role === "user"
        ? `<div class="msg user"><p class="who">あなた</p><p class="bubble">${esc(m.text)}</p></div>`
        : renderAnswer(m, i),
    )
    .join("");
  shell(
    `<div class="town-layout"><section class="town-chat chat" aria-label="${esc(placeName)}について聞く"><header class="chat-top"><h1>${esc(placeName)}について聞く</h1><a class="jump-contacts" href="#contacts">連絡先を見る</a><small>${config.aiReady ? "Google AI" : "体験モード"}</small></header><div class="chat-log" aria-live="polite">${intro}${msgs}${townBusy ? '<div class="msg assistant"><p class="who">ツギテ</p><p class="bubble searching" role="status">資料を調べています</p></div>' : ""}</div><form class="chat-bottom" id="town-form"><div class="composer"><label class="sr-only" for="town-q">町について聞きたいこと</label><textarea id="town-q" rows="2" maxlength="1000" placeholder="町について聞きたいことを入力" ${townBusy ? "disabled" : ""}>${esc(placeDraft)}</textarea><button type="button" class="round" id="dictate" aria-label="声で入力する">${icon("mic")}</button><button class="round primary" aria-label="質問する" ${townBusy ? "disabled" : ""}>${icon("send")}</button></div></form></section><div class="town-side" role="complementary" aria-label="${esc(placeName)}の情報"><section class="town-name"><h2>${esc(placeName)}</h2><p>${town ? town.note : region ? region.position : "地域の記録"}</p></section><section class="side-card" id="contacts"><h3>直接たずねる</h3>${contactsHtml(town)}</section><section class="side-card"><h3>この町の資料</h3>${town || uploads.length ? `<ul class="material-list compact">${(town ? town.sources : []).map((s) => `<li class="material"><span class="material-kind">${esc(s.kind)}</span><strong>${esc(s.title)}</strong><small>${esc(s.where)}</small></li>`).join("")}${uploads.map((m) => `<li class="material has-file">${thumbHtml(m)}<div><span class="material-kind">${esc(m.kind)}（住民が登録）</span><strong>${esc(m.title)}</strong><small>${esc(m.era || "年代不明")}・${visLabel(m.visibility)}</small><button class="text-btn" data-open="${m.id}">開く</button></div></li>`).join("")}</ul>` : '<p class="small">まだ登録されていません。</p>'}<button class="text-btn" id="add-material">資料を登録する</button>${stories.length ? `<p class="answer-label">地域の方の語り（確認済み）</p><ul class="story-list">${stories.map((r) => `<li><button class="story" data-request="${r.id}"><span class="story-q">${esc(r.card.title)}</span><span class="story-meta">${esc(r.speaker)}</span></button></li>`).join("")}</ul>` : ""}</section><section class="side-actions"><a class="secondary-btn" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(region ? region.query : placeName)}" target="_blank" rel="noopener">地図で場所を見る</a><button class="text-btn" id="record-here">この町の話を残す</button></section></div></div>`,
  );
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
          `<h2>根拠 ${Number(b.dataset.cite) + 1}</h2><p><strong>${esc(c.title)}</strong><br>${esc(c.author)}　${esc(c.year)}　${esc(c.kind)}</p><blockquote class="source-quote">${esc(c.excerpt || "抜粋は登録されていません").replace(/\n/g, "<br>")}</blockquote>${c.where ? `<p class="small">${esc(c.where)}</p>` : ""}${c.fileId ? (c.fileKind === "写真" ? `<img class="cite-photo" data-thumb="${c.fileId}" alt="${esc(c.title)}">` : `<p><button class="secondary-btn" data-open="${c.fileId}">PDFを開く</button></p>`) : ""}${c.url ? `<p><a href="${esc(c.url)}" target="_blank" rel="noopener">資料を開く</a></p>` : ""}<div class="dialog-actions">${c.requestId ? `<button class="secondary-btn" id="open-card">語りの手引きを見る</button>` : ""}<button class="primary-btn" data-close>閉じる</button></div>`,
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
  $("#record-here").onclick = () => startRecording(placeName);
  $("#add-material").onclick = () => startRecording(placeName, "files");
  fillThumbs();
  document.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => openMaterial(b.dataset.open)));
  if (pendingAsk && !townBusy) {
    const q = pendingAsk;
    pendingAsk = "";
    askTown(q);
  }
}
function create(question, sample = false, event = DEMO.event, task = DEMO.task) {
  try {
    const r = validateRequest({ question, sampleData: sample, event, task, speaker: DEMO.speaker });
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
  let r = current();
  if (!r) return;
  const previous = r.card;
  r.status = "interview";
  if (r.pendingQuestions?.length)
    r.turns.push(
      turn(
        "assistant",
        "次の担い手から追加の質問です。「" + r.pendingQuestions.pop() + "」について教えていただけますか？",
      ),
    );
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
  return `<div class="review-sidebar"><section class="side-card"><h3>届いている質問</h3><p class="request-quote">${esc(r.question)}</p><p class="meta">${esc(r.event)}<br>${esc(r.task)}</p><hr><label>話す人<input id="speaker" class="field" value="${esc(r.speaker)}"></label><p class="hint">「いつもの場所」も、初めての人に伝わる名前に。知らないことは、知らないままで大丈夫です。</p></section><section class="side-card"><h3>資料を添える<span class="count">${(r.materials || []).length}</span></h3><p class="small">お話に関係する文献のPDFや、昔の写真を一緒に残せます。</p><button type="button" class="secondary-btn" data-page="materials">PDF・写真を登録する</button></section></div>`;
}
function interview() {
  const r = current();
  if (!r) return go("hub");
  shell(
    `<section class="page-header">${stepper(2)}<h1>いつもの言葉で、教えてください。</h1><p>下書きを作ったあとに、内容を一緒に確認できます。</p></section><div class="work-layout">${requestSide(r)}<section class="chat"><header class="chat-top"><h2>${esc(r.speaker)}のお話</h2><small>${config.aiReady ? "Gemini" : "体験用の聞き役"}</small></header><div class="chat-log" aria-live="polite">${r.turns.map((t) => `<div class="msg ${t.role}"><p class="who">${t.role === "user" ? esc(r.speaker) : "ツギテ"}</p><p class="bubble">${esc(t.text)}</p></div>`).join("")}</div><div id="live-status"></div><form class="chat-bottom" id="talk-form"><div class="composer"><label class="sr-only" for="utterance">お話を入力</label><textarea id="utterance" placeholder="話すか、ここに入力してください" required maxlength="8000"></textarea><button type="button" class="round" id="dictate" aria-label="声でお話を入力">${icon("mic")}</button><button class="round primary" ${busy ? "disabled" : ""} aria-label="お話を伝える">${icon("send")}</button></div><div class="inline-actions"><button type="button" class="text-btn" id="sample">架空の台詞を入力</button><button type="button" class="secondary-btn" id="finish" ${busy ? "disabled" : ""}>手引きの下書きを作る</button></div>${config.aiReady ? '<button type="button" class="text-btn" id="live">声で会話を続ける（最大5分）</button>' : ""}</form></section></div>`,
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
  if (busy || !text.trim()) return;
  const r = current();
  r.turns.push(turn("user", text.trim()));
  busy = true;
  save();
  render();
  try {
    const response = config.aiReady
      ? await api("followup", {
          request: { question: r.question, event: r.event, task: r.task },
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
        return `<section class="fact"><label class="fact-label" for="fact-${k}">${label}${f.status === "unknown" ? "<span>未確認</span>" : ""}</label>${draft ? `<textarea class="field" id="fact-${k}">${esc(f.value)}</textarea>` : `<p class="fact-value ${f.status === "unknown" ? "unknown" : ""}">${esc(f.value)}</p>`}${f.sourceIds.length ? `<button class="source-btn" data-source="${k}">元のお話を確かめる</button>` : ""}</section>`;
      },
    ).join(
      "",
    )}</div></article><div class="review-sidebar"><section class="side-card"><h3>${draft ? "確認して残す" : "この手引きを使う"}</h3>${draft ? `<p class="small">人名・時刻・条件を確認してください。修正した内容も、確認時の追記として残ります。</p><label class="check"><input type="checkbox" id="confirm">語り手と内容を確認しました。未確認の項目は、そのまま残します。</label><button class="primary-btn full" id="save-card">確認して残す</button>` : `<p class="small">${new Date(c.confirmedAt).toLocaleDateString("ja-JP")} に確認<br>${r.sampleData ? "架空データでの体験です。" : ""}</p><div class="settings-buttons"><button class="primary-btn" id="ask-memory">この記憶に聞く</button><button class="secondary-btn" id="print">印刷・PDFにする</button><button class="secondary-btn" id="measure">探しやすさを測る</button></div>`}</section><section class="side-card"><h3>次に聞きたいこと</h3>${unknown.length ? `<ul class="unknown-list">${unknown.map(([, l]) => `<li>${l}</li>`).join("")}</ul>` : '<p class="small">今回の6項目はお話が揃いました。実施前に変更がないか確かめましょう。</p>'}<button class="text-btn" id="resume">前回の続きから話を聞く</button></section></div></div>`,
  );
  document.querySelectorAll("[data-source]").forEach(
    (b) =>
      (b.onclick = () => {
        const f = c.facts[b.dataset.source];
        modal(
          `<h2>この内容の出どころ</h2><p>${esc(f.label)}：${esc(f.value)}</p>${f.sourceIds
            .map((id) => {
              const t = r.turns.find((t) => t.id === id);
              return `<blockquote class="source-quote">${esc(t?.text || "元発言が見つかりません")}</blockquote>`;
            })
            .join(
              "",
            )}<div class="dialog-actions"><button class="secondary-btn" data-close>閉じる</button></div>`,
        );
      }),
  );
  $("#resume").onclick = beginInterview;
  $("#save-card")?.addEventListener("click", () => {
    if (!$("#confirm").checked) return toast("語り手と内容を確認してから、チェックを入れてください。");
    let corrections = 0;
    for (const [k] of FACTS) {
      const value = $("#fact-" + k).value.trim() || "未確認";
      if (value !== c.facts[k].value) {
        corrections++;
        if (value === "未確認") c.facts[k] = { ...c.facts[k], value, sourceIds: [], status: "unknown" };
        else {
          const t = turn("user", `確認時の追記（${c.facts[k].label}）：${value}`);
          r.turns.push(t);
          c.facts[k] = { ...c.facts[k], value, sourceIds: [t.id], status: "stated" };
        }
      }
    }
    r.card = reviewCard(r, { ...c, confirmed: true });
    r.status = "confirmed";
    r.metrics.reviewSeconds = Math.round((Date.now() - r.metrics.reviewStartedAt) / 1000);
    r.metrics.corrections = corrections;
    save();
    render();
    toast("確認した手引きを残しました。");
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
    try {
      const result = config.aiReady
        ? await api("answer", { question: q, card: r.card })
        : { keys: answerKeys(q, r.card) };
      const keys = result.keys || [];
      const log = $("#memory-log");
      log.innerHTML += `<p class="memory-q">${esc(q)}</p>${keys.length ? keys.map((k) => `<section class="memory-a"><p class="fact-label">${esc(r.card.facts[k].label)}</p><p class="fact-value">${esc(r.card.facts[k].value)}</p><blockquote class="small">${r.card.facts[k].sourceIds.map((id) => esc(r.turns.find((t) => t.id === id)?.text || "")).join("<br>")}</blockquote></section>`).join("") : `<p class="source-quote">そのことは、まだ記録されていません。次の聞き取りで確認しましょう。</p><button class="secondary-btn" id="queue-question">この質問を次の聞き取りへ</button>`}`;
      $("#memory-question").value = "";
      $("#queue-question")?.addEventListener("click", () => {
        r.pendingQuestions ||= [];
        r.pendingQuestions.push(q);
        save();
        toast("次の聞き取りで、この質問から始めます。");
        $("#queue-question").disabled = true;
      });
    } catch (err) {
      toast(err.message);
    } finally {
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
async function startLive() {
  try {
    const { startConversation } = await import("./live.js");
    const r = current();
    $("#live").disabled = true;
    await startConversation({
      getToken: () => api("live-token", {}),
      request: r,
      onTurn: (role, text) => {
        r.turns.push(turn(role, text));
        save();
        const p = document.createElement("div");
        p.className = "msg " + role;
        p.innerHTML = `<p class="who">${role === "user" ? esc(r.speaker) : "ツギテ"}</p><p class="bubble">${esc(text)}</p>`;
        $(".chat-log")?.append(p);
        if ($(".chat-log")) $(".chat-log").scrollTop = $(".chat-log").scrollHeight;
      },
      onStatus: (text, stop) => {
        const n = $("#live-status");
        if (!n) return;
        n.className = "live-indicator";
        n.textContent = text;
        if (stop) {
          const b = document.createElement("button");
          b.className = "secondary-btn";
          b.textContent = "会話を終了";
          b.onclick = stop;
          n.append(b);
        }
      },
      onEnd: () => render(),
    });
  } catch (e) {
    toast(e.message);
    render();
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
function regions() {
  const list = matchRegions(),
    fits = list.filter((x) => x.score > 0),
    shown = fits.length ? fits : list.filter((x) => x.score >= 0),
    answered = [
      answerLabel("env", hearing.env),
      ...hearing.values.map((v) => answerLabel("values", v)),
      hearing.area ? answerLabel("area", hearing.area) : "",
    ].filter(Boolean);
  shell(
    `<section class="hero hero-small"><h1>合いそうな地域の候補</h1><p class="lead">${answered.length ? `「${answered.map(esc).join("」「")}」をもとに選びました。` : "お答えをもとに選びました。"}${fits.length ? "" : "ぴったり合う候補がなかったため、登録済みの地域をすべて表示しています。"}</p><button class="text-btn" data-page="welcome" id="redo">答えを変える</button></section>${hearing.area === "other" ? '<p class="notice">「そのほか」の方面は、まだ地域の記録がありません。取材が進んだら候補に加わります。</p>' : ""}<div class="region-grid">${shown
      .map(
        ({ k, r, reasons }) =>
          `<article class="region-card"><figure class="region-photo"><img src="images/${r.image}.jpg" alt="${r.name}の風景イメージ" loading="lazy" width="640" height="427"><figcaption>AIで作った風景イメージ</figcaption></figure><div class="region-body"><p class="meta">${r.position}</p><h2>${r.name}</h2><p>${r.hint}</p>${reasons.length ? `<p class="reasons"><span>合う点</span>${reasons.map((x) => `<em>${esc(x)}</em>`).join("")}</p>` : ""}<div class="region-links"><button class="primary-btn" data-region="${k}">この地域の話を見る</button><a class="text-btn" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.query)}" target="_blank" rel="noopener">地図で見る</a></div></div></article>`,
      )
      .join(
        "",
      )}</div><p class="small region-note">候補は体験用の簡単な振り分けです。写真は実在の特定の町や語り手を紹介するものではありません。</p>`,
  );
  $("#redo").onclick = () => go("welcome");
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
        download("ツギテ_記録.json", JSON.stringify(state, null, 2), "application/json");
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
  download("ツギテ_測定.csv", "\uFEFF" + cols.join(",") + "\n" + rows.join("\n"), "text/csv;charset=utf-8");
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
    saveMessage =
      config.storage === "firestore"
        ? "Firestoreと端末に保存"
        : config.storage === "browser"
          ? "この端末のブラウザに保存"
          : "この端末とサーバーに保存";
    render();
  } catch {
    if (config.storage === "browser") {
      saveMessage = "この端末のブラウザに保存";
      render();
    } else toast("サーバー保存は未接続です。設定を確認してください。");
  }
})();
