// ====== CONFIG ======
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbx2e8Xd8kAQ--kWErdGY7CBtsJ8gDSD87SEQbtDHrfM5HL0xxGhfpzZ8hQ5Qjj8bRg/exec";
const LIFF_ID = "2008793696-IEhzXwEH";

// ====== UI ======
const statusEl = document.getElementById("status");
const slotsRoot = document.getElementById("slots");
const dateInput = document.getElementById("date");
const calendarRoot = document.getElementById("calendar");
const slotCountEl = document.getElementById("slotCount");
const selectedDateLabel = document.getElementById("selectedDateLabel");

const log = (msg) => {
  console.log(msg);
  if (statusEl) statusEl.textContent = msg;
};

function fmtYmd(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

function clearSlots() {
  if (slotsRoot) slotsRoot.innerHTML = "";
}

function setSlotCount(n) {
  if (slotCountEl) slotCountEl.textContent = `枠: ${n}件`;
}

function setSelectedDateLabel(dateStr) {
  if (!selectedDateLabel) return;
  // 見やすく "YYYY/MM/DD"
  selectedDateLabel.textContent = String(dateStr || "-").replaceAll("-", "/");
}

// ====== network ======
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

// ====== state ======
const state = {
  profile: null,
  allSlots: [], // 現在月の slots
  currentYm: "", // "202601"
  fp: null, // flatpickr instance
};

// ====== rendering ======
function renderSlotsByDate(selectedDateStr) {
  clearSlots();
  setSelectedDateLabel(selectedDateStr);

  const ymd = ymdCompact(selectedDateStr);
  const filtered = (state.allSlots || []).filter((s) =>
    String(s.slotId || "").startsWith(ymd)
  );

  setSlotCount(filtered.length);

  if (!filtered.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "この日は予約枠がありません。";
    slotsRoot.appendChild(p);
    return;
  }

  filtered.forEach((s) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot-btn";

    // 表示は一旦 start/end。後で "10:00〜11:00" みたいに整形しよう
    btn.textContent = `${s.start} 〜 ${s.end}`;

    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await reserveSlot(s);
      } finally {
        btn.disabled = false;
      }
    });

    slotsRoot.appendChild(btn);
  });
}

// ====== GAS actions ======
async function fetchSlotsForYm(ym) {
  if (!state.profile) throw new Error("profile_not_ready");
  log(`枠を取得中... (${ym})`);

  const payload = {
    action: "getSlots",
    userId: state.profile.userId,
    ym,
  };

  const { data } = await postJson(GAS_URL, payload, 15000);

  if (!data?.ok || !Array.isArray(data.slots)) {
    throw new Error(`getSlots_failed: ${JSON.stringify(data)}`);
  }

  state.allSlots = data.slots;
  state.currentYm = ym;

  return data.slots;
}

async function reserveSlot(slot) {
  if (!state.profile) return;

  log(`予約中... ${slot.slotId}`);

  // TODO: 次ステップでフォームにする（name/tel/note）
  const payload2 = {
    action: "createReservation",
    userId: state.profile.userId,
    slotId: slot.slotId,
    name: "テスト太郎",
    tel: "09012345678",
    note: "LIFFテスト予約",
  };

  const { data } = await postJson(GAS_URL, payload2, 15000);

  if (!data?.ok) {
    log(`予約NG: ${JSON.stringify(data)}`);
    return;
  }

  log(`予約OK ✅ ${data.reservationId}`);

  // 予約で枠が埋まった反映のため、同月の枠を取り直して再描画
  const selected = dateInput.value;
  const ym = toYm(selected);
  await fetchSlotsForYm(ym);
  renderSlotsByDate(selected);
}

// ====== flatpickr setup ======
function initCalendar(initialDateStr) {
  if (!dateInput || !calendarRoot) throw new Error("calendar_dom_missing");

  // flatpickr を inline 表示（常に月カレンダー）
  state.fp = flatpickr(dateInput, {
    locale: "ja",
    inline: true,
    dateFormat: "Y-m-d",
    defaultDate: initialDateStr,
    appendTo: calendarRoot,

    onReady: (_selectedDates, dateStr) => {
      // 初回描画
      setSelectedDateLabel(dateStr);
    },

    onChange: (_selectedDates, dateStr) => {
      // 日付クリック → slots を日付でフィルタして出す
      renderSlotsByDate(dateStr);
    },

    onMonthChange: async (_selectedDates, _dateStr, instance) => {
      // 月移動したら、その月の枠を取り直す
      try {
        const viewDate =
          instance.currentYear +
          "-" +
          String(instance.currentMonth + 1).padStart(2, "0") +
          "-01";
        const ym = toYm(viewDate);

        // 同月なら何もしない（連打対策）
        if (ym === state.currentYm) return;

        await fetchSlotsForYm(ym);

        // 月移動後の「選択日」で再描画（選択日が別月なら月初に寄せてもOK）
        const selected =
          dateInput.value ||
          fmtYmd(new Date(instance.currentYear, instance.currentMonth, 1));
        renderSlotsByDate(selected);
        log("日付を選んでね");
      } catch (e) {
        log(`枠取得NG: ${e?.message || e}`);
      }
    },
  });
}

// ====== main ======
async function run() {
  if (!window.liff) {
    log("LIFF SDKが読み込めてない…");
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

    // 初期日付は今日
    const todayStr = fmtYmd(new Date());
    const initialDateStr = dateInput.value || todayStr;

    // カレンダー初期化（inline）
    initCalendar(initialDateStr);

    // 初期月の枠を取得して描画
    const ym = toYm(initialDateStr);
    await fetchSlotsForYm(ym);
    renderSlotsByDate(initialDateStr);

    log("日付を選んでね");
  } catch (e) {
    log(`ERROR: ${e?.name || "Error"} / ${e?.message || e}`);
    console.error(e);
  }
}

run();
