// ====== CONFIG ======
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbx2e8Xd8kAQ--kWErdGY7CBtsJ8gDSD87SEQbtDHrfM5HL0xxGhfpzZ8hQ5Qjj8bRg/exec";
const LIFF_ID = "2008793696-IEhzXwEH";

// ====== UI ======
const statusEl = document.getElementById("status");
const slotsRoot = document.getElementById("slots");
const slotCountEl = document.getElementById("slotCount");
const calendarRoot = document.getElementById("calendar");

const log = (msg) => {
  console.log(msg);
  if (statusEl) statusEl.textContent = msg;
};

// ====== utils ======
function toYm(dateStr) {
  // "2026-01-05" -> "202601"
  return String(dateStr || "")
    .replaceAll("-", "")
    .slice(0, 6);
}
function ymdCompact(dateStr) {
  // "2026-01-05" -> "20260105"
  return String(dateStr || "").replaceAll("-", "");
}
function formatYmd(y, m, d) {
  // m: 1-12
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function clearSlots() {
  if (slotsRoot) slotsRoot.innerHTML = "";
}

// ====== slots render ======
function renderSlotsByDate(selectedDateStr) {
  clearSlots();

  const ymd = ymdCompact(selectedDateStr);
  const slots = (window.allSlots || []).filter((s) =>
    String(s.slotId || "").startsWith(ymd)
  );

  if (slotCountEl) slotCountEl.textContent = `枠OK: ${slots.length}件`;

  if (slots.length === 0) {
    const p = document.createElement("p");
    p.textContent = "この日は予約枠がありません";
    slotsRoot.appendChild(p);
    return;
  }

  slots.forEach((s) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot-btn";
    btn.textContent = `${s.start} 〜 ${s.end}`;
    btn.style.display = "block";
    btn.style.margin = "8px 0";

    btn.addEventListener("click", async () => {
      await reserveSlot(s);
    });

    slotsRoot.appendChild(btn);
  });
}

// ====== network ======
async function postJson(url, payload, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
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

// ====== API calls ======
async function loadSlots(profile, dateStr) {
  log("枠を取得中...");

  const payload = {
    action: "getSlots",
    userId: profile.userId,
    ym: toYm(dateStr),
  };

  const { data } = await postJson(GAS_URL, payload);
  if (!data?.ok || !Array.isArray(data.slots)) {
    log(`枠取得NG: ${JSON.stringify(data)}`);
    return false;
  }

  window.allSlots = data.slots; // 月の全枠
  return true;
}

// ✅ ここが「既存の予約処理に接続」＝ reserveSlot
async function reserveSlot(slot) {
  // ここは次のステップでフォーム入力に置き換える（今は固定でOK）
  const payload2 = {
    action: "createReservation",
    userId: window.profile.userId,
    slotId: slot.slotId,
    name: "テスト太郎",
    tel: "09012345678",
    note: "LIFFテスト予約",
  };

  log(`予約中... ${slot.slotId}`);
  const r2 = await postJson(GAS_URL, payload2, 10000);

  if (!r2.data?.ok) {
    log(`予約NG: ${JSON.stringify(r2.data)}`);
    return;
  }

  log(`予約OK ✅ ${r2.data.reservationId}`);

  // 予約後は同月を取り直して再描画（枠が消えるのが見える）
  await loadAndShow(window.selectedDateStr);
}

// ====== calendar (simple) ======
function buildCalendarUI() {
  if (!calendarRoot) return;

  calendarRoot.innerHTML = `
    <div style="display:flex; gap:12px; align-items:center; margin: 12px 0;">
      <button id="calPrev" type="button">←</button>
      <div id="calTitle" style="font-weight:bold;"></div>
      <button id="calNext" type="button">→</button>
    </div>
    <div id="calGrid" style="display:grid; grid-template-columns: repeat(7, 1fr); gap:6px;"></div>
  `;

  document
    .getElementById("calPrev")
    .addEventListener("click", () => moveMonth(-1));
  document
    .getElementById("calNext")
    .addEventListener("click", () => moveMonth(1));
}

function renderCalendar(year, month1to12) {
  // month1to12: 1-12
  const titleEl = document.getElementById("calTitle");
  const gridEl = document.getElementById("calGrid");
  if (!gridEl) return;

  if (titleEl) titleEl.textContent = `${year}年 ${month1to12}月`;
  gridEl.innerHTML = "";

  const dow = ["日", "月", "火", "水", "木", "金", "土"];
  dow.forEach((d) => {
    const cell = document.createElement("div");
    cell.textContent = d;
    cell.style.fontSize = "12px";
    cell.style.opacity = "0.7";
    cell.style.textAlign = "center";
    gridEl.appendChild(cell);
  });

  const first = new Date(year, month1to12 - 1, 1);
  const last = new Date(year, month1to12, 0);
  const startBlank = first.getDay(); // 0-6
  const days = last.getDate();

  // blank
  for (let i = 0; i < startBlank; i++) {
    gridEl.appendChild(document.createElement("div"));
  }

  // days
  for (let d = 1; d <= days; d++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = String(d);
    btn.style.padding = "10px 0";
    btn.style.borderRadius = "10px";
    btn.style.border = "1px solid #ddd";
    btn.style.background = "#fff";

    const dateStr = formatYmd(year, month1to12, d);

    // 選択日のハイライト（雑に）
    if (window.selectedDateStr === dateStr) {
      btn.style.border = "2px solid #000";
      btn.style.fontWeight = "bold";
    }

    btn.addEventListener("click", async () => {
      await setSelectedDate(dateStr);
    });

    gridEl.appendChild(btn);
  }
}

function moveMonth(delta) {
  // window.currentYM: {y, m}
  let y = window.currentYM.y;
  let m = window.currentYM.m + delta;
  if (m <= 0) {
    m = 12;
    y -= 1;
  }
  if (m >= 13) {
    m = 1;
    y += 1;
  }
  window.currentYM = { y, m };

  // 月移動だけなら「枠取得」はその月の最初の日に合わせて取る
  const firstDay = formatYmd(y, m, 1);
  // 選択日は「その月の1日」に寄せる（好みで今日にしてもOK）
  setSelectedDate(firstDay);
}

async function setSelectedDate(dateStr) {
  window.selectedDateStr = dateStr;

  // 年月更新（カレンダー表示をその月に合わせる）
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(5, 7));
  window.currentYM = { y, m };

  // まずカレンダーを更新（選択ハイライト反映）
  renderCalendar(y, m);

  // 月の枠を取得してから、その日の枠だけ表示
  await loadAndShow(dateStr);
}

// これがメインの「選択日を基準に、枠取得→表示」
async function loadAndShow(dateStr) {
  clearSlots();

  // 月が変わったら取り直す（毎回取ってもいいけど、まずはシンプルに）
  const ok = await loadSlots(window.profile, dateStr);
  if (!ok) return;

  renderSlotsByDate(dateStr);
  log("枠を選んでね");
}

// ====== main ======
async function run() {
  if (!window.liff) {
    log("LIFF SDKが読み込めてない…");
    return;
  }
  if (!calendarRoot || !slotsRoot) {
    log("必要なDOMが見つからない…（index.html確認してね）");
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
    const profile = await liff.getProfile();
    window.profile = profile;

    log(`こんにちは、${profile.displayName} さん 😊`);

    // 初期日付（今日）
    const today = new Date();
    const initDate = formatYmd(
      today.getFullYear(),
      today.getMonth() + 1,
      today.getDate()
    );

    // カレンダーUI生成＆初回描画
    buildCalendarUI();
    window.currentYM = { y: today.getFullYear(), m: today.getMonth() + 1 };
    window.selectedDateStr = initDate;
    renderCalendar(window.currentYM.y, window.currentYM.m);

    // 初回ロード
    await loadAndShow(initDate);
  } catch (e) {
    log(`ERROR: ${e?.name || "Error"} / ${e?.message || e}`);
    console.error(e);
  }
}

run();
