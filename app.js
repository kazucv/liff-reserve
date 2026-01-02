// ====== CONFIG ======
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbx2e8Xd8kAQ--kWErdGY7CBtsJ8gDSD87SEQbtDHrfM5HL0xxGhfpzZ8hQ5Qjj8bRg/exec";
const LIFF_ID = "2008793696-IEhzXwEH";

// ====== DOM ======
const statusEl = document.getElementById("status");
const slotsRoot = document.getElementById("slots");
const dateInput = document.getElementById("date");
const slotCountEl = document.getElementById("slotCount");

// ====== helpers ======
const log = (msg) => {
  console.log(msg);
  if (statusEl) statusEl.textContent = msg;
};

function toYm(dateStr) {
  // "2026-01-05" -> "202601"
  return String(dateStr || "")
    .replaceAll("-", "")
    .slice(0, 6);
}

function toYmdCompact(dateStr) {
  // "2026-01-05" -> "20260105"
  return String(dateStr || "").replaceAll("-", "");
}

function clearSlots() {
  if (slotsRoot) slotsRoot.innerHTML = "";
  if (slotCountEl) slotCountEl.textContent = "";
}

function renderSlotsByDate(selectedDateStr, profile) {
  if (!slotsRoot) return;

  clearSlots();

  const ymd = toYmdCompact(selectedDateStr);
  const slots = (window.allSlots || []).filter((s) =>
    String(s.slotId || "").startsWith(ymd)
  );

  if (slotCountEl) slotCountEl.textContent = `枠OK: ${slots.length}件`;

  if (slots.length === 0) {
    const p = document.createElement("p");
    p.textContent = "この日は予約枠がありません。";
    slotsRoot.appendChild(p);
    return;
  }

  const ul = document.createElement("ul");
  slots.forEach((s) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot-btn";
    btn.textContent = `${s.start} 〜 ${s.end}`;

    btn.addEventListener("click", async () => {
      await reserveSlot(s, profile);
    });

    li.appendChild(btn);
    ul.appendChild(li);
  });

  slotsRoot.appendChild(ul);
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

// ====== API wrappers ======
async function fetchSlots(profile, dateStr) {
  const payload = {
    action: "getSlots",
    userId: profile.userId,
    ym: toYm(dateStr),
  };

  const { data } = await postJson(GAS_URL, payload, 10000);
  if (!data?.ok || !Array.isArray(data.slots)) {
    throw new Error(`getSlots failed: ${JSON.stringify(data)}`);
  }
  return data.slots;
}

async function reserveSlot(slot, profile) {
  // ここが「既存の予約処理に接続」の場所！
  // 今は固定値 → 次にフォーム入力にする
  log(`予約中... ${slot.slotId}`);

  const payload = {
    action: "createReservation",
    userId: profile.userId,
    slotId: slot.slotId,
    name: "テスト太郎",
    tel: "09012345678",
    note: "LIFFテスト予約",
  };

  const { data } = await postJson(GAS_URL, payload, 10000);

  if (!data?.ok) {
    log(`予約NG: ${JSON.stringify(data)}`);
    return;
  }

  log(`予約OK ✅ ${data.reservationId}`);

  // 予約後、同月の枠を取り直して再描画（埋まり反映）
  const currentDate = dateInput.value;
  window.allSlots = await fetchSlots(profile, currentDate);
  renderSlotsByDate(currentDate, profile);
}

// ====== main ======
async function run() {
  if (!window.liff) {
    log("LIFF SDKが読み込めてない…");
    return;
  }
  if (!window.flatpickr) {
    log("flatpickr が読み込めてない…（CDN確認）");
    return;
  }
  if (!dateInput) {
    log("date input が見つからない…（index.html確認）");
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
    log(`こんにちは、${profile.displayName} さん 😊`);

    // 今日を初期日付に
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const initialDate = `${yyyy}-${mm}-${dd}`;
    dateInput.value = initialDate;

    // 初回ロード
    log("枠を取得中...");
    window.allSlots = await fetchSlots(profile, initialDate);
    renderSlotsByDate(initialDate, profile);
    log("日付を選んでね");

    // ✅ ここがA-2：カレンダー常時表示（inline）
    flatpickr("#date", {
      inline: true,
      dateFormat: "Y-m-d",
      defaultDate: initialDate,
      onChange: async (_selectedDates, dateStr) => {
        try {
          log("枠を取得中...");
          dateInput.value = dateStr;
          window.allSlots = await fetchSlots(profile, dateStr);
          renderSlotsByDate(dateStr, profile);
          log("日付を選んでね");
        } catch (e) {
          log(`枠取得NG: ${e?.message || e}`);
          console.error(e);
        }
      },
    });
  } catch (e) {
    log(`ERROR: ${e?.name || "Error"} / ${e?.message || e}`);
    console.error(e);
  }
}

run();
