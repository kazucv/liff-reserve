const GAS_URL =
  "https://script.google.com/macros/s/AKfycbx2e8Xd8kAQ--kWErdGY7CBtsJ8gDSD87SEQbtDHrfM5HL0xxGhfpzZ8hQ5Qjj8bRg/exec";

const LIFF_ID = "2008793696-IEhzXwEH";

const statusEl = document.getElementById("status");
const log = (msg) => {
  console.log(msg);
  if (statusEl) statusEl.textContent = msg;
};

async function run() {
  if (!window.liff) {
    document.getElementById("status").textContent = "LIFF SDKが読み込めてない…";
    throw new Error("LIFF SDK not loaded");
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

    const url = `${GAS_URL}?userId=${encodeURIComponent(
      profile.userId
    )}&t=${Date.now()}`;

    log("4) fetching GAS...");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000); // 8秒でタイムアウト

    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);

    log(`4.5) response: ${res.status}`);
    const data = await res.json();

    log(`5) GAS OK: ${JSON.stringify(data)}`);
  } catch (e) {
    log(`NG: ${e?.name || "Error"} / ${e?.message || e}`);
    console.error(e);
  }
}

run();
