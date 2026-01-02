// ====== CONFIG ======
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbx2e8Xd8kAQ--kWErdGY7CBtsJ8gDSD87SEQbtDHrfM5HL0xxGhfpzZ8hQ5Qjj8bRg/exec";
const LIFF_ID = "2008793696-IEhzXwEH";

// ====== DOM ======
const statusEl = document.getElementById("status");

const viewCalendar = document.getElementById("viewCalendar");
const viewSlots = document.getElementById("viewSlots");
const viewForm = document.getElementById("viewForm");
const viewDone = document.getElementById("viewDone");

const dateInput = document.getElementById("date");
const calendarRoot = document.getElementById("calendar");

const backToCalendar = document.getElementById("backToCalendar");
const backToSlots = document.getElementById("backToSlots");

const slotCount = document.getElementById("slotCount");
const slotsAM = document.getElementById("slotsAM");
const slotsPM = document.getElementById("slotsPM");

const summary = document.getElementById("summary");
const nameInput = document.getElementById("name");
const telInput = document.getElementById("tel");
const noteInput = document.getElementById("note");
const confirmBtn = document.getElementById("confirmBtn");

const doneText = document.getElementById("doneText");
const doneToCalendar = document.getElementById("doneToCalendar");

// ====== state ======
let profile = null;
let fp = null;

// ym -> slots[]
const slotsCache = new Map();

// slotId/start/end を想定
let selectedDate = null; // "YYYY-MM-DD"
let selectedSlot = null; // slot object

// ====== utils ======
const log = (msg) => {
  console.log(msg);
  if (statusEl) statusEl.textContent = msg;
};

function showView(name) {
  viewCalendar.classList.add("hidden");
  viewSlots.classList.add("hidden");
  viewForm.classList.add("hidden");
  viewDone.classList.add("hidden");

  if (name === "calendar") viewCalendar.classList.remove("hidden");
  if (name === "slots") viewSlots.classList.remove("hidden");
  if (name === "form") viewForm.classList.remove("hidden");
  if (name === "done") viewDone.classList.remove("hidden");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toYmd(dateObj) {
  const y = dateObj.getFullYear();
  const m = pad2(dateObj.getMonth() + 1);
  const d = pad2(dateObj.getDate());
  return `${y}-${m}-${d}`;
}

function toYmFromYmd(ymd) {
  // "2026-01-05" -> "202601"
  return String(ymd).replaceAll("-", "").slice(0, 6);
}

function slotIdToYmd(slotId) {
  // "20260105_10:00" -> "2026-01-05"
  const s = String(slotId || "");
  const y = s.slice(0, 4);
  const m = s.slice(4, 6);
  const d = s.slice(6, 8);
  return `${y}-${m}-${d}`;
}

function slotIdToHm(slotId) {
  // "20260105_10:00" -> "10:00"
  const s = String(slotId || "");
  const idx = s.indexOf("_");
  if (idx === -1) return "";
  return s.slice(idx + 1);
}

function hmFromIso(iso) {
  // "20260105T10:00:00+09:00" or "...Z" -> "10:00"
  const m = String(iso || "").match(/T(\d{2}:\d{2})/);
  return m ? m[1] : "";
}

function isAM(slot) {
  const hm = hmFromIso(slot.start) || slotIdToHm(slot.slotId);
  const h = Number(hm.slice(0, 2));
  return h < 12;
}

function clearSlotsUI() {
  slotsAM.innerHTML = "";
  slotsPM.innerHTML = "";
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

async function fetchSlotsYm(ym) {
  if (slotsCache.has(ym)) return slotsCache.get(ym);

  const payload = {
    action: "getSlots",
    userId: profile.userId,
    ym,
  };

  const { data } = await postJson(GAS_URL, payload);
  if (!data?.ok || !Array.isArray(data.slots)) {
    throw new Error(`getSlots NG: ${JSON.stringify(data)}`);
  }

  slotsCache.set(ym, data.slots);
  return data.slots;
}

async function refreshSlotsYm(ym) {
  slotsCache.delete(ym);
  return await fetchSlotsYm(ym);
}

// ====== calendar ======
function buildAvailableDaysSet() {
  // キャッシュされてる全 slots から日付集合を作る
  const set = new Set();
  for (const slots of slotsCache.values()) {
    (slots || []).forEach((s) => {
      const ymd = slotIdToYmd(s.slotId);
      set.add(ymd);
    });
  }
  return set;
}

function initFlatpickr() {
  if (!window.flatpickr) {
    log("flatpickr が読み込めてない…（CDN確認）");
    return;
  }

  const today = new Date();
  const minDate = today;
  const maxDate = new Date(today);
  maxDate.setMonth(maxDate.getMonth() + 6);

  fp = flatpickr(dateInput, {
    locale: "ja",
    dateFormat: "Y-m-d",
    defaultDate: today,
    minDate,
    maxDate,
    inline: true,
    appendTo: calendarRoot, // ✅ input下じゃなく、このdivに表示
    disableMobile: true,

    onReady: async (selectedDates) => {
      selectedDate = toYmd(selectedDates[0] || today);
      // 初期月を取得
      const ym = toYmFromYmd(selectedDate);
      await fetchSlotsYm(ym);

      // “枠がある日だけ” 見た目で分かるように（薄くハイライト）
      const available = buildAvailableDaysSet();
      fp.redraw(); // onDayCreate を反映
      log("日付を選んでね");
    },

    onMonthChange: async (selectedDates, dateStr, instance) => {
      const y = instance.currentYear;
      const m = pad2(instance.currentMonth + 1);
      const ym = `${y}${m}`;
      try {
        log("枠を取得中...");
        await fetchSlotsYm(ym);
        fp.redraw();
        log("日付を選んでね");
      } catch (e) {
        log(`ERROR: ${e?.message || e}`);
      }
    },

    onChange: async (selectedDates) => {
      const d = selectedDates[0];
      if (!d) return;
      selectedDate = toYmd(d);

      // その月が未取得なら取得
      const ym = toYmFromYmd(selectedDate);
      try {
        log("枠を取得中...");
        await fetchSlotsYm(ym);
        fp.redraw();
        renderSlotsForSelectedDate();
        showView("slots");
        log("時間を選んでね");
      } catch (e) {
        log(`ERROR: ${e?.message || e}`);
      }
    },

    onDayCreate: (dObj, dStr, fp, dayElem) => {
      // 枠がある日に “うっすら点” を出す（iOSっぽい雰囲気）
      try {
        const y = dayElem.dateObj.getFullYear();
        const m = pad2(dayElem.dateObj.getMonth() + 1);
        const d = pad2(dayElem.dateObj.getDate());
        const ymd = `${y}-${m}-${d}`;

        const available = buildAvailableDaysSet();
        if (available.has(ymd)) {
          dayElem.style.boxShadow = "inset 0 -3px 0 rgba(11,91,211,.35)";
          dayElem.style.borderRadius = "14px";
        }
      } catch {}
    },
  });
}

// ====== slots view ======
function getSlotsForDate(ymd) {
  const ym = toYmFromYmd(ymd);
  const slots = slotsCache.get(ym) || [];
  return slots.filter((s) => slotIdToYmd(s.slotId) === ymd);
}

function renderSlotsForSelectedDate() {
  clearSlotsUI();

  const slots = getSlotsForDate(selectedDate);
  if (slotCount)
    slotCount.textContent = `枠OK: ${slots.length}件（押して予約してね）`;

  const am = slots.filter((s) => isAM(s));
  const pm = slots.filter((s) => !isAM(s));

  if (am.length === 0) slotsAM.textContent = "空きなし";
  if (pm.length === 0) slotsPM.textContent = "空きなし";

  const renderBtn = (slot) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot-btn";

    const startHm = hmFromIso(slot.start) || slotIdToHm(slot.slotId);
    const endHm = hmFromIso(slot.end);
    btn.textContent = endHm
      ? `${startHm} 〜 ${endHm}`
      : `${slot.start} 〜 ${slot.end}`;

    btn.addEventListener("click", () => {
      selectedSlot = slot;
      renderFormSummary();
      showView("form");
      log("お名前と電話番号を入れてね");
    });

    return btn;
  };

  am.forEach((s) => slotsAM.appendChild(renderBtn(s)));
  pm.forEach((s) => slotsPM.appendChild(renderBtn(s)));
}

// ====== form view ======
function renderFormSummary() {
  const ymd = selectedDate;
  const slot = selectedSlot;
  if (!slot) return;

  const startHm = hmFromIso(slot.start) || slotIdToHm(slot.slotId);
  const endHm = hmFromIso(slot.end) || "";
  const d = new Date(ymd);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const dd = d.getDate();

  summary.innerHTML = `
    <div>日付: ${y}年${m}月${dd}日 / 時間: ${startHm} 〜 ${endHm}</div>
  `;
}

function normalizeTel(raw) {
  // 数字と + だけ残す（日本は基本数字だけでOK）
  return String(raw || "").replace(/[^\d+]/g, "");
}

// ====== reserve ======
async function reserveSelected() {
  if (!selectedSlot) return;

  const name = String(nameInput.value || "").trim();
  const tel = normalizeTel(telInput.value);

  if (!name || !tel) {
    log("お名前と電話番号は必須だよ");
    return;
  }

  log("予約中...");

  const payload = {
    action: "createReservation",
    userId: profile.userId,
    slotId: selectedSlot.slotId,
    name,
    tel,
    note: String(noteInput.value || "").trim(),
  };

  const r = await postJson(GAS_URL, payload, 10000);

  if (!r.data?.ok) {
    log(`予約NG: ${JSON.stringify(r.data)}`);
    return;
  }

  // 完了画面
  const rid = r.data.reservationId;
  doneText.innerHTML = `
    <div style="font-weight:700; font-size:18px;">予約できたよ ✅</div>
    <div style="margin-top:8px;" class="sub">予約ID: ${rid}</div>
  `;
  showView("done");
  log(`予約OK: ${rid}`);

  // 予約後：その月の枠を更新（押し戻し時に埋まり反映）
  const ym = toYmFromYmd(selectedDate);
  await refreshSlotsYm(ym);
  fp.redraw();
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
    profile = await liff.getProfile();
    log(`こんにちは、${profile.displayName} さん 😊`);

    // UI events
    backToCalendar?.addEventListener("click", () => {
      showView("calendar");
      log("日付を選んでね");
    });

    backToSlots?.addEventListener("click", () => {
      showView("slots");
      log("時間を選んでね");
    });

    confirmBtn?.addEventListener("click", async () => {
      try {
        await reserveSelected();
      } catch (e) {
        log(`ERROR: ${e?.message || e}`);
        console.error(e);
      }
    });

    doneToCalendar?.addEventListener("click", () => {
      showView("calendar");
      log("日付を選んでね");
    });

    // Start
    showView("calendar");
    initFlatpickr();
  } catch (e) {
    log(`ERROR: ${e?.name || "Error"} / ${e?.message || e}`);
    console.error(e);
  }
}

run();
