console.log("APP VERSION: 2026-01-02 unified reserve");

document.getElementById("status").textContent =
  "APP VERSION: 2026-01-02 unified reserve";

// ====== CONFIG ======
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbx2e8Xd8kAQ--kWErdGY7CBtsJ8gDSD87SEQbtDHrfM5HL0xxGhfpzZ8hQ5Qjj8bRg/exec";
const LIFF_ID = "2008793696-IEhzXwEH";

// ====== UI helpers ======
const statusEl = document.getElementById("status");
const slotsRoot = document.getElementById("slots");
const dateInput = document.getElementById("date");
const slotCountEl = document.getElementById("slotCount");

const log = (msg) => {
  console.log(msg);
  if (statusEl) statusEl.textContent = msg;
};

function toYm(dateStr) {
  // "2026-01-05" -> "202601"
  return String(dateStr || "")
    .replaceAll("-", "")
    .replaceAll("/", "")
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

function renderSlotsByDate(selectedDateStr) {
  if (!slotsRoot) return;

  slotsRoot.innerHTML = "";

  const ymd = ymdCompact(selectedDateStr);
  const slots = (window.allSlots || []).filter((s) =>
    String(s.slotId || "").startsWith(ymd)
  );

  if (slotCountEl) {
    slotCountEl.textContent = `枠OK: ${slots.length}件（押して予約してね）`;
  }

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

// ====== GAS: load slots (monthly) ======
async function loadAndShow(dateStr) {
  clearSlots();
  log("枠を取得中...");

  const profile = window.profile;
  if (!profile?.userId) {
    log("profileが取れてない…");
    return;
  }

  const payload = {
    action: "getSlots",
    userId: profile.userId,
    ym: toYm(dateStr),
  };

  const { data } = await postJson(GAS_URL, payload);

  if (!data?.ok || !Array.isArray(data.slots)) {
    log(`枠取得NG: ${JSON.stringify(data)}`);
    return;
  }

  window.allSlots = data.slots; // ✅ 月の全枠
  renderSlotsByDate(dateStr); // ✅ 日付で絞って描画
  log("日付を選んでね");
}

// ====== GAS: create reservation ======
async function reserveSlot(slot) {
  const profile = window.profile;
  if (!profile?.userId) {
    log("profileが取れてない…");
    return;
  }

  // 二度押し防止（簡易）
  if (window.__reserving) return;
  window.__reserving = true;

  try {
    log(`予約中... ${slot.slotId}`);

    const payload2 = {
      action: "createReservation",
      userId: profile.userId,
      slotId: slot.slotId,
      name: "テスト太郎", // 次のステップでフォーム入力に置換
      tel: "09012345678", // 次のステップでフォーム入力に置換
      note: "LIFFテスト予約", // 任意
    };

    const r2 = await postJson(GAS_URL, payload2, 10000);

    if (!r2.data?.ok) {
      log(`予約NG: ${JSON.stringify(r2.data)}`);
      return;
    }

    log(`予約OK ✅ ${r2.data.reservationId}`);

    // ✅ 予約後：同じ月の枠を再取得して再描画
    await loadAndShow(dateInput.value);
  } finally {
    window.__reserving = false;
  }
}

// ====== main ======
async function run() {
  if (!window.liff) {
    log("LIFF SDKが読み込めてない…");
    return;
  }
  if (!dateInput) {
    log("date input が見つからない…（index.html確認してね）");
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
    window.profile = profile; // ✅ どこからでも使えるように保存
    log(`こんにちは、${profile.displayName} さん 😊`);

    // 今日を初期日付にセット
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    if (!dateInput.value) dateInput.value = `${yyyy}-${mm}-${dd}`;

    // 日付変更で再取得（※月が変わるのでgetSlotsも変わる想定）
    dateInput.addEventListener("change", async () => {
      await loadAndShow(dateInput.value);
    });

    // 初回ロード
    await loadAndShow(dateInput.value);
  } catch (e) {
    log(`ERROR: ${e?.name || "Error"} / ${e?.message || e}`);
    console.error(e);
  }
}

run();
