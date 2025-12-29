console.log("APP VERSION: 2025-12-29 14:16 POST");
document.getElementById("status").textContent =
  "APP VERSION: 2025-12-29 14:16 POST";

const GAS_URL =
  "https://script.google.com/macros/s/AKfycbx2e8Xd8kAQ--kWErdGY7CBtsJ8gDSD87SEQbtDHrfM5HL0xxGhfpzZ8hQ5Qjj8bRg/exec";

const LIFF_ID = "2008793696-IEhzXwEH";

const statusEl = document.getElementById("status");
const log = (msg) => {
  console.log(msg);
  if (statusEl) statusEl.textContent = msg;
};

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

async function run() {
  if (!window.liff) {
    log("LIFF SDKが読み込めてない…");
    return;
  }

  try {
    log("1) init LIFF...");
    await liff.init({ liffId: LIFF_ID });

    log(`2) isLoggedIn: ${liff.isLoggedIn()}`);
    if (!liff.isLoggedIn()) {
      log("2.5) redirecting to login...");
      liff.login();
      return;
    }

    log("3) getting profile...");
    const profile = await liff.getProfile();
    log(`3.5) got profile: ${profile.displayName}`);

    // 4) getSlots
    const payload = {
      action: "getSlots",
      userId: profile.userId,
      ym: "202601",
    };

    log("4) POST getSlots...");
    const { status, data } = await postJson(GAS_URL, payload);

    log(`5) status: ${status}`);
    log(`6) data: ${JSON.stringify(data)}`);

    const slots = data?.ok && Array.isArray(data.slots) ? data.slots : [];

    // slots表示
    if (slots.length > 0) {
      const ul = document.createElement("ul");
      slots.forEach((s) => {
        const li = document.createElement("li");
        li.textContent = `${s.start} 〜 ${s.end}`;
        ul.appendChild(li);
      });
      document.body.appendChild(ul);
    }

    // 7) 試しに1件予約（あとでボタンにする）
    const first = slots[0];
    if (!first) {
      log("枠がない…");
      return;
    }

    const payload2 = {
      action: "createReservation",
      userId: profile.userId,
      slotId: first.slotId,
      name: "テスト太郎",
      tel: "09012345678",
      note: "LIFFテスト予約",
    };

    log("7) POST createReservation...");
    const r2 = await postJson(GAS_URL, payload2, 10000);
    log(`8) reserve response: ${r2.status}`);

    if (!r2.data?.ok) {
      log(`予約NG: ${JSON.stringify(r2.data)}`);
      return;
    }

    log(`9) 予約OK: ${r2.data.reservationId}`);
  } catch (e) {
    log(`ERROR: ${e?.name || "Error"} / ${e?.message || e}`);
    console.error(e);
  }
}

run();
