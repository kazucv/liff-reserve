// =====================
//  LIFF Reserve (JP) - single file version
//  replace whole main.js (or app.js) with this
// =====================

// ====== CONFIG ======
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbx2e8Xd8kAQ--kWErdGY7CBtsJ8gDSD87SEQbtDHrfM5HL0xxGhfpzZ8hQ5Qjj8bRg/exec";
const LIFF_ID = "2008793696-IEhzXwEH";

// ====== STATE ======
const state = {
  profile: null,
  allSlots: [],
  selectedDate: null, // "YYYY-MM-DD"
  selectedSlot: null, // {slotId,start,end,...}
  loadedYm: null, // "YYYYMM" 今読んでる月
  form: { name: "", tel: "", note: "" },
};

// ====== DOM ======
const statusEl = document.getElementById("status");

// Views (3 screens)
const viewCalendar = document.getElementById("viewCalendar");
const viewSlots = document.getElementById("viewSlots");
const viewForm = document.getElementById("viewForm");

// Calendar root
const calendarRoot = document.getElementById("calendar");

// Slots
const slotCountEl = document.getElementById("slotCount");
const slotsAMRoot = document.getElementById("slotsAM");
const slotsPMRoot = document.getElementById("slotsPM");

// Form
const summaryEl = document.getElementById("summary");
const nameEl = document.getElementById("name");
const telEl = document.getElementById("tel");
const noteEl = document.getElementById("note");
const confirmBtn = document.getElementById("confirmBtn");

// Back buttons
document.getElementById("backToCalendar")?.addEventListener("click", () => {
  showView("calendar");
});
document.getElementById("backToSlots")?.addEventListener("click", () => {
  showView("slots");
});

// ====== UI utils ======
const log = (msg) => {
  console.log(msg);
  if (statusEl) statusEl.textContent = msg;
};

function showView(name) {
  viewCalendar.classList.toggle("hidden", name !== "calendar");
  viewSlots.classList.toggle("hidden", name !== "slots");
}

async function onPickDate(dateStr) {
  // dateStr: "2026-01-05"
  log(`選択: ${dateStr} → 空き時間を表示するよ`);

  // ✅ ここで「その月の枠を取得」して（既に取得済みならフィルタだけでもOK）
  // いまは window.allSlots がある前提で、日付フィルタして描画
  renderSlotsByDate(dateStr);

  // ✅ 次画面へ
  showView("slots");
}

// flatpickr
flatpickr("#date", {
  locale: "ja",
  inline: true,
  dateFormat: "Y-m-d",
  defaultDate: "2026-01-05", // まずは固定でもOK（あとで今日にする）
  minDate: "today",
  onChange: (selectedDates, dateStr) => {
    // dateStr が "YYYY-MM-DD"
    onPickDate(dateStr);
  },
});

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toYm(dateStr) {
  // "2026-01-05" -> "202601"
  return String(dateStr || "")
    .replaceAll("-", "")
    .slice(0, 6);
}

function ymdCompact(dateStr) {
  // "2026-01-22" or "2026/01/22" -> "20260122"
  return String(dateStr || "")
    .replaceAll("-", "")
    .replaceAll("/", "");
}

function clearSlotsUI() {
  if (slotsAMRoot) slotsAMRoot.innerHTML = "";
  if (slotsPMRoot) slotsPMRoot.innerHTML = "";
  if (slotCountEl) slotCountEl.textContent = "";
}

// "20260105T10:00:00+09:00" -> "10:00"
function hhmmFromIsoLike(str) {
  // 安全に取りたいので ":" を基準に拾う
  const s = String(str || "");
  const m = s.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : s;
}

// "YYYY-MM-DD" -> "2026年1月4日" ざっくり表示（後で整えやすい）
function jpDateLabel(ymd) {
  const [y, m, d] = String(ymd).split("-");
  if (!y || !m || !d) return ymd;
  return `${Number(y)}年${Number(m)}月${Number(d)}日`;
}

function splitAmPm(slots) {
  const am = [];
  const pm = [];
  for (const s of slots) {
    const hhmm = hhmmFromIsoLike(s.start);
    const hh = Number(hhmm.slice(0, 2));
    if (hh < 12) am.push(s);
    else pm.push(s);
  }
  return { am, pm };
}

function renderSlotButtons(root, list) {
  if (!root) return;

  if (!list.length) {
    const p = document.createElement("p");
    p.textContent = "空きなし";
    root.appendChild(p);
    return;
  }

  list.forEach((s) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot-btn";

    const start = hhmmFromIsoLike(s.start);
    const end = hhmmFromIsoLike(s.end);
    btn.textContent = `${start} 〜 ${end}`;

    btn.addEventListener("click", () => {
      state.selectedSlot = s;
      openForm();
    });

    root.appendChild(btn);
  });
}

// ====== NETWORK ======
async function postJson(url, payload, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // GAS安全策
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`JSON parse failed: ${text.slice(0, 200)}`);
    }

    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

async function loadSlotsByYm(ym) {
  log("枠を取得中...");

  const payload = {
    action: "getSlots",
    userId: state.profile.userId,
    ym,
  };

  const { data } = await postJson(GAS_URL, payload);

  if (!data?.ok || !Array.isArray(data.slots)) {
    log(`枠取得NG: ${JSON.stringify(data)}`);
    return false;
  }

  state.allSlots = data.slots;
  state.loadedYm = ym;

  return true;
}

// ====== FLOW ======
async function ensureMonthLoadedForDate(dateStr) {
  const ym = toYm(dateStr);
  if (state.loadedYm === ym && Array.isArray(state.allSlots)) return true;
  return await loadSlotsByYm(ym);
}

function openSlots(dateStr) {
  state.selectedDate = dateStr;

  clearSlotsUI();

  const ymd = ymdCompact(dateStr);
  const slots = (state.allSlots || []).filter((s) =>
    String(s.slotId || "").startsWith(ymd)
  );

  if (slotCountEl) slotCountEl.textContent = `枠: ${slots.length}件`;

  if (!slots.length) {
    if (slotsAMRoot) slotsAMRoot.textContent = "この日は予約枠がありません。";
    if (slotsPMRoot) slotsPMRoot.textContent = "";
    showView("slots");
    log("この日は枠なし");
    return;
  }

  const { am, pm } = splitAmPm(slots);
  renderSlotButtons(slotsAMRoot, am);
  renderSlotButtons(slotsPMRoot, pm);

  showView("slots");
  log("時間を選んでね");
}

function openForm() {
  const s = state.selectedSlot;
  if (!s) return;

  // summary
  const start = hhmmFromIsoLike(s.start);
  const end = hhmmFromIsoLike(s.end);
  if (summaryEl) {
    summaryEl.textContent = `日付: ${jpDateLabel(
      state.selectedDate
    )} / 時間: ${start} 〜 ${end}`;
  }

  // keep form values
  if (nameEl) nameEl.value = state.form.name || "";
  if (telEl) telEl.value = state.form.tel || "";
  if (noteEl) noteEl.value = state.form.note || "";

  showView("form");
  log("お名前と電話番号を入れてね");
}

async function reserveSlot(slot) {
  log(`予約中... ${slot.slotId}`);

  const payload = {
    action: "createReservation",
    userId: state.profile.userId,
    slotId: slot.slotId,
    name: state.form.name,
    tel: state.form.tel,
    note: state.form.note,
  };

  const r = await postJson(GAS_URL, payload, 10000);

  if (!r.data?.ok) {
    log(`予約NG: ${JSON.stringify(r.data)}`);
    return { ok: false, data: r.data };
  }

  log(`予約OK ✅ ${r.data.reservationId}`);
  return { ok: true, data: r.data };
}

// ====== CALENDAR (A-2 placeholder) ======
// ここは「A-2で表示できてるカレンダー」に合わせて、
// 日付タップ時に onPickDate("YYYY-MM-DD") を呼べばOK。
// 今は “最低限のカレンダー” を描画してる（翌月ボタン付き）
function renderSimpleCalendar(initialYmd) {
  if (!calendarRoot) return;

  const [y, m] = initialYmd.split("-").map(Number);
  let curY = y;
  let curM = m; // 1-12

  const header = document.createElement("div");
  const title = document.createElement("div");
  const prev = document.createElement("button");
  const next = document.createElement("button");
  prev.textContent = "＜";
  next.textContent = "＞";
  header.style.display = "flex";
  header.style.gap = "12px";
  header.style.alignItems = "center";

  header.appendChild(prev);
  header.appendChild(title);
  header.appendChild(next);

  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "repeat(7, 1fr)";
  grid.style.gap = "6px";
  grid.style.marginTop = "10px";

  calendarRoot.innerHTML = "";
  calendarRoot.appendChild(header);
  calendarRoot.appendChild(grid);

  function draw() {
    title.textContent = `${curY}/${pad2(curM)}`;
    grid.innerHTML = "";

    // 曜日
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((d) => {
      const el = document.createElement("div");
      el.textContent = d;
      el.style.opacity = "0.5";
      el.style.fontSize = "12px";
      grid.appendChild(el);
    });

    const first = new Date(curY, curM - 1, 1);
    const startDow = first.getDay();
    const lastDay = new Date(curY, curM, 0).getDate();

    // 空白
    for (let i = 0; i < startDow; i++) {
      const blank = document.createElement("div");
      grid.appendChild(blank);
    }

    // 日付
    const minYmd = todayYmd(); // 今日以降のみ選択可

    for (let day = 1; day <= lastDay; day++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = String(day);
      btn.style.padding = "10px 0";
      btn.style.borderRadius = "12px";

      const ymd = `${curY}-${pad2(curM)}-${pad2(day)}`;

      // 過去日 disable
      if (ymd < minYmd) {
        btn.disabled = true;
        btn.style.opacity = "0.3";
      }

      btn.addEventListener("click", async () => {
        await onPickDate(ymd);
      });

      grid.appendChild(btn);
    }
  }

  prev.addEventListener("click", () => {
    curM--;
    if (curM <= 0) {
      curM = 12;
      curY--;
    }
    draw();
  });

  next.addEventListener("click", () => {
    curM++;
    if (curM >= 13) {
      curM = 1;
      curY++;
    }
    draw();
  });

  draw();
}

// 日付タップ時
async function onPickDate(ymd) {
  // 必要ならその月をロード
  const ok = await ensureMonthLoadedForDate(ymd);
  if (!ok) return;
  openSlots(ymd);
}

// ====== FORM submit ======
confirmBtn?.addEventListener("click", async () => {
  // store
  state.form.name = nameEl?.value?.trim() || "";
  state.form.tel = telEl?.value?.trim() || "";
  state.form.note = noteEl?.value?.trim() || "";

  if (!state.form.name || !state.form.tel) {
    log("お名前と電話番号は必須です");
    return;
  }

  if (!state.selectedSlot) {
    log("時間枠が選択されてないよ");
    return;
  }

  const result = await reserveSlot(state.selectedSlot);
  if (!result.ok) return;

  // 予約後：同じ月を取り直して、同じ日の枠画面を更新
  await loadSlotsByYm(toYm(state.selectedDate));
  openSlots(state.selectedDate);
});

// ====== MAIN ======
async function run() {
  if (!window.liff) {
    log("LIFF SDKが読み込めてない…");
    return;
  }

  // Views check
  if (!viewCalendar || !viewSlots || !viewForm) {
    log("viewCalendar/viewSlots/viewForm が見つからない…（HTML確認）");
    return;
  }

  try {
    log("1) init LIFF...");
    await liff.init({ liffId: LIFF_ID });

    if (!liff.isLoggedIn()) {
      log("2) login...");
      liff.login();
      return;
    }

    log("3) getting profile...");
    state.profile = await liff.getProfile();
    log(`こんにちは、${state.profile.displayName} さん 😊`);

    // 初期日付：今日
    state.selectedDate = todayYmd();

    // 初期月の枠を先読み
    await loadSlotsByYm(toYm(state.selectedDate));

    // カレンダー描画（A-2のカレンダーがあるなら、ここを差し替え）
    renderSimpleCalendar(state.selectedDate);

    showView("calendar");
    log("日付を選んでね");
  } catch (e) {
    log(`ERROR: ${e?.name || "Error"} / ${e?.message || e}`);
    console.error(e);
  }
}

run();
