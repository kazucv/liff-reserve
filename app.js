// ====== CONFIG ======
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbx2e8Xd8kAQ--kWErdGY7CBtsJ8gDSD87SEQbtDHrfM5HL0xxGhfpzZ8hQ5Qjj8bRg/exec";
const LIFF_ID = "2008793696-IEhzXwEH";

// ====== DOM ======
const statusEl = document.getElementById("status");
const calendarEl = document.getElementById("calendar");
const slotsEl = document.getElementById("slots");

const log = (msg) => {
  console.log(msg);
  if (statusEl) statusEl.textContent = msg;
};

function ymdCompactFromDate(dateObj) {
  // Date -> "YYYYMMDD"
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function ymFromDate(dateObj) {
  // Date -> "YYYYMM"
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

function clearSlotsUI(message = "") {
  if (!slotsEl) return;
  slotsEl.innerHTML = "";
  if (message) {
    const p = document.createElement("p");
    p.textContent = message;
    slotsEl.appendChild(p);
  }
}

function renderSlotsList(slots, onPick) {
  if (!slotsEl) return;
  slotsEl.innerHTML = "";

  if (!slots || slots.length === 0) {
    clearSlotsUI("この日は予約枠がありません。");
    return;
  }

  slots.forEach((s) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot-btn";
    // 表示は一旦そのまま（後で整える）
    btn.textContent = `${s.start} 〜 ${s.end}`;
    btn.addEventListener("click", () => onPick(s));
    slotsEl.appendChild(btn);
  });
}

// ====== network ======
async function postJson(url, payload, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // GASはこれが事故りにくい
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

// ====== main state ======
let profile = null;
let calendar = null;

// slotsByYmd["20260105"] = [ {slotId,...}, ... ]
let slotsByYmd = {};
let loadedYm = ""; // 今ロード済みのYYYYMM

function buildSlotsIndex(slots) {
  const map = {};
  (slots || []).forEach((s) => {
    const slotId = String(s.slotId || "");
    const ymd = slotId.slice(0, 8); // "YYYYMMDD"
    if (!/^\d{8}$/.test(ymd)) return;
    if (!map[ymd]) map[ymd] = [];
    map[ymd].push(s);
  });
  return map;
}

function buildEventsFromIndex(indexMap) {
  // FullCalendarに「枠あり日」を点で示すためのイベント配列
  // ※見た目は後でいじれる。まずは出ること優先。
  const events = [];
  Object.keys(indexMap).forEach((ymd) => {
    const y = ymd.slice(0, 4);
    const m = ymd.slice(4, 6);
    const d = ymd.slice(6, 8);
    const iso = `${y}-${m}-${d}`;

    events.push({
      title: "◦", // ドット代わり（後でCSSで点にしたりできる）
      start: iso,
      allDay: true,
      display: "list-item", // 月表示で邪魔になりにくい
    });
  });
  return events;
}

async function loadMonthSlots(ym) {
  if (!profile) throw new Error("profile_missing");
  if (!/^\d{6}$/.test(ym)) throw new Error("ym_invalid");

  log("枠を取得中…");

  const payload = {
    action: "getSlots",
    userId: profile.userId,
    ym,
  };

  const { data } = await postJson(GAS_URL, payload, 12000);

  if (!data?.ok || !Array.isArray(data.slots)) {
    throw new Error(`getSlots_failed: ${JSON.stringify(data)}`);
  }

  loadedYm = ym;
  slotsByYmd = buildSlotsIndex(data.slots);

  log("日付をタップしてね");
}

function showSlotsForDate(dateObj) {
  const ymd = ymdCompactFromDate(dateObj);
  const list = slotsByYmd[ymd] || [];
  renderSlotsList(list, async (slot) => {
    await reserveSlot(slot);
  });
}

async function reserveSlot(slot) {
  if (!profile) return;

  // TODO: 次のステップでフォーム入力にする（今は仮）
  const payload = {
    action: "createReservation",
    userId: profile.userId,
    slotId: slot.slotId,
    name: "テスト太郎",
    tel: "09012345678",
    note: "LIFF予約",
  };

  log(`予約中… ${slot.slotId}`);

  const { data } = await postJson(GAS_URL, payload, 15000);

  if (!data?.ok) {
    log(`予約NG: ${JSON.stringify(data)}`);
    return;
  }

  log(`予約OK ✅ ${data.reservationId}`);

  // 予約後：同じ月を取り直して、枠が消える挙動が見えるように
  const ym = loadedYm || slot.slotId.slice(0, 6);
  await loadMonthSlots(ym);

  // カレンダー側の「枠ありドット」も更新
  calendar.removeAllEvents();
  calendar.addEventSource(buildEventsFromIndex(slotsByYmd));
}

// ====== swipe (簡易) ======
// FullCalendarは「標準でスマホの月スワイプ」が弱いことが多いので、
// まずは簡易スワイプで prev/next を呼ぶ（必要なら後で強化）
function attachSimpleSwipe(targetEl, onSwipeLeft, onSwipeRight) {
  let startX = 0;
  let startY = 0;
  const threshold = 40;

  targetEl.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
    },
    { passive: true }
  );

  targetEl.addEventListener(
    "touchend",
    (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      // 縦スクロールを邪魔しない
      if (Math.abs(dy) > Math.abs(dx)) return;
      if (Math.abs(dx) < threshold) return;

      if (dx < 0) onSwipeLeft?.();
      else onSwipeRight?.();
    },
    { passive: true }
  );
}

// ====== boot ======
async function run() {
  if (!window.liff) {
    log("LIFF SDKが読み込めてない…");
    return;
  }
  if (!window.FullCalendar) {
    log("FullCalendarが読み込めてない…（CDN確認）");
    return;
  }

  try {
    log("1) init LIFF…");
    await liff.init({ liffId: LIFF_ID });

    if (!liff.isLoggedIn()) {
      log("2) login…");
      liff.login();
      return;
    }

    log("3) getting profile…");
    profile = await liff.getProfile();
    log(`こんにちは、${profile.displayName} さん 😊`);

    const today = new Date();
    const initialYm = ymFromDate(today);

    // ① 今月の枠ロード
    await loadMonthSlots(initialYm);

    // ② カレンダー作成
    calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: "dayGridMonth",
      locale: "ja",
      height: "auto",
      headerToolbar: {
        left: "prev",
        center: "title",
        right: "next",
      },

      // 「枠あり日」を点で表示（イベントとして追加）
      events: buildEventsFromIndex(slotsByYmd),

      // 日付タップ → その日の枠表示
      dateClick: async (info) => {
        // 表示中の月が変わってるならロードし直す
        const viewStart = info.view.currentStart; // 表示中月の先頭付近
        const ym = ymFromDate(viewStart);
        if (ym !== loadedYm) {
          await loadMonthSlots(ym);
          calendar.removeAllEvents();
          calendar.addEventSource(buildEventsFromIndex(slotsByYmd));
        }

        showSlotsForDate(info.date);
      },
    });

    calendar.render();

    // ③ 初期表示：今日の枠を下に出しておく（気分良い）
    showSlotsForDate(today);

    // ④ 簡易スワイプで月移動（邪魔なら外してOK）
    attachSimpleSwipe(
      calendarEl,
      async () => {
        calendar.next();
        const ym = ymFromDate(calendar.getDate());
        if (ym !== loadedYm) {
          await loadMonthSlots(ym);
          calendar.removeAllEvents();
          calendar.addEventSource(buildEventsFromIndex(slotsByYmd));
        }
      },
      async () => {
        calendar.prev();
        const ym = ymFromDate(calendar.getDate());
        if (ym !== loadedYm) {
          await loadMonthSlots(ym);
          calendar.removeAllEvents();
          calendar.addEventSource(buildEventsFromIndex(slotsByYmd));
        }
      }
    );

    log("日付をタップしてね");
  } catch (e) {
    console.error(e);
    log(`ERROR: ${e?.message || e}`);
  }
}

run();
