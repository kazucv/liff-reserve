// ====== CONFIG ======
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbx2e8Xd8kAQ--kWErdGY7CBtsJ8gDSD87SEQbtDHrfM5HL0xxGhfpzZ8hQ5Qjj8bRg/exec";
const LIFF_ID = "2008793696-IEhzXwEH";

// ====== UI helpers ======
const statusEl = document.getElementById("status");
const slotsRoot = document.getElementById("slots");
const dateInput = document.getElementById("date");

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
}

function renderSlots(slots, selectedDateStr, onPick) {
  clearSlots();

  const ymd = toYmdCompact(selectedDateStr); // 20260105
  const filtered = (slots || []).filter((s) =>
    String(s.slotId || "").startsWith(ymd)
  );

  if (filtered.length === 0) {
    if (slotsRoot) slotsRoot.textContent = "この日は予約枠がありません。";
    return;
  }

  const ul = document.createElement("ul");
  filtered.forEach((s) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");

    // 表示は一旦 start/end そのまま（後で整える）
    btn.textContent = `${s.start} 〜 ${s.end}`;
    btn.style.display = "block";
    btn.style.margin = "8px 0";
    btn.onclick = () => onPick(s);

    li.appendChild(btn);
    ul.appendChild(li);
  });

  if (slotsRoot) slotsRoot.appendChild(ul);
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
    log(`こんにちは、${profile.displayName} さん 😊`);

    // 今日を初期日付にセット
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    if (!dateInput.value) dateInput.value = `${yyyy}-${mm}-${dd}`;

    async function loadAndShow(dateStr) {
      clearSlots();
      log("枠を取得中...");

      const payload = {
        action: "getSlots",
        userId: profile.userId,
        ym: toYm(dateStr),
      };

      const { data } = await postJson(GAS_URL, payload, 10000);

      if (!data?.ok) {
        log(`枠取得NG: ${JSON.stringify(data)}`);
        return;
      }

      log("日付を選んでね");

      renderSlots(data.slots || [], dateStr, async (slot) => {
        // 予約（name/tel は固定。次のステップで入力フォームにする）
        log(`予約中... ${slot.slotId}`);

        const payload2 = {
          action: "createReservation",
          userId: profile.userId,
          slotId: slot.slotId,
          name: "テスト太郎",
          tel: "09012345678",
          note: "LIFFテスト予約",
        };

        const r2 = await postJson(GAS_URL, payload2, 10000);

        if (!r2.data?.ok) {
          log(`予約NG: ${JSON.stringify(r2.data)}`);
          return;
        }

        log(`予約OK ✅ ${r2.data.reservationId}`);

        // 予約後：同じ日をリロード（枠が埋まる挙動が見える）
        await loadAndShow(dateInput.value);
      });
    }

    dateInput.addEventListener("change", () => loadAndShow(dateInput.value));
    await loadAndShow(dateInput.value);
  } catch (e) {
    log(`ERROR: ${e?.name || "Error"} / ${e?.message || e}`);
    console.error(e);
  }
}

run();
